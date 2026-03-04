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
// UPDATED: 2026-03-04-v6-summary-scoreboard-only
// - TIMELINE is no longer required.
// - SUMMARY: extracts Round Wins per half + OT (if present) and computes team metrics.
// - SCOREBOARD: extracts ONLY player, agent (text), ACS, K/D/A (from KDA column).
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
$OPENAI_API_KEY  = $_ENV['OPENAI_API_KEY'] ?? getenv('OPENAI_API_KEY') ?: '';
$OPENAI_MODEL    = $_ENV['OPENAI_MODEL']   ?? getenv('OPENAI_MODEL')   ?: 'gpt-4o';
$EXTRACTOR_BUILD = '2026-03-04-v6-summary-scoreboard-only';

if (empty($OPENAI_API_KEY)) {
    sendError('OPENAI_API_KEY not configured. See https://platform.openai.com/api-keys', 500);
}

// ── Validate upload ───────────────────────────────────────────
if (empty($_FILES['file'])) sendError('No file uploaded', 422);

$file      = $_FILES['file'];
$matchType = $_POST['type'] ?? 'Scrim';

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

// ── Helper: Call OpenAI ───────────────────────────────────────
function callOpenAI(string $apiKey, string $model, array $messages, bool $jsonMode = true): array
{
    if ($jsonMode) {
        array_unshift($messages, [
            'role'    => 'system',
            'content' => 'You are a precise data extraction assistant. You MUST respond with ONLY valid JSON — no markdown, no code fences, no explanation, no preamble. Your entire response must be a single parseable JSON object.',
        ]);
    }

    $payload = [
        'model'       => $model,
        'messages'    => $messages,
        'temperature' => 0.1,
        'max_tokens'  => 4096,
    ];

    if ($jsonMode) {
        $payload['response_format'] = ['type' => 'json_object'];
    }

    $ch = curl_init('https://api.openai.com/v1/chat/completions');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            "Authorization: Bearer {$apiKey}",
        ],
        CURLOPT_POSTFIELDS     => json_encode($payload),
        CURLOPT_TIMEOUT        => 120,
    ]);

    $response   = curl_exec($ch);
    $httpStatus = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError  = curl_error($ch);
    curl_close($ch);

    if ($curlError) sendError("Failed to contact OpenAI API: $curlError", 502);

    $decoded = json_decode($response, true);

    if ($httpStatus === 429) sendError('OpenAI rate limit exceeded or quota reached. Check your usage at https://platform.openai.com/usage', 429);
    if ($httpStatus === 401) sendError('OpenAI API key invalid or missing. Check OPENAI_API_KEY in your .env file.', 401);

    if ($httpStatus !== 200 || empty($decoded['choices'][0]['message']['content'])) {
        $errMsg = $decoded['error']['message'] ?? $decoded['error'] ?? "HTTP $httpStatus";
        sendError("OpenAI API error: $errMsg", 502);
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
        $content[] = [
            'type'      => 'image_url',
            'image_url' => ['url' => $imageDataUrl],
        ];
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

function validateAgentName(?string $candidate, array $dbAgents): ?string
{
    if ($candidate === null) return null;
    $candidate = trim($candidate);
    if ($candidate === '') return null;

    foreach ($dbAgents as $agent) {
        if (strtolower($agent) === strtolower($candidate)) return $agent;
    }
    foreach ($dbAgents as $agent) {
        if (stripos($agent, $candidate) !== false || stripos($candidate, $agent) !== false) return $agent;
    }
    return $candidate;
}

function parseScorePair(?string $score): array
{
    // Accept "14-12", "14 – 12", "14–12"
    $s = trim((string)$score);
    $s = str_replace(['—', '–'], '-', $s);
    $s = preg_replace('/\s+/', '', $s);

    if (!preg_match('/^(\d+)\-(\d+)$/', $s, $m)) return [null, null];
    return [(int)$m[1], (int)$m[2]];
}

/**
 * Build TEAM METRICS purely from SUMMARY values:
 * - first half rounds = 12
 * - second half rounds = 12
 * - overtime rounds = max(0, totalRounds - 24)
 * - split atkWins/defWins using the side labels shown in SUMMARY (ATK/DEF)
 */
function computeTeamMetricsFromSummary(array $summary): array
{
    [$yourScore, $enemyScore] = parseScorePair($summary['score'] ?? null);

    $firstHalfWins  = isset($summary['firstHalfWins']) ? (int)$summary['firstHalfWins'] : null;
    $secondHalfWins = isset($summary['secondHalfWins']) ? (int)$summary['secondHalfWins'] : null;

    $firstHalfSide  = strtoupper(trim((string)($summary['firstHalfSide'] ?? '')));
    $secondHalfSide = strtoupper(trim((string)($summary['secondHalfSide'] ?? '')));

    $otWinsFromUI = $summary['overtimeWins'] ?? null;
    if ($otWinsFromUI === '' || $otWinsFromUI === null) $otWinsFromUI = null;
    if ($otWinsFromUI !== null) $otWinsFromUI = (int)$otWinsFromUI;

    $totalRounds = ($yourScore !== null && $enemyScore !== null) ? ($yourScore + $enemyScore) : null;

    // First half is always 12 rounds
    $firstHalfRounds = 12;

    // Second half rounds depend on total rounds:
    // - If match ends early (e.g. 13-10 = 23), second half is 11
    // - If match goes full regulation (e.g. 13-11 = 24), second half is 12
    // - If OT exists, second half is still 12, OT is extra
    $secondHalfRounds = ($totalRounds !== null) ? max(0, min(12, $totalRounds - 12)) : null;

    // Overtime rounds only after 24
    $otRounds = ($totalRounds !== null) ? max(0, $totalRounds - 24) : 0;

    // Enemy wins per half MUST use actual rounds in that half
    $enemyFirstHalfWins = ($firstHalfWins !== null) ? ($firstHalfRounds - $firstHalfWins) : null;
    $enemySecondHalfWins = ($secondHalfWins !== null && $secondHalfRounds !== null)
        ? ($secondHalfRounds - $secondHalfWins)
        : null;

    // OT wins/losses
    $otWins   = ($otRounds > 0) ? ($otWinsFromUI ?? null) : 0;
    $otLosses = ($otRounds > 0 && $otWins !== null) ? max(0, $otRounds - $otWins) : (($otRounds > 0) ? null : 0);

    // Compute rounds + wins per side based on the side labels shown on Summary
    $atkRounds = 0;
    $defRounds = 0;
    $atkWins   = 0;
    $defWins   = 0;

    if ($firstHalfSide === 'ATK') {
        $atkRounds += $firstHalfRounds;
        $atkWins += ($firstHalfWins ?? 0);
    }
    if ($firstHalfSide === 'DEF') {
        $defRounds += $firstHalfRounds;
        $defWins += ($firstHalfWins ?? 0);
    }

    if ($secondHalfRounds !== null) {
        if ($secondHalfSide === 'ATK') {
            $atkRounds += $secondHalfRounds;
            $atkWins += ($secondHalfWins ?? 0);
        }
        if ($secondHalfSide === 'DEF') {
            $defRounds += $secondHalfRounds;
            $defWins += ($secondHalfWins ?? 0);
        }
    }

    $atkLosses = max(0, $atkRounds - $atkWins);
    $defLosses = max(0, $defRounds - $defWins);

    return [
        'atkRounds'      => $atkRounds,
        'atkWins'        => $atkWins,
        'atkLosses'      => $atkLosses,
        'defRounds'      => $defRounds,
        'defWins'        => $defWins,
        'defLosses'      => $defLosses,
        'otRounds'       => $otRounds,
        'otWins'         => $otWins,
        'otLosses'       => $otLosses,

        // Not available without timeline:
        'postPlantTotal' => 0,
        'postPlantWins'  => 0,
        'atkPistolWin'   => null,
        'defPistolWin'   => null,

        // Helpful breakdowns
        'firstHalf' => [
            'side'      => ($firstHalfSide === 'ATK' || $firstHalfSide === 'DEF') ? $firstHalfSide : null,
            'yourWins'  => $firstHalfWins,
            'enemyWins' => $enemyFirstHalfWins,
            'rounds'    => $firstHalfRounds,
        ],
        'secondHalf' => [
            'side'      => ($secondHalfSide === 'ATK' || $secondHalfSide === 'DEF') ? $secondHalfSide : null,
            'yourWins'  => $secondHalfWins,
            'enemyWins' => $enemySecondHalfWins,
            'rounds'    => $secondHalfRounds,
        ],
        'totalRoundsPlayed' => $totalRounds,
        'finalScore'        => ($yourScore !== null && $enemyScore !== null) ? "{$yourScore}-{$enemyScore}" : null,
    ];
}

// ──────────────────────────────────────────────────────────────
// STEP 1 — TAB DETECTION
// ──────────────────────────────────────────────────────────────
$tabMessages = buildUserMessage($imageDataUrl, <<<TAB
You are a Valorant expert. Look at this screenshot and determine which tab of the match results screen is shown.

Tabs:
- "summary"    — Top shows VICTORY/DEFEAT and score; right shows "Match Highlights" including "ROUND WINS" boxes for 1st Half / 2nd Half (and sometimes OVERTIME).
- "scoreboard" — Player table with columns: AVG COMBAT SCORE, KDA, ECON, FIRST BLOODS, PLANTS, DEFUSES.
- "timeline"   — Horizontal round strip (1,2,3…) at top.
- "performance"— Charts/graphs.
- "unknown"    — Cannot determine.

Return ONLY valid JSON: {"tab":"summary|scoreboard|timeline|performance|unknown"}
TAB);

$tabParsed      = parseJson(hfText(callOpenAI($OPENAI_API_KEY, $OPENAI_MODEL, $tabMessages))) ?? [];
$screenshotType = $tabParsed['tab'] ?? 'unknown';

// ──────────────────────────────────────────────────────────────
// BRANCH: SUMMARY / SCOREBOARD ONLY
// ──────────────────────────────────────────────────────────────

if ($screenshotType === 'timeline') {
    // You said you no longer need timeline — keep it explicit.
    sendError('Timeline screenshots are no longer supported in this flow. Please upload Summary or Scoreboard.', 422);
}
if ($screenshotType === 'performance') {
    sendError('Performance screenshots are not supported. Please upload Summary or Scoreboard.', 422);
}
if ($screenshotType === 'unknown') {
    sendError('Cannot determine tab type. Please upload a clear Summary or Scoreboard screenshot.', 422);
}

// ── SUMMARY ────────────────────────────────────────────────────
if ($screenshotType === 'summary') {

    $summaryMessages = buildUserMessage($imageDataUrl, <<<SUMMARY
You are a Valorant esports data extraction assistant reading the SUMMARY tab.

Extract ONLY what is visible on this SUMMARY screen:

1) Header:
- result: "Win" if it says VICTORY, "Loss" if DEFEAT
- score: "YourScore-EnemyScore" (e.g., "14-12")

2) Match Highlights → ROUND WINS:
- firstHalfSide: label shown above 1st half box (usually "ATK" or "DEF")
- firstHalfWins: integer in the 1st half box
- secondHalfSide: label shown above 2nd half box (usually "ATK" or "DEF")
- secondHalfWins: integer in the 2nd half box
- overtimeWins: integer in the OVERTIME box IF present, otherwise null (if overtime box not shown)

3) If date and map name are visible on this screen, extract them; otherwise null.
Valid maps: {$mapsJson}

Return ONLY valid JSON:
{
  "screenshotType": "summary",
  "date": "YYYY-MM-DD or null",
  "map": "<map name or null>",
  "type": "{$matchType}",
  "result": "Win or Loss",
  "score": "14-12",
  "firstHalfSide": "ATK or DEF or null",
  "firstHalfWins": 0,
  "secondHalfSide": "ATK or DEF or null",
  "secondHalfWins": 0,
  "overtimeWins": 0,
  "confidence": "high|medium|low",
  "notes": ""
}

CRITICAL:
- Do not guess sides; read the ATK/DEF labels shown in the Round Wins boxes.
- If OVERTIME is not shown, set overtimeWins to null.
SUMMARY);

    $rawText   = hfText(callOpenAI($OPENAI_API_KEY, $OPENAI_MODEL, $summaryMessages));
    $extracted = parseJson($rawText) ?? [];

    if (empty($extracted)) {
        sendError('Model returned unparseable JSON for Summary tab: ' . substr($rawText, 0, 300), 502);
    }

    $extracted['screenshotType'] = 'summary';
    $extracted['type']           = $matchType;

    // Compute team metrics server-side (no Timeline)
    $teamMetrics = computeTeamMetricsFromSummary($extracted);

    // Backward-compat: keep teamMetrics key where your UI expects it
    $extracted['teamMetrics'] = [
        'atkRounds'      => $teamMetrics['atkRounds'],
        'atkWins'        => $teamMetrics['atkWins'],
        'atkLosses'      => $teamMetrics['atkLosses'],
        'defRounds'      => $teamMetrics['defRounds'],
        'defWins'        => $teamMetrics['defWins'],
        'defLosses'      => $teamMetrics['defLosses'],
        'otRounds'       => $teamMetrics['otRounds'],
        'otWins'         => $teamMetrics['otWins'],
        'otLosses'       => $teamMetrics['otLosses'],
        'postPlantTotal' => $teamMetrics['postPlantTotal'],
        'postPlantWins'  => $teamMetrics['postPlantWins'],
        'atkPistolWin'   => $teamMetrics['atkPistolWin'],
        'defPistolWin'   => $teamMetrics['defPistolWin'],

        // Optional helpful additions (safe to ignore in frontend)
        'firstHalf'        => $teamMetrics['firstHalf'],
        'secondHalf'       => $teamMetrics['secondHalf'],
        'totalRoundsPlayed' => $teamMetrics['totalRoundsPlayed'],
        'finalScore'       => $teamMetrics['finalScore'],
    ];

    // Summary has no player rows
    $extracted['playerStats'] = [];

    sendSuccess([
        'extracted'       => $extracted,
        'screenshotType'  => 'summary',
        'playerAgentMap'  => [], // deprecated
        'raw'             => $rawText,
        'model'           => $OPENAI_MODEL,
        'extractorBuild'  => $EXTRACTOR_BUILD,
        'processingSteps' => [
            'step1_tabDetection' => 'Detected: Summary tab',
            'step2_extraction'   => 'Extracted score + round wins (1st/2nd/OT if present)',
            'step3_teamMetrics'  => 'Computed atk/def/ot metrics from Summary (no Timeline)',
        ],
    ]);
}

// ── SCOREBOARD ────────────────────────────────────────────────
$dbAgentList = json_decode($agentsJson, true) ?? [];

$scoreboardMessages = buildUserMessage($imageDataUrl, <<<SCOREBOARD
You are a Valorant esports data extraction assistant reading the SCOREBOARD tab.

We only need OUR TEAM (the teal/green team). The scoreboard is grouped by team.
Extract EXACTLY the 5 players from the teal/green team (ignore the red team).

For each extracted player, read:
- player: IGN exactly as shown
- agent: agent name TEXT shown under the player name (do not guess from the icon)
- acs: number in AVG COMBAT SCORE column
- kills, deaths, assists: from the KDA column formatted like "K / D / A"
- map: read map from top-left header line formatted like "MAP - BIND" (return only the map name, e.g. "Bind")

IGNORE:
- rank icons
- agent icons
- econ, first bloods, plants, defuses and any other columns

Valid agents: {$agentsJson}

Return ONLY valid JSON:
{
  "screenshotType": "scoreboard",
  "date": "YYYY-MM-DD or null",
  "map": "<map name or null>",
  "type": "{$matchType}",
  "result": "Win or Loss or null",
  "score": "14-12 or null",
  "playerStats": [
    {"player":"NAME","agent":"AGENT","acs":296,"kills":26,"deaths":22,"assists":5}
  ],
  "confidence": "high|medium|low",
  "notes": ""
}

CRITICAL RULES:
- Extract exactly 5 teal/green players.
- Agent must come from the TEXT label under the player name.
- KDA must be parsed into kills/deaths/assists integers.
- Always prioritize the top-left "MAP - <name>" label for map.
SCOREBOARD);

$rawText   = hfText(callOpenAI($OPENAI_API_KEY, $OPENAI_MODEL, $scoreboardMessages));
$extracted = parseJson($rawText) ?? [];

if (empty($extracted)) {
    sendError('Model returned unparseable JSON for Scoreboard tab: ' . substr($rawText, 0, 300), 502);
}

$extracted['screenshotType'] = 'scoreboard';
$extracted['type']           = $matchType;

// Sanitize + validate agent names, and keep only required fields
$cleanStats = [];
$rows = is_array($extracted['playerStats'] ?? null) ? $extracted['playerStats'] : [];
foreach ($rows as $r) {
    if (!is_array($r)) continue;

    $player = trim((string)($r['player'] ?? ''));
    if ($player === '') continue;

    $agent  = validateAgentName($r['agent'] ?? null, $dbAgentList);

    $acs    = isset($r['acs']) ? (int)$r['acs'] : null;
    $kills  = isset($r['kills']) ? (int)$r['kills'] : null;
    $deaths = isset($r['deaths']) ? (int)$r['deaths'] : null;
    $assists = isset($r['assists']) ? (int)$r['assists'] : null;

    $cleanStats[] = [
        'player'  => $player,
        'agent'   => $agent,
        'acs'     => $acs,
        'kills'   => $kills,
        'deaths'  => $deaths,
        'assists' => $assists,
    ];
    if (count($cleanStats) >= 5) break;
}

// Ensure exactly 5 rows max (your UI expects 5)
$extracted['playerStats'] = array_slice($cleanStats, 0, 5);

// Backward-compat: scoreboard does not provide teamMetrics now
if (!isset($extracted['teamMetrics']) || !is_array($extracted['teamMetrics'])) {
    $extracted['teamMetrics'] = [
        'atkRounds'      => 0,
        'atkWins'        => 0,
        'atkLosses'      => 0,
        'defRounds'      => 0,
        'defWins'        => 0,
        'defLosses'      => 0,
        'otRounds'       => 0,
        'otWins'         => 0,
        'otLosses'       => 0,
        'postPlantTotal' => 0,
        'postPlantWins'  => 0,
        'atkPistolWin'   => null,
        'defPistolWin'   => null,
    ];
}

sendSuccess([
    'extracted'       => $extracted,
    'screenshotType'  => 'scoreboard',
    'playerAgentMap'  => [], // deprecated
    'raw'             => $rawText,
    'model'           => $OPENAI_MODEL,
    'extractorBuild'  => $EXTRACTOR_BUILD,
    'processingSteps' => [
        'step1_tabDetection' => 'Detected: Scoreboard tab',
        'step2_extraction'   => 'Extracted 5 teal players: player, agent(text), ACS, K/D/A',
    ],
]);
