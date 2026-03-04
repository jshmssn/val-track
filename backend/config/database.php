<?php
// ============================================================
// backend/config/database.php
// ============================================================

declare(strict_types=1);


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

    $host   = $_ENV['DB_HOST']     ?? getenv('DB_HOST')     ?: 'localhost';
    $port   = $_ENV['DB_PORT']     ?? getenv('DB_PORT')     ?: '3306';
    $db     = $_ENV['DB_NAME']     ?? getenv('DB_NAME')     ?: 'val_demo';
    $user   = $_ENV['DB_USER']     ?? getenv('DB_USER')     ?: 'jshmssn';
    $pass   = $_ENV['DB_PASSWORD'] ?? getenv('DB_PASSWORD') ?: 'root';

    $dsn = "mysql:host={$host};port={$port};dbname={$db};charset=utf8mb4";

    $pdo = new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);

    return $pdo;
}
