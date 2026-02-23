<?php
declare(strict_types=1);

/**
 * /var/www/training/pages/training-problem-instructor-complete.php
 *
 * Thin page entrypoint (Problem instructor complete).
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
	error_log('[training-problem-instructor-complete] redirect:/login missing session data ' . json_encode([
		'uid' => $uid,
		'has_delivery_meta' => is_array($deliveryMeta),
		'session_token' => $sessionToken !== '' ? 'present' : 'missing'
	], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
	header('Location: /login');
	exit;
}

// ------------------------------------------------------------
// 2) Resolve scope + build exercise meta (DB truth)
// ------------------------------------------------------------
$accessId = (int)($deliveryMeta['access_id'] ?? 0);
$teamNo   = (int)($deliveryMeta['team_no'] ?? 0);

if ($accessId <= 0 || $teamNo <= 0) {
	error_log('[training-problem-instructor-complete] redirect:/training-instructor-outline invalid scope ' . json_encode([
		'access_id' => $accessId,
		'team_no' => $teamNo
	], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
	header('Location: /training-instructor-outline');
	exit;
}

try {
	$exerciseMeta = $exerciseMetaService->loadIntoSession($accessId, $teamNo, $sessionToken);
	$exerciseMetaArr = $exerciseMeta->toArray();
} catch (Throwable $e) {
	error_log('[training-problem-instructor-complete] redirect:/training-instructor-outline loadIntoSession failed ' . json_encode([
		'access_id' => $accessId,
		'team_no' => $teamNo,
		'error' => $e->getMessage()
	], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
	header('Location: /training-instructor-outline');
	exit;
}

$serverNow = time();

// Timer fields are precomputed and cached in session (ExerciseMetaService)
$exerciseStartUnix = (int)($exerciseMetaArr['exercise_start_unix'] ?? 0);
$deadlineUnix = (int)($exerciseMetaArr['deadline_unix'] ?? 0);
$secondsLeft = (int)($exerciseMetaArr['seconds_left'] ?? 0);

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

$lottieId = 49;
$lottieCode = null;
if (isset($lottieRepo) && $lottieRepo instanceof \Modules\Shared\Repositories\LottieRepository) {
	$lottieCode = $lottieRepo->findCodeById($lottieId);
}
if (!empty($_GET['debug']) && ($lottieCode === null || $lottieCode === '')) {
	error_log('[training-problem-instructor-complete] lottie missing', [
		'lottie_id' => $lottieId,
		'has_repo' => isset($lottieRepo),
		'len' => is_string($lottieCode) ? strlen($lottieCode) : 0,
	]);
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
// 5) Page context (template-aware)
// ------------------------------------------------------------
$templateCode = (string)($deliveryMeta['template_code'] ?? 'default');

$pageContext = \App\Context\normalize_context([
	'site'     => 'training',
	'pace'     => 'instructor',
	'skill'    => 'problem',
	'template' => $templateCode,
	'page'     => 'complete',
	'specific' => null,
]);
\App\Context\require_context($pageContext);

// ------------------------------------------------------------
// 6) Assets + page key
// ------------------------------------------------------------
$assets = \App\Context\resolve_assets($pageContext);
$assets['libs']['lottie'] = true;

$ctxKey = \App\Context\ctx_key($pageContext);
$_SERVER['APP_PAGE_KEY'] = $ctxKey;

$pageScript = "/common/assets/js/pages/{$ctxKey}.js";

// ------------------------------------------------------------
// 7) Page class
// ------------------------------------------------------------
require_once INSTALL_ROOT . 'App/Pages/Contracts/PageInterface.php';
require_once INSTALL_ROOT . 'App/Pages/BasePage.php';
require_once INSTALL_ROOT . 'App/Pages/Training/Instructor/ProblemCompletePage.php';

$pageObj = new \App\Pages\Training\Instructor\ProblemCompletePage();

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
			'format_no' => $formatNo,
			'format'    => $formatNo,
			'exercise_start_unix' => $exerciseStartUnix,
			'deadline_unix' => $deadlineUnix,
			'seconds_left' => $secondsLeft,
			'timer_end_unix' => $timerEndUnix,
			'timer_phase' => $timerPhase,
			'timer_source' => $timerInput['source'] ?? 'problem-timer/v1',
		]),
		'COMPLETE_META' => [
			'lottie_id' => $lottieId,
			'lottie_code' => $lottieCode,
		],
	]),
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
?>
</script>

<?php
include INSTALL_ROOT . 'App/View/Layout/footer.php';
