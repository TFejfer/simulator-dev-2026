<?php
declare(strict_types=1);

require_once __DIR__ . '/_guard_dynamic.php';

use Engine\Database\DatabaseManager;
use Modules\Shared\Support\Databases;
use Modules\Shared\Repositories\CiActionsRepository;
use Modules\Shared\Repositories\SharedExerciseParametersRepository;
use Modules\Problem\Repositories\ProblemCiActionRepository;
use Modules\Training\Auth\Repositories\ExerciseRuntimeRepository;
use Modules\Training\Auth\Repositories\ExerciseStepsRepository;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$requestId = bin2hex(random_bytes(8));
header('X-Request-Id: ' . $requestId);

// Helpers (must be declared before first use; functions inside blocks are conditional in PHP)
function getTypeFromCiId(string $ciId): int
{
    $ciId = trim($ciId);
    if ($ciId === '') return 0;

    // Mirror frontend logic: SW* => switch group
    if (preg_match('/^SW/i', $ciId)) return 23;

    // Common case: first two chars are digits (e.g., "12A")
    $prefix = substr($ciId, 0, 2);
    if (preg_match('/^\d{2}$/', $prefix)) return (int)$prefix;

    // Fallback: first 2 digits anywhere in the string
    if (preg_match('/(\d{2})/', $ciId, $m)) return (int)$m[1];

    return 0;
}

function isStepStateValid(int $step, int $state): bool
{
    // 1. iteration
    if ($step >= 20 && $step < 60 && $state > 10 && $state < 20) return true;
    // 2. iteration
    if ($step === 60 && $state > 20 && $state < 99) return true;
    return false;
}

function getActionTypeId(int $currentState, int $nextState, bool $hasRisk): int
{
    if ($currentState + 5 < $nextState) return 2;    // Corrective action
    if ($hasRisk == false) return 1;    // Non-risky action
    return 0;   // Failed fix attempt
}

try {
    // Delivery  meta
    $meta = $_SESSION['delivery_meta'] ?? null;
	if (!is_array($meta)) {
		http_response_code(401);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Missing delivery_meta'], JSON_UNESCAPED_UNICODE);
		exit;
	}

	$accessId = (int)($meta['access_id'] ?? 0);
	$teamNo = (int)($meta['team_no'] ?? 0);
	$token = (string)($meta['session_token'] ?? ($_SESSION['session_token'] ?? ''));

	if ($accessId <= 0 || $teamNo <= 0 || $token === '') {
		http_response_code(422);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Missing access/team/token'], JSON_UNESCAPED_UNICODE);
		exit;
	}

    session_write_close();

    $dbm = DatabaseManager::getInstance();
	$dbRuntime = $dbm->getConnection(Databases::RUNTIME);
    $dbShared = $dbm->getConnection(Databases::SHARED_CONTENT);
    $dbProblem = $dbm->getConnection(Databases::PROBLEM_CONTENT);

    // Input
    $raw = file_get_contents('php://input');
	$in = ($raw !== false && $raw !== '') ? json_decode($raw, true) : [];
	if (!is_array($in)) $in = [];

    $clientExerciseStatus = [
        'outline_id' => (int)($in['outline_id'] ?? 0),
        'step_no' => (int)($in['step_no'] ?? 0),
        'current_state' => (int)($in['current_state'] ?? 0),
    ];

    if ($clientExerciseStatus['outline_id'] <= 0 || $clientExerciseStatus['step_no'] <= 0 || $clientExerciseStatus['current_state'] <= 0) {
		http_response_code(422);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Missing exercise statusinput'], JSON_UNESCAPED_UNICODE);
		exit;
	}

    $ciId = (string)($in['ci_id'] ?? '');
    $actionId = (int)($in['action_id'] ?? 0);

    $ciTypeId = getTypeFromCiId($ciId);

	if ($ciId === '' || $actionId <= 0) {
		http_response_code(422);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Missing ci action input'], JSON_UNESCAPED_UNICODE);
		exit;
	}
    // Exercise meta
    $runtimeRepo = new ExerciseRuntimeRepository($dbRuntime);
    $stepsRepo = new ExerciseStepsRepository($dbShared);
    $problemActionRepo = new ProblemCiActionRepository($dbProblem);
    $ciActionsRepo = new CiActionsRepository($dbShared);
    $sharedParamsRepo = new SharedExerciseParametersRepository($dbShared);
    $serverExerciseStatus = $runtimeRepo->findLatestByOutline($accessId, $teamNo, $clientExerciseStatus['outline_id']);
    
    if (!is_array($serverExerciseStatus)) {
        http_response_code(422);
        echo json_encode(['ok' => false, 'data' => null, 'error' => 'Exercise status not found'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $outlineId = (int)$clientExerciseStatus['outline_id'];

    // Guard clauses: Ensure client exercise status matches server status (truth).
    if ($serverExerciseStatus['outline_id'] !== $clientExerciseStatus['outline_id']) {
        http_response_code(422);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Client-server outline id mismatch'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if ($serverExerciseStatus['step_no'] !== $clientExerciseStatus['step_no']) {
        http_response_code(422);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Client-server step no mismatch'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if ($serverExerciseStatus['current_state'] !== $clientExerciseStatus['current_state']) {
        http_response_code(422);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Client-server current state mismatch'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // Guard clauses: Ensure valid state for action logging
    if ( $serverExerciseStatus['current_state'] === 99 && $serverExerciseStatus['next_state'] === 99) {
        http_response_code(422);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Action is not possible because the problem is already solved'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if ($serverExerciseStatus['current_state'] < 99 && $serverExerciseStatus['next_state'] === 99) {
        // Insert missing admin row for problem solved state (exception)
        $insertId = $runtimeRepo->insertStep([
            'access_id' => $accessId,
            'team_no' => $teamNo,
            'outline_id' => $outlineId,
            'skill_id' => (int)($serverExerciseStatus['skill_id'] ?? 0),
            'exercise_no' => (int)($serverExerciseStatus['exercise_no'] ?? 0),
            'theme_id' => (int)($serverExerciseStatus['theme_id'] ?? 0),
            'scenario_id' => (int)($serverExerciseStatus['scenario_id'] ?? 0),
            'format_id' => (int)($serverExerciseStatus['format_id'] ?? 0),
            'step_no' => ($serverExerciseStatus['current_state'] < 20 && $serverExerciseStatus['next_state'] > 20 && $serverExerciseStatus['next_state'] < 99) ? 60 : $serverExerciseStatus['step_no'],
            'current_state' => 99,
            'next_state' => 99,
            'outcome_id' => 3,
            'actor_token' => $token,
            'actor_name' => 'system',
            'include_in_poll' => 0,
        ]);

        if ($insertId <= 0) {
            error_log('[log_problem_action.php] request_id=' . $requestId . ' 500: insertStep failed (missing solved-state row)');
            http_response_code(500);
            echo json_encode(['ok' => false, 'data' => null, 'error' => 'Failed to create additional action row', 'request_id' => $requestId], JSON_UNESCAPED_UNICODE);
            exit;
        }

        http_response_code(422);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Additional action row was missing'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // Guard clauses: Ensure valid step/state combination for action logging
    if (isStepStateValid($serverExerciseStatus['step_no'], $serverExerciseStatus['current_state']) === false) {
        http_response_code(422);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Invalid step-state combination'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // Guard clauses: Ensure action is allowed at this format and step (exercise_steps policy)
    $skillIdForPolicy = (int)($serverExerciseStatus['skill_id'] ?? 0);
    if ($skillIdForPolicy <= 0) {
        // Default to Problem skill when not present (historic rows)
        $skillIdForPolicy = 1;
    }

    $formatIdForPolicy = (int)($serverExerciseStatus['format_id'] ?? 0);
    $stepNoForPolicy = (int)($serverExerciseStatus['step_no'] ?? 0);

    $formatStepArr = $stepsRepo->findActionPolicy($skillIdForPolicy, $formatIdForPolicy, $stepNoForPolicy);
    if (!is_array($formatStepArr) || (int)($formatStepArr['is_action_allowed'] ?? 0) !== 1) {
        http_response_code(422);
		echo json_encode([
			'ok' => false,
			'data' => null,
			'error' => 'Invalid format-step combination',
		], JSON_UNESCAPED_UNICODE);
        exit;
    }
    // Guard clauses: Ensure action is allowed for this ci type in the format-step combination
    if ($formatStepArr['allowed_ci_type_ids'] !== null) {
        $allowedCiTypes = array_filter(
            array_map(
                static fn($v) => (int)trim((string)$v),
                explode(',', (string)$formatStepArr['allowed_ci_type_ids'])
            ),
            static fn($v) => $v > 0
        );
        if (!in_array($ciTypeId, $allowedCiTypes, true)) {
        http_response_code(422);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Invalid action for ci in format-step combination'], JSON_UNESCAPED_UNICODE);
        exit;
        }
    }

    // Guard clauses: Ensure action is allowed for this ci type
    $actionTimeAndCost = $problemActionRepo->findActionTimeAndCost($ciTypeId, $actionId);
    if (!is_array($actionTimeAndCost)) {
        http_response_code(422);
        echo json_encode([
            'ok' => false,
            'data' => [
                'ci_id' => $ciId,
                'ci_type_id' => $ciTypeId,
                'action_id' => $actionId,
            ],
            'error' => 'Invalid ci type/action combination',
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // Guard clauses: Ensure action risk exists
    $hasRisk = $ciActionsRepo->hasRisk($actionId);
    if ($hasRisk === null) {
        http_response_code(422);
		echo json_encode([
			'ok' => false,
			'data' => [
				'action_id' => $actionId,
			],
			'error' => 'Could not determine action risk',
		], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $hasRisk = (bool)$hasRisk;

    // Guard clauses: Ensure against action spamming (too many actions)
    $maxActions = $runtimeRepo->getMaxActions($accessId, $clientExerciseStatus['outline_id'], $teamNo);
    if ($maxActions > 50) {
        http_response_code(422);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'too many actions'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // Guard clauses: Ensure action outcome exists for this exercise state
    $actionOutcome = $problemActionRepo->findActionOutcome(
        (int)($serverExerciseStatus['theme_id'] ?? 0),
        (int)($serverExerciseStatus['scenario_id'] ?? 0),
        (int)($serverExerciseStatus['current_state'] ?? 0),
        $ciId,
        $actionId
    );

    if (!is_array($actionOutcome)) {
        http_response_code(422);
        echo json_encode(['ok' => false, 'data' => null, 'error' => 'No outcome found for this action and exercise state'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // Guard clause: Check if time is up in discovery format
    $serverFormatId = (int)($serverExerciseStatus['format_id'] ?? 0);
    if ($serverFormatId === 1) {
        $exerciseStartTimeEpoch = $runtimeRepo->findExerciseStartTime($accessId, $clientExerciseStatus['outline_id'], $teamNo);
        if (!$exerciseStartTimeEpoch) {
            http_response_code(422);
            echo json_encode(['ok' => false, 'data' => null, 'error' => 'No exercise start time found'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $sharedParams = $sharedParamsRepo->readAll();
        $discoveryTimeSeconds = isset($sharedParams['problem_discovery_time'])
            ? (int)$sharedParams['problem_discovery_time']
            : null;
        if (!$discoveryTimeSeconds) {
            http_response_code(422);
            echo json_encode(['ok' => false, 'data' => null, 'error' => 'No discovery time found'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        
        $currentTimeEpoch = time();
        if (($currentTimeEpoch - $exerciseStartTimeEpoch) > $discoveryTimeSeconds) {
            http_response_code(409);
            echo json_encode(['ok' => false, 'data' => null, 'error' => 'Discovery time is up'], JSON_UNESCAPED_UNICODE);
            exit;
        }
    }

    $insertId = $runtimeRepo->insertStep([
		'access_id' => $accessId,
		'team_no' => $teamNo,
		'outline_id' => $outlineId,
		'skill_id' => (int)($serverExerciseStatus['skill_id'] ?? 0),
		'exercise_no' => (int)($serverExerciseStatus['exercise_no'] ?? 0),
		'theme_id' => (int)($serverExerciseStatus['theme_id'] ?? 0),
		'scenario_id' => (int)($serverExerciseStatus['scenario_id'] ?? 0),
		'format_id' => (int)($serverExerciseStatus['format_id'] ?? 0),
		'step_no' => ($serverExerciseStatus['current_state'] < 20 && $actionOutcome['next_state'] > 20 && $actionOutcome['next_state'] < 99) ? 60 : $serverExerciseStatus['step_no'],
		'current_state' => (int)($serverExerciseStatus['current_state'] ?? 0),
		'next_state' => (int)($actionOutcome['next_state'] ?? 0),
        'ci_id' => $ciId,
        'action_id' => $actionId,
        'outcome_id' => (int)($actionOutcome['outcome_id'] ?? 0),
        'action_type_id' => getActionTypeId($serverExerciseStatus['current_state'], $actionOutcome['next_state'], $hasRisk),
        'time_min' => $actionTimeAndCost['time_min'] ?? 0,
        'cost' => $actionTimeAndCost['cost'] ?? 0,
        'risk' => $hasRisk,
        'include_in_poll' => 1,
		'actor_token' => $token,
		'actor_name' => 'participant'
	]);

	if ($insertId <= 0) {
		error_log('[log_problem_action.php] request_id=' . $requestId . ' 500: insertStep failed');
		http_response_code(500);
        echo json_encode(['ok' => false, 'data' => null, 'error' => 'Failed to create first entry', 'request_id' => $requestId], JSON_UNESCAPED_UNICODE);
		exit;
	}

    if ($serverExerciseStatus['current_state'] !== $actionOutcome['next_state']) {
        // Insert missing admin row for problem solved state (exception)
        $insertId = $runtimeRepo->insertStep([
            'access_id' => $accessId,
            'team_no' => $teamNo,
            'outline_id' => $outlineId,
            'skill_id' => (int)($serverExerciseStatus['skill_id'] ?? 0),
            'exercise_no' => (int)($serverExerciseStatus['exercise_no'] ?? 0),
            'theme_id' => (int)($serverExerciseStatus['theme_id'] ?? 0),
            'scenario_id' => (int)($serverExerciseStatus['scenario_id'] ?? 0),
            'format_id' => (int)($serverExerciseStatus['format_id'] ?? 0),
            'step_no' => ($serverExerciseStatus['current_state'] < 20 && $actionOutcome['next_state'] > 20 && $actionOutcome['next_state'] < 99) ? 60 : $serverExerciseStatus['step_no'],
            'current_state' => (int)($actionOutcome['next_state'] ?? 0),
            'next_state' => (int)($actionOutcome['next_state'] ?? 0),
            'outcome_id' => 3,
            'actor_token' => $token,
            'actor_name' => 'system',
            'include_in_poll' => 0,
        ]);

        if ($insertId <= 0) {
            error_log('[log_problem_action.php] request_id=' . $requestId . ' 500: insertStep failed (missing solved-state row)');
            http_response_code(500);
            echo json_encode(['ok' => false, 'data' => null, 'error' => 'Failed to create additional action row', 'request_id' => $requestId], JSON_UNESCAPED_UNICODE);
            exit;
        }
    }

    // Success
    echo json_encode(['ok' => true, 'data' => null, 'error' => null], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    error_log('[log_problem_action.php] request_id=' . $requestId . ' 500: ' . $e->getMessage());

	http_response_code(500);
    echo json_encode(['ok' => false, 'data' => null, 'error' => 'Server error', 'request_id' => $requestId], JSON_UNESCAPED_UNICODE);
	exit;
}