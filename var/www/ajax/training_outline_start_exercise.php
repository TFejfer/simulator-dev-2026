<?php
declare(strict_types=1);

/**
 * /var/www/ajax/training_outline_start_exercise.php
 *
 * Backend-authoritative start of a pending exercise.
 *
 * Request JSON:
 * { "outline_id": 396, "position_count": 1, "role_id": 1 }
 *
 * Response JSON:
 * { ok:true, data:{ navigate_to:"delivery-1-1-troubleshoot" }, error:null }
 */

require_once __DIR__ . '/_guard_dynamic.php';

use Engine\Database\DatabaseManager;
use Modules\Shared\Support\Databases;
use Modules\Training\Auth\Repositories\OutlineRepository;
use Modules\Training\Auth\Repositories\ExerciseStepsRepository;
use Modules\Training\Auth\Repositories\ExerciseRuntimeRepository;
use Modules\Training\Auth\Repositories\ActiveParticipantRepository;

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
	$token = (string)($meta['session_token'] ?? ($_SESSION['session_token'] ?? ''));

	if ($accessId <= 0 || $teamNo <= 0 || $deliveryId <= 0 || $token === '') {
		http_response_code(422);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Missing access/team/delivery/token'], JSON_UNESCAPED_UNICODE);
		exit;
	}

	$raw = file_get_contents('php://input');
	$in = ($raw !== false && $raw !== '') ? json_decode($raw, true) : [];
	if (!is_array($in)) $in = [];

	$outlineId = (int)($in['outline_id'] ?? 0);
	$positionCount = (int)($in['position_count'] ?? 0);
	$roleId = (int)($in['role_id'] ?? 0);

	if ($outlineId <= 0) {
		http_response_code(422);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Missing outline_id'], JSON_UNESCAPED_UNICODE);
		exit;
	}

	session_write_close();

	$dbm = DatabaseManager::getInstance();
	$dbRuntime = $dbm->getConnection(Databases::RUNTIME);
	$dbShared = $dbm->getConnection(Databases::SHARED_CONTENT);

	$outlinesRepo = new OutlineRepository($dbShared);
	$stepsRepo = new ExerciseStepsRepository($dbShared);
	$runtimeRepo = new ExerciseRuntimeRepository($dbRuntime);
	$activeRepo = new ActiveParticipantRepository($dbRuntime);

	$outlineRow = $outlinesRepo->findOutlineRowById($outlineId, $deliveryId);
	if (!$outlineRow) {
		http_response_code(404);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Outline item not found'], JSON_UNESCAPED_UNICODE);
		exit;
	}

	$itemType = (string)($outlineRow['item_type'] ?? '');
	$exerciseNo = (int)($outlineRow['exercise_no'] ?? 0);
	$skillId = (int)($outlineRow['skill_id'] ?? 0);
	$formatId = (int)($outlineRow['format_id'] ?? 0);

	if ($itemType !== 'exercise' || $exerciseNo <= 0) {
		http_response_code(422);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Not an exercise item'], JSON_UNESCAPED_UNICODE);
		exit;
	}

	// Guard: must be unlocked
	if (!$runtimeRepo->isUnlocked($accessId, $exerciseNo, 600)) {
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Exercise is locked'], JSON_UNESCAPED_UNICODE);
		exit;
	}

	// Guard: must not be already started/completed
	$latest = $runtimeRepo->findLatestByOutline($accessId, $teamNo, $outlineId);
	$maxStep = $latest ? (int)($latest['step_no'] ?? 0) : 0;

	if ($maxStep >= 10 && $maxStep < 100) {
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Exercise already in progress'], JSON_UNESCAPED_UNICODE);
		exit;
	}
	if ($maxStep >= 100) {
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Exercise already completed'], JSON_UNESCAPED_UNICODE);
		exit;
	}

	// Guard: no other exercise open
	$stmt = $dbShared->prepare("SELECT outline_id FROM outlines WHERE delivery_id = :delivery_id AND item_type='exercise' AND exercise_no > 0");
	$stmt->execute([':delivery_id' => $deliveryId]);
	$allOutlineIds = array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));

	$maxMap = $runtimeRepo->findMaxStepByOutlineIds($accessId, $teamNo, $allOutlineIds);
	foreach ($maxMap as $oid => $ms) {
		if ((int)$oid === $outlineId) continue;
		if ($ms >= 10 && $ms < 100) {
			echo json_encode(['ok' => false, 'data' => null, 'error' => 'Another exercise is already open'], JSON_UNESCAPED_UNICODE);
			exit;
		}
	}

	// Multi-position: require role/position
	if ($formatId === 5) {
		if ($positionCount <= 0 || $roleId <= 0) {
			echo json_encode(['ok' => false, 'data' => null, 'error' => 'Missing role/position'], JSON_UNESCAPED_UNICODE);
			exit;
		}
		$activeRepo->updateRolePosition($accessId, $token, $positionCount, $roleId);
	}

	// Insert first log row (step 20)
	$currentState = null;
	$nextState = null;

	if (in_array($skillId, [1, 8, 12], true)) {
		$currentState = 11;
		$nextState = 11;
	}

	$insertId = $runtimeRepo->insertFirstEntry([
		'access_id' => $accessId,
		'team_no' => $teamNo,
		'outline_id' => $outlineId,
		'exercise_no' => (int)($outlineRow['exercise_no'] ?? 0),
		'theme_id' => (int)($outlineRow['theme_id'] ?? 0),
		'scenario_id' => (int)($outlineRow['scenario_id'] ?? 0),
		'format_id' => $formatId,
		'step_no' => 20,
		'current_state' => $currentState,
		'next_state' => $nextState,
		'actor_token' => $token,
		'actor_name' => 'participant'
	]);

	if ($insertId <= 0) {
		http_response_code(500);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Failed to create first entry'], JSON_UNESCAPED_UNICODE);
		exit;
	}

	// Resolve navigation page via exercise_steps
	$tmpSkill = in_array($skillId, [8, 12], true) ? 1 : $skillId;
	$pageKey = $stepsRepo->findPageKey($tmpSkill, $formatId, 20);
	if ($pageKey === '') $pageKey = 'error';

	echo json_encode([
		'ok' => true,
		'data' => [
			'navigate_to' => $pageKey
		],
		'error' => null
	], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
	exit;

} catch (Throwable) {
	http_response_code(500);
	echo json_encode(['ok' => false, 'data' => null, 'error' => 'Server error'], JSON_UNESCAPED_UNICODE);
	exit;
}