<?php
declare(strict_types=1);

/**
 * /var/www/ajax/log_next_step.php
 *
 * Backend-authoritative "proceed to next step" for an in-progress exercise.
 *
 * Request JSON:
 * { "access_id": 1, "team_no": 2, "outline_id": 396, "step_no": 20 }
 *
 * Response JSON:
 * { ok:true, data:{ page_key:"training-problem-instructor-analysis", step_no:30 }, error:null }
 */

require_once __DIR__ . '/_guard_dynamic.php';

use Engine\Database\DatabaseManager;
use Modules\Shared\Support\Databases;
use Modules\Shared\Repositories\SharedExerciseParametersRepository;
use Modules\Training\Auth\Repositories\ExerciseRuntimeRepository;
use Modules\Training\Auth\Repositories\ExerciseStepsRepository;
use Modules\Problem\Content\Repositories\ProblemScenarioMetaRepository;
use Modules\Problem\Repositories\Forms\SymptomsRepository;
use Modules\Problem\Repositories\Forms\FactsRepository;
use Modules\Problem\Repositories\Forms\SpecificationRepository;
use Modules\Problem\Repositories\Forms\CausesRepository;

use Modules\Shared\Support\Timer\TimeLeftService;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$requestId = bin2hex(random_bytes(8));
header('X-Request-Id: ' . $requestId);

// Helpers (must be declared before first use)
/**
 * @param array<string,mixed> $ctx
 */
function shouldSkipStepNo(int $candidateStepNo, array $ctx): bool
{
    $skillId = (int)($ctx['skill_id'] ?? 0);
    $formatId = (int)($ctx['format_id'] ?? 0);

    // 1) In problem discovery skip/ignore step timesup if the problem is solved
    if ($skillId === 1 && $formatId === 1 && ($ctx['is_solved'] ?? false) === true && $candidateStepNo === 70) {
        return true;
    }

    // 2) In problem format standard and multi-position skip step 60 if scenario has only one cause
    if ($skillId === 1 && in_array($formatId, [3, 5], true) && ($ctx['has_multiple_causes'] ?? true) === false && $candidateStepNo === 60) {
        return true;
    }

    return false;
}

try {
    // Session meta (authoritative access scope)
    $meta = $_SESSION['delivery_meta'] ?? null;
    if (!is_array($meta)) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'data' => null, 'error' => 'Missing delivery_meta'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $accessId = (int)($meta['access_id'] ?? 0);
    $templateId = (int)($meta['template_id'] ?? 0);
	$teamNo = (int)($meta['team_no'] ?? 0);
	$token = (string)($meta['session_token'] ?? ($_SESSION['session_token'] ?? ''));

    if ($accessId === 0 || $templateId === 0 || $teamNo === 0 || $token === '') {
        http_response_code(422);
        echo json_encode(['ok' => false, 'data' => null, 'error' => 'Missing access/template/team/token'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    session_write_close();

    // Input
    $raw = file_get_contents('php://input');
    $in = ($raw !== false && $raw !== '') ? json_decode($raw, true) : [];
    if (!is_array($in)) $in = [];

    $clientExerciseStatus = [
        'outline_id' => (int)($in['outline_id'] ?? 0),
        'step_no' => (int)($in['step_no'] ?? 0),
        'current_state' => (int)($in['current_state'] ?? 0),
    ];

    if ($clientExerciseStatus['outline_id'] === 0 || $clientExerciseStatus['step_no'] === 0 || $clientExerciseStatus['current_state'] === 0) {
		http_response_code(422);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Missing exercise statusinput'], JSON_UNESCAPED_UNICODE);
		exit;
	}

    $dbm = DatabaseManager::getInstance();
    $dbRuntime = $dbm->getConnection(Databases::RUNTIME);
    $dbShared = $dbm->getConnection(Databases::SHARED_CONTENT);
    $dbProblem = $dbm->getConnection(Databases::PROBLEM_CONTENT);

    $runtimeRepo = new ExerciseRuntimeRepository($dbRuntime);
    $stepsRepo = new ExerciseStepsRepository($dbShared);
    $sharedParamsRepo = new SharedExerciseParametersRepository($dbShared);
    $scenarioMetaRepo = new ProblemScenarioMetaRepository($dbProblem);
    $timeLeftService = new TimeLeftService($runtimeRepo, $sharedParamsRepo);

    $symptomsRepo = new SymptomsRepository($dbRuntime);
    $factsRepo = new FactsRepository($dbRuntime);
    $causesRepo = new CausesRepository($dbRuntime);
    $specRepo = new SpecificationRepository($dbRuntime);

    // Truth: current exercise status
    $serverExerciseStatus = $runtimeRepo->findLatestRow($accessId, $teamNo);
    if (!is_array($serverExerciseStatus)) {
        http_response_code(422);
        echo json_encode(['ok' => false, 'data' => null, 'error' => 'Exercise status not found'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $skillId = (int)($serverExerciseStatus['skill_id'] ?? 0);
    $outlineId = (int)($serverExerciseStatus['outline_id'] ?? 0);
    $exerciseNo = (int)($serverExerciseStatus['exercise_no'] ?? 0);
    $themeId = (int)($serverExerciseStatus['theme_id'] ?? 0);
    $scenarioId = (int)($serverExerciseStatus['scenario_id'] ?? 0);
    $formatId = (int)($serverExerciseStatus['format_id'] ?? 0);
    $stepNo = (int)($serverExerciseStatus['step_no'] ?? 0);
    $currentState = (int)($serverExerciseStatus['current_state'] ?? 0);
    
    if ($skillId === 0 || $outlineId === 0 || $formatId === 0 || $exerciseNo === 0 || $themeId === 0 || $scenarioId === 0) {
        http_response_code(422);
        echo json_encode(['ok' => false, 'data' => null, 'error' => 'Invalid exercise meta in runtime status'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // Guard: client status matches server status
    if ((int)($outlineId) !== $clientExerciseStatus['outline_id']) {
        http_response_code(422);
        echo json_encode(['ok' => false, 'data' => null, 'error' => 'Client-server outline id mismatch'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if ((int)($stepNo) !== $clientExerciseStatus['step_no']) {
        http_response_code(422);
        echo json_encode(['ok' => false, 'data' => null, 'error' => 'Client-server step number mismatch'], JSON_UNESCAPED_UNICODE);
        exit;
    }
        if ((int)($currentState) !== $clientExerciseStatus['current_state']) {
        http_response_code(422);
        echo json_encode(['ok' => false, 'data' => null, 'error' => 'Client-server current state mismatch'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // Step-by-step gating conditions (Problem skill, format 2)
    if ($skillId === 1 && $formatId === 2) {
        if ($stepNo === 20) {
            if (!$symptomsRepo->hasPrioritizedClarifiedSymptom($accessId, $teamNo, $outlineId, $exerciseNo)) {
                http_response_code(422);
                echo json_encode(['ok' => false, 'data' => null, 'error' => 'Step requires a described and prioritized symptom'], JSON_UNESCAPED_UNICODE);
                exit;
            }
        }

        if ($templateId === 1 && $stepNo === 30) {
            $required = ['what_ok', 'where_not', 'where_ok', 'when_not'];
            if (!$factsRepo->hasAllKeyMetas($accessId, $teamNo, $outlineId, $exerciseNo, $required)) {
                http_response_code(422);
                echo json_encode(['ok' => false, 'data' => null, 'error' => 'Step requires certain facts to be created'], JSON_UNESCAPED_UNICODE);
                exit;
            }
        }

        if ($templateId === 2 && $stepNo === 30) {
            $required = [
                'problem_statement',
                'what_is','what_isnot','what_distinctions','what_changes',
                'where_is','where_isnot','where_distinctions','where_changes',
                'when_is','when_isnot','when_distinctions','when_changes',
                'extent_is','extent_isnot','extent_distinctions','extent_changes'
            ];

            if (!$specRepo->hasAllKeyMetas($accessId, $teamNo, $outlineId, $exerciseNo, $required)) {
                http_response_code(422);
                echo json_encode(['ok' => false, 'data' => null, 'error' => 'Step requires the KT specification to be filled'], JSON_UNESCAPED_UNICODE);
                exit;
            }
        }

        if ($stepNo === 40) {
            $cnt = $causesRepo->countRows($accessId, $teamNo, $outlineId, $exerciseNo);
            if ($cnt < 3) {
                http_response_code(422);
                echo json_encode(['ok' => false, 'data' => null, 'error' => 'Step requires at least 3 causes to be described'], JSON_UNESCAPED_UNICODE);
                exit;
            }
        }
    }

    // Context for exceptions
    $isSolved = $runtimeRepo->hasSolvedState($accessId, $teamNo, $outlineId)
        || (int)($serverExerciseStatus['current_state'] ?? 0) === 99
        || (int)($serverExerciseStatus['next_state'] ?? 0) === 99;

    $hasMultipleCauses = ($themeId > 0 && $scenarioId > 0)
        ? $scenarioMetaRepo->hasMultipleCauses($themeId, $scenarioId)
        : false;

    $timeIsUp = false;
    if ($skillId === 1 && $formatId === 1) {
        $timeLeft = $timeLeftService->getSecondsLeftFromFirstStep(
            $accessId,
            $teamNo,
            $outlineId,
            20,
            'problem_discovery_time'
        );

        if (isset($timeLeft['error'])) {
            $msg = $timeLeft['error'] === 'missing_start'
                ? 'No exercise start time found'
                : 'No discovery time found';
            http_response_code(422);
            echo json_encode(['ok' => false, 'data' => null, 'error' => $msg], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $timeIsUp = ((int)$timeLeft['seconds_left'] <= 0);
    }

    // Load next step candidates
    $futureSteps = $stepsRepo->findFutureSteps($skillId, $formatId, $stepNo);
    if (!$futureSteps) {
        http_response_code(422);
        echo json_encode(['ok' => false, 'data' => null, 'error' => 'No next step found'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $ctx = [
        'skill_id' => $skillId,
        'format_id' => $formatId,
        'is_solved' => $isSolved,
        'time_is_up' => $timeIsUp,
        'has_multiple_causes' => $hasMultipleCauses,
    ];

    // Forced next-step exception:
    // In problem discovery if time runs out during troubleshooting (step 20..60), next is always timesup step 70.
    $forcedNextStepNo = null;
    if ($skillId === 1 && $formatId === 1 && $isSolved === false && $timeIsUp === true && $stepNo >= 20 && $stepNo <= 60) {
        $forcedNextStepNo = 70;
    }

    $nextStepRow = null;

    if ($forcedNextStepNo !== null) {
        $nextStepRow = $stepsRepo->findStepRow($skillId, $formatId, $forcedNextStepNo);
        if (!is_array($nextStepRow) || (int)($nextStepRow['step_no'] ?? 0) !== $forcedNextStepNo) {
            http_response_code(422);
            echo json_encode(['ok' => false, 'data' => null, 'error' => 'Forced next step not found in exercise_steps'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        if (shouldSkipStepNo($forcedNextStepNo, $ctx)) {
            // Example: forced 70 but solved => skip to natural next
            $nextStepRow = null;
        }
    }

    if ($nextStepRow === null) {
        foreach ($futureSteps as $cand) {
            if (!is_array($cand)) continue;
            $candNo = (int)($cand['step_no'] ?? 0);
            if ($candNo <= 0) continue;

            if (shouldSkipStepNo($candNo, $ctx)) {
                continue;
            }

            $nextStepRow = $cand;
            break;
        }
    }

    if (!is_array($nextStepRow)) {
        http_response_code(422);
        echo json_encode(['ok' => false, 'data' => null, 'error' => 'No valid next step found'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $nextStepNo = (int)($nextStepRow['step_no'] ?? 0);
    $pageKey = (string)($nextStepRow['page_key'] ?? '');

    if ($nextStepNo <= 0 || $pageKey === '') {
        http_response_code(422);
        echo json_encode(['ok' => false, 'data' => null, 'error' => 'Invalid next step configuration'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $insertId = $runtimeRepo->insertNextStepIfNotExists([
        'access_id' => $accessId,
        'team_no' => $teamNo,
        'outline_id' => $outlineId,
        'skill_id' => $skillId,
        'exercise_no' => $exerciseNo,
        'theme_id' => $themeId,
        'scenario_id' => $scenarioId,
        'format_id' => $formatId,
        'step_no' => $nextStepNo,
        'current_state' => $futureSteps[0]['current_state'] === null ? $currentState : $futureSteps[0]['current_state'],
        'next_state' => $futureSteps[0]['next_state'] === null ? $currentState : $futureSteps[0]['next_state'],
        'actor_token' => $token,
        'actor_name' => 'participant',
        'include_in_poll' => 1,
    ]);

    $inserted = ($insertId !== null && $insertId > 0);

    echo json_encode([
        'ok' => true,
        'data' => [
            'page_key' => $pageKey,
            'step_no' => $nextStepNo,
            'inserted' => $inserted,
            'insert_id' => $insertId,
        ],
        'error' => null,
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;

    // Use values for current_state and next_state from nextStepRow or fallback to serverExerciseStatus
    $useCurrentState = array_key_exists('current_state', $nextStepRow) && $nextStepRow['current_state'] !== null
        ? (int)$nextStepRow['current_state']
        : (isset($serverExerciseStatus['current_state']) ? (int)$serverExerciseStatus['current_state'] : null);
    $useNextState = array_key_exists('next_state', $nextStepRow) && $nextStepRow['next_state'] !== null
        ? (int)$nextStepRow['next_state']
        : (isset($serverExerciseStatus['next_state']) ? (int)$serverExerciseStatus['next_state'] : null);
    // ...existing code for atomic insert and response...

} catch (Throwable $e) {
    error_log('[log_next_step.php] request_id=' . $requestId . ' 500: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['ok' => false, 'data' => null, 'error' => 'Server error', 'request_id' => $requestId], JSON_UNESCAPED_UNICODE);
    exit;
}