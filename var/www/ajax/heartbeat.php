<?php
declare(strict_types=1);

/**
 * /var/www/ajax/heartbeat.php
 *
 * Dynamic endpoint (no cache):
 * - Requires valid session via /ajax/_guard.php
 * - Updates log_user_heartbeat(access_id, token) last_seen_at
 * - Returns JSON: { ok, data, error }
 */

require_once __DIR__ . '/_guard_dynamic.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

try {
    // Session token is the stable user session identifier in your new structure
    $token = (string)($_SESSION['session_token'] ?? '');
    if ($token === '') {
        http_response_code(401);
        echo json_encode(['ok' => false, 'data' => null, 'error' => 'Invalid session'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // access_id must come from delivery context/meta (NOT user_id)
    $meta = $_SESSION['delivery_meta'] ?? $_SESSION['delivery_context'] ?? null;

    $accessId = 0;
    if (is_array($meta)) {
        $accessId = (int)($meta['access_id'] ?? $meta['accessID'] ?? $meta['accessId'] ?? 0);
    }

    if ($accessId <= 0) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'data' => null, 'error' => 'Missing access_id'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // $dbRuntime is expected to be provided by _guard.php/bootstrap (same as your other ajax endpoints)
    if (!isset($dbRuntime) || !($dbRuntime instanceof PDO)) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'data' => null, 'error' => 'DB not available'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $stmt = $dbRuntime->prepare("
        INSERT INTO log_user_heartbeat (access_id, token, created_at, last_seen_at)
        VALUES (:aid, :tok, NOW(), NOW())
        ON DUPLICATE KEY UPDATE last_seen_at = NOW()
    ");
    $stmt->execute([
        ':aid' => $accessId,
        ':tok' => $token,
    ]);

    echo json_encode([
        'ok' => true,
        'data' => [
            'access_id' => $accessId,
            'ts' => time(),
        ],
        'error' => null
    ], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'data' => null, 'error' => 'Server error'], JSON_UNESCAPED_UNICODE);
}