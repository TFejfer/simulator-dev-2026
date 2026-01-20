<?php
declare(strict_types=1);

session_start();

header('Content-Type: application/json; charset=utf-8');

echo json_encode([
  'ok' => true,
  'sid' => session_id(),
  'cookie_in' => $_COOKIE,
  'session_in' => $_SESSION,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
