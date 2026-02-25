<?php
declare(strict_types=1);

/**
 * /var/www/ajax/training_instructor_results_read.php
 *
 * Dynamic endpoint (no cache).
 * Returns completed exercises for results list.
 *
 * Response:
 * { ok:true, data:{ results:[...] }, error:null }
 */

require_once __DIR__ . '/_guard_dynamic.php';

use Modules\Training\Auth\Repositories\ExerciseRuntimeRepository;

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

	if ($accessId <= 0 || $teamNo <= 0) {
		http_response_code(422);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Missing access_id or team_no'], JSON_UNESCAPED_UNICODE);
		exit;
	}

	// Release session lock early
	session_write_close();

	$repo = new ExerciseRuntimeRepository($dbRuntime);
	$rows = $repo->findCompletedExercises($accessId, $teamNo);

	$results = [];
	foreach ($rows as $row) {
		$results[] = [
			'exercise' => (int)($row['exercise_no'] ?? 0),
			'skill' => (int)($row['skill_id'] ?? 0),
			'theme' => (int)($row['theme_id'] ?? 0),
			'scenario' => (int)($row['scenario_id'] ?? 0),
			'format' => (int)($row['format_id'] ?? 0),
			'step' => (int)($row['step_no'] ?? 0),
		];
	}

	echo json_encode([
		'ok' => true,
		'data' => [
			'results' => $results,
		],
		'error' => null
	], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
	exit;

} catch (Throwable) {
	http_response_code(500);
	echo json_encode(['ok' => false, 'data' => null, 'error' => 'Server error'], JSON_UNESCAPED_UNICODE);
	exit;
}
