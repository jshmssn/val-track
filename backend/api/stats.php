<?php

declare(strict_types=1);

ob_start();
ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');
error_reporting(E_ALL);

// ============================================================
// backend/api/stats.php
//
// GET /backend/api/stats.php?type=map_winrates&team_id=xxx
// GET /backend/api/stats.php?type=agent_stats&team_id=xxx
// GET /backend/api/stats.php?type=team_economics&team_id=xxx
// GET /backend/api/stats.php?type=player_averages&team_id=xxx
// ============================================================

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../helpers/response.php';
require_once __DIR__ . '/../helpers/auth.php';

setCorsHeaders();
$authUser = requireAuth();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') sendError('Method not allowed', 405);

$type   = $_GET['type']    ?? null;
$teamId = resolveScopedTeamId($authUser, $_GET['team_id'] ?? null);

switch ($type) {
    case 'map_winrates':
        getMapWinrates($teamId);
        break;
    case 'agent_stats':
        getAgentStats($teamId);
        break;
    case 'team_economics':
        getTeamEconomics($teamId);
        break;
    case 'player_averages':
        getPlayerAverages($teamId);
        break;
    default:
        sendError("Unknown stats type. Use: map_winrates, agent_stats, team_economics, player_averages", 400);
}

// ── Map win rates ────────────────────────────────────────────
function getMapWinrates(?string $teamId): void
{
    $db     = getDB();
    $where  = $teamId ? 'WHERE m.team_id = ?' : '';
    $params = $teamId ? [$teamId] : [];

    $stmt = $db->prepare("
        SELECT
            mp.name AS map_name,
            COUNT(*) AS matches_played,
            SUM(CASE WHEN m.result = 'Win'  THEN 1 ELSE 0 END) AS wins,
            SUM(CASE WHEN m.result = 'Loss' THEN 1 ELSE 0 END) AS losses,
            ROUND(100.0 * SUM(CASE WHEN m.result = 'Win' THEN 1 ELSE 0 END) / COUNT(*), 1) AS win_rate_pct
        FROM matches m
        JOIN maps mp ON m.map_id = mp.id
        $where
        GROUP BY mp.name
        ORDER BY win_rate_pct DESC
    ");
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    sendSuccess(array_map(fn($r) => [
        'map_name'       => $r['map_name'],
        'matches_played' => (int)$r['matches_played'],
        'wins'           => (int)$r['wins'],
        'losses'         => (int)$r['losses'],
        'win_rate_pct'   => (float)$r['win_rate_pct'],
    ], $rows));
}

// ── Agent stats ──────────────────────────────────────────────
function getAgentStats(?string $teamId): void
{
    $db     = getDB();
    $join   = $teamId ? 'JOIN matches m ON pms.match_id = m.id' : '';
    $where  = $teamId ? 'WHERE m.team_id = ?' : '';
    $params = $teamId ? [$teamId] : [];

    $stmt = $db->prepare("
        SELECT
            a.name AS agent,
            a.role AS agent_role,
            COUNT(pms.id) AS times_played,
            ROUND(AVG(pms.acs), 1) AS avg_acs,
            ROUND(AVG(pms.kills / NULLIF(pms.deaths, 0)), 2) AS avg_kd,
            ROUND(AVG(pms.adr), 1) AS avg_adr,
            ROUND(AVG(pms.kast_pct), 1) AS avg_kast
        FROM player_match_stats pms
        JOIN agents a ON pms.agent_id = a.id
        $join
        $where
        GROUP BY a.name, a.role
        ORDER BY times_played DESC
    ");
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    sendSuccess(array_map(fn($r) => [
        'agent'        => $r['agent'],
        'agent_role'   => $r['agent_role'],
        'times_played' => (int)$r['times_played'],
        'avg_acs'      => (float)$r['avg_acs'],
        'avg_kd'       => (float)$r['avg_kd'],
        'avg_adr'      => (float)$r['avg_adr'],
        'avg_kast'     => (float)$r['avg_kast'],
    ], $rows));
}

// ── Team economics ───────────────────────────────────────────
function getTeamEconomics(?string $teamId): void
{
    $db     = getDB();
    $where  = $teamId ? 'WHERE m.team_id = ?' : '';
    $params = $teamId ? [$teamId] : [];

    $stmt = $db->prepare("
        SELECT
            m.id AS match_id,
            m.played_at AS date,
            mp.name AS map,
            m.result,
            ROUND(100.0 * tmm.atk_rounds_won   / NULLIF(tmm.atk_rounds_played,   0), 1) AS atk_win_pct,
            ROUND(100.0 * tmm.def_rounds_won   / NULLIF(tmm.def_rounds_played,   0), 1) AS def_win_pct,
            ROUND(100.0 * tmm.post_plant_wins  / NULLIF(tmm.post_plant_total,    0), 1) AS post_plant_pct,
            ROUND(100.0 * tmm.eco_rounds_won   / NULLIF(tmm.eco_rounds_played,   0), 1) AS eco_win_pct,
            ROUND(100.0 * tmm.force_rounds_won / NULLIF(tmm.force_rounds_played, 0), 1) AS force_win_pct
        FROM matches m
        JOIN maps mp ON m.map_id = mp.id
        LEFT JOIN team_match_metrics tmm ON tmm.match_id = m.id
        $where
        ORDER BY m.played_at DESC
    ");
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    sendSuccess(array_map(fn($r) => array_map(
        fn($v) => is_numeric($v) ? (float)$v : $v,
        $r
    ), $rows));
}

// ── Player averages ──────────────────────────────────────────
function getPlayerAverages(?string $teamId): void
{
    $db     = getDB();
    $where  = $teamId ? 'WHERE p.team_id = ? AND p.is_active = 1' : 'WHERE p.is_active = 1';
    $params = $teamId ? [$teamId] : [];

    $stmt = $db->prepare("
        SELECT
            p.id AS player_id,
            p.ign,
            p.role,
            COUNT(pms.id) AS matches_played,
            ROUND(AVG(pms.acs), 1) AS avg_acs,
            ROUND(AVG(pms.kills / NULLIF(pms.deaths, 0)), 2) AS avg_kd,
            ROUND(AVG(pms.adr), 1) AS avg_adr,
            ROUND(AVG(pms.kast_pct), 1) AS avg_kast,
            ROUND(AVG(pms.fk_rate) * 100, 1) AS avg_fk_pct,
            ROUND(AVG(pms.clutch_rate) * 100, 1) AS avg_clutch_pct
        FROM players p
        LEFT JOIN player_match_stats pms ON pms.player_id = p.id
        $where
        GROUP BY p.id, p.ign, p.role
        ORDER BY avg_acs DESC
    ");
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    sendSuccess(array_map(fn($r) => array_map(
        fn($v) => is_numeric($v) ? (float)$v : $v,
        $r
    ), $rows));
}
