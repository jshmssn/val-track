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

$db = getDB();
ensureAuthSchema($db);

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$action = $_GET['action'] ?? '';

if ($method === 'GET' && $action === 'me') {
    handleMe($db);
}
if ($method === 'POST' && $action === 'register') {
    sendError('Self-registration is disabled. Ask a superadmin to create your account.', 403);
}
if ($method === 'POST' && $action === 'login') {
    handleLogin($db);
}
if ($method === 'POST' && $action === 'logout') {
    handleLogout();
}
if ($method === 'POST' && $action === 'forgot') {
    handleForgotPassword($db);
}
if ($method === 'POST' && $action === 'reset') {
    handleResetPassword($db);
}
if ($method === 'POST' && $action === 'change_password') {
    handleChangePassword($db);
}
if ($method === 'POST' && $action === 'update_profile') {
    handleUpdateProfile($db);
}
if ($method === 'POST' && $action === 'setup_team') {
    handleSetupTeam($db);
}

sendError('Not found', 404);

function ensureAuthSchema(PDO $db): void
{
    $db->exec("
        CREATE TABLE IF NOT EXISTS password_resets (
            id CHAR(36) NOT NULL PRIMARY KEY,
            user_id CHAR(36) NOT NULL,
            email VARCHAR(255) NOT NULL,
            token_hash CHAR(64) NOT NULL,
            expires_at DATETIME NOT NULL,
            used_at DATETIME DEFAULT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_password_resets_email (email),
            INDEX idx_password_resets_user (user_id),
            INDEX idx_password_resets_expires (expires_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ");
}

function normalizeEmail(string $email): string
{
    return strtolower(trim($email));
}

function isStrongPassword(string $password): bool
{
    if (strlen($password) < 8) return false;
    if (!preg_match('/[a-z]/', $password)) return false;
    if (!preg_match('/[A-Z]/', $password)) return false;
    if (!preg_match('/\d/', $password)) return false;
    if (!preg_match('/[^a-zA-Z0-9]/', $password)) return false;
    return true;
}

function userPayload(array $user): array
{
    $role = strtolower(trim((string)($user['role'] ?? 'coach')));
    if ($role === 'analyst') $role = 'coach';

    return [
        'id' => $user['id'],
        'team_id' => $user['team_id'],
        'username' => $user['username'],
        'email' => $user['email'],
        'display_name' => $user['display_name'],
        'role' => $role,
        'is_superadmin' => isSuperAdminUser($user),
        'created_at' => $user['created_at'] ?? null,
        'updated_at' => $user['updated_at'] ?? null,
    ];
}

function handleMe(PDO $db): void
{
    $user = currentUserFromDb($db);
    if (!$user) {
        sendSuccess(['authenticated' => false, 'user' => null]);
    }
    sendSuccess(['authenticated' => true, 'user' => userPayload($user)]);
}

function handleLogin(PDO $db): void
{
    $body = getJsonBody();
    $identifier = trim((string)($body['identifier'] ?? ($body['email'] ?? '')));
    $password = (string)($body['password'] ?? '');

    if ($identifier === '') sendError('Invalid credentials', 401);

    $sql = "
        SELECT id, team_id, username, email, display_name, role, password_hash, created_at, updated_at
        FROM users
        WHERE %s = ?
        LIMIT 1
    ";
    if (strpos($identifier, '@') !== false) {
        $lookup = normalizeEmail($identifier);
        $stmt = $db->prepare(sprintf($sql, 'email'));
        $stmt->execute([$lookup]);
    } else {
        $lookup = $identifier;
        $stmt = $db->prepare(sprintf($sql, 'LOWER(username)'));
        $stmt->execute([strtolower($lookup)]);
    }
    $user = $stmt->fetch();

    if (!$user || empty($user['password_hash']) || !password_verify($password, (string)$user['password_hash'])) {
        sendError('Invalid credentials', 401);
    }

    if (password_needs_rehash((string)$user['password_hash'], PASSWORD_BCRYPT)) {
        $newHash = password_hash($password, PASSWORD_BCRYPT);
        if ($newHash !== false) {
            $db->prepare("UPDATE users SET password_hash = ? WHERE id = ?")->execute([$newHash, $user['id']]);
        }
    }

    loginUserSession($user);
    unset($user['password_hash']);
    sendSuccess(['authenticated' => true, 'user' => userPayload($user)]);
}

function handleLogout(): void
{
    logoutUserSession();
    sendSuccess(['authenticated' => false]);
}

function getFrontendBaseUrl(): string
{
    if (function_exists('vtEnv')) {
        $url = trim((string)(vtEnv('FRONTEND_BASE_URL', '') ?? ''));
        if ($url !== '') return rtrim($url, '/');
    }
    return 'http://localhost:3002';
}

function sendResetEmail(string $to, string $link): bool
{
    $subject = 'Valorant Intel Password Reset';
    $message = "We received a password reset request.\n\nUse this link to reset your password:\n$link\n\nIf you did not request this, you can ignore this email.";
    $headers = "From: no-reply@valtrack.local\r\n";
    return @mail($to, $subject, $message, $headers);
}

function handleForgotPassword(PDO $db): void
{
    $body = getJsonBody();
    $email = normalizeEmail((string)($body['email'] ?? ''));

    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        sendSuccess(['message' => 'If that email exists, a reset link has been sent.']);
    }

    $stmt = $db->prepare("SELECT id, email FROM users WHERE email = ? LIMIT 1");
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if ($user) {
        $token = bin2hex(random_bytes(32));
        $hash = hash('sha256', $token);

        $db->prepare("UPDATE password_resets SET used_at = NOW() WHERE email = ? AND used_at IS NULL")->execute([$email]);
        $db->prepare("
            INSERT INTO password_resets (id, user_id, email, token_hash, expires_at)
            VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))
        ")->execute([uuid(), $user['id'], $email, $hash]);

        $resetLink = getFrontendBaseUrl() . '/?reset_token=' . urlencode($token);
        $mailSent = sendResetEmail($email, $resetLink);

        if (!$mailSent) {
            error_log('Password reset email failed for ' . $email . '. Link: ' . $resetLink);
        }
    }

    sendSuccess(['message' => 'If that email exists, a reset link has been sent.']);
}

function handleResetPassword(PDO $db): void
{
    $body = getJsonBody();
    $token = trim((string)($body['token'] ?? ''));
    $password = (string)($body['password'] ?? '');

    if ($token === '') sendError('Reset token is required', 422);
    if (!isStrongPassword($password)) {
        sendError('Password must be at least 8 chars and include uppercase, lowercase, number, and symbol', 422);
    }

    $hash = hash('sha256', $token);
    $stmt = $db->prepare("
        SELECT id, user_id, email
        FROM password_resets
        WHERE token_hash = ?
          AND used_at IS NULL
          AND expires_at >= NOW()
        LIMIT 1
    ");
    $stmt->execute([$hash]);
    $row = $stmt->fetch();
    if (!$row) sendError('Invalid or expired reset token', 400);

    $passwordHash = password_hash($password, PASSWORD_BCRYPT);
    if ($passwordHash === false) sendError('Failed to hash password', 500);

    $db->beginTransaction();
    try {
        $db->prepare("UPDATE users SET password_hash = ? WHERE id = ?")->execute([$passwordHash, $row['user_id']]);
        $db->prepare("UPDATE password_resets SET used_at = NOW() WHERE id = ?")->execute([$row['id']]);
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        throw $e;
    }

    sendSuccess(['message' => 'Password has been reset successfully']);
}

function handleChangePassword(PDO $db): void
{
    $sessionUser = requireAuth();
    $body = getJsonBody();

    $currentPassword = (string)($body['current_password'] ?? '');
    $newPassword = (string)($body['new_password'] ?? '');

    if ($currentPassword === '') sendError('Current password is required', 422);
    if (!isStrongPassword($newPassword)) {
        sendError('New password must be at least 8 chars and include uppercase, lowercase, number, and symbol', 422);
    }

    $stmt = $db->prepare("SELECT id, password_hash FROM users WHERE id = ? LIMIT 1");
    $stmt->execute([$sessionUser['id']]);
    $row = $stmt->fetch();
    if (!$row || empty($row['password_hash'])) sendError('Account not found', 404);
    if (!password_verify($currentPassword, (string)$row['password_hash'])) {
        sendError('Current password is incorrect', 401);
    }

    $hash = password_hash($newPassword, PASSWORD_BCRYPT);
    if ($hash === false) sendError('Failed to hash password', 500);

    $db->prepare("UPDATE users SET password_hash = ? WHERE id = ?")->execute([$hash, $sessionUser['id']]);
    sendSuccess(['message' => 'Password updated successfully']);
}

function handleUpdateProfile(PDO $db): void
{
    $sessionUser = requireAuth();
    $body = getJsonBody();

    $username = trim((string)($body['username'] ?? ''));
    $email = normalizeEmail((string)($body['email'] ?? ''));

    if ($username === '') sendError('Username is required', 422);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) sendError('Invalid email address', 422);

    $userId = (string)$sessionUser['id'];

    $usernameChk = $db->prepare("SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id <> ? LIMIT 1");
    $usernameChk->execute([$username, $userId]);
    if ($usernameChk->fetch()) sendError('Username is already in use', 409);

    $emailChk = $db->prepare("SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id <> ? LIMIT 1");
    $emailChk->execute([$email, $userId]);
    if ($emailChk->fetch()) sendError('Email is already in use', 409);

    $db->prepare("UPDATE users SET username = ?, email = ? WHERE id = ?")->execute([$username, $email, $userId]);

    $fetch = $db->prepare("
        SELECT id, team_id, username, email, display_name, role, created_at, updated_at
        FROM users
        WHERE id = ?
        LIMIT 1
    ");
    $fetch->execute([$userId]);
    $user = $fetch->fetch();
    if (!$user) sendError('Account not found', 404);

    loginUserSession($user);
    sendSuccess([
        'message' => 'Profile updated successfully',
        'user' => userPayload($user),
    ]);
}

function handleSetupTeam(PDO $db): void
{
    $sessionUser = requireAuth();
    if (isSuperAdminUser($sessionUser)) {
        sendError('Superadmin does not require team setup', 422);
    }

    $userId = (string)$sessionUser['id'];
    $rowStmt = $db->prepare("
        SELECT id, team_id, username, email, display_name, role, created_at, updated_at
        FROM users
        WHERE id = ?
        LIMIT 1
    ");
    $rowStmt->execute([$userId]);
    $user = $rowStmt->fetch();
    if (!$user) sendError('Account not found', 404);
    if (!empty($user['team_id'])) {
        sendSuccess([
            'message' => 'Team is already assigned',
            'user' => userPayload($user),
        ]);
    }

    $body = getJsonBody();
    $teamName = trim((string)($body['team_name'] ?? ''));
    $teamTag = trim((string)($body['team_tag'] ?? ''));
    $region = trim((string)($body['region'] ?? ''));

    if ($teamName === '') sendError('Team name is required', 422);
    if (mb_strlen($teamName) > 100) sendError('Team name is too long', 422);
    if ($teamTag !== '' && mb_strlen($teamTag) > 10) sendError('Team tag is too long', 422);
    if ($region !== '' && mb_strlen($region) > 50) sendError('Region is too long', 422);

    $db->beginTransaction();
    try {
        $teamId = generateNextTeamId($db);
        $db->prepare("
            INSERT INTO teams (id, name, tag, region)
            VALUES (?, ?, ?, ?)
        ")->execute([$teamId, $teamName, $teamTag !== '' ? $teamTag : null, $region !== '' ? $region : null]);

        $db->prepare("UPDATE users SET team_id = ? WHERE id = ?")->execute([$teamId, $userId]);
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) $db->rollBack();
        throw $e;
    }

    $refresh = $db->prepare("
        SELECT id, team_id, username, email, display_name, role, created_at, updated_at
        FROM users
        WHERE id = ?
        LIMIT 1
    ");
    $refresh->execute([$userId]);
    $updatedUser = $refresh->fetch();
    if (!$updatedUser) sendError('Account not found', 404);

    loginUserSession($updatedUser);
    sendSuccess([
        'message' => 'Team created and linked to your account',
        'user' => userPayload($updatedUser),
        'team' => [
            'id' => $teamId,
            'name' => $teamName,
            'tag' => $teamTag !== '' ? $teamTag : null,
            'region' => $region !== '' ? $region : null,
        ],
    ], 201);
}

function generateNextTeamId(PDO $db): string
{
    $prefix = 'aaaaaaaa-0000-0000-0000-';
    $stmt = $db->query("
        SELECT id
        FROM teams
        WHERE id LIKE 'aaaaaaaa-0000-0000-0000-%'
        ORDER BY id DESC
        LIMIT 1
        FOR UPDATE
    ");
    $row = $stmt ? $stmt->fetch() : null;
    $lastSeq = 0;
    if ($row && !empty($row['id'])) {
        $tail = substr((string)$row['id'], -12);
        if (ctype_digit($tail)) {
            $lastSeq = (int)$tail;
        }
    }

    $nextSeq = $lastSeq + 1;
    if ($nextSeq > 999999999999) {
        sendError('Team ID sequence exhausted', 500);
    }

    return $prefix . str_pad((string)$nextSeq, 12, '0', STR_PAD_LEFT);
}
