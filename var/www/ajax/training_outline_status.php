<?php
declare(strict_types=1);

/**
 * /var/www/ajax/training_outline_status.php
 *
 * Dynamic endpoint (no cache).
 *
 * Returns:
 * - locks: recent unlock events (exercise_no + seconds_left)
 * - exercises: max_step per exercise_no (including max_step=0)
 *
 * Response:
 * { ok:true, data:{ locks:[], exercises:[] }, error:null }
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
	$deliveryId = (int)($meta['delivery_id'] ?? 0);

	if ($accessId <= 0 || $deliveryId <= 0) {
		http_response_code(422);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Missing access_id or delivery_id'], JSON_UNESCAPED_UNICODE);
		exit;
	}

	if ($teamNo <= 0) {
		// Team guard should handle this on the client, but keep endpoint safe.
		echo json_encode([
			'ok' => true,
			'data' => ['locks' => [], 'exercises' => []],
			'error' => null
		], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
		exit;
	}

	session_write_close();

	$dbm = DatabaseManager::getInstance();
	$dbSharedContent = $dbm->getConnection('shared_content');

	$repo = new TrainingOutlineStatusRepository($dbRuntime, $dbSharedContent);

	$locks = $repo->findRecentUnlocks($accessId, 60);
	$exercises = $repo->findExerciseProgress($deliveryId, $accessId, $teamNo);


echo json_encode([
	'ok' => true,
	'data' => [
		'_debug' => [
			'access_id' => $accessId,
			'team_no' => $teamNo,
			'delivery_id_raw' => ($meta['delivery_id'] ?? null),
			'delivery_id_cast' => $deliveryId,
		],
		'exercises' => [],
		'locks' => []
	],
	'error' => null
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
exit;



	/*
	echo json_encode([
		'ok' => true,
		'data' => [
			'locks' => $locks,
			'exercises' => $exercises,
		],
		'error' => null
	], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
	exit;
*/
} catch (Throwable) {
	http_response_code(500);
	echo json_encode(['ok' => false, 'data' => null, 'error' => 'Server error'], JSON_UNESCAPED_UNICODE);
	exit;
}