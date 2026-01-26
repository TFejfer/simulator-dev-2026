<?php
declare(strict_types=1);

/**
 * /var/www/ajax/problem_exercise_state_content.php
 *
 * Returns dynamic/runtime payload for the current exercise.
 * Uses ETag + 304 to avoid re-downloading unchanged payload.
 *
 * State payload depends on:
 * - theme_id
 * - scenario_id
 * - current_state
 * - language_code
 *
 * Contract:
 * - 200: echoes JSON string payload (built by ProblemExerciseStateService)
 * - 304: no body
 *
 * Headers:
 * - ETag: W/"<hash>"
 * - Cache-Control: private, max-age=0, must-revalidate
 */

require_once __DIR__ . '/_guard.php';

header('Content-Type: application/json; charset=utf-8');

try {
	$schemaVersion = 1;

	// ------------------------------------------------------------
	// 1) Require exercise context
	// ------------------------------------------------------------
	$exerciseMeta = $_SESSION['exercise_meta'] ?? null;
	if (!is_array($exerciseMeta)) {
		http_response_code(401);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Missing exercise context'], JSON_UNESCAPED_UNICODE);
		exit;
	}

	$deliveryMeta = $_SESSION['delivery_meta'] ?? null;
	if (!is_array($deliveryMeta)) {
		http_response_code(401);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Missing delivery_meta'], JSON_UNESCAPED_UNICODE);
		exit;
	}

	// ------------------------------------------------------------
	// 2) Ensure language_code exists (truth: active_participants -> delivery_meta -> fallback)
	// ------------------------------------------------------------
	$accessId = (int)($deliveryMeta['access_id'] ?? 0);
	$token = (string)($_SESSION['session_token'] ?? '');

	$languageCode = (string)($exerciseMeta['language_code'] ?? ($deliveryMeta['language_code'] ?? 'en'));
	if ($languageCode === '') $languageCode = 'en';

	if ($accessId > 0 && $token !== '' && isset($trainingActiveRepo)) {
		$setup = $trainingActiveRepo->findSetupStatus($accessId, $token);
		if (!empty($setup['language_code'])) {
			$languageCode = (string)$setup['language_code'];
		}
	}

	$exerciseMeta['language_code'] = $languageCode;
	$deliveryMeta['language_code'] = $languageCode;

	// Release session lock early (state payload is read-only)
	session_write_close();

	// ------------------------------------------------------------
	// 3) Compute ETag fingerprint (ONLY meaningful payload drivers)
	// ------------------------------------------------------------
	$themeId = (int)($exerciseMeta['theme_id'] ?? 0);
	$scenarioId = (int)($exerciseMeta['scenario_id'] ?? 0);
	$currentState = (int)($exerciseMeta['current_state'] ?? 0);

	if ($themeId <= 0 || $scenarioId <= 0 || $currentState <= 0) {
		http_response_code(409);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Missing theme/scenario/state'], JSON_UNESCAPED_UNICODE);
		exit;
	}

	// Stable fingerprint: schema + module + ctx fields
	$fingerprint = $schemaVersion . ':problem:' . $themeId . ':' . $scenarioId . ':' . $currentState . ':' . $languageCode;
	$etagBare = sha1($fingerprint);

	// Always send cache directives
	header('Cache-Control: private, max-age=0, must-revalidate');

	// Normalize to bare token: strip quotes, strip weak prefix
	$norm = static function (string $v): string {
		$v = trim($v);
		$v = trim($v, "\" \t\r\n");
		if (str_starts_with($v, 'W/')) {
			$v = trim(substr($v, 2));
		}
		$v = trim($v, "\" \t\r\n");
		return $v;
	};

	// Always emit weak ETag in a consistent format
	$etagHeader = 'W/"' . $etagBare . '"';
	header('ETag: ' . $etagHeader);

	$clientEtag = (string)($_SERVER['HTTP_IF_NONE_MATCH'] ?? '');
	$clientBare = $norm($clientEtag);

	if ($clientBare !== '' && hash_equals($etagBare, $clientBare)) {
		http_response_code(304);
		exit;
	}

	// ------------------------------------------------------------
	// 4) Build payload (200)
	// ------------------------------------------------------------
	$out = $problemExerciseStateService->getOrBuild($deliveryMeta, $exerciseMeta, $schemaVersion);

	$json = (string)($out['json'] ?? '');
	if ($json === '') {
		http_response_code(500);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Exercise state payload was empty'], JSON_UNESCAPED_UNICODE);
		exit;
	}

	echo $json;
	exit;

} catch (Throwable $e) {
	http_response_code(500);
	echo json_encode(
		[
			'ok'	=> false,
			'data'	=> null,
			'error'	=> $e->getMessage(),
			'where'	=> basename($e->getFile()) . ':' . $e->getLine(),
		],
		JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
	);
	exit;
}