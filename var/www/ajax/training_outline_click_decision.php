<?php
declare(strict_types=1);

/**
 * /var/www/ajax/training_outline_click_decision.php
 *
 * Backend-authoritative decision for outline click.
 *
 * Request JSON:
 * { "outline_id": 396 }
 *
 * Response JSON:
 * {
 *   ok: true,
 *   data: {
 *     status: "ok"|"warn"|"lock"|"nogo"|"role",
 *     action: "navigate"|"modal",
 *     navigate_to: "delivery-1-1-troubleshoot"|"...",
 *     outline_id, exercise_no, skill_id, format_id,
 *     is_multi_position: bool
 *   },
 *   error: null
 * }
 */

require_once __DIR__ . '/_guard_dynamic.php';

use Engine\Database\DatabaseManager;
use Modules\Shared\Support\Databases;
use Modules\Training\Auth\Repositories\OutlineRepository;
use Modules\Training\Auth\Repositories\ExerciseStepsRepository;
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

	$outlineRow = $outlinesRepo->findOutlineRowById($outlineId, $deliveryId);

	if (!$outlineRow) {
		echo json_encode(['ok' => true, 'data' => ['status' => 'nogo', 'action' => 'modal', 'navigate_to' => '', 'outline_id' => $outlineId], 'error' => null], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
		exit;
	}

	$itemType = (string)($outlineRow['item_type'] ?? '');
	$exerciseNo = (int)($outlineRow['exercise_no'] ?? 0);
	$skillId = (int)($outlineRow['skill_id'] ?? 0);
	$formatId = (int)($outlineRow['format_id'] ?? 0);

	$latest = $runtimeRepo->findLatestByOutline($accessId, $teamNo, $outlineId);
	$maxStep = $latest ? (int)($latest['step_no'] ?? 0) : 0;

	// Non-exercise items: navigate directly if you have routes; else modal/noop.
	if ($itemType !== 'exercise' || $exerciseNo <= 0) {
		echo json_encode([
			'ok' => true,
			'data' => [
				'status' => 'ok',
				'action' => 'navigate',
				'navigate_to' => 'training-instructor-outline', // keep user on outline by default
				'outline_id' => $outlineId,
				'exercise_no' => $exerciseNo,
				'skill_id' => $skillId,
				'format_id' => $formatId,
				'is_multi_position' => false
			],
			'error' => null
		], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
		exit;
	}

	$isMultiPosition = ($formatId === 5);

	// Determine current step for clicked outline

	// Determine if another exercise is open (in progress)
	// We do it by scanning all outline_ids for this delivery.
	// (If you already have a cached list, use it.)
	$allOutlineIds = [$outlineId];
	// NOTE: For a complete check, we need all delivery outline_ids with item_type='exercise'.
	// We reuse the shared outlines table quickly:
	$stmt = $dbShared->prepare("SELECT outline_id FROM outlines WHERE delivery_id = :delivery_id AND item_type='exercise' AND exercise_no > 0");
	$stmt->execute([':delivery_id' => $deliveryId]);
	$allOutlineIds = array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));

	$maxMap = $runtimeRepo->findMaxStepByOutlineIds($accessId, $teamNo, $allOutlineIds);

	$isAnotherOpen = false;
	foreach ($maxMap as $oid => $ms) {
		if ((int)$oid === $outlineId) continue;
		if ($ms >= 10 && $ms < 100) { $isAnotherOpen = true; break; }
	}

	// State
	$isCompleted = ($maxStep >= 100);
	$isInProgress = ($maxStep >= 10 && $maxStep < 100);
	$isPending = ($maxStep <= 0);

	// Completed -> go to result page
	if ($isCompleted) {
		$target = ((int)$skillId === 1) ? 'training-problem-instructor-result' : 'training-instructor-results';
		echo json_encode([
			'ok' => true,
			'data' => [
				'status' => 'ok',
				'action' => 'navigate',
				'navigate_to' => $target,
				'outline_id' => $outlineId,
				'exercise_no' => $exerciseNo,
				'skill_id' => $skillId,
				'format_id' => $formatId,
				'is_multi_position' => $isMultiPosition
			],
			'error' => null
		], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
		exit;
	}

	// In progress -> resolve page via exercise_steps (backend authoritative)
	if ($isInProgress) {
		$tmpSkill = in_array($skillId, [8, 12], true) ? 1 : $skillId;
		$runtimeFormat = $latest ? (int)($latest['format_id'] ?? $formatId) : $formatId;
		$pageKey = $stepsRepo->findPageKey($tmpSkill, $runtimeFormat, $maxStep);
		if ($pageKey === '') $pageKey = 'error';

		echo json_encode([
			'ok' => true,
			'data' => [
				'status' => $isMultiPosition ? 'role' : 'ok',
				'action' => 'navigate',
				'navigate_to' => $pageKey,
				'outline_id' => $outlineId,
				'exercise_no' => $exerciseNo,
				'skill_id' => $skillId,
				'format_id' => $runtimeFormat,
				'is_multi_position' => $isMultiPosition
			],
			'error' => null
		], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
		exit;
	}

	// Pending -> locked?
	$isUnlocked = $runtimeRepo->isUnlocked($accessId, $exerciseNo, 600);
	if (!$isUnlocked) {
		echo json_encode([
			'ok' => true,
			'data' => [
				'status' => 'lock',
				'action' => 'modal',
				'navigate_to' => '',
				'outline_id' => $outlineId,
				'exercise_no' => $exerciseNo,
				'skill_id' => $skillId,
				'format_id' => $formatId,
				'is_multi_position' => $isMultiPosition
			],
			'error' => null
		], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
		exit;
	}

	// Pending -> another exercise open?
	if ($isAnotherOpen) {
		echo json_encode([
			'ok' => true,
			'data' => [
				'status' => 'nogo',
				'action' => 'modal',
				'navigate_to' => '',
				'outline_id' => $outlineId,
				'exercise_no' => $exerciseNo,
				'skill_id' => $skillId,
				'format_id' => $formatId,
				'is_multi_position' => $isMultiPosition
			],
			'error' => null
		], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
		exit;
	}

	// Pending + unlocked + no other open -> start flow
	echo json_encode([
		'ok' => true,
		'data' => [
			'status' => $isMultiPosition ? 'role' : 'warn',
			'action' => 'modal',
			'navigate_to' => '',
			'outline_id' => $outlineId,
			'exercise_no' => $exerciseNo,
			'skill_id' => $skillId,
			'format_id' => $formatId,
			'is_multi_position' => $isMultiPosition
		],
		'error' => null
	], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
	exit;

} catch (Throwable $e) {
	http_response_code(500);
	echo json_encode(['ok' => false, 'data' => null, 'error' => 'Server error'], JSON_UNESCAPED_UNICODE);
	exit;
}