<?php
declare(strict_types=1);

/**
 * /var/www/ajax/setup_register_user.php
 *
 * Dynamic endpoint (no cache):
 * - Validates input (language_code, first_name, join team)
 * - Reads access_id + token + team_no/team_count from session delivery_meta
 * - Upserts into log_active_participants via repository (RUNTIME DB)
 * - Updates session delivery_meta.team_no if joinTeam was requested
 * - Returns JSON { ok, data, error }
 *
 * IMPORTANT SESSION NOTE:
 * - We release the session lock before DB work to avoid deadlocks/timeouts.
 * - Then we reopen the session briefly to persist the updated team_no.
 */

require_once __DIR__ . '/_guard_dynamic.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$DEBUG = isset($_GET['debug']) && $_GET['debug'] !== '0';

try {
	// -------------------------------------------------
	// 1) Read session essentials (while session lock is held)
	// -------------------------------------------------
	$token = (string)($_SESSION['session_token'] ?? '');
	$meta = $_SESSION['delivery_meta'] ?? $_SESSION['delivery_context'] ?? null;

	$accessId = 0;
	$teamNo = 0;
	$teamCount = 0;

	if (is_array($meta)) {
		$accessId = (int)($meta['access_id'] ?? $meta['accessID'] ?? $meta['accessId'] ?? 0);
		$teamNo = (int)($meta['team_no'] ?? $meta['team'] ?? 0);
		$teamCount = (int)($meta['team_count'] ?? $meta['teams'] ?? 0);
	}

	if ($accessId <= 0 || $token === '') {
		http_response_code(401);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Invalid session'], JSON_UNESCAPED_UNICODE);
		exit;
	}

	// -------------------------------------------------
	// 2) Parse JSON body
	// -------------------------------------------------
	$raw = file_get_contents('php://input') ?: '';
	$in = json_decode($raw, true);
	if (!is_array($in)) $in = [];

	$languageCode = strtolower(trim((string)($in['setupLanguageCode'] ?? 'en')));
	$firstName = trim((string)($in['setupFirstName'] ?? ''));
	$joinTeam = (int)($in['setupJoinTeam'] ?? 0);

	$browser = (string)($in['browser'] ?? '');
	$os = (string)($in['OS'] ?? $in['os'] ?? '');
	$timezone = (string)($in['timezone'] ?? '');

	// Validate language code
	if (!preg_match('/^[a-z]{2}$/', $languageCode)) {
		$languageCode = 'en';
	}

	// Validate first name
	if ($firstName === '' || mb_strlen($firstName) > 60) {
		http_response_code(422);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Invalid first_name'], JSON_UNESCAPED_UNICODE);
		exit;
	}

	// Validate join team range
	if ($joinTeam < 0) $joinTeam = 0;
	if ($teamCount > 0 && $joinTeam > $teamCount) $joinTeam = 0;

	// Selecting current team means "no change requested"
	if ($joinTeam === $teamNo) $joinTeam = 0;

	// Compute intended new team_no for the session:
	// - joinTeam > 0 => switch to that team
	// - joinTeam == 0 => keep current teamNo (may still be 0)
	$newTeamNo = ($joinTeam > 0) ? $joinTeam : $teamNo;
	if ($newTeamNo < 0) $newTeamNo = 0;

	// -------------------------------------------------
	// 3) Release session lock early (prevents deadlocks with parallel calls)
	// -------------------------------------------------
	session_write_close();

	// -------------------------------------------------
	// 4) Validate DB handle + repository availability
	// -------------------------------------------------
	if (!isset($dbRuntime) || !($dbRuntime instanceof PDO)) {
		http_response_code(500);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'DB not available'], JSON_UNESCAPED_UNICODE);
		exit;
	}

	if (!class_exists(\Modules\Training\Auth\Repositories\ActiveParticipantRepository::class)) {
		http_response_code(500);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Repository class not found'], JSON_UNESCAPED_UNICODE);
		exit;
	}

	$repo = new \Modules\Training\Auth\Repositories\ActiveParticipantRepository($dbRuntime);

	if (!method_exists($repo, 'upsertSetupData')) {
		http_response_code(500);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Repository method upsertSetupData not found'], JSON_UNESCAPED_UNICODE);
		exit;
	}

	// -------------------------------------------------
	// 5) Persist setup data in DB
	// -------------------------------------------------
	$repo->upsertSetupData(
		$accessId,
		$token,
		$teamNo,
		$languageCode,
		$firstName,
		$joinTeam,
		$browser,
		$os,
		$timezone
	);

	// -------------------------------------------------
	// 6) Re-open session briefly to persist the new team_no
	// -------------------------------------------------
	// NOTE:
	// - Because we called session_write_close() above, we must reopen the session
	//   if we want to change session values.
	// - Keep this section short.
	if (session_status() !== PHP_SESSION_ACTIVE) {
		@session_start();
	}

	// Update delivery_meta if present. Do not create a new structure if missing;
	// that should be handled by the login/builder flow.
	if (isset($_SESSION['delivery_meta']) && is_array($_SESSION['delivery_meta'])) {
		$_SESSION['delivery_meta']['team_no'] = $newTeamNo;
		$_SESSION['delivery_meta']['language_code'] = $languageCode;
		$_SESSION['delivery_meta']['first_name'] = $firstName;
	}

	// Optional: also keep delivery_context in sync if it exists (during transition)
	if (isset($_SESSION['delivery_context']) && is_array($_SESSION['delivery_context'])) {
		$_SESSION['delivery_context']['team_no'] = $newTeamNo;
		$_SESSION['delivery_context']['team'] = $newTeamNo;
	}

	session_write_close();

	// -------------------------------------------------
	// 7) Respond
	// -------------------------------------------------
	echo json_encode([
		'ok' => true,
		'data' => [
			'requested_team_no' => $joinTeam,
			'team_no' => $newTeamNo,
			'language_code' => $languageCode,
			'first_name' => $firstName,
		],
		'error' => null
	], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
	exit;

} catch (Throwable $e) {
	http_response_code(500);

	$out = ['ok' => false, 'data' => null, 'error' => 'Server error'];

	if ($DEBUG) {
		$out['error'] = $e->getMessage();
		$out['where'] = basename($e->getFile()) . ':' . $e->getLine();
	}

	echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
	exit;
}