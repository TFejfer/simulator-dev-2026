<?php
declare(strict_types=1);

/**
 * /var/www/ajax/problem_action_log.php
 *
 * Dynamic endpoint (no cache).
 * Logs performed Inspect & Act actions.
 */

require_once __DIR__ . '/_guard_dynamic.php';

// Read meta BEFORE bootstrap closes the session
$deliveryMeta = $_SESSION['delivery_meta'] ?? null;
$exerciseMeta = $_SESSION['exercise_meta'] ?? null;

require_once __DIR__ . '/problem/_forms_bootstrap.php';

use Engine\Database\DatabaseManager;
use Modules\Problem\Repositories\WorkflowLogRepository;
use Modules\Problem\Support\Request;
use Modules\Training\Auth\Repositories\ExerciseRuntimeRepository;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

try {
	$boot = ProblemFormsBootstrap::init();
	$in = $boot['in'];
	$scope = $boot['scope'];
	$token = $boot['actor_token'];
	$themeId = (int)$boot['theme_id'];
	$scenarioId = (int)$boot['scenario_id'];

	$ciId = Request::str($in, 'ciID', '');
	if ($ciId === '') {
		$ciId = Request::str($in, 'ci_id', '');
	}
	$actionId = Request::int($in, 'actionID', 0);
	if ($actionId <= 0) {
		$actionId = Request::int($in, 'action_id', 0);
	}

	if ($ciId === '' || $actionId <= 0) {
		http_response_code(422);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Missing ciID/actionID'], JSON_UNESCAPED_UNICODE);
		exit;
	}

	$formatId = is_array($exerciseMeta) ? (int)($exerciseMeta['format_id'] ?? 0) : 0;
	$stepNo = is_array($exerciseMeta) ? (int)($exerciseMeta['step_no'] ?? 0) : 0;
	$currentState = is_array($exerciseMeta) ? (int)($exerciseMeta['current_state'] ?? 0) : 0;
	$deadlineUnix = is_array($exerciseMeta) ? (int)($exerciseMeta['deadline_unix'] ?? 0) : 0;
	$secondsLeft = is_array($exerciseMeta) ? (int)($exerciseMeta['seconds_left'] ?? 0) : 0;

	if ($formatId <= 0 || $stepNo <= 0 || $currentState <= 0) {
		$dbRuntime = DatabaseManager::getInstance()->getConnection('runtime');
		$runtimeRepo = new ExerciseRuntimeRepository($dbRuntime);

		$latest = null;
		if (!empty($scope['outline_id'])) {
			$latest = $runtimeRepo->findLatestByOutline(
				(int)$scope['access_id'],
				(int)$scope['team_no'],
				(int)$scope['outline_id']
			);
		}
		if (!$latest) {
			$latest = $runtimeRepo->findLatestRow((int)$scope['access_id'], (int)$scope['team_no']);
		}

		if ($latest) {
			$formatId = $formatId > 0 ? $formatId : (int)($latest['format_id'] ?? 0);
			$stepNo = $stepNo > 0 ? $stepNo : (int)($latest['step_no'] ?? 0);
			$currentState = $currentState > 0 ? $currentState : (int)($latest['current_state'] ?? 0);
		}
	}

	$now = time();
	$isExpired = false;
	if ($deadlineUnix > 0) {
		$isExpired = $now >= $deadlineUnix;
	} elseif ($secondsLeft !== 0) {
		$isExpired = $secondsLeft <= 0;
	}

	if ($formatId === 1 && $isExpired) {
		http_response_code(409);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Action not allowed: discovery time has expired.'], JSON_UNESCAPED_UNICODE);
		exit;
	}

	if ($stepNo < 20 || $stepNo > 60) {
		http_response_code(409);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Action not allowed in the current step.'], JSON_UNESCAPED_UNICODE);
		exit;
	}

	$validStepState = false;
	if ($stepNo >= 20 && $stepNo < 60 && $currentState > 10 && $currentState < 20) {
		$validStepState = true;
	} elseif ($stepNo === 60 && $currentState > 20 && $currentState < 99) {
		$validStepState = true;
	}

	if (!$validStepState) {
		http_response_code(409);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Invalid step/state for action logging.'], JSON_UNESCAPED_UNICODE);
		exit;
	}

	$dbRuntime = DatabaseManager::getInstance()->getConnection('runtime');
	$workflowRepo = new WorkflowLogRepository($dbRuntime);

	$workflowRepo->insert([
		'access_id' => (int)$scope['access_id'],
		'team_no' => (int)$scope['team_no'],
		'outline_id' => (int)$scope['outline_id'],
		'exercise_no' => (int)$scope['exercise_no'],
		'theme_id' => $themeId > 0 ? $themeId : null,
		'scenario_id' => $scenarioId > 0 ? $scenarioId : null,
		'step_no' => $stepNo,
		'crud' => 1,
		'ci_id' => $ciId,
		'action_id' => $actionId,
		'info' => (string)$actionId,
		'actor_token' => $token,
	]);

	echo json_encode(['ok' => true, 'data' => ['logged' => true], 'error' => null], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
	exit;

} catch (Throwable $e) {
	http_response_code(500);
	echo json_encode(['ok' => false, 'data' => null, 'error' => 'Server error'], JSON_UNESCAPED_UNICODE);
	exit;
}
