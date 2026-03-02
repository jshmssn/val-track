<?php
// Turn off HTML error output — all errors must return JSON
ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');
error_reporting(0);

/**
 * Lightweight .env loader (no Composer dependency).
 * Loads KEY=VALUE pairs into $_ENV and process env when not already set.
 */
function loadEnvFile(string $path): void
{
    if (!is_file($path) || !is_readable($path)) {
        return;
    }

    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines === false) {
        return;
    }

    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#') {
            continue;
        }

        $eq = strpos($line, '=');
        if ($eq === false) {
            continue;
        }

        $key = trim(substr($line, 0, $eq));
        $val = trim(substr($line, $eq + 1));
        if ($key === '') {
            continue;
        }

        if (
            (array_key_exists($key, $_ENV) && $_ENV[$key] !== '') ||
            getenv($key) !== false
        ) {
            continue;
        }

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

// Load env vars from backend/.env first, then project-root .env as fallback.
loadEnvFile(__DIR__ . '/../.env');
loadEnvFile(__DIR__ . '/../../.env');

// Catch any fatal/uncaught errors and return JSON
register_shutdown_function(function () {
    $err = error_get_last();
    if ($err && in_array($err['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        if (!headers_sent()) {
            header('Content-Type: application/json; charset=utf-8');
            http_response_code(500);
        }
        echo json_encode([
            'success' => false,
            'error'   => 'PHP fatal error: ' . $err['message'] . ' in ' . $err['file'] . ':' . $err['line'],
        ]);
    }
});

// Catch uncaught exceptions too
set_exception_handler(function (Throwable $e) {
    if (!headers_sent()) {
        header('Content-Type: application/json; charset=utf-8');
        http_response_code(500);
    }
    echo json_encode([
        'success' => false,
        'error'   => $e->getMessage(),
    ]);
    exit;
});

// ============================================================
// backend/api/ai_extract.php
//
// POST /backend/api/ai_extract.php
//   multipart/form-data:
//     file   — uploaded file (image, PDF, doc)
//     type   — "Scrim" | "Tournament"
//
// Handles three Valorant screenshot types automatically:
//
//   SCOREBOARD tab → extracts green-team player stats
//   SUMMARY tab    → extracts team metrics (ATK/DEF rounds,
//                    spikes, post-plant wins, etc.)
//   TIMELINE tab   → extracts round-by-round outcomes and
//                    computes accurate ATK/DEF team metrics
//
// All three can be uploaded and their data merged on the frontend.
//
// ── Provider: Google Gemini ───────────────────────────────────
// Uses the Google Gemini generateContent endpoint.
//
// Default model: gemini-2.0-flash
//   • Excellent vision/OCR capabilities — ideal for scoreboards
//   • Supports JSON structured output + inline base64 images
//
// Other supported vision models (set via GEMINI_MODEL):
//   • gemini-2.0-flash       ← DEFAULT (fast, accurate, cost-effective)
//   • gemini-2.0-flash-lite  (cheaper, slightly less accurate)
//   • gemini-1.5-pro         (higher quality, slower)
//   • gemini-1.5-flash       (fast, good quality)
//
// Authentication: set GEMINI_API_KEY in your environment / .env file.
//   Create a key at https://aistudio.google.com/app/apikey
// ============================================================

// Buffer all output — prevents any PHP notices/warnings from
// corrupting the JSON response before we're ready to send it
ob_start();

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../helpers/response.php';

// Discard anything buffered so far (e.g. BOM, stray whitespace, notices)
ob_clean();

setCorsHeaders();

// Handle OPTIONS preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendError('Method not allowed', 405);
}

// ── Config ────────────────────────────────────────────────────
// Google Gemini API key — used to authenticate with the Gemini API.
// Create a key at https://aistudio.google.com/app/apikey and add it
// to your .env file as GEMINI_API_KEY.
$GEMINI_API_KEY = $_ENV['GEMINI_API_KEY'] ?? getenv('GEMINI_API_KEY') ?: 'AIzaSyD5YpupfcsRlK7RfaDkDye2fauJGmN_Zow';

// The model to use. Override by setting the GEMINI_MODEL env var.
//
// Recommended vision-capable models:
//   "gemini-2.0-flash"       <- default (fast, excellent OCR and vision)
//   "gemini-2.0-flash-lite"  (cheaper, slightly less accurate)
//   "gemini-1.5-pro"         (higher quality, slower)
//   "gemini-1.5-flash"       (fast, good quality)
$GEMINI_MODEL = $_ENV['GEMINI_MODEL'] ?? getenv('GEMINI_MODEL') ?: 'gemini-2.0-flash';
$EXTRACTOR_BUILD = '2026-02-27-timeline-fallback-v3';

if (empty($GEMINI_API_KEY)) {
    sendError(
        'GEMINI_API_KEY not configured. Create an API key at https://aistudio.google.com/app/apikey ' .
            'and add it to your .env file.',
        500
    );
}

// ── Validate upload ───────────────────────────────────────────
if (empty($_FILES['file'])) {
    sendError('No file uploaded', 422);
}

$file      = $_FILES['file'];
$matchType = $_POST['type'] ?? 'Scrim'; // "Scrim" | "Tournament"
$teamId    = 'aaaaaaaa-0000-0000-0000-000000000001'; // Fixed team ID

if ($file['error'] !== UPLOAD_ERR_OK) {
    sendError('File upload error: ' . $file['error'], 422);
}

$allowedMimes = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
];

$finfo    = finfo_open(FILEINFO_MIME_TYPE);
$mimeType = finfo_file($finfo, $file['tmp_name']);
finfo_close($finfo);

if (!in_array($mimeType, $allowedMimes)) {
    sendError("Unsupported file type: $mimeType", 422);
}

// ── Read file as base64 ───────────────────────────────────────
$fileBytes  = file_get_contents($file['tmp_name']);
$fileBase64 = base64_encode($fileBytes);

if (strpos($mimeType, 'image/') === 0) {
    // Store raw base64 + mimeType separately for Gemini inline_data format
    $imageBase64  = $fileBase64;
    $imageMime    = $mimeType;
    $imageDataUrl = "data:{$mimeType};base64,{$fileBase64}"; // kept for image cropping
} else {
    // PDFs and documents: Gemini supports PDF natively as inline_data
    // but for simplicity we treat non-images as unsupported for vision tasks.
    $imageBase64  = null;
    $imageMime    = null;
    $imageDataUrl = null;
}

// ── Fetch reference data from DB ──────────────────────────────
$db         = getDB();
$mapsStmt   = $db->query("SELECT name FROM maps WHERE is_active = 1");
$mapsJson   = json_encode(array_column($mapsStmt->fetchAll(), 'name'));

$agentsStmt = $db->query("SELECT name FROM agents WHERE is_active = 1");
$agentsJson = json_encode(array_column($agentsStmt->fetchAll(), 'name'));

// ── Helper: Build Gemini API URL ──────────────────────────────
function buildGeminiUrl(string $apiKey, string $model): string
{
    return "https://generativelanguage.googleapis.com/v1beta/models/{$model}:generateContent?key={$apiKey}";
}

// ── Helper: Call Gemini API ───────────────────────────────────
//
// Uses the Google Gemini generateContent endpoint.
//
// Parameters
//   $apiKey     — Gemini API key (GEMINI_API_KEY)
//   $model      — Gemini model ID, e.g. "gemini-2.0-flash"
//   $parts      — Array of Gemini "parts" (text and/or inlineData objects)
//   $jsonMode   — When true, instructs the model to return a JSON object.
//
function callGemini(
    string $apiKey,
    string $model,
    array  $parts,
    bool   $jsonMode = true
): array {
    $url = buildGeminiUrl($apiKey, $model);

    $body = [
        'contents' => [
            [
                'parts' => $parts,
            ],
        ],
        'generationConfig' => [
            'temperature'     => 0.1,   // Low temperature → more deterministic JSON
            'maxOutputTokens' => 4096,
        ],
    ];

    // Request structured JSON output.
    if ($jsonMode) {
        $body['generationConfig']['responseMimeType'] = 'application/json';
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST           => true,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
        ],
        CURLOPT_POSTFIELDS => json_encode($body),
        CURLOPT_TIMEOUT    => 60,
    ]);

    $response   = curl_exec($ch);
    $httpStatus = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError  = curl_error($ch);
    curl_close($ch);

    if ($curlError) {
        sendError("Failed to contact Gemini API: $curlError", 502);
    }

    $decoded = json_decode($response, true);

    if ($httpStatus !== 200 || empty($decoded['candidates'][0]['content']['parts'][0]['text'])) {
        $errMsg = $decoded['error']['message']
            ?? "Gemini API returned HTTP $httpStatus";
        sendError("Gemini API error: $errMsg", 502);
    }

    return $decoded;
}

// Thin wrapper — extracts the text content from a Gemini API response.
function hfText(array $response): string
{
    return $response['candidates'][0]['content']['parts'][0]['text'] ?? '';
}

// ── Helper: Build image part for Gemini ──────────────────────
//
// Gemini uses "inlineData" instead of "image_url" data URIs.
//
function buildImagePart(string $base64, string $mimeType): array
{
    return [
        'inlineData' => [
            'mimeType' => $mimeType,
            'data'     => $base64,
        ],
    ];
}

// ── Helper: Build text part for Gemini ───────────────────────
function buildTextPart(string $text): array
{
    return ['text' => $text];
}

// ── Helper: Parse JSON from model text ───────────────────────
function parseGeminiJson(string $rawText): ?array
{
    // Strip markdown fences
    $text = preg_replace('/^```(?:json)?\s*/m', '', $rawText);
    $text = preg_replace('/\s*```$/m', '', $text);
    $text = trim($text);

    $decoded = json_decode($text, true);
    if (is_array($decoded)) {
        return $decoded;
    }

    // Fallback: extract outermost JSON object
    $jsonStart = strpos($text, '{');
    $jsonEnd   = strrpos($text, '}');
    if ($jsonStart !== false && $jsonEnd !== false && $jsonEnd > $jsonStart) {
        $decoded = json_decode(substr($text, $jsonStart, $jsonEnd - $jsonStart + 1), true);
        if (is_array($decoded)) {
            return $decoded;
        }
    }

    return null;
}

// ── Helper: Validate agent name against Valorant API ─────────
function validateAgentName(string $candidate, array $dbAgents): string
{
    $officialAgents = fetchOfficialValorantAgents();
    $haystack       = !empty($officialAgents) ? $officialAgents : $dbAgents;

    // Exact match (case-insensitive)
    foreach ($haystack as $agent) {
        if (strtolower($agent) === strtolower($candidate)) {
            return $agent;
        }
    }

    // Partial / contains match
    foreach ($haystack as $agent) {
        if (
            stripos($agent, $candidate) !== false ||
            stripos($candidate, $agent) !== false
        ) {
            return $agent;
        }
    }

    return $candidate;
}

function fetchOfficialValorantAgents(): array
{
    static $cache = null;
    if ($cache !== null) {
        return $cache;
    }

    $ch = curl_init('https://valorant-api.com/v1/agents?isPlayableCharacter=true');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 5,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_HTTPHEADER     => ['Accept: application/json'],
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200 || !$response) {
        $cache = [];
        return [];
    }

    $data = json_decode($response, true);

    if (empty($data['data']) || !is_array($data['data'])) {
        $cache = [];
        return [];
    }

    $cache = array_values(array_map(fn($a) => $a['displayName'], $data['data']));
    return $cache;
}

// ──────────────────────────────────────────────────────────────
// STEP 1 — TAB DETECTION: Summary or Scoreboard?
// ──────────────────────────────────────────────────────────────
$screenshotType = 'scoreboard'; // default
$agentIconData  = [];

if ($imageBase64 !== null) {

    $tabDetectPrompt = <<<TAB
You are a Valorant expert. Look at this screenshot and determine which tab of the match results screen is shown.

The possible tabs are:
- "summary"    — Shows a large agent character on the left, "MATCH HIGHLIGHTS" table on the right with rows like ROUND WINS, FIRST BLOODS, SPIKES DEPLOYED, POST-SPIKE WINS, DEFUSALS, etc. Also shows DEF / ATK columns labelled "1st HALF" / "2nd HALF".
- "scoreboard" — Shows a table of player rows with columns: AVG COMBAT SCORE, KDA, ECON RATING, FIRST BLOODS, PLANTS, DEFUSES. Rows are highlighted GREEN (winning team) or RED (losing team).
- "timeline"   — The TIMELINE tab label at the top is highlighted, there is a horizontal strip of round columns (1,2,3...), and a lower-left player panel with 10 rows where each row shows player name and agent name text.
- "performance"— Shows performance graphs/charts.
- "unknown"    — Cannot determine.

Return ONLY valid JSON:
{"tab": "summary|scoreboard|timeline|performance|unknown"}
TAB;

    $tabParts = [
        buildImagePart($imageBase64, $imageMime),
        buildTextPart($tabDetectPrompt),
    ];

    $tabResponse    = callGemini($GEMINI_API_KEY, $GEMINI_MODEL, $tabParts);
    $tabRaw         = hfText($tabResponse);
    $tabParsed      = parseGeminiJson($tabRaw);
    $screenshotType = $tabParsed['tab'] ?? 'scoreboard';
}

// ── PRE-PROCESSING: Agent icon detection (Scoreboard only) ────
if ($imageBase64 !== null && $screenshotType === 'scoreboard') {

    $iconPrompt = <<<ICON
You are a Valorant game analyst. Analyze this Valorant scoreboard screenshot.

YOUR ONLY JOB: Identify which player rows have a RED background and which have a TEAL background.

HOW TO TELL THE COLORS APART:
- Look at the wide colored band behind the stats (AVG COMBAT SCORE, KDA, ECON RATING columns).
- RED rows: the band is clearly red, maroon, crimson, or dark burgundy — it has a RED hue.
- TEAL rows: the band is clearly teal, cyan, blue-green, or dark seafoam — it has a BLUE-GREEN hue.

These are the ONLY two colors in the scoreboard. There is no ambiguity — every row is either RED or TEAL.

TASK:
List ALL rows you see (there should be 10 total), top to bottom.
For each row state:
  1. rowPosition (1 = top row)
  2. playerName — exact text shown
  3. agentName — the Valorant agent shown in the circular portrait (null if "?" icon)
  4. rowColor — MUST be exactly "teal" or "red" — no other value is allowed

STRICT RULES:
- rowColor "red" = the row has a RED/MAROON/CRIMSON background. DO NOT label any red row as "teal".
- rowColor "teal" = the row has a TEAL/CYAN/BLUE-GREEN background. DO NOT label any teal row as "red".
- You MUST have exactly 5 "teal" rows and exactly 5 "red" rows. If you do not, recount.
- DO NOT guess or assume — look at each row individually.

Return ONLY valid JSON, no markdown:
{
  "greenTeamPlayers": [
    {
      "rowPosition": 1,
      "playerName": "<exact name>",
      "agentName": "<agent name or null>",
      "rowColor": "teal",
      "confidence": "high|medium|low"
    }
  ]
}

Include all 10 rows. agentName must be a real Valorant agent (Jett, Killjoy, Sova, Reyna, Sage, Omen, KAY/O, Skye, Fade, Breach, Gekko, Harbor, Viper, Brimstone, Astra, Cypher, Chamber, Deadlock, Vyse, Neon, Yoru, Phoenix, Iso, Raze, Waylay, Clove, Veto, or null).
ICON;

    $iconParts = [
        buildImagePart($imageBase64, $imageMime),
        buildTextPart($iconPrompt),
    ];

    $iconResponse = callGemini($GEMINI_API_KEY, $GEMINI_MODEL, $iconParts);
    $iconRaw      = hfText($iconResponse);
    $iconParsed   = parseGeminiJson($iconRaw);

    $dbAgentList = json_decode($agentsJson, true) ?? [];

    $rawPlayers   = $iconParsed['greenTeamPlayers'] ?? $iconParsed['greenTeamAgentIcons'] ?? [];

    // STRICT filter — only keep rows explicitly marked "teal"
    $greenPlayers = array_filter(
        $rawPlayers,
        fn($p) => isset($p['rowColor']) && strtolower(trim($p['rowColor'])) === 'teal'
    );

    // Safety cap: max 5 teal rows (one Valorant team)
    if (count($greenPlayers) > 5) {
        $greenPlayers = array_values($greenPlayers);
        usort($greenPlayers, fn($a, $b) => (int)($a['rowPosition'] ?? 99) - (int)($b['rowPosition'] ?? 99));
        $greenPlayers = array_slice($greenPlayers, 0, 5);
    }

    if (!empty($greenPlayers)) {
        foreach ($greenPlayers as &$iconEntry) {
            $agentKey = isset($iconEntry['agentName']) ? 'agentName' : 'detectedAgentName';
            if (!empty($iconEntry[$agentKey])) {
                $raw      = $iconEntry[$agentKey];
                $verified = validateAgentName($raw, $dbAgentList);

                $iconEntry[$agentKey]         = $verified;
                $iconEntry['validatedViaApi'] = ($verified !== $raw)
                    ? "Corrected from '{$raw}' to '{$verified}'"
                    : 'Matched';
            }
        }
        unset($iconEntry);

        $agentIconData = array_values(array_map(fn($p) => [
            'rowPosition'       => $p['rowPosition'],
            'playerName'        => $p['playerName'] ?? null,
            'detectedAgentName' => $p['agentName'] ?? $p['detectedAgentName'] ?? null,
            'rowColor'          => $p['rowColor'] ?? 'teal',
            'confidence'        => $p['confidence'] ?? 'medium',
            'validatedViaApi'   => $p['validatedViaApi'] ?? 'Matched',
        ], $greenPlayers));
    }
}

// ──────────────────────────────────────────────────────────────
// STEP 2 — MAIN EXTRACTION: Branch on screenshot type
// ──────────────────────────────────────────────────────────────

$rawText   = '';
$extracted = [];

// ── BRANCH A: Summary tab ─────────────────────────────────────
if ($screenshotType === 'summary') {

    $summaryPrompt = <<<SUMMARY
You are a Valorant esports data analyst. This is a SUMMARY tab screenshot from a Valorant match results screen.

It contains:
- Top-left: date, map name, match duration
- Centre-top: score (e.g. "13 VICTORY 5" or "5 DEFEAT 13")
- Left side: large agent character art with the MVP player name and agent name below them, plus stat icons
- Right side: "MATCH HIGHLIGHTS" table with two columns — DEF (1st HALF) and ATK (2nd HALF)

The MATCH HIGHLIGHTS table rows are:
  ROUND WINS         → how many rounds won each half
  FIRST BLOODS       → total first bloods each half
  FIRST BLOOD WINS   → rounds won after getting first blood
  ELIMINATION WINS   → rounds won by full team elimination
  SPIKES DEPLOYED    → how many times spike was planted each half
  POST-SPIKE WINS    → rounds won after spike plant each half
  DEFUSALS           → spike defusals each half
  DEF TEAM ELIMINATED→ how many times the defending team was eliminated
  DETONATIONS        → spike detonations each half

Valid maps: {$mapsJson}

Extract and return ONLY valid JSON (no markdown):

{
  "screenshotType": "summary",
  "date": "YYYY-MM-DD",
  "map": "<map name from valid list>",
  "type": "{$matchType}",
  "result": "Win or Loss",
  "score": "13-5",
  "mvpPlayer": "<player name shown under the agent art>",
  "mvpAgent": "<agent name shown under the player name>",
  "mvpAcs": 345,
  "teamMetrics": {
    "defRounds": 13,
    "defWins": 8,
    "atkRounds": 5,
    "atkWins": 5,
    "postPlantTotal": 11,
    "postPlantWins": 7,
    "atkPistolWin": "Loss",
    "defPistolWin": "Loss"
  },
  "summaryHighlights": {
    "def_roundWins": 8,
    "def_firstBloods": 9,
    "def_firstBloodWins": 7,
    "def_eliminationWins": 5,
    "def_spikesDeployed": 7,
    "def_postSpikeWins": 3,
    "def_defusals": 3,
    "def_defTeamEliminated": 4,
    "def_detonations": 0,
    "atk_roundWins": 5,
    "atk_firstBloods": 4,
    "atk_firstBloodWins": 4,
    "atk_eliminationWins": 3,
    "atk_spikesDeployed": 4,
    "atk_postSpikeWins": 4,
    "atk_defusals": 0,
    "atk_defTeamEliminated": 2,
    "atk_detonations": 2
  },
  "playerStats": [],
  "confidence": "high|medium|low",
  "notes": "<what you extracted and any caveats>"
}

Rules:
- teamMetrics.defRounds = DEF 1st HALF round wins value from ROUND WINS row
- teamMetrics.atkRounds = ATK 2nd HALF round wins value from ROUND WINS row
- teamMetrics.defWins   = same as defRounds
- teamMetrics.atkWins   = same as atkRounds
- postPlantTotal = def_spikesDeployed + atk_spikesDeployed
- postPlantWins  = def_postSpikeWins + atk_postSpikeWins
- result: if the top shows "VICTORY" = Win, "DEFEAT" = Loss
- score: bigger number first if Win (e.g. "13-5"), smaller first if Loss (e.g. "5-13")
- Use null for any field you cannot read clearly
- playerStats is always empty [] for Summary tab
SUMMARY;

    $mainParts = [
        buildImagePart($imageBase64, $imageMime),
        buildTextPart($summaryPrompt),
    ];

    $hfResponse = callGemini($GEMINI_API_KEY, $GEMINI_MODEL, $mainParts);
    $rawText    = hfText($hfResponse);
    $extracted  = parseGeminiJson($rawText) ?? [];

    if (empty($extracted)) {
        sendError('Model returned unparseable JSON for Summary tab: ' . substr($rawText, 0, 300), 502);
    }

    $extracted['screenshotType'] = 'summary';
    $extracted['type']           = $matchType;

    sendSuccess([
        'extracted'       => $extracted,
        'screenshotType'  => 'summary',
        'agentIconData'   => [],
        'raw'             => $rawText,
        'model'           => $GEMINI_MODEL,
        'extractorBuild'  => $EXTRACTOR_BUILD,
        'processingSteps' => [
            'step1_tabDetection' => 'Detected: Summary tab',
            'step2_extraction'   => 'Completed — team metrics and match highlights extracted',
            'step3_agentMerge'   => 'Skipped — Summary tab has no player rows',
        ],
    ]);
}

// ── BRANCH C: Timeline tab ────────────────────────────────────
if ($screenshotType === 'timeline') {

    // ── PASS 1: Extract round-by-round data and team metrics ──
    $timelinePrompt = <<<TIMELINE
You are a Valorant esports data analyst. This is a TIMELINE tab screenshot from a Valorant match results screen.

The timeline shows a grid of rounds (numbered 1, 2, 3 … up to 18 or 24 for overtime).
For each round there are:
  - Two vertical bars: the TEAL bar (your team) and the RED bar (opponents).
  - An icon row at the bottom of each round indicating how the round ended.

ICON MEANINGS (bottom row):
  ✕ / X inside a circle (red or teal)  → All enemies eliminated (team-wipe win)
  Running stick figure (person silhouette, no circle) → Time ran out / Spike not planted
  Star / Spike icon                    → Spike defused (defuse win)
  Flame / Fire icon                    → Spike detonated (post-plant win for attacker)
  Skull / Crossbones                   → Surrender or forfeit

HALF STRUCTURE:
  - Rounds 1–12 = first half (your team starts on one side)
  - Round 13 onward = second half (sides swap)
  - If there's a small refresh/swap icon between rounds 12 and 13, that confirms the half switch.
  - Overtime starts after round 24 if tied.

YOUR TASK:
For each round column, determine:
  1. roundNumber — the number shown at the top (1, 2, 3 …)
  2. winner — "us" (teal/your team won) or "them" (red/opponent won)
  3. half — "def" or "atk" for your team in that round
  4. endCondition — one of: "elimination", "spike_detonated", "spike_defused", "time_expired", "surrender"
  5. postPlant — true if round ended with spike_detonated, false otherwise
  6. isPistolRound — true ONLY for round 1 and round 13

Compute teamMetrics:
  - atkRounds, atkWins, defRounds, defWins, postPlantTotal, postPlantWins, atkPistolWin="Win" or "Loss", defPistolWin="Win" or "Loss"

Extract from header: date, map, result (Win/Loss), score (e.g. "13-5")

Return ONLY valid JSON (no markdown):
{
  "screenshotType": "timeline",
  "date": "YYYY-MM-DD or null",
  "map": "<map name or null>",
  "type": "{$matchType}",
  "result": "Win or Loss",
  "score": "13-5",
  "rounds": [{"roundNumber":1,"winner":"us","half":"def","endCondition":"elimination","postPlant":false,"isPistolRound":true}],
  "teamMetrics": {"atkRounds":6,"atkWins":5,"defRounds":12,"defWins":8,"postPlantTotal":9,"postPlantWins":6,"atkPistolWin":"Loss","defPistolWin":"Loss"},
  "playerStats": [],
  "confidence": "high|medium|low",
  "notes": ""
}
TIMELINE;

    $timelineParts = [
        buildImagePart($imageBase64, $imageMime),
        buildTextPart($timelinePrompt),
    ];

    $hfResponse = callGemini($GEMINI_API_KEY, $GEMINI_MODEL, $timelineParts);
    $rawText    = hfText($hfResponse);
    $extracted  = parseGeminiJson($rawText) ?? [];

    if (empty($extracted)) {
        sendError('Model returned unparseable JSON for Timeline tab: ' . substr($rawText, 0, 300), 502);
    }

    $extracted['screenshotType'] = 'timeline';
    $extracted['type']           = $matchType;

    // ── PASS 2: Dedicated agent extraction — crop to teal rows only ──
    // Crop the image to just the teal team rows so the AI sees nothing else.
    $agentBase64   = $imageBase64;  // fallback: full image
    $agentMimeType = $imageMime;

    if ($imageDataUrl !== null && function_exists('imagecreatefromstring')) {
        $imgData = base64_decode($imageBase64);
        $src     = @imagecreatefromstring($imgData);
        if ($src !== false) {
            $fullW = imagesx($src);
            $fullH = imagesy($src);

            // Player panel is lower-left. Teal rows = top half of panel.
            // Crop: left 48% width, vertical 47%-74% of full image height.
            $cropX = 0;
            $cropY = (int)($fullH * 0.47);
            $cropW = (int)($fullW * 0.48);
            $cropH = (int)($fullH * 0.235);

            $cropped = imagecreatetruecolor($cropW, $cropH);
            imagecopy($cropped, $src, 0, 0, $cropX, $cropY, $cropW, $cropH);

            ob_start();
            imagepng($cropped);
            $pngBytes = ob_get_clean();
            imagedestroy($src);
            imagedestroy($cropped);

            if ($pngBytes) {
                $agentBase64   = base64_encode($pngBytes);
                $agentMimeType = 'image/png';
            }
        }
    }

    $agentPrompt = <<<AGENTPROMPT
You are reading a Valorant TIMELINE tab screenshot.

Focus ONLY on the player list panel in the lower-left of the screen (under "ROUND X ...").
That panel has 10 rows split into:
- Top 5 teal rows = our team
- Bottom 5 red rows = opponents

Extract ONLY the top 5 teal rows.

For each teal row:
- "player" = exact player name text
- "agent"  = exact agent name text shown under the player name (or null if unreadable)

Do NOT use names from the event log on the right.
Do NOT include red team players.
Do NOT infer from portraits when text is visible; prefer OCR text.

Valid agent names: {$agentsJson}

Return ONLY valid JSON (no markdown):
{
  "playerAgentMap": [
    {"player":"NAME","agent":"AGENT"},
    {"player":"NAME","agent":"AGENT"},
    {"player":"NAME","agent":"AGENT"},
    {"player":"NAME","agent":"AGENT"},
    {"player":"NAME","agent":"AGENT"}
  ]
}
AGENTPROMPT;

    $agentParts = [
        buildImagePart($agentBase64, $agentMimeType),
        buildTextPart($agentPrompt),
    ];

    $agentResponse  = callGemini($GEMINI_API_KEY, $GEMINI_MODEL, $agentParts);
    $agentRaw       = hfText($agentResponse);
    $agentParsed    = parseGeminiJson($agentRaw) ?? [];
    $playerAgentMap = $agentParsed['playerAgentMap'] ?? [];

    // Validate agent names against DB
    if (!empty($playerAgentMap)) {
        $dbAgentList = json_decode($agentsJson, true) ?? [];
        foreach ($playerAgentMap as &$entry) {
            if (!empty($entry['agent'])) {
                $entry['agent'] = validateAgentName($entry['agent'], $dbAgentList);
            }
        }
        unset($entry);
        $playerAgentMap = array_values(array_filter($playerAgentMap, function ($entry) {
            $player = trim((string)($entry['player'] ?? ''));
            return $player !== '';
        }));
    }

    // Fallback OCR pass: if first pass returns nothing, retry on full image
    // with a looser output shape that includes row colors.
    if (empty($playerAgentMap) && $imageBase64 !== null) {
        $fallbackPrompt = <<<AGENTFALLBACK
You are an OCR extractor for a Valorant TIMELINE screenshot.

Read ONLY the lower-left PLAYER table.
It has 10 rows:
- top 5 rows are teal/green team
- bottom 5 rows are red team

For each visible row, extract:
- rowPosition (1..10 from top to bottom)
- player (player name text)
- agent (agent name text shown below the player name; null if unreadable)
- rowColor ("teal" or "red")

Do not read the event log on the right.
Do not use portraits/icons to guess names.

Valid agent names: {$agentsJson}

Return ONLY valid JSON:
{
  "rows": [
    {"rowPosition":1,"player":"NAME","agent":"AGENT","rowColor":"teal"}
  ]
}
AGENTFALLBACK;

        $fallbackParts = [
            buildImagePart($imageBase64, $imageMime),
            buildTextPart($fallbackPrompt),
        ];

        $fallbackResponse = callGemini($GEMINI_API_KEY, $GEMINI_MODEL, $fallbackParts);
        $fallbackRaw      = hfText($fallbackResponse);
        $fallbackParsed   = parseGeminiJson($fallbackRaw) ?? [];

        $rows = $fallbackParsed['rows'] ?? $fallbackParsed['playerRows'] ?? $fallbackParsed['playerAgentMap'] ?? [];
        $rows = is_array($rows) ? $rows : [];

        $tealRows = array_filter($rows, function ($r) {
            $color = strtolower(trim((string)($r['rowColor'] ?? '')));
            return $color === 'teal' || $color === 'green' || $color === 'cyan';
        });

        if (empty($tealRows) && !empty($rows)) {
            usort($rows, fn($a, $b) => (int)($a['rowPosition'] ?? 999) - (int)($b['rowPosition'] ?? 999));
            $tealRows = array_slice($rows, 0, 5);
        }

        $fallbackMap = [];
        foreach ($tealRows as $r) {
            $player = trim((string)($r['player'] ?? $r['playerName'] ?? ''));
            $agent  = $r['agent'] ?? $r['agentName'] ?? null;
            if ($player === '') continue;
            if (is_string($agent) && trim($agent) !== '') {
                $agent = validateAgentName($agent, json_decode($agentsJson, true) ?? []);
            } else {
                $agent = null;
            }
            $fallbackMap[] = ['player' => $player, 'agent' => $agent];
        }

        if (!empty($fallbackMap)) {
            $playerAgentMap = array_values($fallbackMap);
        }
    }

    $extracted['playerAgentMap'] = $playerAgentMap;

    $agentMapNote = !empty($playerAgentMap)
        ? 'Extracted ' . count($playerAgentMap) . ' player→agent mappings from Timeline panel'
        : 'Agent panel not found or unreadable';

    $timelineAgentDebug = [
        'mappedCount' => count($playerAgentMap),
        'pass1Parsed' => !empty($agentParsed),
    ];

    sendSuccess([
        'extracted'       => $extracted,
        'screenshotType'  => 'timeline',
        'playerAgentMap'  => $playerAgentMap,
        'agentIconData'   => [],
        'raw'             => $rawText,
        'model'           => $GEMINI_MODEL,
        'extractorBuild'  => $EXTRACTOR_BUILD,
        'processingSteps' => [
            'step1_tabDetection' => 'Detected: Timeline tab',
            'step2_extraction'   => 'Completed — round-by-round data and team metrics extracted',
            'step3_agentMerge'   => $agentMapNote,
        ],
        'timelineAgentDebug' => $timelineAgentDebug,
    ]);
}

// ── BRANCH B: Scoreboard tab (or unknown — try scoreboard) ────

// Build hint string from pre-processed player+agent data
$agentHints = '';
if (!empty($agentIconData)) {
    $hintLines = [];
    foreach ($agentIconData as $entry) {
        $name      = $entry['playerName']        ?? '?';
        $agent     = $entry['detectedAgentName'] ?? 'unknown';
        $pos       = $entry['rowPosition'];
        $hintLines[] = "  Row {$pos}: player=\"{$name}\" agent=\"{$agent}\"";
    }
    $agentHints = "\n\nPre-identified GREEN team rows (use these as authoritative — player names AND agents are already verified):\n"
        . implode("\n", $hintLines)
        . "\n\nOnly include these exact players in playerStats. Do not add any others.";
}

$scoreboardPrompt = <<<PROMPT
You are a Valorant esports data analyst. Analyze this match scoreboard screenshot.

Match type context: {$matchType}
Valid maps: {$mapsJson}
Valid agents: {$agentsJson}
{$agentHints}

═══════════════════════════════════════════════════════════
CRITICAL FILTERING RULE:
═══════════════════════════════════════════════════════════
The scoreboard has 10 rows. Each row is either TEAL or RED.

  • TEAL / CYAN / BLUE-GREEN background → INCLUDE this player
  • RED / MAROON / CRIMSON background   → EXCLUDE this player — NO EXCEPTIONS

If pre-identified players are listed above, use ONLY those players.
If no pre-identified players are listed, include ONLY rows with a
non-red (teal/cyan/green) background. ANY row with even a hint of
red coloring must be excluded.
═══════════════════════════════════════════════════════════

IMPORTANT — READ EACH ROW INDEPENDENTLY:
The scoreboard is a table where every player row has DIFFERENT numbers.
You MUST read the actual value shown in each cell for each player.
DO NOT copy the same stats to multiple players.
The top player typically has a higher ACS than the bottom player.

COLUMN MAPPING:
  AVG COMBAT SCORE column → acs
  K column                → kills
  D column                → deaths
  A column                → assists
  ADR column              → adr (null if not shown)
  KAST column             → kast (null if not shown)
  ECON RATING column      → adr (use as adr if ADR not shown)
  FIRST BLOODS column     → firstBloods (integer)
  PLANTS column           → plants (integer)
  DEFUSES column          → defuses (integer)

Extract the following and return ONLY valid JSON (no markdown, no explanation):

{
  "screenshotType": "scoreboard",
  "date": "YYYY-MM-DD or null",
  "map": "<map name from valid list>",
  "type": "{$matchType}",
  "result": "Win or Loss",
  "score": "<score like 13-5>",
  "opponent": "<opponent team name if visible, else null>",
  "tournament": null,
  "stage": null,
  "playerStats": [
    {
      "player": "<IGN exactly as shown>",
      "agent": "<agent name — use pre-identified if provided above>",
      "acs": <ACTUAL number read from ACS column — NOT a placeholder>,
      "kills": <ACTUAL number read from K column>,
      "deaths": <ACTUAL number read from D column>,
      "assists": <ACTUAL number read from A column>,
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
  "teamFilter": "green_only",
  "confidence": "high|medium|low",
  "notes": ""
}

FINAL RULES:
- Each player's acs, kills, deaths MUST differ from each other — they are unique per row.
- If all players end up with the same ACS, you have made an error — re-read each row.
- playerStats MUST contain ONLY players whose row background is GREEN/TEAL.
- Red-team players are FORBIDDEN from appearing in playerStats.
- Use null for any fields you cannot determine.
- fkRate and clutchRate are decimals 0.0–1.0 (null if column not visible).
- Always return valid parseable JSON.
PROMPT;

$mainParts = [
    buildImagePart($imageBase64, $imageMime),
    buildTextPart($scoreboardPrompt),
];

$hfResponse = callGemini($GEMINI_API_KEY, $GEMINI_MODEL, $mainParts);
$rawText    = hfText($hfResponse);
$extracted  = parseGeminiJson($rawText);

if (!$extracted) {
    sendError('Model returned unparseable JSON: ' . substr($rawText, 0, 300), 502);
}

// ── Identical-stats guard: detect if model copied the same numbers for all players ──
$statsRows = $extracted['playerStats'] ?? [];
$acsValues = array_filter(array_column($statsRows, 'acs'), fn($v) => $v !== null);
$allSameAcs = count($acsValues) >= 2 && count(array_unique($acsValues)) === 1;

if ($allSameAcs && count($statsRows) >= 2) {
    $retryLines = [];
    foreach ($statsRows as $r) {
        $pn = $r['player'] ?? '?';
        $retryLines[] = "  - Player \"{$pn}\": read ACS, K, D, A, FIRST BLOODS, PLANTS, DEFUSES from their row";
    }
    $retryStr = implode("\n", $retryLines);

    $retryPrompt = <<<RETRY
This is a Valorant scoreboard. Each row has DIFFERENT stats per player.
Read the ACTUAL numbers shown for each player — do NOT repeat the same value.

{$retryStr}

Return ONLY JSON:
{"playerStats":[{"player":"<n>","acs":<number>,"kills":<number>,"deaths":<number>,"assists":<number>,"adr":null,"kast":null,"fkRate":null,"clutchRate":null,"firstBloods":<number>,"plants":<number>,"defuses":<number>}]}
RETRY;

    $retryParts    = [buildImagePart($imageBase64, $imageMime), buildTextPart($retryPrompt)];
    $retryResponse = callGemini($GEMINI_API_KEY, $GEMINI_MODEL, $retryParts);
    $retryRaw      = hfText($retryResponse);
    $retryParsed   = parseGeminiJson($retryRaw);

    if (!empty($retryParsed['playerStats'])) {
        $extracted['playerStats'] = $retryParsed['playerStats'];
        $extracted['notes'] = ($extracted['notes'] ?? '') . ' [auto-retry: identical-stats detected]';
    }
}

// ──────────────────────────────────────────────────────────────
// STEP 3 — POST-PROCESSING: Merge agent icons, validate agents
// ──────────────────────────────────────────────────────────────

if (!empty($agentIconData) && !empty($extracted['playerStats'])) {
    foreach ($extracted['playerStats'] as $idx => &$player) {
        $rowPosition = $idx + 1;
        foreach ($agentIconData as $iconEntry) {
            if ((int)$iconEntry['rowPosition'] === $rowPosition && !empty($iconEntry['detectedAgentName'])) {
                $player['agent'] = $iconEntry['detectedAgentName'];
                break;
            }
        }
    }
    unset($player);
}

$dbAgentListFinal = json_decode($agentsJson, true) ?? [];
if (!empty($extracted['playerStats'])) {
    foreach ($extracted['playerStats'] as &$player) {
        if (!empty($player['agent'])) {
            $player['agent'] = validateAgentName($player['agent'], $dbAgentListFinal);
        }
    }
    unset($player);
}

$extracted['screenshotType'] = 'scoreboard';
$extracted['type']           = $matchType;
$extracted['teamFilter']     = 'green_only';

// ──────────────────────────────────────────────────────────────
// STEP 4 — Return structured response
// ──────────────────────────────────────────────────────────────
sendSuccess([
    'extracted'      => $extracted,
    'screenshotType' => 'scoreboard',
    'agentIconData'  => $agentIconData,
    'raw'            => $rawText,
    'model'          => $GEMINI_MODEL,
    'extractorBuild' => $EXTRACTOR_BUILD,
    'processingSteps' => [
        'step1_tabDetection' => "Detected: {$screenshotType} tab",
        'step2_extraction'   => 'Completed — green team players extracted only',
        'step3_agentMerge'   => !empty($agentIconData)
            ? 'Completed — validated agent names merged into player stats'
            : 'Skipped',
    ],
]);
