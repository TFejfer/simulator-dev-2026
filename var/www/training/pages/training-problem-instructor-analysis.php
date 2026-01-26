<?php
declare(strict_types=1);

/**
 * /var/www/training/pages/training-problem-instructor-analysis.php
 *
 * Thin page entrypoint (Problem instructor analysis).
 *
 * Responsibilities:
 * - Require authenticated session
 * - Build exercise_meta (DB truth + session cache) for this request
 * - Release session lock early (important for parallel AJAX calls)
 * - Resolve context + assets
 * - Render page skeleton
 * - Export page-data JSON (incl. delivery_meta + exercise_meta for debugging)
 */

define('INSTALL_ROOT', '/var/www/');
require_once INSTALL_ROOT . 'App/bootstrap.php';

// ------------------------------------------------------------
// 1) Require authenticated session
// ------------------------------------------------------------
$uid = $_SESSION['user_id'] ?? null;
$deliveryMeta = $_SESSION['delivery_meta'] ?? null;
$sessionToken = (string)($_SESSION['session_token'] ?? '');

if (empty($uid) || !is_array($deliveryMeta) || $sessionToken === '') {
	header('Location: /login');
	exit;
}

// ------------------------------------------------------------
// 2) Resolve scope + build exercise meta (DB truth)
// NOTE:
// - access_id / team_no must exist and be > 0
// - token comes from session, not from delivery_meta
// ------------------------------------------------------------
$accessId = (int)($deliveryMeta['access_id'] ?? 0);
$teamNo = (int)($deliveryMeta['team_no'] ?? 0);

if ($accessId <= 0 || $teamNo <= 0) {
	// No valid team scope yet -> outline/setup is the correct place
	header('Location: /training-instructor-outline');
	exit;
}

try {
	// This call writes exercise_meta into $_SESSION['exercise_meta'] and returns the DTO
	$exerciseMeta = $exerciseMetaService->loadIntoSession($accessId, $teamNo, $sessionToken);
} catch (Throwable) {
	// If no log_exercise exists yet (or any runtime error), redirect back to outline
	header('Location: /training-instructor-outline');
	exit;
}

// Release session lock early (critical for parallel AJAX)
session_write_close();

// ------------------------------------------------------------
// 3) Debug helper (?debug=1)
// ------------------------------------------------------------
require_once INSTALL_ROOT . 'Engine/Support/Debug.php';
\Engine\Support\Debug::enableIfRequested();

// ------------------------------------------------------------
// 4) Context helpers
// ------------------------------------------------------------
require_once INSTALL_ROOT . 'App/Context/context.php';
require_once INSTALL_ROOT . 'App/Context/requirements.php';
require_once INSTALL_ROOT . 'App/Context/assets.php';

// ------------------------------------------------------------
// 5) Page context
// ------------------------------------------------------------
$pageContext = \App\Context\normalize_context([
	'site'		=> 'training',
	'pace'		=> 'instructor',
	'skill'		=> 'problem',
	'template'	=> null,
	'page'		=> 'analysis',
	'specific'	=> null,
]);
\App\Context\require_context($pageContext);

// ------------------------------------------------------------
// 6) Assets + page key
// ------------------------------------------------------------
$assets = \App\Context\resolve_assets($pageContext);

// Add feature scripts as you build them
// $assets['js'][] = '/common/assets/js/features/sidebar/help-sidebar.js';

$ctxKey = \App\Context\ctx_key($pageContext); // expected: training-problem-instructor-analysis
$_SERVER['APP_PAGE_KEY'] = $ctxKey;

$pageScript = "/common/assets/js/pages/{$ctxKey}.js";

// ------------------------------------------------------------
// 7) Page class
// ------------------------------------------------------------
require_once INSTALL_ROOT . 'App/Pages/Contracts/PageInterface.php';
require_once INSTALL_ROOT . 'App/Pages/BasePage.php';
require_once INSTALL_ROOT . 'App/Pages/Training/Instructor/ProblemAnalysisPage.php';

$pageObj = new \App\Pages\Training\Instructor\ProblemAnalysisPage();

// ------------------------------------------------------------
// 8) Render
// NOTE: $nonce and $view are expected by your header/footer layout.
// ------------------------------------------------------------
$view = [
	'assets'		=> $assets,
	'pageScript'	=> $pageScript,
	'ctxKey'		=> $ctxKey,
];

include INSTALL_ROOT . 'App/View/Layout/header.php';

echo $pageObj->getPage();
?>
<script id="page-data" type="application/json" nonce="<?php echo $nonce ?? ''; ?>">
<?php
echo json_encode([
	'DEBUG'		=> !empty($_GET['debug']),
	'CTX_KEY'	=> $ctxKey,
	'DATA'		=> array_merge($pageObj->getPageData(), [
		// Expose both for debugging / transparency
		'DELIVERY_META' => $deliveryMeta,
		'EXERCISE_META' => $exerciseMeta->toArray(),

		// Optional: minimal session debug (do NOT expose secrets)
		'SESSION_DEBUG' => [
			'user_id'	=> $uid,
			'access_id'	=> $accessId,
			'team_no'	=> $teamNo,
			'token'		=> ($sessionToken !== '') ? 'set' : 'missing',
		],
	]),
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
?>
</script>
<?php
include INSTALL_ROOT . 'App/View/Layout/footer.php';