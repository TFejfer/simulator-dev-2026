<?php
declare(strict_types=1);

/**
 * /var/www/ajax/problem/forms/iteration.php
 *
 * Dynamic endpoint (no cache).
 * CRUD:
 * - read
 * - upsert
 */

require_once __DIR__ . '/../../_guard_dynamic.php';
require_once __DIR__ . '/../_forms_bootstrap.php';

use Modules\Problem\Support\Request;
use Modules\Problem\DTO\FormRequest;
use Modules\Problem\Services\Forms\FormsServiceFactory;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

try {
	$boot = ProblemFormsBootstrap::init();
	$in = $boot['in'];
	$scope = $boot['scope'];
	$token = $boot['actor_token'];
	$themeId = (int)$boot['theme_id'];
	$scenarioId = (int)$boot['scenario_id'];

	if ($themeId <= 0 || $scenarioId <= 0) {
		http_response_code(422);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Missing theme_id or scenario_id'], JSON_UNESCAPED_UNICODE);
		exit;
	}

	$crud = Request::str($in, 'crud', 'read');
	$expected = Request::int($in, 'expected_version', 0);
	$payload = Request::arr($in, 'payload');

	$service = FormsServiceFactory::make($dbRuntime);

	$req = new FormRequest(
		$scope['access_id'],
		$scope['team_no'],
		$scope['outline_id'],
		$scope['exercise_no'],
		$token,
		'iteration',
		$crud,
		$expected,
		$payload
	);

	if ($crud === 'read') {
		$res = $service->read($req, $themeId, $scenarioId);
		echo json_encode(['ok' => true, 'data' => [
			'form_key' => $res->formKey,
			'version' => $res->version,
			'data' => $res->data,
		], 'error' => null], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
		exit;
	}

	$out = $service->write($req, $themeId, $scenarioId);
	if ($out instanceof \Modules\Problem\DTO\FormConflictResponse) {
		http_response_code(409);
		echo json_encode(['ok' => false, 'data' => [
			'form_key' => $out->formKey,
			'current_version' => $out->currentVersion,
			'data' => $out->data,
		], 'error' => 'version_conflict'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
		exit;
	}

	echo json_encode(['ok' => true, 'data' => [
		'form_key' => $out->formKey,
		'version' => $out->version,
		'data' => $out->data,
	], 'error' => null], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
	exit;

} catch (Throwable) {
	http_response_code(500);
	echo json_encode(['ok' => false, 'data' => null, 'error' => 'Server error'], JSON_UNESCAPED_UNICODE);
	exit;
}