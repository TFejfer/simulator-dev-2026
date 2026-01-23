<?php
declare(strict_types=1);

/**
 * /var/www/ajax/training_instructor_outline_status_read.php
 *
 * Dynamic endpoint (no cache).
 * Purpose: Return outline status payload for OutlineUI.applyStatusUpdate().
 *
 * Response:
 * {
 *   "ok": true,
 *   "data": {
 *     "exercises": [ { "exercise_no": 1, "max_step": 10 }, ... ],
 *     "locks":     [ { "exercise_no": 1, "seconds_left": 45 }, ... ]
 *   },
 *   "error": null
 * }
 */

require_once __DIR__ . '/_guard_dynamic.php';

use Engine\Database\DatabaseManager;
use Modules\Training\Auth\Repositories\TrainingOutlineStatusRepository;

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
	$teamNo = (int)($meta['team_no'] ?? 0);

	if ($accessId <= 0) {
		http_response_code(422);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Missing access_id'], JSON_UNESCAPED_UNICODE);
		exit;
	}
	if ($teamNo <= 0) {
		// Outline status depends on team scope for progress.
		http_response_code(422);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Missing team_no'], JSON_UNESCAPED_UNICODE);
		exit;
	}

	// Optional JSON body: allow overriding lookback window (safe clamped)
	$raw = file_get_contents('php://input');
	$in = ($raw !== false && $raw !== '') ? json_decode($raw, true) : [];
	if (!is_array($in)) $in = [];

	$windowSeconds = (int)($in['window_seconds'] ?? 60);
	if ($windowSeconds < 10) $windowSeconds = 10;
	if ($windowSeconds > 600) $windowSeconds = 600;

	// Release session lock before DB work
	session_write_close();

	$dbm = DatabaseManager::getInstance();

	// IMPORTANT:
	// - runtime: RUNTIME DB (log_exercise_unlock, log_exercise)
	// - shared_content: SHARED_CONTENT DB (outlines)
	$dbRuntime = $dbm->getConnection('runtime');
	$dbShared = $dbm->getConnection('shared_content');

	$repo = new TrainingOutlineStatusRepository($dbRuntime);

	$locks = $repo->findRecentUnlocks($accessId, $windowSeconds);
	$exercises = $repo->findExerciseProgress($accessId, $teamNo);

	echo json_encode([
		'ok' => true,
		'data' => [
			'exercises' => $exercises,
			'locks' => $locks,
		],
		'error' => null
	], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
	exit;

} catch (Throwable) {
	http_response_code(500);
	echo json_encode(['ok' => false, 'data' => null, 'error' => 'Server error'], JSON_UNESCAPED_UNICODE);
	exit;
}
