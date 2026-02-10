<?php
declare(strict_types=1);

/**
 * /var/www/training/pages/training-problem-instructor-action.php
 *
 * Thin page entrypoint (Problem instructor action).
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
	error_log('[training-problem-instructor-action] redirect:/login missing session data ' . json_encode([
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
	error_log('[training-problem-instructor-action] redirect:/training-instructor-outline invalid scope ' . json_encode([
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
	error_log('[training-problem-instructor-action] redirect:/training-instructor-outline loadIntoSession failed ' . json_encode([
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

// ------------------------------------------------------------
// 3) Resolve action data
// ------------------------------------------------------------
$languageCode = (string)($deliveryMeta['language_code'] ?? 'en');
if ($languageCode === '') $languageCode = 'en';

$actionRow = $exerciseRuntimeRepo->findLatestActionRow($accessId, $teamNo);
$actionRow = is_array($actionRow) ? $actionRow : [];

$commonTerms = [];
$ciActions = [];
if (isset($sharedTextsRepo)) {
	$commonTerms = $sharedTextsRepo->rowsToMap($sharedTextsRepo->readCommonTerminologyRows($languageCode));
	$ciActions = $sharedTextsRepo->rowsToMap($sharedTextsRepo->readCiActionsRows($languageCode));
}

$actionId = (int)($actionRow['action_id'] ?? 0);
$outcomeId = (int)($actionRow['outcome_id'] ?? 0);
$ciId = (string)($actionRow['ci_id'] ?? '');

$actionName = '';
if ($actionId > 0) {
	$actionName = (string)($ciActions[(string)$actionId] ?? $commonTerms[(string)$actionId] ?? '');
}

$outcomeText = '';
if ($outcomeId > 0) {
	if (class_exists(\Modules\Problem\Content\Repositories\OutcomeRepository::class) && isset($dbProblemContent)) {
		$outcomeRepo = new \Modules\Problem\Content\Repositories\OutcomeRepository($dbProblemContent);
		$outcomeText = (string)($outcomeRepo->findOutcomeText($outcomeId, $languageCode) ?? '');
	}
}

$performingTerm = (string)($commonTerms['601'] ?? 'Performing');

$ciImageSrc = '/common/assets/images/configimages/config_placeholder.png';

$themeId = (int)($exerciseMetaArr['theme_id'] ?? 0);
if ($ciId !== '' && $themeId > 0 && isset($themeConfigurationItemsService)) {
	$items = $themeConfigurationItemsService->build(new \Modules\Problem\Services\InfoSources\InfoSourceKey(
		themeId: $themeId,
		scenarioId: (int)($exerciseMetaArr['scenario_id'] ?? 0),
		state: (int)($exerciseMetaArr['current_state'] ?? 0),
		languageCode: $languageCode,
		schemaVersion: 1
	));

	$ciLookup = null;
	foreach ($items as $ci) {
		if (!is_array($ci)) continue;
		if (isset($ci['ci_id']) && (string)$ci['ci_id'] === $ciId) {
			$ciLookup = $ci;
			break;
		}
	}

	$typeId = 0;
	if (preg_match('/^(\d{2})/', $ciId, $m)) {
		$typeId = (int)$m[1];
	}

	if ($typeId > 0) {
		$isSwitch = in_array($typeId, [23, 24], true);
		$typePrefix = $isSwitch ? 'SW' : str_pad((string)$typeId, 2, '0', STR_PAD_LEFT);
		$hasMultiple = $isSwitch || (isset($ciLookup['has_multiple_images']) && (string)$ciLookup['has_multiple_images'] === '1');
		$themeSuffix = $hasMultiple ? str_pad((string)$themeId, 2, '0', STR_PAD_LEFT) : '00';
		$suffix = $isSwitch ? '00' : $themeSuffix;
		$ciImageSrc = '/common/assets/images/configimages/config_' . $typePrefix . $suffix . '.png';
	}
}

$isSolved = false;
$outlineId = (int)($exerciseMetaArr['outline_id'] ?? 0);
if ($outlineId > 0) {
	$isSolved = $exerciseRuntimeRepo->hasSolvedState($accessId, $teamNo, $outlineId)
		|| (int)($actionRow['current_state'] ?? 0) === 99
		|| (int)($actionRow['next_state'] ?? 0) === 99;
}

// Release session lock early (critical for parallel AJAX)
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
	'page'     => 'action',
	'specific' => null,
]);
\App\Context\require_context($pageContext);

// ------------------------------------------------------------
// 7) Assets + page key
// ------------------------------------------------------------
$assets = \App\Context\resolve_assets($pageContext);
$assets['libs']['lottie'] = true;
$assets['css'][] = '/common/assets/css/features/problem/action.css';

$ctxKey = \App\Context\ctx_key($pageContext);
$_SERVER['APP_PAGE_KEY'] = $ctxKey;

$pageScript = "/common/assets/js/pages/{$ctxKey}.js";

// ------------------------------------------------------------
// 8) Page class
// ------------------------------------------------------------
require_once INSTALL_ROOT . 'App/Pages/Contracts/PageInterface.php';
require_once INSTALL_ROOT . 'App/Pages/BasePage.php';
require_once INSTALL_ROOT . 'App/Pages/Training/Instructor/ProblemActionPage.php';

$pageObj = new \App\Pages\Training\Instructor\ProblemActionPage();

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
		'ACTION_META' => [
			'ci_id' => $ciId,
			'action_id' => $actionId,
			'outcome_id' => $outcomeId,
			'action_name' => $actionName,
			'outcome_text' => $outcomeText,
			'performing_term' => $performingTerm,
			'image_src' => $ciImageSrc,
			'lottie_src' => '/common/assets/lottie/48.json',
			'is_solved' => $isSolved,
		],
	]),
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
?>
</script>

<?php
include INSTALL_ROOT . 'App/View/Layout/footer.php';
