<?php

declare(strict_types=1);

ob_start();
ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');
error_reporting(E_ALL);

// ============================================================
// backend/api/players.php
//
// GET    ?team_id=x               → list players for team
// GET    ?id=x                    → single player
// POST                            → create player
// PUT    ?id=x                    → update player
// DELETE ?id=x                    → delete player
// ============================================================

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../helpers/response.php';
require_once __DIR__ . '/../helpers/auth.php';

setCorsHeaders();
$authUser = requireAuth();
$scopeTeamId = resolveScopedTeamId($authUser, $_GET['team_id'] ?? null);

$method = $_SERVER['REQUEST_METHOD'];
$id     = $_GET['id'] ?? null;   // UUID string — do NOT cast to int
$db     = getDB();

if ($method === 'GET') {
    if ($id !== null) {
        $stmt = $db->prepare("SELECT id, team_id, ign, role, is_active, created_at FROM players WHERE id = ?");
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        if (!$row) sendError('Player not found', 404);
        assertTeamAccess($authUser, (string)$row['team_id']);
        sendSuccess($row);
    }

    $teamId = $scopeTeamId;   // UUID string

    $stmt = $db->prepare("SELECT id, ign, role, is_active FROM players WHERE team_id = ? ORDER BY ign");
    $stmt->execute([$teamId]);
    sendSuccess($stmt->fetchAll());
}

if ($method === 'POST') {
    $body   = getJsonBody();
    $teamId = resolveScopedTeamId($authUser, $body['team_id'] ?? null);
    $ign    = trim(requireParam($body, 'ign'));
    $newId  = uuid();

    $stmt = $db->prepare("INSERT INTO players (id, team_id, ign, role) VALUES (?,?,?,?)");
    $stmt->execute([$newId, $teamId, $ign, $body['role'] ?? null]);
    sendSuccess(['id' => $newId], 201);
}

if ($method === 'PUT' && $id !== null) {
    $check = $db->prepare("SELECT team_id FROM players WHERE id = ?");
    $check->execute([$id]);
    $row = $check->fetch();
    if (!$row) sendError('Player not found', 404);
    assertTeamAccess($authUser, (string)$row['team_id']);

    $body   = getJsonBody();
    $fields = [];
    $params = [];
    foreach (['ign', 'role', 'is_active'] as $f) {
        if (array_key_exists($f, $body)) {
            $fields[] = "$f = ?";
            $params[] = $body[$f];
        }
    }
    if (empty($fields)) sendError('Nothing to update', 422);
    $params[] = $id;
    $db->prepare("UPDATE players SET " . implode(', ', $fields) . " WHERE id = ?")->execute($params);
    sendSuccess(['updated' => $id]);
}

if ($method === 'DELETE' && $id !== null) {
    $check = $db->prepare("SELECT team_id FROM players WHERE id = ?");
    $check->execute([$id]);
    $row = $check->fetch();
    if (!$row) sendError('Player not found', 404);
    assertTeamAccess($authUser, (string)$row['team_id']);

    $db->prepare("DELETE FROM players WHERE id = ?")->execute([$id]);
    sendSuccess(['deleted' => $id]);
}

sendError('Not found', 404);
