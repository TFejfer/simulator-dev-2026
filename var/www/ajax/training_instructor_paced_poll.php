<?php
declare(strict_types=1);

/**
 * /var/www/ajax/training_instructor_paced_poll.php
 *
 * Dynamic endpoint (no cache).
 * Purpose: Poll "signal updates" from RUNTIME.log_poll.
 *
 * Request JSON:
 * { "last_poll_id": 123 }
 *
 * Response JSON:
 * {
 *   "ok": true,
 *   "data": {
 *     "updates": [ ... ],
 *     "server_latest_poll_id": 456,
 *     "effective_last_poll_id": 300
 *   },
 *   "error": null
 * }
 *
 * Client rule:
 * - Always set client cursor to data.server_latest_poll_id
 *   (even when updates is empty).
 */

require_once __DIR__ . '/_guard_dynamic.php';

use Engine\Database\DatabaseManager;
use Modules\Training\Auth\Repositories\InstructorPollingRepository;

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

	// Token: accept both the new canonical key ("token") and the current key ("session_token").
	$actorToken = (string)($meta['token'] ?? '');
	if ($actorToken === '') {
		$actorToken = (string)($meta['session_token'] ?? '');
	}
	if ($actorToken === '') {
		$actorToken = (string)($_SESSION['session_token'] ?? '');
	}

	// access_id and token must exist; team_no may be 0 (not assigned yet).
	if ($accessId <= 0 || $teamNo < 0 || $actorToken === '') {
		http_response_code(422);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Missing access_id/team_no/token'], JSON_UNESCAPED_UNICODE);
		exit;
	}

	$raw = file_get_contents('php://input');
	$in = ($raw !== false && $raw !== '') ? json_decode($raw, true) : [];
	if (!is_array($in)) $in = [];

	$lastPollId = (int)($in['last_poll_id'] ?? 0);
	if ($lastPollId < 0) $lastPollId = 0;

	// If team is not assigned, do not hammer the DB and do not 422-loop.
	// Let the UI/guards route the user to setup.
	if ($teamNo === 0) {
		echo json_encode([
			'ok' => true,
			'data' => [
				'updates' => [],
				'server_latest_poll_id' => $lastPollId,
				'effective_last_poll_id' => $lastPollId,
			],
			'error' => null
		], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
		exit;
	}

	// Release session lock before DB work (prevents deadlocks with parallel requests)
	session_write_close();

	$dbm = DatabaseManager::getInstance();
	$dbRuntime = $dbm->getConnection('runtime');

	$repo = new InstructorPollingRepository($dbRuntime);

	$out = $repo->pollForUpdates(
		accessId: $accessId,
		teamNo: $teamNo,
		actorToken: $actorToken,
		lastPollId: $lastPollId,
		maxRows: 20,
		fallbackLookbackRows: 200
	);

	// NOTE: Do not force navigation here to avoid redirecting non-exercise pages (outline etc.).
	$navigateTo = '';

	echo json_encode([
		'ok' => true,
		'data' => $out,
		'error' => null
	], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
	exit;

} catch (Throwable) {
	http_response_code(500);
	echo json_encode(['ok' => false, 'data' => null, 'error' => 'Server error'], JSON_UNESCAPED_UNICODE);
	exit;
}