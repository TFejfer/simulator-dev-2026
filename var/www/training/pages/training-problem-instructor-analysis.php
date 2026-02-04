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
// ------------------------------------------------------------
$accessId = (int)($deliveryMeta['access_id'] ?? 0);
$teamNo   = (int)($deliveryMeta['team_no'] ?? 0);

if ($accessId <= 0 || $teamNo <= 0) {
	header('Location: /training-instructor-outline');
	exit;
}

try {
	$exerciseMeta = $exerciseMetaService->loadIntoSession($accessId, $teamNo, $sessionToken);
	$exerciseMetaArr = $exerciseMeta->toArray();
} catch (Throwable) {
	header('Location: /training-instructor-outline');
	exit;
}

$serverNow = time();

// Timer fields are precomputed and cached in session (ExerciseMetaService)
$exerciseStartUnix = (int)($exerciseMetaArr['exercise_start_unix'] ?? 0);
$deadlineUnix = (int)($exerciseMetaArr['deadline_unix'] ?? 0);
$secondsLeft = (int)($exerciseMetaArr['seconds_left'] ?? 0);

// Timer parameters (from shared_content.exercise_parameters with problem_* keys)
$timerParams = [];
if (isset($exerciseParamsRepo)) {
	if (method_exists($exerciseParamsRepo, 'readAll')) {
		$timerParams = $exerciseParamsRepo->readAll();
	} elseif (method_exists($exerciseParamsRepo, 'getValue')) {
		$keys = [
			'problem_introduction_time',
			'problem_discovery_time',
			'problem_discovery_swap_registration',
			'problem_discovery_swap_investigation',
			'problem_max_finalize_time_in_seconds',
			'problem_swap_time'
		];
		foreach ($keys as $k) {
			$timerParams[$k] = $exerciseParamsRepo->getValue($k);
		}
	}
}

// Timer inputs are already computed by ExerciseMetaService; use as-is
$timerInput = [
	'exercise_start_unix' => $exerciseStartUnix,
	'deadline_unix' => $deadlineUnix,
	'seconds_left' => $secondsLeft,
	'timer_end_unix' => (int)($exerciseMetaArr['timer_end_unix'] ?? 0),
	'phase' => (string)($exerciseMetaArr['timer_phase'] ?? ''),
	'source' => (string)($exerciseMetaArr['timer_source'] ?? 'problem-timer/v1'),
];

$timerEndUnix = (int)$timerInput['timer_end_unix'];
$timerPhase = (string)$timerInput['phase'];

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
// 5) Page context (template-aware)
// ------------------------------------------------------------
$templateCode = (string)($deliveryMeta['template_code'] ?? 'default');

$pageContext = \App\Context\normalize_context([
	'site'     => 'training',
	'pace'     => 'instructor',
	'skill'    => 'problem',
	'template' => $templateCode,
	'page'     => 'analysis',
	'specific' => null,
]);
\App\Context\require_context($pageContext);

// ------------------------------------------------------------
// 6) Assets + page key
// ------------------------------------------------------------
$assets = \App\Context\resolve_assets($pageContext);

$ctxKey = \App\Context\ctx_key($pageContext);
$_SERVER['APP_PAGE_KEY'] = $ctxKey;

$pageScript = "/common/assets/js/pages/{$ctxKey}.js";

// Forms - core (always)
$assets['js'][] = '/common/assets/js/features/problem/forms/helpers.js';
$assets['js'][] = '/common/assets/js/features/problem/forms/store.js';
$assets['js'][] = '/common/assets/js/features/problem/forms/forms-controller.js';
$assets['js'][] = '/common/assets/js/features/problem/forms/forms-layout.js';
$assets['js'][] = '/common/assets/js/features/problem/forms/forms-registry.js';

// Forms - template bundle (single entrypoint)
// NOTE: This file should register the concrete forms for the chosen template.
//$assets['js'][] = "/common/assets/js/features/problem/forms/{$templateCode}/_bundle.js";

// (Optional) template CSS (if you implement it)
//$assets['css'][] = "/common/assets/css/features/problem/forms/{$templateCode}.css";

// ------------------------------------------------------------
// 7) Page class
// ------------------------------------------------------------
require_once INSTALL_ROOT . 'App/Pages/Contracts/PageInterface.php';
require_once INSTALL_ROOT . 'App/Pages/BasePage.php';
require_once INSTALL_ROOT . 'App/Pages/Training/Instructor/ProblemAnalysisPage.php';

$pageObj = new \App\Pages\Training\Instructor\ProblemAnalysisPage();

// ------------------------------------------------------------
// 8) Render
// ------------------------------------------------------------
$view = [
	'assets'     => $assets,
	'pageScript' => $pageScript,
	'ctxKey'     => $ctxKey,
];

include INSTALL_ROOT . 'App/View/Layout/header.php';

echo $pageObj->getPage();
?>

<script id="page-data" type="application/json" nonce="<?php echo $nonce ?? ''; ?>">
<?php
// Enrich exercise meta for topbar timers (format + timer inputs)
$formatNo = (int)($exerciseMetaArr['format_id'] ?? 0);

$pageData = $pageObj->getPageData();
$pageData['DELIVERY'] = array_merge($pageData['DELIVERY'] ?? [], [
	'serverTimeNow'  => $serverNow,
	'server_now_unix'=> $serverNow,
]);

echo json_encode([
	'DEBUG'   => !empty($_GET['debug']),
	'CTX_KEY' => $ctxKey,
	'DATA'    => array_merge($pageData, [
		'DELIVERY_META' => [
			'serverTimeNow' => $serverNow,
			'team_no'        => $deliveryMeta['team_no'] ?? 0,
			'language_code'  => $deliveryMeta['language_code'] ?? 'en',
			'template_id'    => (int)($deliveryMeta['template_id'] ?? 0),
			'template_code'  => (string)($deliveryMeta['template_code'] ?? 'default'),
			'is_frontline'   => (int)($deliveryMeta['is_frontline'] ?? 0),
		],
		'EXERCISE_META' => array_merge($exerciseMetaArr, [
			// TopBarRules expects format_no/format; mirror format_id so countdown rules can trigger
			'format_no' => $formatNo,
			'format'    => $formatNo,
			// Timer inputs
			'exercise_start_unix' => $exerciseStartUnix,
			'deadline_unix' => $deadlineUnix,
			'seconds_left' => $secondsLeft,
			'timer_end_unix' => $timerEndUnix,
			'timer_phase' => $timerPhase,
			'timer_source' => $timerInput['source'] ?? 'problem-timer/v1',
		]),
	]),
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
?>
</script>

<?php
// One stable asset version per request.
// Use this for both __ASSET_VER__ and the module bundle URL.
$assetVer = (string)time();

include INSTALL_ROOT . 'App/View/Layout/footer.php';

$templateCode = (string)($deliveryMeta['template_code'] ?? 'default');
?>

<script nonce="<?php echo $nonce ?? ''; ?>">
	window.__ASSET_VER__ = "<?php echo $assetVer; ?>";
</script>

<script
	type="module"
	src="/common/assets/js/features/problem/forms/<?php echo htmlspecialchars($templateCode, ENT_QUOTES, 'UTF-8'); ?>/_bundle.js?v=<?php echo $assetVer; ?>">
</script>

<?php