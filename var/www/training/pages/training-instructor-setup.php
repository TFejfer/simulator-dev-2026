<?php
declare(strict_types=1);

/**
 * /var/www/training/pages/training-instructor-setup.php
 *
 * Thin page entrypoint:
 * - Loads unified bootstrap
 * - Loads App context helpers (normalize_context, require_context, resolve_assets, ctx_key)
 * - Resolves assets and page script
 * - Instantiates the page controller
 * - Renders App layout wrappers
 * - Exposes page-data JSON to the page script
 */

define('INSTALL_ROOT', '/var/www/');

require_once INSTALL_ROOT . 'App/bootstrap.php';

// Require authenticated session for setup page
$uid  = $_SESSION['user_id'] ?? null;
$meta = $_SESSION['delivery_meta'] ?? null;

if (empty($uid) || !is_array($meta) || empty($_SESSION['session_token'])) {
	header('Location: /login');
	exit;
}

// Debug helper (shows exceptions on-screen when ?debug=1)
require_once INSTALL_ROOT . 'Engine/Support/Debug.php';
\Engine\Support\Debug::enableIfRequested();

// App context helpers (do NOT rely on legacy bootstrap_min.php)
require_once INSTALL_ROOT . 'App/Context/context.php';
require_once INSTALL_ROOT . 'App/Context/requirements.php';
require_once INSTALL_ROOT . 'App/Context/assets.php';

// -------------------------------------------------
// Page context
// -------------------------------------------------
$pageContext = \App\Context\normalize_context([
	'site'     => 'training',
	'pace'     => 'instructor',
	'skill'    => null,
	'template' => null,
	'page'     => 'setup',
	'specific' => null,
]);

\App\Context\require_context($pageContext);

// -------------------------------------------------
// Assets
// -------------------------------------------------
$assets = \App\Context\resolve_assets($pageContext);

$ctxKey     = \App\Context\ctx_key($pageContext); // expected: training-instructor-setup
$_SERVER['APP_PAGE_KEY'] = $ctxKey;

$pageScript = "/common/assets/js/pages/{$ctxKey}.js";

// -------------------------------------------------
// Page class
// -------------------------------------------------
require_once INSTALL_ROOT . 'App/Pages/Contracts/PageInterface.php';
require_once INSTALL_ROOT . 'App/Pages/BasePage.php';
require_once INSTALL_ROOT . 'App/Pages/Training/Instructor/SetupPage.php';

$pageObj = new \App\Pages\Training\Instructor\SetupPage();

// -------------------------------------------------
// Render
// -------------------------------------------------
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
