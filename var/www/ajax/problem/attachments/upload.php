<?php
declare(strict_types=1);

/**
 * /var/www/ajax/problem/attachments/upload.php
 *
 * Dynamic endpoint (no cache).
 * Multipart upload:
 * - requires expected_version for OCC
 * - bumps versions(form_key='attachments')
 */

require_once __DIR__ . '/../../_guard_dynamic.php';
require_once __DIR__ . '/../_forms_bootstrap.php';

use Modules\Problem\Support\Request;
use Modules\Problem\Services\Forms\AttachmentsServiceFactory;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

try {
	$boot = ProblemFormsBootstrap::init();
	$in = $boot['in']; // will be $_POST for multipart
	$scope = $boot['scope'];
	$token = $boot['actor_token'];
	$themeId = (int)$boot['theme_id'];
	$scenarioId = (int)$boot['scenario_id'];

	$expected = Request::int($in, 'expected_version', 0);

	if (!isset($_FILES['file']) || !is_array($_FILES['file'])) {
		http_response_code(422);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Missing file'], JSON_UNESCAPED_UNICODE);
		exit;
	}

	$f = $_FILES['file'];
	if (($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
		http_response_code(422);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Upload error'], JSON_UNESCAPED_UNICODE);
		exit;
	}

	$tmp = (string)($f['tmp_name'] ?? '');
	$name = (string)($f['name'] ?? '');
	$size = (int)($f['size'] ?? 0);

	if ($tmp === '' || $name === '' || $size <= 0) {
		http_response_code(422);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Invalid upload'], JSON_UNESCAPED_UNICODE);
		exit;
	}

	// Basic allowlist (adjust)
	$ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
	$allow = ['jpg','jpeg','png','gif','webp'];
	if (!in_array($ext, $allow, true)) {
		http_response_code(422);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Invalid file type'], JSON_UNESCAPED_UNICODE);
		exit;
	}

	// 5MB
	if ($size > 5 * 1024 * 1024) {
		http_response_code(422);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'File too large'], JSON_UNESCAPED_UNICODE);
		exit;
	}

	$blob = file_get_contents($tmp);
	if ($blob === false) {
		http_response_code(500);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Read failed'], JSON_UNESCAPED_UNICODE);
		exit;
	}

	$svc = AttachmentsServiceFactory::make($dbRuntime);

	$out = $svc->uploadWithOcc(
		$scope['access_id'],
		$scope['team_no'],
		$scope['outline_id'],
		$scope['exercise_no'],
		$themeId,
		$scenarioId,
		$token,
		$expected,
		$name,
		$blob
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