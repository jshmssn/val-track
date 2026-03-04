<?php

declare(strict_types=1);

ob_start();
ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');
error_reporting(E_ALL);

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../helpers/response.php';
require_once __DIR__ . '/../helpers/auth.php';

setCorsHeaders();
$authUser = requireAuth();

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    getNotes();
} elseif ($method === 'POST') {
    upsertNote();
} elseif ($method === 'DELETE') {
    deleteByContext();
} else {
    sendError('Not found', 404);
}

function getNotes(): void
{
    global $authUser;
    $db = getDB();

    $teamId = resolveScopedTeamId($authUser, $_GET['team_id'] ?? '');

    $where = ['cn.team_id = ?', 'cn.valid = 1'];
    $params = [$teamId];

    if (!empty($_GET['match_id'])) {
        $where[] = 'cn.match_id = ?';
        $params[] = $_GET['match_id'];
    }
    if (!empty($_GET['player_id'])) {
        $where[] = 'cn.player_id = ?';
        $params[] = $_GET['player_id'];
    }

    $stmt = $db->prepare("
        SELECT
            cn.id,
            cn.team_id,
            cn.match_id,
            cn.player_id,
            p.ign AS player,
            cn.title,
            cn.body,
            cn.tags,
            cn.created_at,
            cn.updated_at
        FROM coaching_notes cn
        LEFT JOIN players p ON p.id = cn.player_id
        WHERE " . implode(' AND ', $where) . "
        ORDER BY cn.updated_at DESC
    ");
    $stmt->execute($params);
    sendSuccess($stmt->fetchAll());
}

function upsertNote(): void
{
    global $authUser;
    $db = getDB();
    $body = getJsonBody();

    $teamId = resolveScopedTeamId($authUser, $body['team_id'] ?? '');
    $matchId = requireParam($body, 'match_id');
    $playerId = requireParam($body, 'player_id');
    $noteBody = trim((string)($body['body'] ?? ''));

    if ($noteBody === '') {
        sendError('Missing required field: body', 422);
    }

    $title = isset($body['title']) ? trim((string)$body['title']) : null;
    $tags = isset($body['tags']) ? trim((string)$body['tags']) : null;
    $createdBy = (string)($authUser['id'] ?? '');
    if ($createdBy === '') $createdBy = null;

    // Keep one canonical note per team+match+player context.
    $find = $db->prepare("
        SELECT id
        FROM coaching_notes
        WHERE team_id = ? AND match_id = ? AND player_id = ?
        ORDER BY updated_at DESC
        LIMIT 1
    ");
    $find->execute([$teamId, $matchId, $playerId]);
    $existing = $find->fetch();

    if ($existing) {
        $id = (string)$existing['id'];
        $upd = $db->prepare("
            UPDATE coaching_notes
            SET title = ?, body = ?, tags = ?, valid = 1
            WHERE id = ?
        ");
        $upd->execute([
            $title !== '' ? $title : null,
            $noteBody,
            $tags !== '' ? $tags : null,
            $id,
        ]);
    } else {
        $id = uuid();
        $ins = $db->prepare("
            INSERT INTO coaching_notes
              (id, team_id, created_by, match_id, player_id, title, body, tags, valid)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
        ");
        $ins->execute([
            $id,
            $teamId,
            $createdBy,
            $matchId,
            $playerId,
            $title !== '' ? $title : null,
            $noteBody,
            $tags !== '' ? $tags : null,
        ]);
    }

    $row = $db->prepare("
        SELECT
            cn.id,
            cn.team_id,
            cn.match_id,
            cn.player_id,
            p.ign AS player,
            cn.title,
            cn.body,
            cn.tags,
            cn.created_at,
            cn.updated_at
        FROM coaching_notes cn
        LEFT JOIN players p ON p.id = cn.player_id
        WHERE cn.id = ?
        LIMIT 1
    ");
    $row->execute([$id]);
    sendSuccess($row->fetch());
}

function deleteByContext(): void
{
    global $authUser;
    $db = getDB();

    $teamId = resolveScopedTeamId($authUser, $_GET['team_id'] ?? '');
    $matchId = $_GET['match_id'] ?? '';
    $playerId = $_GET['player_id'] ?? '';

    if ($teamId === '' || $matchId === '' || $playerId === '') {
        sendError('team_id, match_id, and player_id are required', 422);
    }

    $del = $db->prepare("
        UPDATE coaching_notes
        SET valid = 0
        WHERE team_id = ? AND match_id = ? AND player_id = ? AND valid = 1
    ");
    $del->execute([$teamId, $matchId, $playerId]);

    sendSuccess([
        'deleted' => true,
        'rows' => $del->rowCount(),
    ]);
}
