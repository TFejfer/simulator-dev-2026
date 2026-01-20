<?php
declare(strict_types=1);

require_once __DIR__ . '/../App/bootstrap.php';

// Must have a valid login session
$uid = $_SESSION['user_id'] ?? null;
$meta = $_SESSION['delivery_meta'] ?? null;

if (empty($uid) || !is_array($meta)) {
    header('Location: /login');
    exit;
}

// Route based on pace_id (1=instructor-paced, 2=league)
$paceId = (int)($meta['pace_id'] ?? 1);

if ($paceId === 2) {
    header('Location: /training-team-home');
    exit;
}

// Default landing for instructor-paced participants
header('Location: /training-instructor-setup');
exit;