<?php
declare(strict_types=1);

require_once __DIR__ . '/../../_guard_dynamic.php';

// Read meta BEFORE bootstrap closes the session
$deliveryMeta = $_SESSION['delivery_meta'] ?? null;
$exerciseMeta = $_SESSION['exercise_meta'] ?? null;

require_once __DIR__ . '/../_forms_bootstrap.php';

use Modules\Problem\Services\Forms\ExerciseStateServiceFactory;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

try {
	$boot = ProblemFormsBootstrap::init();
	$scope = $boot['scope'];
	$themeId = (int)$boot['theme_id'];
	$scenarioId = (int)$boot['scenario_id'];

	// Skill scope: problem = 1 (risk/rca will use their own endpoint or set another id)
	$skillId = 1;

	// format/step come from exercise_meta (server truth)
	$formatId = is_array($exerciseMeta) ? (int)($exerciseMeta['format_id'] ?? 0) : 0;
	$stepNo = is_array($exerciseMeta) ? (int)($exerciseMeta['step_no'] ?? 0) : 0;
	$numberOfCauses = is_array($exerciseMeta) ? (int)($exerciseMeta['number_of_causes'] ?? 0) : 0;
	$hasCausality = is_array($exerciseMeta) ? ((bool)($exerciseMeta['has_causality'] ?? false)) : false;

	$templateId = is_array($deliveryMeta) ? (int)($deliveryMeta['template_id'] ?? 0) : 0;
	$templateCode = is_array($deliveryMeta) ? (string)($deliveryMeta['template_code'] ?? 'default') : 'default';

	if ($templateId <= 0) {
		http_response_code(422);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Missing template_id (delivery_meta)'], JSON_UNESCAPED_UNICODE);
		exit;
	}

	if ($formatId <= 0 || $stepNo <= 0) {
		http_response_code(422);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Missing format_id or step_no (exercise_meta)'], JSON_UNESCAPED_UNICODE);
		exit;
	}

	$svc = ExerciseStateServiceFactory::make($dbRuntime, $templateCode);

	$state = $svc->readAllForms(
		$scope['access_id'],
		$scope['team_no'],
		$scope['outline_id'],
		$scope['exercise_no'],
		$themeId,
		$scenarioId,
		$skillId,
		$formatId,
		$stepNo,
		$templateId,
		$numberOfCauses,
		$hasCausality
	);

	echo json_encode(['ok' => true, 'data' => $state, 'error' => null], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
	exit;

} catch (Throwable $e) {
	error_log('[state.php] 500: ' . $e->getMessage());
	error_log('[state.php] file=' . $e->getFile() . ' line=' . $e->getLine());

	http_response_code(500);
	echo json_encode(['ok' => false, 'data' => null, 'error' => 'Server error'], JSON_UNESCAPED_UNICODE);
	exit;
}