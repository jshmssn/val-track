<?php

declare(strict_types=1);

ob_start();
ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../helpers/response.php';

setCorsHeaders();

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$type = $_GET['type'] ?? null;
$teamId = $_GET['team_id'] ?? null;
$id = $_GET['id'] ?? null;
$db = getDB();

if (!$type) sendError('type is required', 422);

switch ($method) {
    case 'GET':
        handleGet($db, (string)$type, $teamId);
        break;
    case 'POST':
        handlePost($db, (string)$type);
        break;
    case 'PUT':
        handlePut($db, (string)$type, $teamId);
        break;
    case 'DELETE':
        handleDelete($db, (string)$type, $id);
        break;
    default:
        sendError('Method not allowed', 405);
}

function handleGet(PDO $db, string $type, ?string $teamId): void
{
    switch ($type) {
        case 'maps':
            $rows = $db->query("SELECT id, name FROM maps WHERE is_active = 1 ORDER BY name")->fetchAll();
            sendSuccess($rows);
            break;
        case 'agents':
            $rows = $db->query("SELECT id, name, role FROM agents WHERE is_active = 1 ORDER BY role, name")->fetchAll();
            sendSuccess($rows);
            break;
        case 'players':
            if (!$teamId) sendError('team_id required', 422);
            $stmt = $db->prepare("SELECT id, ign, role, is_active FROM players WHERE team_id = ? AND is_active = 1 ORDER BY ign");
            $stmt->execute([$teamId]);
            sendSuccess($stmt->fetchAll());
            break;
        case 'opponents':
            if (!$teamId) sendError('team_id required', 422);
            $stmt = $db->prepare("SELECT DISTINCT name FROM opponents WHERE team_id = ? ORDER BY name");
            $stmt->execute([$teamId]);
            sendSuccess(array_column($stmt->fetchAll(), 'name'));
            break;
        case 'teams':
            $rows = $db->query("SELECT id, name FROM teams ORDER BY name")->fetchAll();
            sendSuccess($rows);
            break;
        case 'team':
            if (!$teamId) sendError('team_id required', 422);
            $stmt = $db->prepare("SELECT id, name FROM teams WHERE id = ?");
            $stmt->execute([$teamId]);
            $row = $stmt->fetch();
            if (!$row) sendError('Team not found', 404);
            sendSuccess($row);
            break;
        default:
            sendError('type must be: maps, agents, players, opponents, teams, team', 400);
    }
}

function handlePost(PDO $db, string $type): void
{
    $body = getJsonBody();
    $name = trim((string)($body['name'] ?? ''));
    if ($name === '') sendError('name is required', 422);

    if ($type === 'maps') {
        $sel = $db->prepare("SELECT id, is_active FROM maps WHERE LOWER(name) = LOWER(?) LIMIT 1");
        $sel->execute([$name]);
        $existing = $sel->fetch();

        if ($existing && (int)$existing['is_active'] === 1) {
            sendError('Map already exists', 409);
        }
        if ($existing) {
            $db->prepare("UPDATE maps SET name = ?, is_active = 1 WHERE id = ?")->execute([$name, $existing['id']]);
            $stmt = $db->prepare("SELECT id, name FROM maps WHERE id = ?");
            $stmt->execute([$existing['id']]);
            sendSuccess($stmt->fetch(), 201);
        }

        $id = uuid();
        $db->prepare("INSERT INTO maps (id, name, is_active) VALUES (?, ?, 1)")->execute([$id, $name]);
        sendSuccess(['id' => $id, 'name' => $name], 201);
    }

    if ($type === 'agents') {
        $role = trim((string)($body['role'] ?? 'Unassigned'));
        if ($role === '') $role = 'Unassigned';

        $sel = $db->prepare("SELECT id, is_active FROM agents WHERE LOWER(name) = LOWER(?) LIMIT 1");
        $sel->execute([$name]);
        $existing = $sel->fetch();

        if ($existing && (int)$existing['is_active'] === 1) {
            sendError('Agent already exists', 409);
        }
        if ($existing) {
            $db->prepare("UPDATE agents SET name = ?, role = ?, is_active = 1 WHERE id = ?")->execute([$name, $role, $existing['id']]);
            $stmt = $db->prepare("SELECT id, name, role FROM agents WHERE id = ?");
            $stmt->execute([$existing['id']]);
            sendSuccess($stmt->fetch(), 201);
        }

        $id = uuid();
        $db->prepare("INSERT INTO agents (id, name, role, is_active) VALUES (?, ?, ?, 1)")->execute([$id, $name, $role]);
        sendSuccess(['id' => $id, 'name' => $name, 'role' => $role], 201);
    }

    sendError('POST supports only type=maps or type=agents', 400);
}

function handleDelete(PDO $db, string $type, ?string $id): void
{
    if (!$id) sendError('id is required', 422);

    if ($type === 'maps') {
        $stmt = $db->prepare("SELECT id FROM maps WHERE id = ? AND is_active = 1");
        $stmt->execute([$id]);
        if (!$stmt->fetch()) sendError('Map not found', 404);

        $inUse = $db->prepare("SELECT COUNT(*) AS c FROM matches WHERE map_id = ?");
        $inUse->execute([$id]);
        $count = (int)$inUse->fetch()['c'];
        if ($count > 0) sendError('Cannot delete map: it is already used in matches', 409);

        $db->prepare("UPDATE maps SET is_active = 0 WHERE id = ?")->execute([$id]);
        sendSuccess(['id' => $id, 'deleted' => true]);
    }

    if ($type === 'agents') {
        $stmt = $db->prepare("SELECT id FROM agents WHERE id = ? AND is_active = 1");
        $stmt->execute([$id]);
        if (!$stmt->fetch()) sendError('Agent not found', 404);

        $inUse = $db->prepare("SELECT COUNT(*) AS c FROM player_match_stats WHERE agent_id = ?");
        $inUse->execute([$id]);
        $count = (int)$inUse->fetch()['c'];
        if ($count > 0) sendError('Cannot delete agent: it is already used in player match stats', 409);

        $db->prepare("UPDATE agents SET is_active = 0 WHERE id = ?")->execute([$id]);
        sendSuccess(['id' => $id, 'deleted' => true]);
    }

    sendError('DELETE supports only type=maps or type=agents', 400);
}

function handlePut(PDO $db, string $type, ?string $teamId): void
{
    if ($type !== 'team') {
        sendError('PUT supports only type=team', 400);
    }

    if (!$teamId) sendError('team_id required', 422);
    $body = getJsonBody();
    $name = trim((string)($body['name'] ?? ''));
    if ($name === '') sendError('name is required', 422);

    $check = $db->prepare("SELECT id FROM teams WHERE id = ?");
    $check->execute([$teamId]);
    if (!$check->fetch()) sendError('Team not found', 404);

    $db->prepare("UPDATE teams SET name = ? WHERE id = ?")->execute([$name, $teamId]);
    $stmt = $db->prepare("SELECT id, name FROM teams WHERE id = ?");
    $stmt->execute([$teamId]);
    sendSuccess($stmt->fetch());
}
