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
if (!isSuperAdminUser($authUser)) {
    sendError('Forbidden: superadmin only', 403);
}

$db = getDB();
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = $_GET['action'] ?? 'overview';

function canonicalRole(string $role): string
{
    $r = strtolower(trim($role));
    if ($r === 'analyst') return 'coach';
    return $r;
}

if ($method === 'GET' && $action === 'overview') {
    $users = $db->query("
        SELECT id, team_id, username, email, display_name, role, created_at, updated_at
        FROM users
        ORDER BY created_at DESC
    ")->fetchAll();
    foreach ($users as &$u) {
        $u['role'] = canonicalRole((string)($u['role'] ?? 'coach'));
        $u['is_superadmin'] = isSuperAdminUser($u);
    }

    $teams = $db->query("
        SELECT id, name, tag, region, created_at, updated_at
        FROM teams
        ORDER BY name
    ")->fetchAll();

    sendSuccess([
        'users' => $users,
        'teams' => $teams,
    ]);
}

if ($method === 'PUT' && $action === 'user') {
    $id = trim((string)($_GET['id'] ?? ''));
    if ($id === '') sendError('id is required', 422);

    $targetStmt = $db->prepare("
        SELECT id, email
        FROM users
        WHERE id = ?
        LIMIT 1
    ");
    $targetStmt->execute([$id]);
    $targetUser = $targetStmt->fetch();
    if (!$targetUser) sendError('User not found', 404);
    if (isSuperAdminUser($targetUser)) {
        sendError('Cannot edit superadmin accounts', 403);
    }

    $body = getJsonBody();
    $sets = [];
    $params = [];

    if (array_key_exists('display_name', $body)) {
        $name = trim((string)$body['display_name']);
        if ($name === '') sendError('display_name cannot be empty', 422);
        $sets[] = 'display_name = ?';
        $params[] = $name;
    }
    if (array_key_exists('email', $body)) {
        $email = strtolower(trim((string)$body['email']));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) sendError('Invalid email', 422);
        $emailChk = $db->prepare("SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id <> ? LIMIT 1");
        $emailChk->execute([$email, $id]);
        if ($emailChk->fetch()) sendError('Email already in use', 409);
        $sets[] = 'email = ?';
        $params[] = $email;
    }
    if (array_key_exists('username', $body)) {
        $username = trim((string)$body['username']);
        if ($username === '') sendError('username cannot be empty', 422);
        $userChk = $db->prepare("SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id <> ? LIMIT 1");
        $userChk->execute([$username, $id]);
        if ($userChk->fetch()) sendError('Username already in use', 409);
        $sets[] = 'username = ?';
        $params[] = $username;
    }
    if (array_key_exists('role', $body)) {
        $role = canonicalRole((string)$body['role']);
        if (!in_array($role, ['coach', 'player', 'admin'], true)) {
            sendError('Invalid role', 422);
        }
        $sets[] = 'role = ?';
        $params[] = $role;
    }
    if (array_key_exists('team_id', $body)) {
        $teamId = trim((string)($body['team_id'] ?? ''));
        if ($teamId !== '') {
            $chk = $db->prepare("SELECT id FROM teams WHERE id = ? LIMIT 1");
            $chk->execute([$teamId]);
            if (!$chk->fetch()) sendError('Team not found', 404);
            $sets[] = 'team_id = ?';
            $params[] = $teamId;
        } else {
            $sets[] = 'team_id = NULL';
        }
    }

    if (!$sets) sendError('No fields to update', 422);
    $params[] = $id;

    $stmt = $db->prepare("UPDATE users SET " . implode(', ', $sets) . " WHERE id = ?");
    $stmt->execute($params);
    if ($stmt->rowCount() === 0) {
        $chk = $db->prepare("SELECT id FROM users WHERE id = ? LIMIT 1");
        $chk->execute([$id]);
        if (!$chk->fetch()) sendError('User not found', 404);
    }

    $fetch = $db->prepare("
        SELECT id, team_id, username, email, display_name, role, created_at, updated_at
        FROM users
        WHERE id = ?
        LIMIT 1
    ");
    $fetch->execute([$id]);
    $row = $fetch->fetch();
    if (!$row) sendError('User not found', 404);
    $row['role'] = canonicalRole((string)($row['role'] ?? 'coach'));
    $row['is_superadmin'] = isSuperAdminUser($row);

    sendSuccess($row);
}

if ($method === 'POST' && $action === 'create_user') {
    $body = getJsonBody();

    $email = strtolower(trim((string)($body['email'] ?? '')));
    $username = trim((string)($body['username'] ?? ''));
    $displayName = trim((string)($body['display_name'] ?? ''));
    $role = canonicalRole((string)($body['role'] ?? 'coach'));
    $teamId = null;

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) sendError('Invalid email', 422);
    if ($username === '') sendError('username is required', 422);
    if ($displayName === '') sendError('display_name is required', 422);
    if (!in_array($role, ['coach', 'player', 'admin'], true)) {
        sendError('Invalid role', 422);
    }

    $emailChk = $db->prepare("SELECT id FROM users WHERE email = ? LIMIT 1");
    $emailChk->execute([$email]);
    if ($emailChk->fetch()) sendError('Email already in use', 409);

    $userChk = $db->prepare("SELECT id FROM users WHERE LOWER(username) = LOWER(?) LIMIT 1");
    $userChk->execute([$username]);
    if ($userChk->fetch()) sendError('Username already in use', 409);

    $plainPassword = 'valot' . date('Y');
    $hash = password_hash($plainPassword, PASSWORD_BCRYPT);
    if ($hash === false) sendError('Failed to hash password', 500);

    $id = uuid();
    $db->prepare("
        INSERT INTO users (id, team_id, username, email, display_name, role, password_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ")->execute([$id, $teamId, $username, $email, $displayName, $role, $hash]);

    $fetch = $db->prepare("
        SELECT id, team_id, username, email, display_name, role, created_at, updated_at
        FROM users
        WHERE id = ?
        LIMIT 1
    ");
    $fetch->execute([$id]);
    $row = $fetch->fetch();
    if (!$row) sendError('Failed to create user', 500);
    $row['role'] = canonicalRole((string)($row['role'] ?? 'coach'));
    $row['is_superadmin'] = isSuperAdminUser($row);

    sendSuccess([
        'user' => $row,
        'generated_password' => $plainPassword,
    ], 201);
}

sendError('Not found', 404);
