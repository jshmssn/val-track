<?php
// ============================================================
// backend/config/database.php
// ============================================================

declare(strict_types=1);

function vtLoadEnvFile(string $path): void
{
    if (!is_file($path) || !is_readable($path)) return;

    $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines === false) return;

    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#') continue;

        $eq = strpos($line, '=');
        if ($eq === false) continue;

        $key = trim(substr($line, 0, $eq));
        $val = trim(substr($line, $eq + 1));
        if ($key === '') continue;

        if ((array_key_exists($key, $_ENV) && $_ENV[$key] !== '') || getenv($key) !== false) {
            continue;
        }

        if (strlen($val) >= 2) {
            $first = $val[0];
            $last  = $val[strlen($val) - 1];
            if (($first === '"' && $last === '"') || ($first === "'" && $last === "'")) {
                $val = substr($val, 1, -1);
            }
        }

        $_ENV[$key] = $val;
        putenv("$key=$val");
    }
}

function vtEnv(string $key, ?string $default = null): ?string
{
    if (array_key_exists($key, $_ENV) && $_ENV[$key] !== '') {
        return (string) $_ENV[$key];
    }

    $val = getenv($key);
    if ($val !== false && $val !== '') {
        return (string) $val;
    }

    return $default;
}

function vtEnvBool(string $key, bool $default = false): bool
{
    $raw = vtEnv($key);
    if ($raw === null) return $default;

    $norm = strtolower(trim($raw));
    if (in_array($norm, ['1', 'true', 'yes', 'on'], true)) return true;
    if (in_array($norm, ['0', 'false', 'no', 'off'], true)) return false;
    return $default;
}

function vtLoadProjectEnvs(): void
{
    static $loaded = false;
    if ($loaded) return;
    $loaded = true;

    vtLoadEnvFile(__DIR__ . '/../.env');
    vtLoadEnvFile(__DIR__ . '/../../.env');
}


function uuid(): string
{
    return sprintf(
        '%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
        mt_rand(0, 0xffff),
        mt_rand(0, 0xffff),
        mt_rand(0, 0xffff),
        mt_rand(0, 0x0fff) | 0x4000,
        mt_rand(0, 0x3fff) | 0x8000,
        mt_rand(0, 0xffff),
        mt_rand(0, 0xffff),
        mt_rand(0, 0xffff)
    );
}

function getDB(): PDO
{
    static $pdo = null;
    if ($pdo !== null) return $pdo;

    vtLoadProjectEnvs();

    $isProduction = vtEnvBool('IS_PRODUCTION', false);
    $defaultDbName = $isProduction ? 'valorant_intel' : 'val_demo';

    $host = vtEnv('DB_HOST', 'localhost') ?? 'localhost';
    $port = vtEnv('DB_PORT', '3306') ?? '3306';
    $db   = vtEnv('DB_NAME', $defaultDbName) ?? $defaultDbName;
    $user = vtEnv('DB_USER', 'jshmssn') ?? 'jshmssn';
    $pass = vtEnv('DB_PASSWORD', vtEnv('DB_PASS', 'root')) ?? 'root';

    $dsn = "mysql:host={$host};port={$port};dbname={$db};charset=utf8mb4";

    $pdo = new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);

    return $pdo;
}
