<?php

declare(strict_types=1);

ob_start();
ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');
error_reporting(E_ALL);

// ============================================================
// backend/api/matches.php
//
// GET    /backend/api/matches.php              → all matches (with filters)
// GET    /backend/api/matches.php?id=xxx       → single match with player stats + metrics
// POST   /backend/api/matches.php              → create match + player stats + metrics
// PUT    /backend/api/matches.php?id=xxx       → update match
// DELETE /backend/api/matches.php?id=xxx       → delete match
// ============================================================

// Buffer ALL output so PHP warnings never corrupt JSON with HTML
require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../helpers/response.php';

setCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'];
$id     = $_GET['id'] ?? null;

// ── Route ────────────────────────────────────────────────────
if ($method === 'GET' && $id !== null) {
    getMatch($id);
} elseif ($method === 'GET') {
    getMatches();
} elseif ($method === 'POST') {
    createMatch();
} elseif ($method === 'PUT' && $id !== null) {
    updateMatch($id);
} elseif ($method === 'DELETE' && $id !== null) {
    deleteMatch($id);
} else {
    sendError('Not found', 404);
}

// ── GET all matches ──────────────────────────────────────────
// ── GET all matches ──────────────────────────────────────────
function getMatches(): void
{
    $db = getDB();

    // Optional filters via query params
    $where  = ['1=1'];
    $params = [];

    if (!empty($_GET['team_id'])) {
        $where[] = 'm.team_id = ?';
        $params[] = $_GET['team_id'];
    }
    if (!empty($_GET['map'])) {
        $where[] = 'mp.name = ?';
        $params[] = $_GET['map'];
    }
    if (!empty($_GET['type'])) {
        $where[] = 'm.type = ?';
        $params[] = $_GET['type'];
    }
    if (!empty($_GET['result'])) {
        $where[] = 'm.result = ?';
        $params[] = $_GET['result'];
    }
    if (!empty($_GET['opponent'])) {
        $where[] = 'o.name = ?';
        $params[] = $_GET['opponent'];
    }

    $sql = "
        SELECT
            m.id, m.team_id, m.played_at AS date, m.type, m.result,
            CONCAT(m.score_us, '-', m.score_them) AS score,
            mp.name AS map,
            o.name  AS opponent,
            m.tournament, m.stage, m.vod_url, m.notes,
            m.created_at
        FROM matches m
        JOIN maps mp      ON m.map_id      = mp.id
        LEFT JOIN opponents o ON m.opponent_id = o.id
        WHERE " . implode(' AND ', $where) . "
        ORDER BY m.played_at DESC
    ";

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $matches = $stmt->fetchAll();

    // Attach player stats + metrics to each match
    foreach ($matches as &$match) {
        $match['playerStats'] = getPlayerStatsForMatch($db, $match['id']);
        $match['teamMetrics'] = getTeamMetricsForMatch($db, $match['id']);
    }

    sendSuccess($matches);
}

// ── GET single match ─────────────────────────────────────────
function getMatch(string $id): void
{
    $db   = getDB();
    $match = findMatchById($db, $id);
    if (!$match) sendError('Match not found', 404);

    $match['playerStats'] = getPlayerStatsForMatch($db, $id);
    $match['teamMetrics'] = getTeamMetricsForMatch($db, $id);

    sendSuccess($match);
}

// ── POST create match ────────────────────────────────────────
function createMatch(): void
{
    $db   = getDB();
    $body = getJsonBody();

    // Validate required fields
    foreach (['date', 'map', 'type', 'result', 'score'] as $field) {
        if (empty($body[$field])) sendError("Missing required field: $field", 422);
    }

    // Parse score "13-9"
    $scoreParts = explode('-', $body['score']);
    $scoreUs    = (int)($scoreParts[0] ?? 0);
    $scoreThem  = (int)($scoreParts[1] ?? 0);

    // Resolve map ID
    $mapStmt = $db->prepare("SELECT id FROM maps WHERE name = ?");
    $mapStmt->execute([$body['map']]);
    $mapRow = $mapStmt->fetch();
    if (!$mapRow) sendError('Unknown map: ' . $body['map'], 422);
    $mapId = $mapRow['id'];

    // Resolve or create opponent
    $opponentId = null;
    if (!empty($body['opponent']) && !empty($body['team_id'])) {
        $opStmt = $db->prepare("SELECT id FROM opponents WHERE team_id = ? AND name = ?");
        $opStmt->execute([$body['team_id'], $body['opponent']]);
        $opRow = $opStmt->fetch();
        if ($opRow) {
            $opponentId = $opRow['id'];
        } else {
            // Auto-create opponent
            $opponentId = uuid();
            $db->prepare("INSERT INTO opponents (id, team_id, name) VALUES (?, ?, ?)")
                ->execute([$opponentId, $body['team_id'], $body['opponent']]);
        }
    }

    // Insert match
    $matchId  = uuid();
    $teamId   = $body['team_id'] ?? 'aaaaaaaa-0000-0000-0000-000000000001'; // default demo team
    $db->prepare("
        INSERT INTO matches
            (id, team_id, opponent_id, map_id, played_at, type, result,
             score_us, score_them, tournament, stage, vod_url, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ")->execute([
        $matchId,
        $teamId,
        $opponentId,
        $mapId,
        $body['date'],
        $body['type'],
        $body['result'],
        $scoreUs,
        $scoreThem,
        $body['tournament'] ?? null,
        $body['stage']      ?? null,
        $body['vod_url']    ?? null,
        $body['notes']      ?? null,
    ]);

    // Insert player stats
    if (!empty($body['playerStats']) && is_array($body['playerStats'])) {
        foreach ($body['playerStats'] as $ps) {
            // Resolve player ID from IGN — auto-create if not found
            $plStmt = $db->prepare("SELECT id FROM players WHERE ign = ? AND team_id = ?");
            $plStmt->execute([$ps['player'], $teamId]);
            $plRow = $plStmt->fetch();
            if (!$plRow) {
                // Player doesn't exist yet — insert them automatically
                $newPlayerId = uuid();
                $db->prepare("
                    INSERT INTO players (id, team_id, ign, role, is_active, created_at, updated_at)
                    VALUES (?, ?, ?, ?, 1, NOW(), NOW())
                ")->execute([
                    $newPlayerId,
                    $teamId,
                    $ps['player'],
                    $ps['role'] ?? null,
                ]);
                $plRow = ['id' => $newPlayerId];
            }

            // Resolve agent ID
            $agStmt = $db->prepare("SELECT id FROM agents WHERE name = ?");
            $agStmt->execute([$ps['agent']]);
            $agRow = $agStmt->fetch();
            if (!$agRow) continue;

            $db->prepare("
                INSERT INTO player_match_stats
                    (id, match_id, player_id, agent_id, acs, kills, deaths, assists,
                     adr, kast_pct, fk_rate, clutch_rate)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ")->execute([
                uuid(),
                $matchId,
                $plRow['id'],
                $agRow['id'],
                $ps['acs']    ?? 0,
                $ps['kills']  ?? 0,
                $ps['deaths'] ?? 0,
                $ps['assists'] ?? 0,
                $ps['adr']    ?? 0,
                $ps['kast']   ?? 0,
                $ps['fkRate'] ?? null,
                $ps['clutchRate'] ?? null,
            ]);
        }
    }

    // Insert team metrics
    if (!empty($body['teamMetrics']) && is_array($body['teamMetrics'])) {
        $tm = $body['teamMetrics'];
        $db->prepare("
            INSERT INTO team_match_metrics
                (id, match_id,
                 atk_rounds_played, atk_rounds_won,
                 def_rounds_played, def_rounds_won,
                 post_plant_total, post_plant_wins,
                 eco_rounds_played, eco_rounds_won)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ")->execute([
            uuid(),
            $matchId,
            $tm['atkRounds']      ?? 0,
            $tm['atkWins']       ?? 0,
            $tm['defRounds']      ?? 0,
            $tm['defWins']       ?? 0,
            $tm['postPlantTotal'] ?? 0,
            $tm['postPlantWins'] ?? 0,
            ($tm['atkPistolWin'] ?? $tm['ecoTotal'] ?? 'Loss') === 'Win' ? 1 : 0,
            ($tm['defPistolWin'] ?? $tm['ecoWins']  ?? 'Loss') === 'Win' ? 1 : 0,
        ]);
    }

    // Return the newly created match in full
    getMatch($matchId);
}

// ── PUT update match ─────────────────────────────────────────
function updateMatch(string $id): void
{
    $db   = getDB();
    $body = getJsonBody();

    // Check exists
    $check = $db->prepare("SELECT id FROM matches WHERE id = ?");
    $check->execute([$id]);
    if (!$check->fetch()) sendError('Match not found', 404);

    // Build dynamic SET clause from provided fields
    $allowed = [
        'played_at' => 'date',
        'type' => 'type',
        'result' => 'result',
        'tournament' => 'tournament',
        'stage' => 'stage',
        'vod_url' => 'vod_url',
        'notes' => 'notes'
    ];
    $sets   = [];
    $params = [];

    foreach ($allowed as $col => $key) {
        if (isset($body[$key])) {
            $sets[]   = "`$col` = ?";
            $params[] = $body[$key];
        }
    }

    // Handle score update
    if (!empty($body['score'])) {
        $parts = explode('-', $body['score']);
        $sets[]   = 'score_us = ?';
        $params[] = (int)($parts[0] ?? 0);
        $sets[]   = 'score_them = ?';
        $params[] = (int)($parts[1] ?? 0);
    }

    if (!empty($sets)) {
        $params[] = $id;
        $db->prepare("UPDATE matches SET " . implode(', ', $sets) . " WHERE id = ?")
            ->execute($params);
    }

    getMatch($id);
}

// ── DELETE match ─────────────────────────────────────────────
function deleteMatch(string $id): void
{
    $db   = getDB();
    $stmt = $db->prepare("DELETE FROM matches WHERE id = ?");
    $stmt->execute([$id]);

    if ($stmt->rowCount() === 0) sendError('Match not found', 404);

    sendSuccess(['id' => $id, 'deleted' => true]);
}

// ── Helpers ──────────────────────────────────────────────────
function getPlayerStatsForMatch(PDO $db, string $matchId): array
{
    $stmt = $db->prepare("
        SELECT
            p.id AS playerId,
            p.ign AS player,
            a.name AS agent,
            pms.acs,
            ROUND(pms.kills / NULLIF(pms.deaths, 0), 2) AS kd,
            pms.adr,
            pms.kast_pct AS kast,
            pms.fk_rate AS fkRate,
            pms.clutch_rate AS clutchRate,
            pms.kills, pms.deaths, pms.assists
        FROM player_match_stats pms
        JOIN players p ON pms.player_id = p.id
        JOIN agents  a ON pms.agent_id  = a.id
        WHERE pms.match_id = ?
        ORDER BY pms.acs DESC
    ");
    $stmt->execute([$matchId]);
    $rows = $stmt->fetchAll();

    // Cast numeric strings to numbers
    return array_map(fn($r) => array_map(fn($v) => is_numeric($v) ? (float)$v : $v, $r), $rows);
}

function getTeamMetricsForMatch(PDO $db, string $matchId): ?array
{
    $stmt = $db->prepare("
        SELECT
            atk_rounds_played AS atkRounds, atk_rounds_won AS atkWins,
            def_rounds_played AS defRounds, def_rounds_won AS defWins,
            post_plant_total AS postPlantTotal, post_plant_wins AS postPlantWins,
            eco_rounds_played AS atkPistolWin, eco_rounds_won AS defPistolWin
        FROM team_match_metrics
        WHERE match_id = ?
    ");
    $stmt->execute([$matchId]);
    $row = $stmt->fetch();
    if (!$row) return null;

    $result = [];
    foreach ($row as $key => $val) {
        if ($key === 'atkPistolWin' || $key === 'defPistolWin') {
            $result[$key] = ((int)$val === 1) ? 'Win' : 'Loss';
        } else {
            $result[$key] = (int)$val;
        }
    }
    return $result;
}

function findMatchById(PDO $db, string $id): ?array
{
    $stmt = $db->prepare("
        SELECT
            m.id, m.team_id, m.played_at AS date, m.type, m.result,
            CONCAT(m.score_us, '-', m.score_them) AS score,
            mp.name AS map,
            o.name  AS opponent,
            m.tournament, m.stage, m.vod_url, m.notes
        FROM matches m
        JOIN maps mp          ON m.map_id      = mp.id
        LEFT JOIN opponents o ON m.opponent_id = o.id
        WHERE m.id = ?
    ");
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    return $row ?: null;
}
