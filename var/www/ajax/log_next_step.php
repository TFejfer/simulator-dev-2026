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

// -------------------------
// Response helpers
// -------------------------
/**
 * @param mixed $data
 * @param array<string,mixed> $extra
 */
function respondJson(?int $status, bool $ok, $data, ?string $error, array $extra = []): void
{
    if ($status !== null) {
        http_response_code($status);
    }

    $payload = array_merge([
        'ok' => $ok,
        'data' => $data,
        'error' => $error,
    ], $extra);

    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/**
 * @param array<string,mixed> $data
 */
function respondOk(array $data): void
{
    respondJson(null, true, $data, null);
}

function respondError(int $status, string $message): void
{
    respondJson($status, false, null, $message);
}

/**
 * @return array<string,mixed>
 */
function readJsonBody(): array
{
    $raw = file_get_contents('php://input');
    $in = ($raw !== false && $raw !== '') ? json_decode($raw, true) : [];
    return is_array($in) ? $in : [];
}

// -------------------------
// Routing helpers
// -------------------------
/**
 * @param array<string,mixed> $ctx
 */
function shouldSkipStepNo(int $candidateStepNo, array $ctx): bool
{
    $skillId = (int)($ctx['skill_id'] ?? 0);
    $formatId = (int)($ctx['format_id'] ?? 0);

    // 1) In problem discovery skip/ignore step timesup if the problem is solved.
    if ($skillId === 1 && $formatId === 1 && ($ctx['is_solved'] ?? false) === true && $candidateStepNo === 70) {
        return true;
    }

    // 2) In problem format standard and multi-position skip step 60 if scenario has only one cause.
    if ($skillId === 1 && in_array($formatId, [3, 5], true) && ($ctx['has_multiple_causes'] ?? true) === false && $candidateStepNo === 60) {
        return true;
    }

    return false;
}

try {
    // ------------------------------------------------------------
    // 1) Session scope (authoritative)
    // ------------------------------------------------------------
    $meta = $_SESSION['delivery_meta'] ?? null;
    if (!is_array($meta)) {
        respondError(401, 'Missing delivery_meta');
    }

    $accessId = (int)($meta['access_id'] ?? 0);
    $templateId = (int)($meta['template_id'] ?? 0);
    $teamNo = (int)($meta['team_no'] ?? 0);
    $token = (string)($meta['session_token'] ?? ($_SESSION['session_token'] ?? ''));

    if ($accessId === 0 || $templateId === 0 || $teamNo === 0 || $token === '') {
        respondError(422, 'Missing access/template/team/token');
    }

    // Release session lock early
    session_write_close();

    // ------------------------------------------------------------
    // 2) Input
    // ------------------------------------------------------------
    $in = readJsonBody();
    $clientExerciseStatus = [
        'outline_id' => (int)($in['outline_id'] ?? 0),
        'step_no' => (int)($in['step_no'] ?? 0),
        'current_state' => (int)($in['current_state'] ?? 0),
    ];

    if ($clientExerciseStatus['outline_id'] === 0 || $clientExerciseStatus['step_no'] === 0 || $clientExerciseStatus['current_state'] === 0) {
        respondError(422, 'Missing exercise statusinput');
    }

    // ------------------------------------------------------------
    // 3) Repositories
    // ------------------------------------------------------------
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

    // ------------------------------------------------------------
    // 4) Truth: current exercise status
    // ------------------------------------------------------------
    $serverExerciseStatus = $runtimeRepo->findLatestRow($accessId, $teamNo);
    if (!is_array($serverExerciseStatus)) {
        respondError(422, 'Exercise status not found');
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
        respondError(422, 'Invalid exercise meta in runtime status');
    }

    // ------------------------------------------------------------
    // 5) Guard: client status matches server status
    // ------------------------------------------------------------
    if ($outlineId !== $clientExerciseStatus['outline_id']) {
        respondError(422, 'Client-server outline id mismatch');
    }
    if ($stepNo !== $clientExerciseStatus['step_no']) {
        respondError(422, 'Client-server step number mismatch');
    }
    if ($currentState !== $clientExerciseStatus['current_state']) {
        respondError(422, 'Client-server current state mismatch');
    }

    // ------------------------------------------------------------
    // 6) Step-by-step gating conditions (Problem skill, format 2)
    // ------------------------------------------------------------
    if ($skillId === 1 && $formatId === 2) {
        if ($stepNo === 20 && !$symptomsRepo->hasPrioritizedClarifiedSymptom($accessId, $teamNo, $outlineId, $exerciseNo)) {
            respondError(422, 'Step requires a described and prioritized symptom');
        }

        if ($templateId === 1 && $stepNo === 30) {
            $required = ['what_ok', 'where_not', 'where_ok', 'when_not'];
            if (!$factsRepo->hasAllKeyMetas($accessId, $teamNo, $outlineId, $exerciseNo, $required)) {
                respondError(422, 'Step requires certain facts to be created');
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
                respondError(422, 'Step requires the KT specification to be filled');
            }
        }

        if ($stepNo === 40) {
            $cnt = $causesRepo->countRows($accessId, $teamNo, $outlineId, $exerciseNo);
            if ($cnt < 3) {
                respondError(422, 'Step requires at least 3 causes to be described');
            }
        }
    }

    // ------------------------------------------------------------
    // 7) Context for next-step exceptions
    // ------------------------------------------------------------
    $isSolved = $runtimeRepo->hasSolvedState($accessId, $teamNo, $outlineId)
        || (int)($serverExerciseStatus['current_state'] ?? 0) === 99
        || (int)($serverExerciseStatus['next_state'] ?? 0) === 99;

    $hasMultipleCauses = ($themeId > 0 && $scenarioId > 0)
        ? $scenarioMetaRepo->hasMultipleCauses($themeId, $scenarioId)
        : false;

    $isActionWindow = ($skillId === 1 && $stepNo >= 20 && $stepNo <= 60);
    $timeIsUp = false;
    $forcedNextStepNo = null;

    if ($isActionWindow && $formatId === 1) {
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
            respondError(422, $msg);
        }

        $timeIsUp = ((int)$timeLeft['seconds_left'] <= 0);
    }

    // Forced next-step exceptions for Problem action window (step 20..60).
    // - If time is up in format 1, always go to step 70.
    // - Else if solved: format 1 -> step 100, other formats -> step 80.
    // - Else (not solved): return to analysis without inserting a step row.
    if ($isActionWindow && $formatId === 1 && $timeIsUp === true) {
        $forcedNextStepNo = 70;
    } elseif ($isActionWindow && $isSolved === true) {
        $forcedNextStepNo = ($formatId === 1) ? 100 : 80;
    }

    if ($isActionWindow && $forcedNextStepNo === null) {
        respondOk([
            'page_key' => '/training-problem-instructor-analysis',
            'step_no' => $stepNo,
            'inserted' => false,
            'insert_id' => null,
        ]);
    }

    // ------------------------------------------------------------
    // 8) Choose next step
    // ------------------------------------------------------------
    $futureSteps = $stepsRepo->findFutureSteps($skillId, $formatId, $stepNo);
    if (!$futureSteps) {
        respondError(422, 'No next step found');
    }

    $ctx = [
        'skill_id' => $skillId,
        'format_id' => $formatId,
        'is_solved' => $isSolved,
        'time_is_up' => $timeIsUp,
        'has_multiple_causes' => $hasMultipleCauses,
    ];

    $nextStepRow = null;

    if ($forcedNextStepNo !== null) {
        $nextStepRow = $stepsRepo->findStepRow($skillId, $formatId, $forcedNextStepNo);
        if (!is_array($nextStepRow) || (int)($nextStepRow['step_no'] ?? 0) !== $forcedNextStepNo) {
            respondError(422, 'Forced next step not found in exercise_steps');
        }

        if (shouldSkipStepNo($forcedNextStepNo, $ctx)) {
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
        respondError(422, 'No valid next step found');
    }

    $nextStepNo = (int)($nextStepRow['step_no'] ?? 0);
    $pageKey = (string)($nextStepRow['page_key'] ?? '');

    if ($nextStepNo <= 0 || $pageKey === '') {
        respondError(422, 'Invalid next step configuration');
    }

    // ------------------------------------------------------------
    // 9) Insert next step
    // ------------------------------------------------------------
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

    respondOk([
        'page_key' => $pageKey,
        'step_no' => $nextStepNo,
        'inserted' => $inserted,
        'insert_id' => $insertId,
    ]);
} catch (Throwable $e) {
    error_log('[log_next_step.php] request_id=' . $requestId . ' 500: ' . $e->getMessage());
    respondJson(500, false, null, 'Server error', ['request_id' => $requestId]);
}