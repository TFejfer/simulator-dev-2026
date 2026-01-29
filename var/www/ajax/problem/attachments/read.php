<?php
declare(strict_types=1);

/**
 * /var/www/ajax/problem/attachments/read.php
 *
 * Dynamic endpoint (no cache).
 * Returns the binary as HTML <img> (legacy-style) OR raw base64 (better).
 *
 * Request:
 * - outline_id, exercise_no, theme_id, scenario_id
 *
 * Response:
 * { ok:true, data:{ id, file_name, file_html }, error:null }
 */

require_once __DIR__ . '/../../_guard_dynamic.php';
require_once __DIR__ . '/../_forms_bootstrap.php';

use Modules\Problem\Services\Forms\AttachmentsServiceFactory;
use Modules\Problem\Support\Request;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

try {
	$boot = ProblemFormsBootstrap::init();
	$scope = $boot['scope'];
	$themeId = (int)$boot['theme_id'];
	$scenarioId = (int)$boot['scenario_id'];

	$svc = AttachmentsServiceFactory::make($dbRuntime);

	$row = $svc->read(
		$scope['access_id'],
		$scope['team_no'],
		$scope['outline_id'],
		$scope['exercise_no'],
		$themeId,
		$scenarioId
	);

	echo json_encode(['ok' => true, 'data' => $row, 'error' => null], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
	exit;

} catch (Throwable) {
	http_response_code(500);
	echo json_encode(['ok' => false, 'data' => null, 'error' => 'Server error'], JSON_UNESCAPED_UNICODE);
	exit;
}