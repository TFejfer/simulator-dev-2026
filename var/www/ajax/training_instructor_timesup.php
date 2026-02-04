<?php
declare(strict_types=1);

// /var/www/ajax/training_instructor_timesup.php
// Triggered by client when countdown reaches zero. Inserts step 70 once per team/outline and emits a poll signal.

require_once __DIR__ . '/_guard_dynamic.php';

use Engine\Database\DatabaseManager;
use Modules\Training\Auth\Repositories\ExerciseRuntimeRepository;
use Modules\Training\Auth\Repositories\InstructorPollingRepository;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

try {
    $meta = $_SESSION['delivery_meta'] ?? null;
    if (!is_array($meta)) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'error' => 'Missing delivery_meta']);
        exit;
    }

    $accessId = (int)($meta['access_id'] ?? 0);
    $teamNo = (int)($meta['team_no'] ?? 0);

    $actorToken = (string)($meta['token'] ?? '');
    if ($actorToken === '') $actorToken = (string)($meta['session_token'] ?? '');
    if ($actorToken === '') $actorToken = (string)($_SESSION['session_token'] ?? '');

    if ($accessId <= 0 || $teamNo <= 0 || $actorToken === '') {
        http_response_code(422);
        echo json_encode(['ok' => false, 'error' => 'Missing access_id/team_no/token']);
        exit;
    }

    $exerciseMetaSession = $_SESSION['exercise_meta'] ?? [];
    $outlineId = (int)($exerciseMetaSession['outline_id'] ?? 0);
    if ($outlineId <= 0) {
        http_response_code(422);
        echo json_encode(['ok' => false, 'error' => 'Missing outline_id']);
        exit;
    }

    // Guard: only allow times-up when server clock has passed the cached deadline.
    $deadlineUnix = (int)($exerciseMetaSession['deadline_unix'] ?? 0);
    $now = time();
    if ($deadlineUnix > 0 && $now < $deadlineUnix) {
        http_response_code(409);
        echo json_encode(['ok' => false, 'error' => 'Not expired yet', 'deadline_unix' => $deadlineUnix, 'now_unix' => $now]);
        exit;
    }

    $dbRuntime = DatabaseManager::getInstance()->getConnection('runtime');
    $exerciseRuntimeRepo = new ExerciseRuntimeRepository($dbRuntime);

    // Idempotent: if already at/after step 70 for this outline, do nothing.
    $latest = $exerciseRuntimeRepo->findLatestByOutline($accessId, $teamNo, $outlineId);
    $latestStep = (int)($latest['step_no'] ?? 0);
    if ($latestStep >= 70) {
        echo json_encode(['ok' => true, 'inserted' => false, 'already_at' => $latestStep]);
        exit;
    }

    $exerciseRuntimeRepo->insertStep([
        'access_id' => $accessId,
        'team_no' => $teamNo,
        'outline_id' => $outlineId,
        'skill_id' => (int)($exerciseMetaSession['skill_id'] ?? 0),
        'exercise_no' => (int)($exerciseMetaSession['exercise_no'] ?? ($latest['exercise_no'] ?? 0)),
        'theme_id' => (int)($exerciseMetaSession['theme_id'] ?? ($latest['theme_id'] ?? 0)),
        'scenario_id' => (int)($exerciseMetaSession['scenario_id'] ?? ($latest['scenario_id'] ?? 0)),
        'format_id' => (int)($exerciseMetaSession['format_id'] ?? ($latest['format_id'] ?? 0)),
        'step_no' => 70,
        'current_state' => 0,
        'next_state' => 0,
        'actor_token' => $actorToken,
        'actor_name' => (string)($meta['actor_name'] ?? 'system'),
        'include_in_poll' => 1,
    ]);

    // Emit poll signal so other clients pick up the transition.
    $pollRepo = new InstructorPollingRepository($dbRuntime);
    $pollRepo->emitSignal($accessId, $teamNo, $actorToken, 'log_exercise', 'step-change', '70');

    echo json_encode(['ok' => true, 'inserted' => true]);
    exit;

} catch (Throwable) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Server error']);
    exit;
}
