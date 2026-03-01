<?php
declare(strict_types=1);

/**
 * /var/www/training/pages/training-problem-instructor-result.php
 *
 * Thin page entrypoint (Problem instructor result).
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
// 2) Resolve exercise context from query
// ------------------------------------------------------------
$exerciseNo = (int)($_GET['exercise'] ?? 0);
if ($exerciseNo <= 0) {
	$exerciseNo = (int)($_GET['id'] ?? 0);
}

if ($exerciseNo <= 0) {
	header('Location: /training-instructor-outline');
	exit;
}

$accessId = (int)($deliveryMeta['access_id'] ?? 0);
$teamNo = (int)($deliveryMeta['team_no'] ?? 0);
$languageCode = (string)($deliveryMeta['language_code'] ?? 'en');

if ($accessId <= 0 || $teamNo <= 0) {
	header('Location: /training-instructor-outline');
	exit;
}

try {
	$exerciseMeta = $exerciseMetaService->loadByExerciseNoIntoSession($accessId, $teamNo, $exerciseNo, $sessionToken);
	$exerciseMetaArr = $exerciseMeta->toArray();
} catch (Throwable $e) {
	error_log('[training-problem-instructor-result] loadByExerciseNoIntoSession failed ' . json_encode([
		'access_id' => $accessId,
		'team_no' => $teamNo,
		'exercise_no' => $exerciseNo,
		'error' => $e->getMessage(),
	], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
	header('Location: /training-instructor-outline');
	exit;
}

$stepNo = (int)($exerciseMetaArr['step_no'] ?? 0);
$skillId = (int)($exerciseMetaArr['skill_id'] ?? 0);
$formatId = (int)($exerciseMetaArr['format_id'] ?? 0);
$outlineId = (int)($exerciseMetaArr['outline_id'] ?? 0);
$themeId = (int)($exerciseMetaArr['theme_id'] ?? 0);
$scenarioId = (int)($exerciseMetaArr['scenario_id'] ?? 0);

if ($stepNo !== 100 || $skillId !== 1 || $outlineId <= 0) {
	header('Location: /training-instructor-outline');
	exit;
}

// ------------------------------------------------------------
// 3) Build result payload (metrics + CSF computed server-side)
// ------------------------------------------------------------
$resultPayload = [];
if (isset($problemMetricsService) && $problemMetricsService instanceof \Modules\Problem\Services\Metrics\ProblemMetricsService) {
	try {
		$resultPayload = $problemMetricsService->buildResultPayloadForExercise(
			$accessId,
			$teamNo,
			$outlineId,
			$exerciseNo,
			$themeId,
			$scenarioId,
			$formatId,
			$skillId,
			$languageCode
		);
		if (empty($resultPayload['metrics']) || empty($resultPayload['success_criteria'])) {
			error_log('[training-problem-instructor-result] missing persisted metrics or success criteria ' . json_encode([
				'access_id' => $accessId,
				'team_no' => $teamNo,
				'outline_id' => $outlineId,
				'exercise_no' => $exerciseNo,
			], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
		}
	} catch (Throwable $e) {
		error_log('[training-problem-instructor-result] buildResultPayloadForExercise failed ' . json_encode([
			'access_id' => $accessId,
			'team_no' => $teamNo,
			'exercise_no' => $exerciseNo,
			'error' => $e->getMessage(),
		], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
	}
}

// Release session lock early (results page is read-only)
session_write_close();

// ------------------------------------------------------------
// 4) Debug helper (?debug=1)
// ------------------------------------------------------------
require_once INSTALL_ROOT . 'Engine/Support/Debug.php';
\Engine\Support\Debug::enableIfRequested();

// ------------------------------------------------------------
// 5) Context helpers
// ------------------------------------------------------------
require_once INSTALL_ROOT . 'App/Context/context.php';
require_once INSTALL_ROOT . 'App/Context/requirements.php';
require_once INSTALL_ROOT . 'App/Context/assets.php';

// ------------------------------------------------------------
// 6) Page context (template-aware)
// ------------------------------------------------------------
$templateCode = (string)($deliveryMeta['template_code'] ?? 'default');

$pageContext = \App\Context\normalize_context([
	'site'     => 'training',
	'pace'     => 'instructor',
	'skill'    => 'problem',
	'template' => $templateCode,
	'page'     => 'result',
	'specific' => null,
]);
\App\Context\require_context($pageContext);

// ------------------------------------------------------------
// 7) Assets + page key
// ------------------------------------------------------------
$assets = \App\Context\resolve_assets($pageContext);
$assets['libs']['chart'] = true;
$assets['libs']['imagerotator'] = true;
$assets['modules']['problem-information-sources'] = true;

$assets['js'][] = '/common/assets/js/features/problem/forms/helpers.js';
$assets['js'][] = '/common/assets/js/features/problem/forms/store.js';
$assets['js'][] = '/common/assets/js/features/problem/forms/forms-controller.js';
$assets['js'][] = '/common/assets/js/features/problem/forms/forms-layout.js';
$assets['js'][] = '/common/assets/js/features/problem/forms/forms-registry.js';
$assets['js'][] = '/common/assets/js/features/sidebar/help-sidebar.js';
$assets['js'][] = '/common/assets/js/features/sidebar/problem-info-sources-registry.js';
$assets['js'][] = '/common/assets/js/features/sidebar/sources/utils.js';
$assets['js'][] = '/common/assets/js/features/sidebar/sources/inbox.js';
$assets['js'][] = '/common/assets/js/features/sidebar/sources/process.js';
$assets['js'][] = '/common/assets/js/features/sidebar/sources/maintenance.js';
$assets['js'][] = '/common/assets/js/features/sidebar/sources/performance.js';
$assets['js'][] = '/common/assets/js/features/sidebar/sources/system-log.js';
$assets['js'][] = '/common/assets/js/features/sidebar/sources/inspect-and-act.js';
$assets['js'][] = '/common/assets/js/features/sidebar/problem-info-sidebar.js';

$assets['css'][] = '/common/assets/css/pages/training-instructor-problem-result.css';

$ctxKey = \App\Context\ctx_key($pageContext);
$_SERVER['APP_PAGE_KEY'] = $ctxKey;

$pageScript = "/common/assets/js/pages/{$ctxKey}.js";

// ------------------------------------------------------------
// 8) Page class
// ------------------------------------------------------------
require_once INSTALL_ROOT . 'App/Pages/Contracts/PageInterface.php';
require_once INSTALL_ROOT . 'App/Pages/BasePage.php';
require_once INSTALL_ROOT . 'App/Pages/Training/Instructor/ProblemResultPage.php';

$pageObj = new \App\Pages\Training\Instructor\ProblemResultPage();

// ------------------------------------------------------------
// 9) Render
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
$formatNo = (int)($exerciseMetaArr['format_id'] ?? 0);

$pageData = $pageObj->getPageData();

// NOTE: timers are included for consistency, but TopBarRules treats this page as non-exercise.
$serverNow = time();

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
			'exercise_start_unix' => (int)($exerciseMetaArr['exercise_start_unix'] ?? 0),
			'deadline_unix' => (int)($exerciseMetaArr['deadline_unix'] ?? 0),
			'seconds_left' => (int)($exerciseMetaArr['seconds_left'] ?? 0),
			'timer_end_unix' => (int)($exerciseMetaArr['timer_end_unix'] ?? 0),
			'timer_phase' => (string)($exerciseMetaArr['timer_phase'] ?? ''),
			'timer_source' => (string)($exerciseMetaArr['timer_source'] ?? 'problem-timer/v1'),
		]),
		'RESULT' => $resultPayload,
	]),
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
?>
</script>

<?php
$assetVer = (string)time();
include INSTALL_ROOT . 'App/View/Layout/footer.php';
?>

<script nonce="<?php echo $nonce ?? ''; ?>">
	window.__ASSET_VER__ = "<?php echo $assetVer; ?>";
</script>

<script
	type="module"
	src="/common/assets/js/features/problem/forms/<?php echo htmlspecialchars($templateCode, ENT_QUOTES, 'UTF-8'); ?>/_bundle.js?v=<?php echo $assetVer; ?>">
</script>
