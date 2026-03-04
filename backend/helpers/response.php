<?php
// ============================================================
// backend/helpers/response.php
// ============================================================

declare(strict_types=1);

function getAllowedCorsOrigins(): array
{
    $raw = '';
    if (function_exists('vtEnv')) {
        $raw = (string)(vtEnv('CORS_ALLOWED_ORIGINS', '') ?? '');
    } else {
        $raw = (string)(getenv('CORS_ALLOWED_ORIGINS') ?: '');
    }

    $parts = array_filter(array_map('trim', explode(',', $raw)));
    return array_values($parts);
}

function setCorsHeadersForRequest(): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin === '') return;

    $allowed = getAllowedCorsOrigins();

    if (empty($allowed) || in_array('*', $allowed, true) || in_array($origin, $allowed, true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
        header('Access-Control-Allow-Credentials: true');
    }
}

function setCorsHeaders(): void
{
    header('Content-Type: application/json; charset=utf-8');
    setCorsHeadersForRequest();
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
    header('Access-Control-Max-Age: 86400');

    if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

function sendSuccess($data, int $code = 200): void
{
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    header('Content-Type: application/json; charset=utf-8');
    setCorsHeadersForRequest();
    http_response_code($code);
    echo json_encode(['success' => true, 'data' => $data], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

function sendError(string $message, int $code = 400, ?array $details = null): void
{
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    header('Content-Type: application/json; charset=utf-8');
    setCorsHeadersForRequest();
    http_response_code($code);
    $body = ['success' => false, 'error' => $message];
    if ($details) $body['details'] = $details;
    echo json_encode($body, JSON_UNESCAPED_UNICODE);
    exit;
}

function getJsonBody(): array
{
    $raw = file_get_contents('php://input');
    if (empty($raw)) return [];
    $decoded = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        sendError('Invalid JSON body: ' . json_last_error_msg(), 400);
    }
    return $decoded ?? [];
}

function requireParam(array $data, string $key, string $label = '')
{
    if (!isset($data[$key]) || $data[$key] === '') {
        sendError('Missing required field: ' . ($label ?: $key), 422);
    }
    return $data[$key];
}