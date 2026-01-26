<?php
declare(strict_types=1);

/**
 * /var/www/ajax/problem_exercise_static_content.php
 *
 * Returns static/published payload for the current exercise.
 * Uses ETag + 304 to avoid re-downloading unchanged payload.
 *
 * Requirements:
 * - Authenticated session
 * - exercise_meta must exist in session (exercise page only)
 * - language_code must be provided (service requires it)
 *
 * Contract:
 * - 200: echoes JSON string payload (built by ProblemExerciseStaticService)
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
	// 1) Require exercise context (exercise pages only)
	// ------------------------------------------------------------
	$exerciseMeta = $_SESSION['exercise_meta'] ?? null;
	if (!is_array($exerciseMeta)) {
		http_response_code(401);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Missing exercise context'], JSON_UNESCAPED_UNICODE);
		exit;
	}

	// ------------------------------------------------------------
	// 2) Ensure language_code exists (service requirement)
	// Truth order:
	//   a) active_participants (per token)
	//   b) delivery_meta
	//   c) fallback 'en'
	// ------------------------------------------------------------
	$deliveryMeta = $_SESSION['delivery_meta'] ?? [];
	$accessId = (int)($deliveryMeta['access_id'] ?? 0);
	$token = (string)($_SESSION['session_token'] ?? '');

	$languageCode = 'en';

	if ($accessId > 0 && $token !== '' && isset($trainingActiveRepo)) {
		$setup = $trainingActiveRepo->findSetupStatus($accessId, $token);
		if (!empty($setup['language_code'])) {
			$languageCode = (string)$setup['language_code'];
		}
	}

	if (!empty($deliveryMeta['language_code'])) {
		$languageCode = (string)$deliveryMeta['language_code'];
	}

	$exerciseMeta['language_code'] = $languageCode;

	// Release session lock early (static payload is read-only)
	session_write_close();

	// ------------------------------------------------------------
	// 3) Build static payload (published, cacheable)
	// ------------------------------------------------------------
	$out = $problemExerciseStaticService->getOrBuild($exerciseMeta, $schemaVersion);

	$etag = (string)($out['etag'] ?? '');
	$json = (string)($out['json'] ?? '');

	// ------------------------------------------------------------
	// 4) ETag / 304 handling (normalize weak/strong formats)
	// ------------------------------------------------------------
	$norm = static function (string $v): string {
		$v = trim($v);

		// Strip outer quotes first (IMPORTANT for values like: "W/abc...")
		$v = trim($v, "\" \t\r\n");

		// Strip weak prefix if present
		if (str_starts_with($v, 'W/')) {
			$v = trim(substr($v, 2));
		}

		// Strip quotes again just in case
		$v = trim($v, "\" \t\r\n");

		return $v;
	};

	$etagBare = $norm($etag);

	// Always send cache directives
	header('Cache-Control: private, max-age=0, must-revalidate');

	if ($etagBare !== '') {
		// Always emit weak ETag in a consistent format
		$etagHeader = 'W/"' . $etagBare . '"';
		header('ETag: ' . $etagHeader);

		$clientEtag = (string)($_SERVER['HTTP_IF_NONE_MATCH'] ?? '');
		$clientBare = $norm($clientEtag);

		if ($clientBare !== '' && hash_equals($etagBare, $clientBare)) {
			http_response_code(304);
			exit;
		}
	}

	// ------------------------------------------------------------
	// 5) 200 + body
	// ------------------------------------------------------------
	if ($json === '') {
		http_response_code(500);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Exercise static payload was empty'], JSON_UNESCAPED_UNICODE);
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