<?php
// Turn off HTML error output — all errors must return JSON
ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');
error_reporting(0);

/**
 * Lightweight .env loader (no Composer dependency).
 */
function loadEnvFile(string $path): void
{
    if (!is_file($path) || !is_readable($path)) return;

    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines === false) return;

    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#') continue;

        $eq = strpos($line, '=');
        if ($eq === false) continue;

        $key = trim(substr($line, 0, $eq));
        $val = trim(substr($line, $eq + 1));
        if ($key === '') continue;

        if ((array_key_exists($key, $_ENV) && $_ENV[$key] !== '') || getenv($key) !== false) continue;

        if (strlen($val) >= 2) {
            $first = $val[0];
            $last  = $val[strlen($val) - 1];
            if (($first === '"' && $last === '"') || ($first === "'" && $last === "'")) {
                $val = substr($val, 1, -1);
            }
        }

        $_ENV[$key] = $val;
        putenv("$key=$val");
    }
}

loadEnvFile(__DIR__ . '/../.env');
loadEnvFile(__DIR__ . '/../../.env');

register_shutdown_function(function () {
    $err = error_get_last();
    if ($err && in_array($err['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        if (!headers_sent()) {
            header('Content-Type: application/json; charset=utf-8');
            http_response_code(500);
        }
        echo json_encode(['success' => false, 'error' => 'PHP fatal error: ' . $err['message']]);
    }
});

set_exception_handler(function (Throwable $e) {
    if (!headers_sent()) {
        header('Content-Type: application/json; charset=utf-8');
        http_response_code(500);
    }
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    exit;
});

// ============================================================
// backend/api/ai_extract.php
//
// POST /backend/api/ai_extract.php
//   multipart/form-data:
//     file            — uploaded screenshot (image)
//     type            — "Scrim" | "Tournament"
//     playerAgentMap  — JSON string from a previously processed
//                       Timeline screenshot (optional but recommended
//                       when uploading a Scoreboard).
//                       Shape: [{"player":"Flux","agent":"Killjoy"},...]
//
// ── How the two-screenshot flow works ────────────────────────
//
//  1. Upload TIMELINE screenshot first  → get playerAgentMap
//  2. Upload SCOREBOARD screenshot next, passing playerAgentMap
//     from step 1 in the request body.
//
//  When playerAgentMap is present on a Scoreboard upload:
//    • The AI is told exactly which 5 player names to look for.
//    • It finds each player's row BY NAME — row colour is irrelevant.
//    • Agents come from the Timeline map, not the scoreboard icons.
//    • This is the correct, authoritative source for agents.
//
//  When playerAgentMap is absent (standalone scoreboard):
//    • Falls back to teal-row detection as before.
//
// ── Provider: Hugging Face Inference API ─────────────────────
// Uses the HF Inference API /v1/chat/completions endpoint.
//
// Default model: Qwen/Qwen2.5-VL-7B-Instruct
//   • Strong vision/OCR, good at reading player names in tables
//
// Set HF_API_KEY in .env.  Get a token at:
//   https://huggingface.co/settings/tokens
// ============================================================

ob_start();

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../helpers/response.php';

ob_clean();

setCorsHeaders();

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Method not allowed', 405);
}

// ── Config ────────────────────────────────────────────────────
$HF_API_KEY = $_ENV['HF_API_KEY'] ?? getenv('HF_API_KEY') ?: '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';
$HF_MODEL   = $_ENV['HF_MODEL']   ?? getenv('HF_MODEL')   ?: 'Qwen/Qwen2.5-VL-7B-Instruct';
$EXTRACTOR_BUILD = '2026-02-27-v4-timeline-authoritative';

if (empty($HF_API_KEY)) {
    sendError('HF_API_KEY not configured. See https://huggingface.co/settings/tokens', 500);
}

// ── Validate upload ───────────────────────────────────────────
if (empty($_FILES['file'])) sendError('No file uploaded', 422);

$file      = $_FILES['file'];
$matchType = $_POST['type'] ?? 'Scrim';

// playerAgentMap passed from a previous Timeline extraction.
// Shape: [{"player":"Flux","agent":"Killjoy"}, ...]
$incomingPamRaw = $_POST['playerAgentMap'] ?? null;
$incomingPam    = [];
if ($incomingPamRaw) {
    $decoded = json_decode($incomingPamRaw, true);
    if (is_array($decoded)) $incomingPam = $decoded;
}

if ($file['error'] !== UPLOAD_ERR_OK) sendError('File upload error: ' . $file['error'], 422);

$allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

$finfo    = finfo_open(FILEINFO_MIME_TYPE);
$mimeType = finfo_file($finfo, $file['tmp_name']);
finfo_close($finfo);

if (!in_array($mimeType, $allowedMimes)) sendError("Unsupported file type: $mimeType", 422);

$fileBytes    = file_get_contents($file['tmp_name']);
$imageDataUrl = "data:{$mimeType};base64," . base64_encode($fileBytes);

// ── Fetch reference data from DB ──────────────────────────────
$db         = getDB();
$mapsJson   = json_encode(array_column($db->query("SELECT name FROM maps   WHERE is_active = 1")->fetchAll(), 'name'));
$agentsJson = json_encode(array_column($db->query("SELECT name FROM agents WHERE is_active = 1")->fetchAll(), 'name'));

// ── Helper: Call Hugging Face ─────────────────────────────────
function callHuggingFace(string $apiKey, string $model, array $messages, bool $jsonMode = true): array
{
    if ($jsonMode) {
        array_unshift($messages, [
            'role'    => 'system',
            'content' => 'You are a precise data extraction assistant. You MUST respond with ONLY valid JSON — no markdown, no code fences, no explanation, no preamble. Your entire response must be a single parseable JSON object.',
        ]);
    }

    $ch = curl_init('https://router.huggingface.co/v1/chat/completions');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_HTTPHEADER     => ['Content-Type: application/json', "Authorization: Bearer {$apiKey}"],
        CURLOPT_POSTFIELDS     => json_encode(['model' => $model, 'messages' => $messages, 'temperature' => 0.1, 'max_tokens' => 4096]),
        CURLOPT_TIMEOUT        => 120,
    ]);

    $response   = curl_exec($ch);
    $httpStatus = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError  = curl_error($ch);
    curl_close($ch);

    if ($curlError) sendError("Failed to contact Hugging Face API: $curlError", 502);

    $decoded = json_decode($response, true);

    if ($httpStatus === 503) sendError("Hugging Face API error (503 — model loading): " . ($decoded['error'] ?? 'Try again in 30s'), 503);
    if ($httpStatus === 429) sendError('Hugging Face rate limit exceeded. Upgrade to HF PRO or try again later.', 429);

    if ($httpStatus !== 200 || empty($decoded['choices'][0]['message']['content'])) {
        sendError("Hugging Face API error: " . ($decoded['error']['message'] ?? $decoded['error'] ?? "HTTP $httpStatus"), 502);
    }

    return $decoded;
}

function hfText(array $response): string
{
    return $response['choices'][0]['message']['content'] ?? '';
}

function buildUserMessage(?string $imageDataUrl, string $promptText): array
{
    $content = [];
    if ($imageDataUrl !== null) {
        $content[] = ['type' => 'image_url', 'image_url' => ['url' => $imageDataUrl]];
    }
    $content[] = ['type' => 'text', 'text' => $promptText];
    return [['role' => 'user', 'content' => $content]];
}

function parseJson(string $rawText): ?array
{
    $text = preg_replace('/^```(?:json)?\s*/m', '', $rawText);
    $text = preg_replace('/\s*```$/m', '', $text);
    $text = trim($text);

    $decoded = json_decode($text, true);
    if (is_array($decoded)) return $decoded;

    $jsonStart = strpos($text, '{');
    $jsonEnd   = strrpos($text, '}');
    if ($jsonStart !== false && $jsonEnd !== false && $jsonEnd > $jsonStart) {
        $decoded = json_decode(substr($text, $jsonStart, $jsonEnd - $jsonStart + 1), true);
        if (is_array($decoded)) return $decoded;
    }

    return null;
}

// Fuzzy-normalise a player name for matching — strips spaces/punctuation, lowercase
function normaliseKey(string $name): string
{
    return strtolower(preg_replace('/[^a-z0-9]/i', '', $name));
}

function validateAgentName(string $candidate, array $dbAgents): string
{
    $haystack = $dbAgents;

    foreach ($haystack as $agent) {
        if (strtolower($agent) === strtolower($candidate)) return $agent;
    }
    foreach ($haystack as $agent) {
        if (stripos($agent, $candidate) !== false || stripos($candidate, $agent) !== false) return $agent;
    }
    return $candidate;
}

function cleanPlayerAgentMap(array $rows, array $dbAgents): array
{
    $out = [];
    $seenPlayerKeys = [];

    foreach ($rows as $entry) {
        $player = trim((string)($entry['player'] ?? $entry['playerName'] ?? ''));
        if ($player === '') continue;

        $playerKey = normaliseKey($player);
        if ($playerKey === '' || in_array($playerKey, $seenPlayerKeys, true)) continue;
        $seenPlayerKeys[] = $playerKey;

        $agentRaw = trim((string)($entry['agent'] ?? $entry['agentName'] ?? ''));
        $agent = $agentRaw !== '' ? validateAgentName($agentRaw, $dbAgents) : null;

        $out[] = ['player' => $player, 'agent' => $agent];
        if (count($out) >= 5) break;
    }

    return $out;
}

function hasDuplicateAgents(array $playerAgentMap): bool
{
    $seen = [];
    foreach ($playerAgentMap as $row) {
        $agent = trim((string)($row['agent'] ?? ''));
        if ($agent === '') continue;
        $k = strtolower($agent);
        if (isset($seen[$k])) return true;
        $seen[$k] = true;
    }
    return false;
}

function normalizeWinnerValue($winner): ?string
{
    $w = strtolower(trim((string)$winner));
    if ($w === 'us' || $w === 'our' || $w === 'ours' || $w === 'team') return 'us';
    if ($w === 'them' || $w === 'enemy' || $w === 'opponent' || $w === 'opponents') return 'them';
    if ($w === 'win' || $w === 'won' || $w === 'w') return 'us';
    if ($w === 'loss' || $w === 'lose' || $w === 'lost' || $w === 'l') return 'them';
    if ($w === 'teal' || $w === 'green' || $w === 'cyan' || $w === 'gold' || $w === 'yellow') return 'us';
    if ($w === 'red' || $w === 'pink' || $w === 'maroon') return 'them';
    return null;
}

function normalizeEndConditionValue($condition): ?string
{
    $c = strtolower(trim((string)$condition));
    $c = str_replace([' ', '-'], '_', $c);

    if (in_array($c, ['elimination', 'elim', 'kill', 'killed'], true)) return 'elimination';
    if (in_array($c, ['spike_detonated', 'detonated', 'detonation', 'spike_exploded'], true)) return 'spike_detonated';
    if (in_array($c, ['spike_defused', 'defused', 'defuse'], true)) return 'spike_defused';
    if (in_array($c, ['time_expired', 'time', 'timer', 'timeout'], true)) return 'time_expired';
    if (in_array($c, ['surrender', 'ff', 'forfeit'], true)) return 'surrender';
    return null;
}

function inferWinnerFromRound(array $r): ?string
{
    $candidates = [
        $r['winner'] ?? null,
        $r['result'] ?? null,
        $r['roundResult'] ?? null,
        $r['winLoss'] ?? null,
        $r['outcome'] ?? null,
        $r['iconColor'] ?? null,
        $r['color'] ?? null,
    ];

    foreach ($candidates as $cand) {
        $norm = normalizeWinnerValue($cand);
        if ($norm !== null) return $norm;
    }
    return null;
}

function mergeRoundOutcomesByNumber(array $baseRounds, array $iconRounds): array
{
    $byNum = [];
    foreach ($baseRounds as $r) {
        $n = (int)($r['roundNumber'] ?? 0);
        if ($n <= 0) continue;
        $byNum[$n] = $r;
    }

    foreach ($iconRounds as $r) {
        $n = (int)($r['roundNumber'] ?? 0);
        if ($n <= 0) continue;
        if (!isset($byNum[$n])) $byNum[$n] = ['roundNumber' => $n];
        if (isset($r['iconColor'])) {
            $byNum[$n]['iconColor'] = $r['iconColor'];
            $byNum[$n]['color'] = $r['iconColor'];
        }
        if (isset($r['endCondition']) && $r['endCondition'] !== null && $r['endCondition'] !== '') {
            $byNum[$n]['endCondition'] = $r['endCondition'];
        }
        if (isset($r['result']) && $r['result'] !== null && $r['result'] !== '') {
            $byNum[$n]['result'] = $r['result'];
        }
    }

    ksort($byNum, SORT_NUMERIC);
    return array_values($byNum);
}

function inferFirstHalfSideFromIcons(array $rounds): ?string
{
    $atkVotes = 0;
    $defVotes = 0;

    foreach ($rounds as $r) {
        $n = (int)($r['roundNumber'] ?? 0);
        if ($n < 1 || $n > 12) continue;

        $winner = normalizeWinnerValue($r['winner'] ?? null);
        $end    = normalizeEndConditionValue($r['endCondition'] ?? null);
        if ($winner === null || $end === null) continue;

        // Detonation => attacker win, Defuse => defender win.
        if ($end === 'spike_detonated') {
            if ($winner === 'us') $atkVotes++;
            if ($winner === 'them') $defVotes++;
        } elseif ($end === 'spike_defused') {
            if ($winner === 'us') $defVotes++;
            if ($winner === 'them') $atkVotes++;
        }
    }

    if ($atkVotes > $defVotes) return 'atk';
    if ($defVotes > $atkVotes) return 'def';
    return null;
}

function recomputeTimelineTeamMetrics(array &$rounds): array
{
    // Normalize + sort rounds first.
    $normRounds = [];
    foreach ($rounds as $r) {
        $num = (int)($r['roundNumber'] ?? 0);
        if ($num <= 0) continue;
        $normRounds[] = [
            'roundNumber'    => $num,
            'winner'         => inferWinnerFromRound($r),
            'endCondition'   => normalizeEndConditionValue($r['endCondition'] ?? null),
            'isPistolRound'  => ($num === 1 || $num === 13),
        ];
    }
    usort($normRounds, fn($a, $b) => $a['roundNumber'] <=> $b['roundNumber']);

    // Fallback to model-provided half labels only if icon inference cannot decide.
    $firstHalfSide = inferFirstHalfSideFromIcons($normRounds);
    if ($firstHalfSide === null) {
        foreach ($rounds as $r) {
            $n = (int)($r['roundNumber'] ?? 0);
            if ($n < 1 || $n > 12) continue;
            $h = strtolower(trim((string)($r['half'] ?? '')));
            if ($h === 'atk' || $h === 'def') {
                $firstHalfSide = $h;
                break;
            }
        }
    }
    if ($firstHalfSide === null) $firstHalfSide = 'def';

    $oppHalf = $firstHalfSide === 'atk' ? 'def' : 'atk';
    $byRound = [];
    foreach ($normRounds as $r) {
        $num = $r['roundNumber'];
        $half = $num <= 12 ? $firstHalfSide : $oppHalf;
        $winner = $r['winner'];
        $end    = $r['endCondition'];

        // Track row for replacing extracted rounds (team-metrics only normalization).
        $byRound[$num] = [
            'roundNumber'   => $num,
            'winner'        => $winner ?? ($rounds[$num - 1]['winner'] ?? null),
            'half'          => $half,
            'endCondition'  => $end ?? ($rounds[$num - 1]['endCondition'] ?? null),
            'postPlant'     => $end === 'spike_detonated',
            'isPistolRound' => ($num === 1 || $num === 13),
        ];
    }

    $metrics = [
        'atkRounds'      => 0,
        'atkWins'        => 0,
        'defRounds'      => 0,
        'defWins'        => 0,
        'postPlantTotal' => 0,
        'postPlantWins'  => 0,
        'atkPistolWin'   => 'Loss',
        'defPistolWin'   => 'Loss',
    ];

    foreach ($byRound as $r) {
        $half   = $r['half'];
        $winner = normalizeWinnerValue($r['winner']);
        $end    = normalizeEndConditionValue($r['endCondition']);

        if ($half === 'atk') {
            $metrics['atkRounds']++;
            if ($winner === 'us') $metrics['atkWins']++;

            // Plant happened on our attack if round ended in detonation OR defuse.
            if ($end === 'spike_detonated' || $end === 'spike_defused') {
                $metrics['postPlantTotal']++;
                if ($winner === 'us' && $end === 'spike_detonated') {
                    $metrics['postPlantWins']++;
                }
            }
        } else {
            $metrics['defRounds']++;
            if ($winner === 'us') $metrics['defWins']++;
        }

        if ($r['isPistolRound']) {
            if ($half === 'atk') {
                $metrics['atkPistolWin'] = $winner === 'us' ? 'Win' : 'Loss';
            } else {
                $metrics['defPistolWin'] = $winner === 'us' ? 'Win' : 'Loss';
            }
        }
    }

    $rounds = array_values($byRound);
    return $metrics;
}

// ──────────────────────────────────────────────────────────────
// STEP 1 — TAB DETECTION
// ──────────────────────────────────────────────────────────────
$screenshotType = 'scoreboard';

$tabMessages = buildUserMessage($imageDataUrl, <<<TAB
You are a Valorant expert. Look at this screenshot and determine which tab of the match results screen is shown.

Tabs:
- "summary"    — Large agent art left, "MATCH HIGHLIGHTS" table right with DEF/ATK columns.
- "scoreboard" — Player table with columns: AVG COMBAT SCORE, KDA, ECON RATING, FIRST BLOODS, PLANTS, DEFUSES.
- "timeline"   — Horizontal round strip (1,2,3…) at top, lower-left player panel with 10 rows showing name + agent.
- "performance"— Charts/graphs.
- "unknown"    — Cannot determine.

Return ONLY valid JSON: {"tab": "summary|scoreboard|timeline|performance|unknown"}
TAB);

$tabParsed      = parseJson(hfText(callHuggingFace($HF_API_KEY, $HF_MODEL, $tabMessages)));
$screenshotType = $tabParsed['tab'] ?? 'scoreboard';

// ──────────────────────────────────────────────────────────────
// STEP 2 — BRANCH: Summary / Timeline / Scoreboard
// ──────────────────────────────────────────────────────────────

// ── BRANCH A: Summary tab ─────────────────────────────────────
if ($screenshotType === 'summary') {

    $mainMessages = buildUserMessage($imageDataUrl, <<<SUMMARY
You are a Valorant esports data analyst. This is a SUMMARY tab screenshot.

Extract and return ONLY valid JSON (no markdown):
{
  "screenshotType": "summary",
  "date": "YYYY-MM-DD",
  "map": "<map name>",
  "type": "{$matchType}",
  "result": "Win or Loss",
  "score": "13-5",
  "mvpPlayer": "<player name>",
  "mvpAgent": "<agent name>",
  "mvpAcs": 345,
  "teamMetrics": {
    "defRounds": 13, "defWins": 8, "atkRounds": 5, "atkWins": 5,
    "postPlantTotal": 11, "postPlantWins": 7, "atkPistolWin": "Loss", "defPistolWin": "Loss"
  },
  "summaryHighlights": {
    "def_roundWins": 8, "def_firstBloods": 9, "def_firstBloodWins": 7,
    "def_eliminationWins": 5, "def_spikesDeployed": 7, "def_postSpikeWins": 3,
    "def_defusals": 3, "def_defTeamEliminated": 4, "def_detonations": 0,
    "atk_roundWins": 5, "atk_firstBloods": 4, "atk_firstBloodWins": 4,
    "atk_eliminationWins": 3, "atk_spikesDeployed": 4, "atk_postSpikeWins": 4,
    "atk_defusals": 0, "atk_defTeamEliminated": 2, "atk_detonations": 2
  },
  "playerStats": [],
  "confidence": "high|medium|low",
  "notes": ""
}

Valid maps: {$mapsJson}
Rules:
- result: "VICTORY" → Win, "DEFEAT" → Loss
- score: bigger number first if Win
- Use null for unreadable fields
- playerStats is always []
SUMMARY);

    $rawText   = hfText(callHuggingFace($HF_API_KEY, $HF_MODEL, $mainMessages));
    $extracted = parseJson($rawText) ?? [];

    if (empty($extracted)) sendError('Model returned unparseable JSON for Summary tab: ' . substr($rawText, 0, 300), 502);

    $extracted['screenshotType'] = 'summary';
    $extracted['type']           = $matchType;

    sendSuccess([
        'extracted'       => $extracted,
        'screenshotType'  => 'summary',
        'playerAgentMap'  => [],
        'raw'             => $rawText,
        'model'           => $HF_MODEL,
        'extractorBuild'  => $EXTRACTOR_BUILD,
        'processingSteps' => [
            'step1_tabDetection' => 'Detected: Summary tab',
            'step2_extraction'   => 'Completed',
            'step3_playerMerge'  => 'Skipped — Summary has no player rows',
        ],
    ]);
}

// ── BRANCH B: Timeline tab ────────────────────────────────────
if ($screenshotType === 'timeline') {

    // Pass 1 — round-by-round data + team metrics
    $timelineMessages = buildUserMessage($imageDataUrl, <<<TIMELINE
I'm sharing a cropped image of a Valorant match TIMELINE icon row. Each icon represents one round result for my team. Analyze every round icon left to right and extract both win/loss results and ATK/DEF side stats.

Icon Legend:

Teal/green flame = Win (ATK round win)
Teal/green claw = Win (DEF round win)
Teal/green X inside circle = Win
Gold/yellow star = Win
Red flame = Loss (DEF round loss)
Red claw = Loss (ATK round loss)
Red X inside circle = Loss

Rules:

- ANY teal, green, or gold/yellow icon = WIN
- ANY red icon = LOSS
- Count icons left to right, labeled position 1 through N

Side determination (first half, rounds 1-12):

- Red claw OR teal flame in rounds 1-12 -> team started as ATTACKER
- Green claw OR red flame in rounds 1-12 -> team started as DEFENDER

Side swaps after round 12 (halftime):
Rounds 13+ are the opposite side.

Pistol Round Checker (must include):

- Treat Round 1 and Round 13 as pistol rounds.
- Determine your team's side for each pistol:
  - Round 1 side = starting side
  - Round 13 side = opposite side after halftime
- For each pistol round, output:
  - Round number
  - Side (ATK/DEF)
  - Icon color
  - Win/Loss result
- Also summarize pistol performance:
  - Pistol wins / pistol losses
  - State explicitly whether your team won/lost R1 pistol and R13 pistol

Tasks:

- List every round number with its icon color and Win/Loss result
- Count total Wins and total Losses overall
- List which round numbers were wins
- Identify which side the team started on (ATK or DEF) based on rounds 1-12 icons
- Count Wins and Losses for rounds 1-12 (starting side)
- Count Wins and Losses for rounds 13+ (opposite side)
- Verify total wins match any visible scoreboard (e.g. 6-13)

Valid maps: {$mapsJson}

Return ONLY valid JSON:
{
  "screenshotType": "timeline",
  "date": "YYYY-MM-DD or null",
  "map": "<map name or null>",
  "type": "{$matchType}",
  "result": "Win or Loss",
  "score": "13-5",
  "rounds": [
    {"roundNumber":1,"winner":"us","half":"def","endCondition":"elimination","postPlant":false,"isPistolRound":true}
  ],
  "teamMetrics": {"atkRounds":6,"atkWins":5,"defRounds":12,"defWins":8,"postPlantTotal":9,"postPlantWins":6,"atkPistolWin":"Win","defPistolWin":"Loss"},
  "playerStats": [],
  "confidence": "high|medium|low",
  "notes": ""
}
TIMELINE);

    $rawText   = hfText(callHuggingFace($HF_API_KEY, $HF_MODEL, $timelineMessages));
    $extracted = parseJson($rawText) ?? [];

    if (empty($extracted)) sendError('Model returned unparseable JSON for Timeline tab: ' . substr($rawText, 0, 300), 502);

    $extracted['screenshotType'] = 'timeline';
    $extracted['type']           = $matchType;
    $extractedRounds = is_array($extracted['rounds'] ?? null) ? $extracted['rounds'] : [];
    // Dedicated icon pass for team metrics reliability (winner by icon color).
    $iconRounds = [];
    $iconMessages = buildUserMessage($imageDataUrl, <<<ICONPASS
Read the TIMELINE icon row only (rounds left to right, 1..N).

For each round icon extract:
- roundNumber
- iconColor: "teal" | "green" | "gold" | "yellow" | "red" | "pink"
- endCondition: "elimination" | "spike_detonated" | "spike_defused" | "time_expired" | "surrender"
- result: "Win" if iconColor is teal/green/gold/yellow, "Loss" if iconColor is red/pink

Return ONLY valid JSON:
{
  "rounds": [
    {"roundNumber":1,"iconColor":"red","endCondition":"elimination","result":"Loss"}
  ]
}
ICONPASS);
    $iconRaw = hfText(callHuggingFace($HF_API_KEY, $HF_MODEL, $iconMessages));
    $iconParsed = parseJson($iconRaw) ?? [];
    if (is_array($iconParsed['rounds'] ?? null)) {
        $iconRounds = $iconParsed['rounds'];
    }
    if (!empty($iconRounds)) {
        $extractedRounds = mergeRoundOutcomesByNumber($extractedRounds, $iconRounds);
    }
    if (!empty($extractedRounds)) {
        // Keep existing rounds played (already correct); only correct wins+pistols/post-plant.
        $computed = recomputeTimelineTeamMetrics($extractedRounds);
        $currentMetrics = is_array($extracted['teamMetrics'] ?? null) ? $extracted['teamMetrics'] : [];
        $extracted['teamMetrics'] = array_merge($currentMetrics, [
            'atkWins'       => $computed['atkWins'],
            'defWins'       => $computed['defWins'],
            'atkPistolWin'  => $computed['atkPistolWin'],
            'defPistolWin'  => $computed['defPistolWin'],
            'postPlantTotal'=> $computed['postPlantTotal'],
            'postPlantWins' => $computed['postPlantWins'],
        ]);
        $extracted['rounds']      = $extractedRounds;
    }

    // ── Pass 2 — extract player names + agents from the player panel ──
    // The lower-left panel has 10 rows: top 5 = our team (teal), bottom 5 = opponents (red).
    // We crop to the teal half if possible, then ask the model to read the text.

    $agentImageDataUrl = $imageDataUrl; // fallback: full image

    if (function_exists('imagecreatefromstring')) {
        $imgData = base64_decode(preg_replace('/^data:[^;]+;base64,/', '', $imageDataUrl));
        $src     = @imagecreatefromstring($imgData);
        if ($src !== false) {
            $fullW = imagesx($src);
            $fullH = imagesy($src);

            // Crop: lower-left timeline player panel where names + agents are printed.
            // Keep it wide/tall enough to include all 5 teal rows on common resolutions.
            $cropX = 0;
            $cropY = (int)($fullH * 0.58);
            $cropW = (int)($fullW * 0.52);
            $cropH = (int)($fullH * 0.40);

            $cropped = imagecreatetruecolor($cropW, $cropH);
            imagecopy($cropped, $src, 0, 0, $cropX, $cropY, $cropW, $cropH);

            ob_start();
            imagepng($cropped);
            $pngBytes = ob_get_clean();
            imagedestroy($src);
            imagedestroy($cropped);

            if ($pngBytes) {
                $agentImageDataUrl = 'data:image/png;base64,' . base64_encode($pngBytes);
            }
        }
    }

    $agentMessages = buildUserMessage($agentImageDataUrl, <<<AGENTPROMPT
You are reading a Valorant TIMELINE tab screenshot (or a cropped portion of its lower-left player panel).

The player panel has rows. Each row shows:
  Line 1: the player's display name / IGN
  Line 2: the agent name they are playing (TEXT — read the label, do NOT guess from icons)

Extract the top 5 rows only (these are OUR team — the teal/green team).

CRITICAL INSTRUCTIONS:
- Read the AGENT NAME TEXT that appears beneath each player name. It is written in plain text.
- Do NOT guess agents from icon colours or artwork — read the actual text label.
- Pay close attention to similar-looking agent names. For example:
    "Tejo" and "Iso" are two DIFFERENT agents — read the text carefully.
    "Viper" and "Vyse" are two DIFFERENT agents — read the text carefully.
- The agent name must exactly match one of the valid names listed below.
- If you are unsure between two similar names, pick the one whose text most closely matches what is written.

Valid agent names: {$agentsJson}

Return ONLY valid JSON:
{
  "playerAgentMap": [
    {"player":"NAME","agent":"AGENT"},
    {"player":"NAME","agent":"AGENT"},
    {"player":"NAME","agent":"AGENT"},
    {"player":"NAME","agent":"AGENT"},
    {"player":"NAME","agent":"AGENT"}
  ]
}
AGENTPROMPT);

    $agentRaw    = hfText(callHuggingFace($HF_API_KEY, $HF_MODEL, $agentMessages));
    $agentParsed = parseJson($agentRaw) ?? [];
    $playerAgentMap = $agentParsed['playerAgentMap'] ?? [];

    // Validate + clean
    $dbAgentList = json_decode($agentsJson, true) ?? [];
    $playerAgentMap = cleanPlayerAgentMap(is_array($playerAgentMap) ? $playerAgentMap : [], $dbAgentList);

    // If output looks suspicious (missing rows or duplicate agents), force a stricter OCR retry.
    $needsStrictRetry = count($playerAgentMap) < 5 || hasDuplicateAgents($playerAgentMap);
    if ($needsStrictRetry) {
        $strictMessages = buildUserMessage($imageDataUrl, <<<STRICTAGENTS
You are an OCR extractor for a Valorant TIMELINE screenshot.

Read ONLY the lower-left player panel and extract OUR TEAM (top 5 teal rows).
Each row has:
  - player name (line 1)
  - agent name text directly below it (line 2)

CRITICAL RULES:
- Agent MUST come from the TEXT label below the player name.
- Never infer from portrait/icon/artwork colors.
- If text is unreadable, set agent to null.
- The 5 players on one team must have 5 different agents (no duplicates).
- Keep exact player spelling from the screenshot.

Valid agent names: {$agentsJson}

Return ONLY valid JSON:
{
  "playerAgentMap": [
    {"player":"NAME","agent":"AGENT_OR_NULL"},
    {"player":"NAME","agent":"AGENT_OR_NULL"},
    {"player":"NAME","agent":"AGENT_OR_NULL"},
    {"player":"NAME","agent":"AGENT_OR_NULL"},
    {"player":"NAME","agent":"AGENT_OR_NULL"}
  ]
}
STRICTAGENTS);

        $strictRaw    = hfText(callHuggingFace($HF_API_KEY, $HF_MODEL, $strictMessages));
        $strictParsed = parseJson($strictRaw) ?? [];
        $strictMap    = cleanPlayerAgentMap(is_array($strictParsed['playerAgentMap'] ?? null) ? $strictParsed['playerAgentMap'] : [], $dbAgentList);

        if (!empty($strictMap) && (!hasDuplicateAgents($strictMap) || count($strictMap) >= count($playerAgentMap))) {
            $playerAgentMap = $strictMap;
        }
    }

    // Fallback: retry on full image if nothing extracted
    if (empty($playerAgentMap)) {
        $fallbackMessages = buildUserMessage($imageDataUrl, <<<FALLBACK
You are an OCR extractor for a Valorant TIMELINE screenshot.

Read ONLY the lower-left player table. It has 10 rows:
  - Top 5 rows = teal/green team (OUR team)
  - Bottom 5 rows = red team (opponents)

For each row extract:
  - rowPosition (1..10 top to bottom)
  - player (display name)
  - agent (agent name TEXT below the player name — read the label, not the icon. "Tejo" and "Iso" are different agents. "Viper" and "Vyse" are different agents.)
  - rowColor ("teal" or "red")

Valid agent names: {$agentsJson}

Return ONLY valid JSON:
{
  "rows": [
    {"rowPosition":1,"player":"NAME","agent":"AGENT","rowColor":"teal"}
  ]
}
FALLBACK);

        $fallbackRaw    = hfText(callHuggingFace($HF_API_KEY, $HF_MODEL, $fallbackMessages));
        $fallbackParsed = parseJson($fallbackRaw) ?? [];

        $rows = $fallbackParsed['rows'] ?? $fallbackParsed['playerRows'] ?? [];
        $rows = is_array($rows) ? $rows : [];

        // Keep teal rows; if none labelled, take first 5
        $tealRows = array_filter($rows, fn($r) => in_array(strtolower(trim((string)($r['rowColor'] ?? ''))), ['teal', 'green', 'cyan']));
        if (empty($tealRows) && !empty($rows)) {
            usort($rows, fn($a, $b) => (int)($a['rowPosition'] ?? 999) - (int)($b['rowPosition'] ?? 999));
            $tealRows = array_slice($rows, 0, 5);
        }

        $fallbackMap = cleanPlayerAgentMap($tealRows, $dbAgentList);

        if (!empty($fallbackMap)) $playerAgentMap = $fallbackMap;
    }

    $extracted['playerAgentMap'] = $playerAgentMap;

    sendSuccess([
        'extracted'       => $extracted,
        'screenshotType'  => 'timeline',
        'playerAgentMap'  => $playerAgentMap,
        'raw'             => $rawText,
        'model'           => $HF_MODEL,
        'extractorBuild'  => $EXTRACTOR_BUILD,
        'processingSteps' => [
            'step1_tabDetection' => 'Detected: Timeline tab',
            'step2_extraction'   => 'Completed — round-by-round data extracted',
            'step3_playerMerge'  => empty($playerAgentMap)
                ? 'Agent panel not found or unreadable'
                : 'Extracted ' . count($playerAgentMap) . ' player→agent mappings',
        ],
    ]);
}

// ── BRANCH C: Scoreboard tab ──────────────────────────────────
//
// KEY DESIGN:
//   If the caller passed a playerAgentMap from a Timeline scan,
//   we use THOSE player names as the authoritative list and ask the
//   model to find each player's row by name — ignoring row colour.
//   The agent for each player also comes from the Timeline map.
//
//   If no playerAgentMap was passed (standalone scoreboard upload),
//   we fall back to teal-row detection.
//

$dbAgentList = json_decode($agentsJson, true) ?? [];
$hasTimelinePam = !empty($incomingPam);

if ($hasTimelinePam) {
    // ── SCOREBOARD WITH TIMELINE DATA ────────────────────────
    // Build a readable list of the 5 players the model must find
    $playerLookupLines = [];
    $agentByNormKey    = [];

    foreach ($incomingPam as $entry) {
        $pName = trim((string)($entry['player'] ?? ''));
        $aName = trim((string)($entry['agent']  ?? ''));
        if ($pName === '') continue;
        $playerLookupLines[] = "  - \"$pName\"";
        $agentByNormKey[normaliseKey($pName)] = $aName ?: null;
    }

    $playerListStr = implode("\n", $playerLookupLines);

    $scoreboardPrompt = <<<PROMPT
You are a Valorant esports data analyst reading a SCOREBOARD screenshot.

The scoreboard is a TABLE. Each row is a different player with DIFFERENT numbers.
You must read the actual number shown in the cell for EACH player individually.
DO NOT copy the same stats to multiple players — every player has unique numbers.

OUR TEAM PLAYERS (find these exact names, each is a separate row in the table):
{$playerListStr}

COLUMN MAPPING — read these specific columns for each player:
  AVG COMBAT SCORE column → acs
  K column (or KILLS)     → kills
  D column (or DEATHS)    → deaths
  A column (or ASSISTS)   → assists
  ADR column              → adr  (null if not shown)
  KAST column             → kast (null if not shown)
  FIRST BLOODS column     → firstBloods (integer)
  PLANTS column           → plants (integer)
  DEFUSES column          → defuses (integer)

STEP-BY-STEP INSTRUCTIONS:
1. Locate each player's row by their name.
2. For that row, read the number in EACH column independently.
3. Every player will have DIFFERENT numbers — the top player has higher ACS than the bottom player.
4. DO NOT repeat the same number for multiple players.

Also extract match header info: date, map, result (Win/Loss), score (e.g. "13-5"), opponent, tournament, stage.
Valid maps: {$mapsJson}

Return ONLY valid JSON (no markdown). IMPORTANT: each player object must have the ACTUAL numbers read from their row — they must NOT all be the same:
{
  "screenshotType": "scoreboard",
  "date": "YYYY-MM-DD or null",
  "map": "<map name>",
  "type": "{$matchType}",
  "result": "Win or Loss",
  "score": "<score>",
  "opponent": null,
  "tournament": null,
  "stage": null,
  "playerStats": [
    {
      "player": "<name from list above>",
      "acs": <ACTUAL number from ACS column for THIS player — NOT a placeholder>,
      "kills": <ACTUAL number from K column for THIS player>,
      "deaths": <ACTUAL number from D column for THIS player>,
      "assists": <ACTUAL number from A column for THIS player>,
      "adr": <ACTUAL number or null>,
      "kast": <ACTUAL number or null>,
      "fkRate": null,
      "clutchRate": null,
      "firstBloods": <ACTUAL number from FIRST BLOODS column>,
      "plants": <ACTUAL number from PLANTS column>,
      "defuses": <ACTUAL number from DEFUSES column>
    }
  ],
  "teamMetrics": {
    "atkRounds": 0, "atkWins": 0, "defRounds": 0, "defWins": 0,
    "postPlantTotal": 0, "postPlantWins": 0, "atkPistolWin": "Loss", "defPistolWin": "Loss"
  },
  "confidence": "high|medium|low",
  "notes": ""
}

CRITICAL RULES:
- Each player's acs, kills, deaths, assists MUST be different from each other.
- If all 5 players end up with the same ACS value, you have made an error — re-read the screenshot.
- fkRate and clutchRate are 0.0–1.0 decimals (null if column not visible).
- teamMetrics all zeros — team metrics come from the Timeline screenshot.
- Include EXACTLY the 5 players listed — no more, no less.
PROMPT;

    $mainMessages = buildUserMessage($imageDataUrl, $scoreboardPrompt);
    $rawText      = hfText(callHuggingFace($HF_API_KEY, $HF_MODEL, $mainMessages));
    $extracted    = parseJson($rawText);

    if (!$extracted) sendError('Model returned unparseable JSON: ' . substr($rawText, 0, 300), 502);

    // ── Identical-stats guard: detect if model copied the same numbers for all players ──
    // This is the most common failure mode — the model uses the example values as a template.
    $statsRows = $extracted['playerStats'] ?? [];
    $acsValues = array_filter(array_column($statsRows, 'acs'), fn($v) => $v !== null);
    $allSameAcs = count($acsValues) >= 2 && count(array_unique($acsValues)) === 1;

    if ($allSameAcs && count($statsRows) >= 2) {
        // Retry with an even more explicit prompt that includes actual player names
        $namedPlayerLines = [];
        foreach ($incomingPam as $entry) {
            $pName = trim((string)($entry['player'] ?? ''));
            if ($pName !== '') $namedPlayerLines[] = "  - Player \"$pName\": read their row's ACS, K, D, A, FIRST BLOODS, PLANTS, DEFUSES";
        }
        $namedStr = implode("\n", $namedPlayerLines);

        $retryPrompt = <<<RETRY
This is a Valorant SCOREBOARD screenshot showing a table of player stats.
Each row in the table belongs to a DIFFERENT player and has DIFFERENT numbers.

I need you to read the ACTUAL numbers from the screenshot for each specific player.
DO NOT use placeholder values. DO NOT copy the same number to multiple players.

Find each player by their name and read the number actually shown in their row:
{$namedStr}

The columns you must read from (left to right in the table):
  AVG COMBAT SCORE (or ACS) → acs
  K (kills) → kills
  D (deaths) → deaths
  A (assists) → assists
  FIRST BLOODS → firstBloods
  PLANTS → plants
  DEFUSES → defuses

Return ONLY valid JSON — each player MUST have different acs/kills/deaths values:
{
  "playerStats": [
    {"player": "<name>", "acs": <number>, "kills": <number>, "deaths": <number>, "assists": <number>, "adr": null, "kast": null, "fkRate": null, "clutchRate": null, "firstBloods": <number>, "plants": <number>, "defuses": <number>}
  ]
}
RETRY;

        $retryMessages  = buildUserMessage($imageDataUrl, $retryPrompt);
        $retryRaw       = hfText(callHuggingFace($HF_API_KEY, $HF_MODEL, $retryMessages));
        $retryExtracted = parseJson($retryRaw);

        if (!empty($retryExtracted['playerStats'])) {
            // Merge retry playerStats into the main extracted object
            $extracted['playerStats'] = $retryExtracted['playerStats'];
            $extracted['notes'] = ($extracted['notes'] ?? '') . ' [auto-retry: identical-stats detected]';
        }
    }

    // ── Post-process: whitelist filter + Timeline agent injection ──
    //
    // CRITICAL: The model often returns all 10 rows despite being told to
    // return only 5. We enforce the whitelist here in PHP — a row is only
    // kept if its normalised player name exists in $agentByNormKey (i.e. it
    // was in the Timeline's playerAgentMap). Enemy rows are silently dropped.
    $finalStats       = [];
    $matchedNormKeys  = []; // track which PAM players we already filled

    foreach ($extracted['playerStats'] ?? [] as $row) {
        $normKey = normaliseKey((string)($row['player'] ?? ''));

        // ── WHITELIST CHECK — drop any row not in the Timeline PAM ──
        if (!array_key_exists($normKey, $agentByNormKey)) {
            continue; // this is an enemy player — skip
        }

        // Avoid duplicates (model sometimes returns the same player twice)
        if (in_array($normKey, $matchedNormKeys)) continue;
        $matchedNormKeys[] = $normKey;

        // Use canonical name spelling from the Timeline PAM
        $canonicalName = $row['player'];
        foreach ($incomingPam as $pam) {
            if (normaliseKey($pam['player']) === $normKey) {
                $canonicalName = $pam['player'];
                break;
            }
        }

        $timelineAgent = $agentByNormKey[$normKey];

        $finalStats[] = [
            'player'      => $canonicalName,
            // Agent always comes from Timeline — never from the scoreboard icons
            'agent'       => $timelineAgent ? validateAgentName($timelineAgent, $dbAgentList) : null,
            'acs'         => $row['acs']        ?? null,
            'kills'       => $row['kills']      ?? null,
            'deaths'      => $row['deaths']     ?? null,
            'assists'     => $row['assists']    ?? null,
            'adr'         => $row['adr']        ?? null,
            'kast'        => $row['kast']       ?? null,
            'fkRate'      => $row['fkRate']     ?? null,
            'clutchRate'  => $row['clutchRate'] ?? null,
            'firstBloods' => $row['firstBloods'] ?? 0,
            'plants'      => $row['plants']      ?? 0,
            'defuses'     => $row['defuses']     ?? 0,
        ];
    }

    // If the model missed some players (name mismatch), add blank rows
    // so the frontend always gets all 5 players.
    $returnedNormKeys = array_map(fn($r) => normaliseKey($r['player']), $finalStats);
    foreach ($incomingPam as $pam) {
        $pName = trim((string)($pam['player'] ?? ''));
        if ($pName === '') continue;
        if (!in_array(normaliseKey($pName), $returnedNormKeys)) {
            $agent = trim((string)($pam['agent'] ?? ''));
            $finalStats[] = [
                'player'      => $pName,
                'agent'       => $agent !== '' ? validateAgentName($agent, $dbAgentList) : null,
                'acs'         => null,
                'kills'       => null,
                'deaths'      => null,
                'assists'     => null,
                'adr'         => null,
                'kast'        => null,
                'fkRate'      => null,
                'clutchRate'  => null,
                'firstBloods' => 0,
                'plants'      => 0,
                'defuses'     => 0,
            ];
        }
    }

    $extracted['playerStats']    = $finalStats;
    $extracted['screenshotType'] = 'scoreboard';
    $extracted['type']           = $matchType;
    $extracted['teamFilter']     = 'timeline_authoritative';

    sendSuccess([
        'extracted'       => $extracted,
        'screenshotType'  => 'scoreboard',
        'playerAgentMap'  => $incomingPam,
        'raw'             => $rawText,
        'model'           => $HF_MODEL,
        'extractorBuild'  => $EXTRACTOR_BUILD,
        'processingSteps' => [
            'step1_tabDetection' => 'Detected: Scoreboard tab',
            'step2_extraction'   => 'Completed — stats extracted by player name (Timeline authoritative)',
            'step3_playerMerge'  => 'Agents injected from Timeline playerAgentMap — scoreboard icons ignored',
        ],
    ]);
}

// ── SCOREBOARD STANDALONE (no Timeline data) ──────────────────
// Original teal-row detection fallback when no playerAgentMap provided.

// SCOREBOARD STANDALONE (no Timeline data)
$scoreboardPrompt = <<<PROMPT
Please follow these guidelines when extracting rows: Identify the rows with a green or blue-green background. These rows represent our team (TEAL side) and should be included. Identify the rows with a red or maroon background. These rows represent the opposing team (RED side) and should be excluded.

Valid maps: {$mapsJson}
Valid agents: {$agentsJson}

Return ONLY valid JSON (no markdown):
{
  "screenshotType": "scoreboard",
  "date": "YYYY-MM-DD",
  "map": "<map>",
  "type": "{$matchType}",
  "result": "Win",
  "score": "13-5",
  "opponent": null,
  "tournament": null,
  "stage": null,
  "playerStats": [
    {
      "player": "<IGN exactly as shown>",
      "agent": "<agent name>",
      "acs": 287,
      "kills": 22,
      "deaths": 15,
      "assists": 4,
      "adr": 178,
      "kast": 76,
      "fkRate": 0.68,
      "clutchRate": 0.50,
      "firstBloods": 0,
      "plants": 0,
      "defuses": 0
    }
  ],
  "teamMetrics": {
    "atkRounds": 0, "atkWins": 0, "defRounds": 0, "defWins": 0,
    "postPlantTotal": 0, "postPlantWins": 0, "atkPistolWin": "Loss", "defPistolWin": "Loss"
  },
  "confidence": "high|medium|low",
  "notes": ""
}
PROMPT;

$mainMessages = buildUserMessage($imageDataUrl, $scoreboardPrompt);
$rawText      = hfText(callHuggingFace($HF_API_KEY, $HF_MODEL, $mainMessages));
$extracted    = parseJson($rawText);

if (!$extracted) sendError('Model returned unparseable JSON: ' . substr($rawText, 0, 300), 502);

// Validate agent names and enforce hard cap of 5 players.
// The model often ignores the "teal rows only" instruction and returns all 10.
// Without a Timeline whitelist we cannot know exactly which 5 are ours, so we
// cap at 5 and let the user correct any mistakes in the review form.
$rawStats = array_slice($extracted['playerStats'] ?? [], 0, 5);
foreach ($rawStats as &$player) {
    if (!empty($player['agent'])) {
        $player['agent'] = validateAgentName($player['agent'], $dbAgentList);
    }
}
unset($player);
$extracted['playerStats']    = $rawStats;
$extracted['screenshotType'] = 'scoreboard';
$extracted['type']           = $matchType;
$extracted['teamFilter']     = 'teal_rows_only';

sendSuccess([
    'extracted'       => $extracted,
    'screenshotType'  => 'scoreboard',
    'playerAgentMap'  => [],
    'raw'             => $rawText,
    'model'           => $HF_MODEL,
    'extractorBuild'  => $EXTRACTOR_BUILD,
    'processingSteps' => [
        'step1_tabDetection' => 'Detected: Scoreboard tab',
        'step2_extraction'   => 'Completed — teal rows only (no Timeline data provided)',
        'step3_playerMerge'  => 'Skipped — upload a Timeline screenshot first for accurate agents',
    ],
]);
