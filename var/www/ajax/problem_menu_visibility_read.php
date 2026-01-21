<?php
declare(strict_types=1);

/**
 * /var/www/ajax/problem_menu_visibility_read.php
 *
 * Returns menu visibility map for Problem exercise pages.
 *
 * Request JSON:
 * { format_id, step_no, position_count, role_id, theme_id, scenario_id }
 *
 * Response JSON:
 * { ok:true, data:{ code:0|1|2, ... }, error:null }
 */

require_once __DIR__ . '/_guard_dynamic.php';

use Engine\Database\DatabaseManager;
use Modules\Shared\Support\Databases;
use Modules\Problem\Repositories\ProblemMenuVisibilityRepository;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

try {
	$raw = file_get_contents('php://input');
	$in = ($raw !== false && $raw !== '') ? json_decode($raw, true) : [];
	if (!is_array($in)) $in = [];

	$formatId = (int)($in['format_id'] ?? 0);
	$stepNo = (int)($in['step_no'] ?? 0);
	$positionCount = (int)($in['position_count'] ?? 0);
	$roleId = (int)($in['role_id'] ?? 0);
	$themeId = (int)($in['theme_id'] ?? 0);
	$scenarioId = (int)($in['scenario_id'] ?? 0);

	session_write_close();

	$dbm = DatabaseManager::getInstance();
	$dbProblem = $dbm->getConnection(Databases::PROBLEM_CONTENT);

	$repo = new ProblemMenuVisibilityRepository($dbProblem);

	$map = $repo->resolveVisibility($formatId, $stepNo, $positionCount, $roleId, $themeId, $scenarioId);

	echo json_encode(['ok' => true, 'data' => $map, 'error' => null], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
	exit;

} catch (Throwable) {
	http_response_code(500);
	echo json_encode(['ok' => false, 'data' => null, 'error' => 'Server error'], JSON_UNESCAPED_UNICODE);
	exit;
}