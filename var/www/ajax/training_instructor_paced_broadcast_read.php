<?php
declare(strict_types=1);

/**
 * /var/www/ajax/training_instructor_paced_broadcast_read.php
 *
 * Dynamic endpoint (no cache).
 * Purpose: Fetch the latest broadcast message (real payload) after a log_poll signal.
 *
 * Response JSON:
 * {
 *   "ok": true,
 *   "data": { "id": 123, "message": "...", "created_at": "..." } | null,
 *   "error": null
 * }
 */

require_once __DIR__ . '/_guard_dynamic.php';

use Engine\Database\DatabaseManager;
use Modules\Training\Auth\Repositories\BroadcastRepository;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

try {
	$meta = $_SESSION['delivery_meta'] ?? null;
	if (!is_array($meta)) {
		http_response_code(401);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Missing delivery_meta'], JSON_UNESCAPED_UNICODE);
		exit;
	}

	$accessId = (int)($meta['access_id'] ?? 0);
	if ($accessId <= 0) {
		http_response_code(422);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Missing access_id'], JSON_UNESCAPED_UNICODE);
		exit;
	}

	// Parse JSON body (optional)
	$raw = file_get_contents('php://input');
	$in = ($raw !== false && $raw !== '') ? json_decode($raw, true) : [];
	if (!is_array($in)) $in = [];

	$lookbackSeconds = (int)($in['lookback_seconds'] ?? 60);
	if ($lookbackSeconds < 5) $lookbackSeconds = 5;
	if ($lookbackSeconds > 600) $lookbackSeconds = 600;

	// Release session lock before DB work
	session_write_close();

	$dbm = DatabaseManager::getInstance();
	$dbRuntime = $dbm->getConnection('runtime');

	$repo = new BroadcastRepository($dbRuntime);
	$msg = $repo->readLatest($accessId, $lookbackSeconds);

	echo json_encode([
		'ok' => true,
		'data' => $msg,
		'error' => null
	], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
	exit;

} catch (Throwable) {
	http_response_code(500);
	echo json_encode(['ok' => false, 'data' => null, 'error' => 'Server error'], JSON_UNESCAPED_UNICODE);
	exit;
}