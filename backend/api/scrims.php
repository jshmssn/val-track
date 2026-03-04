<?php

declare(strict_types=1);

ob_start();
ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');
error_reporting(E_ALL);

// ============================================================
// backend/api/scrims.php
//
// GET  ?action=list           → raw filtered scrim rows
// GET  ?action=map_stats      → Map Win%, A/D Win%, PIS Win%
// GET  ?action=agent_map_pct  → Agent × Map win% matrix
// GET  ?action=summary        → full dashboard summary
// POST ?action=create         → insert scrim
// PUT  ?id=xxx                → update scrim
// DELETE ?id=xxx              → delete scrim
//
// Filter params: team_id, map, type, opponent, result, agent,
//                date_start, date_end
// ============================================================

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../helpers/response.php';
require_once __DIR__ . '/../helpers/auth.php';
require_once __DIR__ . '/../models/ScrimsRepository.php';
require_once __DIR__ . '/../services/AnalyticsCalculator.php';

setCorsHeaders();
$authUser = requireAuth();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? null;
$id     = isset($_GET['id']) ? (int)$_GET['id'] : null;
$teamId = resolveScopedTeamId($authUser, $_GET['team_id'] ?? null);

$repo = new ScrimsRepository();

$f = [
    'map'           => $_GET['map']        ?? null,
    'type'          => $_GET['type']       ?? null,
    'opponent'      => $_GET['opponent']   ?? null,
    'result'        => $_GET['result']     ?? null,
    'agent'         => $_GET['agent']      ?? null,
    'dateStart'     => $_GET['date_start'] ?? null,
    'dateEnd'       => $_GET['date_end']   ?? null,
    // Multi-agent include/exclude — comma-separated, mirrors Excel agent_filter include1..5/exclude1..5
    // e.g. ?include_agents=Jett,Sova&exclude_agents=Reyna
    'includeAgents' => isset($_GET['include_agents']) && $_GET['include_agents'] !== ''
        ? array_map('trim', explode(',', $_GET['include_agents'])) : [],
    'excludeAgents' => isset($_GET['exclude_agents']) && $_GET['exclude_agents'] !== ''
        ? array_map('trim', explode(',', $_GET['exclude_agents'])) : [],
];

// ── Routing ──────────────────────────────────────────────────
if ($method === 'GET') {

    switch ($action) {

        case 'list':
            $rows = $repo->fetchRows(
                $teamId,
                $f['map'],
                $f['type'],
                $f['opponent'],
                $f['result'],
                $f['agent'],
                $f['dateStart'],
                $f['dateEnd'],
                (int)($_GET['limit']  ?? 1500),
                (int)($_GET['offset'] ?? 0),
                $f['includeAgents'],
                $f['excludeAgents']
            );
            sendSuccess(array_map('castScrimRow', $rows));

        case 'map_stats':
            // SQL-computed version (fast, exact match to Excel formulas)
            $rows = $repo->fetchMapWinStats(
                $teamId,
                $f['type'],
                $f['dateStart'],
                $f['dateEnd']
            );

            // Add overall row using PHP-level aggregation over all rows
            $allRows = $repo->fetchRows($teamId, null, $f['type'], null, null, null, $f['dateStart'], $f['dateEnd'], 5000, 0, $f['includeAgents'], $f['excludeAgents']);
            $allRows = array_map('castScrimRow', $allRows);
            $overall = AnalyticsCalculator::mapWinPercentages($allRows)['Overall'] ?? null;

            sendSuccess([
                'overall' => $overall,
                'by_map'  => $rows,
            ]);

        case 'agent_map_pct':
            // Agent × Map win% + times_played — mirrors Agent Map% sheet exactly
            $allRows = $repo->fetchRows(
                $teamId,
                null,
                $f['type'],
                null,
                null,
                null,
                $f['dateStart'],
                $f['dateEnd'],
                5000,
                0,
                $f['includeAgents'],
                $f['excludeAgents']
            );
            $allRows = array_map('castScrimRow', $allRows);
            $matrix  = AnalyticsCalculator::agentMapWinPercentages($allRows);
            sendSuccess($matrix);

        case 'summary':
            // Full dashboard: map stats + agent stats + recent matches
            $allRows = $repo->fetchRows(
                $teamId,
                $f['map'],
                $f['type'],
                $f['opponent'],
                $f['result'],
                $f['agent'],
                $f['dateStart'],
                $f['dateEnd'],
                5000,
                0,
                $f['includeAgents'],
                $f['excludeAgents']
            );
            $allRows = array_map('castScrimRow', $allRows);

            $mapStats   = AnalyticsCalculator::mapWinPercentages($allRows);
            $agentStats = AnalyticsCalculator::agentMapWinPercentages($allRows);

            // Recent 10 matches for display
            $recent = array_slice($allRows, 0, 10);

            sendSuccess([
                'total_matches' => count($allRows),
                'map_stats'     => $mapStats,
                'agent_stats'   => $agentStats,
                'recent'        => $recent,
            ]);

        default:
            sendError('Unknown action. Use: list, map_stats, agent_map_pct, summary', 400);
    }
}

if ($method === 'POST') {
    $body   = getJsonBody();
    $teamId = resolveScopedTeamId($authUser, $body['team_id'] ?? null);

    $insertId = $repo->insert(array_merge($body, ['team_id' => $teamId]));
    sendSuccess(['id' => $insertId], 201);
}

if ($method === 'PUT' && $id !== null) {
    $scope = getDB()->prepare("SELECT team_id FROM scrims WHERE id = ? LIMIT 1");
    $scope->execute([$id]);
    $row = $scope->fetch();
    if (!$row) sendError('Scrim not found', 404);
    assertTeamAccess($authUser, (string)$row['team_id']);

    $body = getJsonBody();
    $repo->update($id, $body);
    sendSuccess(['updated' => $id]);
}

if ($method === 'DELETE' && $id !== null) {
    $scope = getDB()->prepare("SELECT team_id FROM scrims WHERE id = ? LIMIT 1");
    $scope->execute([$id]);
    $row = $scope->fetch();
    if (!$row) sendError('Scrim not found', 404);
    assertTeamAccess($authUser, (string)$row['team_id']);

    $repo->delete($id);
    sendSuccess(['deleted' => $id]);
}

sendError('Not found', 404);

// ── Helpers ──────────────────────────────────────────────────
function castScrimRow(array $r): array
{
    $intFields = ['id', 'rounds_won', 'rounds_lost', 'atk_rw', 'atk_rl', 'def_rw', 'def_rl'];
    foreach ($intFields as $f2) {
        if (isset($r[$f2])) $r[$f2] = (int)$r[$f2];
    }
    return $r;
}
