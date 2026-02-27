<?php
// ============================================================
// backend/helpers/response.php
// ============================================================

declare(strict_types=1);

function setCorsHeaders(): void
{
    // Send CORS headers immediately — must come before any output
    header('Content-Type: application/json; charset=utf-8');

    // Handle OPTIONS preflight — respond immediately without touching DB or files
    if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

function sendSuccess($data, int $code = 200): void
{
    // Wipe ALL output buffers — catches PHP warnings/notices that render as HTML
    // e.g. "<br /><b>Warning</b>..." which breaks JSON.parse on the frontend
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    header('Content-Type: application/json; charset=utf-8');
    http_response_code($code);
    echo json_encode(['success' => true, 'data' => $data], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

function sendError(string $message, int $code = 400, ?array $details = null): void
{
    // Wipe ALL output buffers before sending error JSON
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    header('Content-Type: application/json; charset=utf-8');
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
        sendError("Missing required field: " . ($label ?: $key), 422);
    }
    return $data[$key];
}
