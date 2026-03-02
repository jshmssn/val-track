<?php

declare(strict_types=1);

ob_start();
ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');
error_reporting(E_ALL);

// ============================================================
// backend/api/reference.php
//
// GET ?type=maps       → all active map names
// GET ?type=agents     → all active agent names
// GET ?type=players    → players for a team (?team_id=x)
// GET ?type=opponents  → opponent names for a team
// GET ?type=teams      → all teams
// ============================================================

require_once __DIR__ . '/../config/database.php';
require_once __DIR__ . '/../helpers/response.php';

setCorsHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') sendError('Method not allowed', 405);

$type   = $_GET['type']    ?? null;
$teamId = $_GET['team_id'] ?? null;   // UUID string — do NOT cast to int
$db     = getDB();

switch ($type) {
    case 'maps':
        $rows = $db->query("SELECT id, name FROM maps WHERE is_active = 1 ORDER BY name")->fetchAll();
        sendSuccess($rows);

    case 'agents':
        $rows = $db->query("SELECT id, name, role FROM agents WHERE is_active = 1 ORDER BY role, name")->fetchAll();
        sendSuccess($rows);

    case 'players':
        if (!$teamId) sendError('team_id required', 422);
        $stmt = $db->prepare("SELECT id, ign, role, is_active FROM players WHERE team_id = ? AND is_active = 1 ORDER BY ign");
        $stmt->execute([$teamId]);
        sendSuccess($stmt->fetchAll());

    case 'opponents':
        if (!$teamId) sendError('team_id required', 422);
        $stmt = $db->prepare("SELECT DISTINCT name FROM opponents WHERE team_id = ? ORDER BY name");
        $stmt->execute([$teamId]);
        sendSuccess(array_column($stmt->fetchAll(), 'name'));

    case 'teams':
        $rows = $db->query("SELECT id, name FROM teams ORDER BY name")->fetchAll();
        sendSuccess($rows);

    default:
        sendError('type must be: maps, agents, players, opponents, teams', 400);
}
