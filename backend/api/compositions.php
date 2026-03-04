<?php

declare(strict_types=1);

ob_start();
ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../helpers/response.php';

setCorsHeaders();

$db = getDB();
ensureSchema($db);

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$teamId = $_GET['team_id'] ?? null;
$compositionId = $_GET['composition_id'] ?? null;
$resultId = $_GET['result_id'] ?? null;

switch ($method) {
    case 'GET':
        if (!$teamId) sendError('team_id required', 422);
        listCompositions($db, (string)$teamId);
        break;
    case 'POST':
        createResource($db);
        break;
    case 'PUT':
        updateResource($db, $compositionId, $resultId);
        break;
    case 'DELETE':
        deleteResource($db, $compositionId, $resultId);
        break;
    default:
        sendError('Method not allowed', 405);
}

function ensureSchema(PDO $db): void
{
    $db->exec("
        CREATE TABLE IF NOT EXISTS team_compositions (
            id CHAR(36) PRIMARY KEY,
            team_id CHAR(36) NOT NULL,
            name VARCHAR(120) NOT NULL,
            agents_json TEXT NULL,
            notes TEXT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_team_compositions_team (team_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    // Backfill for existing installs created before agents_json was added.
    try {
        $db->exec("ALTER TABLE team_compositions ADD COLUMN agents_json TEXT NULL AFTER name");
    } catch (Throwable $e) {
        // Column already exists; ignore.
    }

    $db->exec("
        CREATE TABLE IF NOT EXISTS team_composition_games (
            id CHAR(36) PRIMARY KEY,
            composition_id CHAR(36) NOT NULL,
            match_id CHAR(36) NULL,
            played_at DATE NOT NULL,
            map_name VARCHAR(100) NULL,
            opponent_name VARCHAR(120) NULL,
            result VARCHAR(10) NOT NULL,
            scoreline VARCHAR(20) NULL,
            agents_json TEXT NULL,
            notes TEXT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_composition_games_comp (composition_id),
            INDEX idx_composition_games_played (played_at),
            CONSTRAINT fk_composition_games_comp
                FOREIGN KEY (composition_id) REFERENCES team_compositions(id)
                ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    // Backfill for existing installs.
    try {
        $db->exec("ALTER TABLE team_composition_games ADD COLUMN match_id CHAR(36) NULL AFTER composition_id");
    } catch (Throwable $e) {
        // Column already exists; ignore.
    }
    try {
        $db->exec("ALTER TABLE team_composition_games ADD COLUMN agents_json TEXT NULL AFTER scoreline");
    } catch (Throwable $e) {
        // Column already exists; ignore.
    }
}

function listCompositions(PDO $db, string $teamId): void
{
    $stmt = $db->prepare("
        SELECT id, team_id, name, agents_json, notes, created_at, updated_at
        FROM team_compositions
        WHERE team_id = ?
        ORDER BY updated_at DESC, created_at DESC
    ");
    $stmt->execute([$teamId]);
    $comps = $stmt->fetchAll();

    if (!$comps) {
        sendSuccess([]);
    }

    $resultStmt = $db->prepare("
        SELECT
            g.id, g.composition_id, g.played_at, g.map_name, g.opponent_name,
            g.match_id, g.result, g.scoreline, g.agents_json, g.notes, g.created_at, g.updated_at
        FROM team_composition_games g
        WHERE g.composition_id = ?
        ORDER BY g.played_at DESC, g.created_at DESC
    ");

    foreach ($comps as &$comp) {
        $decodedAgents = [];
        if (!empty($comp['agents_json'])) {
            $decoded = json_decode((string)$comp['agents_json'], true);
            if (is_array($decoded)) {
                $decodedAgents = array_values(array_filter(array_map('strval', $decoded), fn($a) => trim($a) !== ''));
            }
        }
        $comp['agents'] = $decodedAgents;
        unset($comp['agents_json']);

        $resultStmt->execute([$comp['id']]);
        $games = $resultStmt->fetchAll();
        foreach ($games as &$game) {
            $decodedGameAgents = json_decode((string)($game['agents_json'] ?? ''), true);
            $game['agents'] = is_array($decodedGameAgents)
                ? array_values(array_filter(array_map('strval', $decodedGameAgents), fn($a) => trim($a) !== ''))
                : [];
            unset($game['agents_json']);
        }

        $wins = 0;
        $losses = 0;
        foreach ($games as $g) {
            if (($g['result'] ?? '') === 'Win') $wins++;
            elseif (($g['result'] ?? '') === 'Loss') $losses++;
        }
        $total = count($games);
        $winRate = $total > 0 ? (int)round(($wins / $total) * 100) : 0;

        $comp['summary'] = [
            'played' => $total,
            'wins' => $wins,
            'losses' => $losses,
            'winRate' => $winRate,
        ];
        $comp['games'] = $games;
    }

    sendSuccess($comps);
}

function createResource(PDO $db): void
{
    $body = getJsonBody();
    $entity = (string)($body['entity'] ?? '');

    if ($entity === 'composition') {
        $teamId = trim((string)($body['team_id'] ?? ''));
        $name = trim((string)($body['name'] ?? ''));
        $agents = normalizeAgents($body['agents'] ?? []);
        $notes = isset($body['notes']) ? trim((string)$body['notes']) : null;

        if ($teamId === '') sendError('team_id required', 422);
        if ($name === '') sendError('name required', 422);

        $id = uuid();
        $stmt = $db->prepare("
            INSERT INTO team_compositions (id, team_id, name, agents_json, notes)
            VALUES (?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $id,
            $teamId,
            $name,
            !empty($agents) ? json_encode($agents, JSON_UNESCAPED_UNICODE) : null,
            $notes !== '' ? $notes : null
        ]);

        sendSuccess(['id' => $id], 201);
    }

    if ($entity === 'game') {
        $compositionId = trim((string)($body['composition_id'] ?? ''));
        $matchId = trim((string)($body['match_id'] ?? ''));
        $playedAt = trim((string)($body['played_at'] ?? ''));
        $result = trim((string)($body['result'] ?? ''));
        $mapName = isset($body['map_name']) ? trim((string)$body['map_name']) : null;
        $opponentName = isset($body['opponent_name']) ? trim((string)$body['opponent_name']) : null;
        $scoreline = isset($body['scoreline']) ? trim((string)$body['scoreline']) : null;
        $agents = normalizeAgents($body['agents'] ?? []);
        $notes = isset($body['notes']) ? trim((string)$body['notes']) : null;

        if ($compositionId === '') sendError('composition_id required', 422);
        if ($matchId === '' && $playedAt === '') sendError('played_at required when match_id is not provided', 422);
        if ($matchId === '' && $result !== 'Win' && $result !== 'Loss') sendError('result must be Win or Loss', 422);

        $exists = $db->prepare("SELECT id FROM team_compositions WHERE id = ?");
        $exists->execute([$compositionId]);
        if (!$exists->fetch()) sendError('Composition not found', 404);

        if ($matchId !== '') {
            $meta = fetchMatchMeta($db, $matchId);
            if (!$meta) sendError('Match not found', 404);
            $playedAt = (string)$meta['played_at'];
            $mapName = $meta['map_name'] ?? null;
            $opponentName = $meta['opponent_name'] ?? null;
            $result = $meta['result'] ?? 'Loss';
            $scoreline = $meta['scoreline'] ?? null;
        }

        $id = uuid();
        $stmt = $db->prepare("
            INSERT INTO team_composition_games
                (id, composition_id, match_id, played_at, map_name, opponent_name, result, scoreline, agents_json, notes)
            VALUES
                (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $id,
            $compositionId,
            $matchId !== '' ? $matchId : null,
            $playedAt,
            $mapName !== '' ? $mapName : null,
            $opponentName !== '' ? $opponentName : null,
            $result,
            $scoreline !== '' ? $scoreline : null,
            !empty($agents) ? json_encode($agents, JSON_UNESCAPED_UNICODE) : null,
            $notes !== '' ? $notes : null,
        ]);

        sendSuccess(['id' => $id], 201);
    }

    sendError('Unsupported entity. Use composition or game', 400);
}

function updateResource(PDO $db, ?string $compositionId, ?string $resultId): void
{
    $body = getJsonBody();

    if ($compositionId) {
        $name = isset($body['name']) ? trim((string)$body['name']) : null;
        $agentsProvided = array_key_exists('agents', $body);
        $agents = $agentsProvided ? normalizeAgents($body['agents']) : null;
        $notes = isset($body['notes']) ? trim((string)$body['notes']) : null;
        $sets = [];
        $params = [];

        if ($name !== null) {
            if ($name === '') sendError('name cannot be empty', 422);
            $sets[] = 'name = ?';
            $params[] = $name;
        }
        if ($notes !== null) {
            $sets[] = 'notes = ?';
            $params[] = ($notes === '' ? null : $notes);
        }
        if ($agentsProvided) {
            $sets[] = 'agents_json = ?';
            $params[] = !empty($agents) ? json_encode($agents, JSON_UNESCAPED_UNICODE) : null;
        }
        if (!$sets) sendError('No fields to update', 422);

        $params[] = $compositionId;
        $stmt = $db->prepare("UPDATE team_compositions SET " . implode(', ', $sets) . " WHERE id = ?");
        $stmt->execute($params);
        if ($stmt->rowCount() === 0) {
            $exists = $db->prepare("SELECT id FROM team_compositions WHERE id = ? LIMIT 1");
            $exists->execute([$compositionId]);
            if (!$exists->fetch()) sendError('Composition not found', 404);
            sendSuccess(['id' => $compositionId, 'updated' => false, 'unchanged' => true]);
        }
        sendSuccess(['id' => $compositionId, 'updated' => true]);
    }

    if ($resultId) {
        $sets = [];
        $params = [];

        if (isset($body['played_at'])) {
            $playedAt = trim((string)$body['played_at']);
            if ($playedAt === '') sendError('played_at cannot be empty', 422);
            $sets[] = 'played_at = ?';
            $params[] = $playedAt;
        }
        if (isset($body['map_name'])) {
            $mapName = trim((string)$body['map_name']);
            $sets[] = 'map_name = ?';
            $params[] = ($mapName === '' ? null : $mapName);
        }
        if (isset($body['opponent_name'])) {
            $opponent = trim((string)$body['opponent_name']);
            $sets[] = 'opponent_name = ?';
            $params[] = ($opponent === '' ? null : $opponent);
        }
        if (isset($body['result'])) {
            $result = trim((string)$body['result']);
            if ($result !== 'Win' && $result !== 'Loss') sendError('result must be Win or Loss', 422);
            $sets[] = 'result = ?';
            $params[] = $result;
        }
        if (isset($body['scoreline'])) {
            $score = trim((string)$body['scoreline']);
            $sets[] = 'scoreline = ?';
            $params[] = ($score === '' ? null : $score);
        }
        if (array_key_exists('agents', $body)) {
            $agents = normalizeAgents($body['agents']);
            $sets[] = 'agents_json = ?';
            $params[] = !empty($agents) ? json_encode($agents, JSON_UNESCAPED_UNICODE) : null;
        }
        if (isset($body['notes'])) {
            $notes = trim((string)$body['notes']);
            $sets[] = 'notes = ?';
            $params[] = ($notes === '' ? null : $notes);
        }
        if (array_key_exists('match_id', $body)) {
            $matchId = trim((string)$body['match_id']);
            if ($matchId === '') {
                $sets[] = 'match_id = ?';
                $params[] = null;
            } else {
                $meta = fetchMatchMeta($db, $matchId);
                if (!$meta) sendError('Match not found', 404);
                $sets[] = 'match_id = ?';
                $params[] = $matchId;
                $sets[] = 'played_at = ?';
                $params[] = (string)$meta['played_at'];
                $sets[] = 'map_name = ?';
                $params[] = $meta['map_name'] ?? null;
                $sets[] = 'opponent_name = ?';
                $params[] = $meta['opponent_name'] ?? null;
                $sets[] = 'result = ?';
                $params[] = $meta['result'] ?? 'Loss';
                $sets[] = 'scoreline = ?';
                $params[] = $meta['scoreline'] ?? null;
            }
        }
        if (!$sets) sendError('No fields to update', 422);

        $params[] = $resultId;
        $stmt = $db->prepare("UPDATE team_composition_games SET " . implode(', ', $sets) . " WHERE id = ?");
        $stmt->execute($params);
        if ($stmt->rowCount() === 0) {
            $exists = $db->prepare("SELECT id FROM team_composition_games WHERE id = ? LIMIT 1");
            $exists->execute([$resultId]);
            if (!$exists->fetch()) sendError('Game record not found', 404);
            sendSuccess(['id' => $resultId, 'updated' => false, 'unchanged' => true]);
        }
        sendSuccess(['id' => $resultId, 'updated' => true]);
    }

    sendError('composition_id or result_id required', 422);
}

function normalizeAgents($raw): array
{
    if (!is_array($raw)) return [];
    $out = [];
    foreach ($raw as $item) {
        $agent = trim((string)$item);
        if ($agent === '') continue;
        $out[] = $agent;
    }
    // unique while preserving order
    return array_values(array_unique($out));
}

function fetchMatchMeta(PDO $db, string $matchId): ?array
{
    $stmt = $db->prepare("
        SELECT
            m.played_at,
            mp.name AS map_name,
            o.name AS opponent_name,
            m.result,
            CONCAT(m.score_us, '-', m.score_them) AS scoreline
        FROM matches m
        JOIN maps mp ON m.map_id = mp.id
        LEFT JOIN opponents o ON m.opponent_id = o.id
        WHERE m.id = ?
        LIMIT 1
    ");
    $stmt->execute([$matchId]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function deleteResource(PDO $db, ?string $compositionId, ?string $resultId): void
{
    if ($compositionId) {
        $stmt = $db->prepare("DELETE FROM team_compositions WHERE id = ?");
        $stmt->execute([$compositionId]);
        if ($stmt->rowCount() === 0) sendError('Composition not found', 404);
        sendSuccess(['id' => $compositionId, 'deleted' => true]);
    }

    if ($resultId) {
        $stmt = $db->prepare("DELETE FROM team_composition_games WHERE id = ?");
        $stmt->execute([$resultId]);
        if ($stmt->rowCount() === 0) sendError('Game record not found', 404);
        sendSuccess(['id' => $resultId, 'deleted' => true]);
    }

    sendError('composition_id or result_id required', 422);
}
