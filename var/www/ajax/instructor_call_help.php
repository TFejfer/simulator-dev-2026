<?php
declare(strict_types=1);

/**
 * /var/www/ajax/instructor_call_help.php
 *
 * Dynamic endpoint (no caching).
 *
 * Purpose:
 * - Team requests instructor help.
 * - No client parameters are accepted.
 *
 * Security:
 * - access_id and team_no are read exclusively from session (delivery_meta).
 * - notification_id is fixed: 2 ("Call instructor / request help").
 *
 * Architecture:
 * - No SQL in endpoint.
 * - Uses existing Modules\Shared\Repositories\NotificationRepository.
 */

require_once __DIR__ . '/_guard_dynamic.php';

use Modules\Shared\Repositories\NotificationRepository;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

try {
    $meta = $_SESSION['delivery_meta'] ?? null;
    if (!is_array($meta)) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'data' => null, 'error' => 'Missing delivery_meta'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $accessId = (int)($meta['access_id'] ?? 0);
    $teamNo   = (int)($meta['team_no'] ?? 0);

    if ($accessId <= 0 || $teamNo <= 0) {
        http_response_code(422);
        echo json_encode(['ok' => false, 'data' => null, 'error' => 'Missing access_id or team_no'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // Fixed semantic meaning:
    // 2 = "Call instructor / request help"
    $NOTIFICATION_ID = 2;

    // Release session lock before DB work (avoid blocking other concurrent requests)
    session_write_close();

    $repo = new NotificationRepository($dbRuntime);
    $repo->insertInstructorNotification($accessId, $teamNo, $NOTIFICATION_ID);

    echo json_encode(['ok' => true, 'data' => null, 'error' => null], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;

} catch (Throwable) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'data' => null, 'error' => 'Server error'], JSON_UNESCAPED_UNICODE);
    exit;
}