<?php

declare(strict_types=1);

ob_start();
ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');
error_reporting(E_ALL);

// ============================================================
// backend/api/player_stats.php
//
// GET  ?action=list           → raw filtered rows
// GET  ?action=averages       → per-player overall averages
// GET  ?action=by_map         → per-player per-map averages
// GET  ?action=by_agent       → per-player per-agent averages
// GET  ?action=team_map       → team-wide per-map table
// GET  ?action=team_agent     → team-wide per-agent table
// GET  ?action=summary        → full multi-player dashboard summary
// POST ?action=create         → insert single stat row
// PUT  ?id=xxx                → update a row
// DELETE ?id=xxx              → delete a row
//
// Common filter params (all optional):
//   team_id, player, type, map, agent, date_start, date_end
// ============================================================

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../helpers/response.php';
require_once __DIR__ . '/../helpers/auth.php';
require_once __DIR__ . '/../models/PlayerStatsRepository.php';
require_once __DIR__ . '/../services/AnalyticsCalculator.php';

setCorsHeaders();
$authUser = requireAuth();

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? null;
$id     = isset($_GET['id']) ? (int)$_GET['id'] : null;
$requiresTeamScope = !($method === 'GET' && $action === 'acs_calculator');
$teamId = null;
if ($requiresTeamScope) {
    $teamId = resolveScopedTeamId($authUser, $_GET['team_id'] ?? null);
}

$repo = new PlayerStatsRepository();

// ── Filter params helper ─────────────────────────────────────
$filters = static fn() => [
    'player'     => $_GET['player']     ?? null,
    'type'       => $_GET['type']       ?? null,
    'map'        => $_GET['map']        ?? null,
    'agent'      => $_GET['agent']      ?? null,
    'dateStart'  => $_GET['date_start'] ?? null,
    'dateEnd'    => $_GET['date_end']   ?? null,
];

// ── Routing ──────────────────────────────────────────────────
if ($method === 'GET') {
    $f = $filters();

    switch ($action) {

        case 'list':
            $rows = $repo->fetchRows(
                $teamId,
                $f['player'],
                $f['type'],
                $f['map'],
                $f['agent'],
                $f['dateStart'],
                $f['dateEnd'],
                (int)($_GET['limit']  ?? 2000),
                (int)($_GET['offset'] ?? 0)
            );
            // Cast numeric columns
            sendSuccess(array_map('castPlayerRow', $rows));

        case 'averages':
            $rows = $repo->fetchPlayerAverages(
                $teamId,
                $f['type'],
                $f['map'],
                $f['agent'],
                $f['dateStart'],
                $f['dateEnd']
            );
            sendSuccess(array_map(function ($r) {
                $r = castFloats($r);
                $r['classification'] = AnalyticsCalculator::classifyPlayer(
                    (float)($r['avg_acs'] ?? 0),
                    (float)($r['avg_kda'] ?? 0)
                );
                return $r;
            }, $rows));

        case 'by_map':
            $rows = $repo->fetchPlayerMapAverages(
                $teamId,
                $f['player'],
                $f['type'],
                $f['dateStart'],
                $f['dateEnd']
            );
            sendSuccess(array_map('castFloats', $rows));

        case 'by_agent':
            $rows = $repo->fetchPlayerAgentAverages(
                $teamId,
                $f['player'],
                $f['type'],
                $f['dateStart'],
                $f['dateEnd']
            );
            sendSuccess(array_map('castFloats', $rows));

        case 'team_map':
            $rows = $repo->fetchTeamMapStats(
                $teamId,
                $f['type'],
                $f['dateStart'],
                $f['dateEnd']
            );
            sendSuccess(array_map('castFloats', $rows));

        case 'team_agent':
            $rows = $repo->fetchTeamAgentStats(
                $teamId,
                $f['type'],
                $f['dateStart'],
                $f['dateEnd']
            );
            sendSuccess(array_map('castFloats', $rows));

        case 'summary':
            // Full multi-player summary mirroring Excel Home sheet
            $playersParam = $_GET['players'] ?? '';
            $players = $playersParam !== ''
                ? array_map('trim', explode(',', $playersParam))
                : [];

            if (empty($players)) {
                // Auto-detect from DB
                $stmt = getDB()->prepare(
                    "SELECT ign FROM players WHERE team_id = ? AND is_active = 1 ORDER BY ign"
                );
                $stmt->execute([$teamId]);
                $players = array_column($stmt->fetchAll(), 'ign');
            }

            // Fetch all rows for this team/filters
            $allRows = $repo->fetchRows(
                $teamId,
                null,
                $f['type'],
                $f['map'],
                $f['agent'],
                $f['dateStart'],
                $f['dateEnd'],
                5000,
                0
            );
            $allRows = array_map('castPlayerRow', $allRows);

            $summary = AnalyticsCalculator::multiPlayerSummary(
                $players,
                $allRows,
                $f['type'],
                $f['map'],
                $f['agent'],
                $f['dateStart'],
                $f['dateEnd']
            );

            sendSuccess([
                'players' => $summary,
                'total_rows' => count($allRows),
            ]);

        case 'acs_calculator':
            // Mirrors the "ACS calculator" sheet
            $k = (int)($_GET['kills']   ?? 0);
            $d = (int)($_GET['deaths']  ?? 0);
            $a = (int)($_GET['assists'] ?? 0);
            $fb = (int)($_GET['fb']      ?? 0);
            sendSuccess([
                'kills'   => $k,
                'deaths'  => $d,
                'assists' => $a,
                'fb'      => $fb,
                'acs'     => AnalyticsCalculator::calculateACS($k, $d, $a, $fb),
                'kda'     => AnalyticsCalculator::kda($k, $d, $a),
            ]);

        default:
            sendError('Unknown action. Use: list, averages, by_map, by_agent, team_map, team_agent, summary, acs_calculator', 400);
    }
}

if ($method === 'POST') {
    $body = getJsonBody();

    // Resolve IDs
    $teamId   = resolveScopedTeamId($authUser, $body['team_id'] ?? null);
    $mapId    = $repo->resolveMapId(requireParam($body, 'map'));
    $agentId  = $repo->resolveAgentId(requireParam($body, 'agent'));
    $playerId = $repo->resolvePlayerId(requireParam($body, 'player'), $teamId);

    if (!$mapId)    sendError("Unknown map: {$body['map']}", 422);
    if (!$agentId)  sendError("Unknown agent: {$body['agent']}", 422);
    if (!$playerId) sendError("Player '{$body['player']}' not found for this team", 422);

    $kills   = (int)($body['kills']   ?? 0);
    $deaths  = (int)($body['deaths']  ?? 0);
    $assists = (int)($body['assists'] ?? 0);

    // Auto-calculate KDA (stored as a computed column, not stored directly)
    $insertId = $repo->insert([
        'team_id'   => $teamId,
        'player_id' => $playerId,
        'played_at' => requireParam($body, 'played_at'),
        'type'      => $body['type']    ?? 'Scrim',
        'map_id'    => $mapId,
        'agent_id'  => $agentId,
        'acs'       => (int)requireParam($body, 'acs'),
        'kills'     => $kills,
        'deaths'    => $deaths,
        'assists'   => $assists,
        'fb'        => (int)($body['fb'] ?? 0),
    ]);

    sendSuccess(['id' => $insertId], 201);
}

if ($method === 'PUT' && $id !== null) {
    $scope = getDB()->prepare("SELECT team_id FROM player_stats WHERE id = ? LIMIT 1");
    $scope->execute([$id]);
    $row = $scope->fetch();
    if (!$row) sendError('Player stat row not found', 404);
    assertTeamAccess($authUser, (string)$row['team_id']);

    $body = getJsonBody();
    if (isset($body['map']))   $body['map_id']   = $repo->resolveMapId($body['map']);
    if (isset($body['agent'])) $body['agent_id'] = $repo->resolveAgentId($body['agent']);
    $repo->update($id, $body);
    sendSuccess(['updated' => $id]);
}

if ($method === 'DELETE' && $id !== null) {
    $scope = getDB()->prepare("SELECT team_id FROM player_stats WHERE id = ? LIMIT 1");
    $scope->execute([$id]);
    $row = $scope->fetch();
    if (!$row) sendError('Player stat row not found', 404);
    assertTeamAccess($authUser, (string)$row['team_id']);

    $repo->delete($id);
    sendSuccess(['deleted' => $id]);
}

sendError('Not found', 404);

// ── Helpers ──────────────────────────────────────────────────
function castPlayerRow(array $r): array
{
    $r['acs']     = (int)$r['acs'];
    $r['kills']   = (int)$r['kills'];
    $r['deaths']  = (int)$r['deaths'];
    $r['assists'] = (int)$r['assists'];
    $r['fb']      = (int)$r['fb'];
    $r['kda']     = (float)$r['kda'];
    return $r;
}

function castFloats(array $r): array
{
    foreach ($r as $k => $v) {
        if (is_numeric($v) && strpos($k, 'id') === false && $k !== 'games' && $k !== 'total_entries') {
            $r[$k] = (strpos($k, 'avg') !== false || strpos($k, 'kda') !== false)
                ? (float)$v : (is_float($v + 0) ? (float)$v : (int)$v);
        }
    }
    return $r;
}
