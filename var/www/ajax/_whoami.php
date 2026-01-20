<?php
declare(strict_types=1);

require_once '/var/www/bootstrap.php'; // this should session_start()

header('Content-Type: application/json; charset=utf-8');

echo json_encode([
    'host' => $_SERVER['HTTP_HOST'] ?? null,
    'https' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
    'session_status' => session_status(),
    'session_id' => session_id(),
    'cookie_names' => array_keys($_COOKIE ?? []),
    'has_user_id' => isset($_SESSION['user_id']),
    'has_delivery_meta' => isset($_SESSION['delivery_meta']),
    'has_session_token' => isset($_SESSION['session_token']),
    // Do not dump full session in prod; this is temporary debug
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
