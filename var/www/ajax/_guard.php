<?php
declare(strict_types=1);

/**
 * AJAX guard
 * Enforces a valid login session for all AJAX endpoints.
 */

require_once __DIR__ . '/../App/bootstrap.php';

if (!empty($_GET['debug'])) {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'session_status' => session_status(),
        'session_id'     => session_id(),
        'cookie_phpsessid' => $_COOKIE['PHPSESSID'] ?? null,
        'has_user_id'    => isset($_SESSION['user_id']),
        'has_delivery_meta' => isset($_SESSION['delivery_meta']),
        'has_session_token' => isset($_SESSION['session_token']),
        'session_keys'   => array_keys($_SESSION ?? []),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$uid = $_SESSION['user_id'] ?? null;
$ctx = $_SESSION['delivery_meta'] ?? null;

if (empty($uid) || !is_array($ctx)) {
    http_response_code(401);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => 'Not authenticated']);
    exit;
}

if (empty($_SESSION['session_token'])) {
    http_response_code(401);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => 'Invalid session']);
    exit;
}