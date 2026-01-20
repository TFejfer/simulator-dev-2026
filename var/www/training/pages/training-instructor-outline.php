<?php
declare(strict_types=1);

/**
 * /var/www/training/pages/training-instructor-outline.php
 *
 * Thin page entrypoint.
 */

define('INSTALL_ROOT', '/var/www/');

require_once INSTALL_ROOT . 'App/bootstrap.php';

// Require authenticated session
$uid  = $_SESSION['user_id'] ?? null;
$meta = $_SESSION['delivery_meta'] ?? null;

if (empty($uid) || !is_array($meta) || empty($_SESSION['session_token'])) {
	header('Location: /login');
	exit;
}

// Debug helper (?debug=1)
require_once INSTALL_ROOT . 'Engine/Support/Debug.php';
\Engine\Support\Debug::enableIfRequested();

// Context helpers
require_once INSTALL_ROOT . 'App/Context/context.php';
require_once INSTALL_ROOT . 'App/Context/requirements.php';
require_once INSTALL_ROOT . 'App/Context/assets.php';

// Page context
$pageContext = \App\Context\normalize_context([
	'site'     => 'training',
	'pace'     => 'instructor',
	'skill'    => null,
	'template' => null,
	'page'     => 'outline',
	'specific' => null,
]);
\App\Context\require_context($pageContext);

// Assets + page key
$assets = \App\Context\resolve_assets($pageContext);
// Page specific js script
$assets['js'][] = '/common/assets/js/features/outline/outline-ui.js';
$assets['js'][] = '/common/assets/js/features/outline/outline-status.js';
$assets['js'][] = '/common/assets/js/polling/consumers/consumer.outline.js';

$ctxKey = \App\Context\ctx_key($pageContext); // expected: training-instructor-outline
$_SERVER['APP_PAGE_KEY'] = $ctxKey;

$pageScript = "/common/assets/js/pages/{$ctxKey}.js";

// Page class
require_once INSTALL_ROOT . 'App/Pages/Contracts/PageInterface.php';
require_once INSTALL_ROOT . 'App/Pages/BasePage.php';
require_once INSTALL_ROOT . 'App/Pages/Training/Instructor/OutlinePage.php';

$pageObj = new \App\Pages\Training\Instructor\OutlinePage();

// Render
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
echo json_encode([
	'DEBUG'   => !empty($_GET['debug']),
	'CTX_KEY' => $ctxKey,
	'DATA'    => $pageObj->getPageData(),
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
?>
</script>
<?php
include INSTALL_ROOT . 'App/View/Layout/footer.php';