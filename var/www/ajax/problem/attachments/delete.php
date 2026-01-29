<?php
declare(strict_types=1);

/**
 * /var/www/ajax/problem/attachments/delete.php
 *
 * Dynamic endpoint (no cache).
 * Deletes current attachment for scope and bumps versions(form_key='attachments') with OCC.
 */

require_once __DIR__ . '/../../_guard_dynamic.php';
require_once __DIR__ . '/../_forms_bootstrap.php';

use Modules\Problem\Support\Request;
use Modules\Problem\Services\Forms\AttachmentsServiceFactory;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

try {
	$boot = ProblemFormsBootstrap::init();
	$in = $boot['in'];
	$scope = $boot['scope'];
	$token = $boot['actor_token'];
	$themeId = (int)$boot['theme_id'];
	$scenarioId = (int)$boot['scenario_id'];

	$expected = Request::int($in, 'expected_version', 0);

	$svc = AttachmentsServiceFactory::make($dbRuntime);

	$out = $svc->deleteWithOcc(
		$scope['access_id'],
		$scope['team_no'],
		$scope['outline_id'],
		$scope['exercise_no'],
		$themeId,
		$scenarioId,
		$token,
		$expected
	);

	if ($out['ok'] === false && ($out['error'] ?? '') === 'version_conflict') {
		http_response_code(409);
		echo json_encode(['ok' => false, 'data' => $out['data'], 'error' => 'version_conflict'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
		exit;
	}

	echo json_encode(['ok' => true, 'data' => $out['data'], 'error' => null], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
	exit;

} catch (Throwable) {
	http_response_code(500);
	echo json_encode(['ok' => false, 'data' => null, 'error' => 'Server error'], JSON_UNESCAPED_UNICODE);
	exit;
}