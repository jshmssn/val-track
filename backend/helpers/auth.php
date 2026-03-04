<?php
declare(strict_types=1);

require_once __DIR__ . '/response.php';

function ensureSessionStarted(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) return;

    $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['SERVER_PORT'] ?? '') === '443')
        || (strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https');

    session_name('VALTRACKSESSID');
    session_set_cookie_params([
        'lifetime' => 60 * 60 * 24 * 7,
        'path' => '/',
        'secure' => $isHttps,
        'httponly' => true,
        'samesite' => $isHttps ? 'None' : 'Lax',
    ]);
    session_start();
}

function authUser(): ?array
{
    ensureSessionStarted();
    $user = $_SESSION['auth_user'] ?? null;
    return is_array($user) ? $user : null;
}

function isSuperAdminUser(array $user): bool
{
    if (function_exists('vtLoadProjectEnvs')) {
        vtLoadProjectEnvs();
    }

    $email = strtolower(trim((string)($user['email'] ?? '')));
    if ($email === '') return false;

    $raw = '';
    if (function_exists('vtEnv')) {
        $raw = (string)(vtEnv('SUPERADMIN_EMAILS', '') ?? '');
    } else {
        $raw = (string)(getenv('SUPERADMIN_EMAILS') ?: '');
    }
    if ($raw === '') return false;

    $allow = array_filter(array_map(static fn($v) => strtolower(trim($v)), explode(',', $raw)));
    return in_array($email, $allow, true);
}

function requireUserTeamId(array $user): string
{
    $teamId = trim((string)($user['team_id'] ?? ''));
    if ($teamId === '' && !isSuperAdminUser($user)) {
        sendError('No team assigned to your account', 403);
    }
    return $teamId;
}

function resolveScopedTeamId(array $user, ?string $requestedTeamId): string
{
    $requested = trim((string)($requestedTeamId ?? ''));
    $myTeam = trim((string)($user['team_id'] ?? ''));
    $super = isSuperAdminUser($user);

    if ($super) {
        if ($requested !== '') return $requested;
        if ($myTeam !== '') return $myTeam;
        sendError('team_id is required for superadmin requests', 422);
    }

    if ($myTeam === '') sendError('No team assigned to your account', 403);
    return $myTeam;
}

function assertTeamAccess(array $user, string $recordTeamId): void
{
    if (isSuperAdminUser($user)) return;
    $myTeam = trim((string)($user['team_id'] ?? ''));
    if ($myTeam === '' || $myTeam !== $recordTeamId) {
        sendError('Forbidden: team scope violation', 403);
    }
}

function requireAuth(): array
{
    $user = authUser();
    if (!$user) {
        sendError('Unauthorized', 401);
    }
    return $user;
}

function loginUserSession(array $user): void
{
    ensureSessionStarted();
    session_regenerate_id(true);
    $_SESSION['auth_user'] = [
        'id' => (string)$user['id'],
        'email' => (string)$user['email'],
        'display_name' => (string)($user['display_name'] ?? ''),
        'username' => (string)($user['username'] ?? ''),
        'role' => (string)($user['role'] ?? 'coach'),
        'team_id' => $user['team_id'] ?? null,
        'is_superadmin' => isSuperAdminUser($user),
    ];
}

function logoutUserSession(): void
{
    ensureSessionStarted();
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'] ?? '', (bool)$params['secure'], (bool)$params['httponly']);
    }
    session_destroy();
}

function currentUserFromDb(PDO $db): ?array
{
    $sessionUser = authUser();
    if (!$sessionUser || empty($sessionUser['id'])) return null;

    $stmt = $db->prepare("
        SELECT id, team_id, username, email, display_name, role, created_at, updated_at
        FROM users
        WHERE id = ?
        LIMIT 1
    ");
    $stmt->execute([$sessionUser['id']]);
    $row = $stmt->fetch();
    return $row ?: null;
}
