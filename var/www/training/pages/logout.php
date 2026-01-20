<?php
declare(strict_types=1);

require_once __DIR__ . '/../../App/bootstrap.php';

$sessionService->ensureStarted();

$accessId = (int)($_SESSION['user_id'] ?? 0);
$token    = (string)($_SESSION['session_token'] ?? '');

$logoutService->logout($accessId, $token);

header('Location: /login');
exit;