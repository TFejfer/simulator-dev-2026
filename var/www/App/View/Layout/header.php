<?php
declare(strict_types=1);

/**
 * /var/www/App/View/Layout/header.php
 *
 * New standalone header (no legacy helpers).
 * Inputs (optional):
 *   $view = [
 *     'assets'     => ['libs'=>[...], 'modules'=>[...]],
 *     'pageScript' => '/common/assets/js/pages/xxx.js',
 *     'ctxKey'     => 'training-instructor-setup',
 *   ];
 */

if (!defined('INSTALL_ROOT')) define('INSTALL_ROOT', '/var/www/');

$assets     = $view['assets']     ?? ['libs' => [], 'modules' => []];
$pageScript = $view['pageScript'] ?? '';
$ctxKey     = $view['ctxKey']     ?? '';

$libScriptArr    = is_array($assets['libs'] ?? null) ? $assets['libs'] : [];
$customScriptArr = is_array($assets['modules'] ?? null) ? $assets['modules'] : [];

// Content Security Policy nonce
$nonce = base64_encode(random_bytes(16));

header(
    "Content-Security-Policy: " .
    "default-src 'self'; " .
    "img-src 'self' data:; " .
    "script-src 'self' 'nonce-$nonce' https://code.jquery.com https://www.gstatic.com; " .
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " .
    "font-src 'self' https://fonts.gstatic.com data:;"
);

// Helper: safe HTML output
$h = static fn(string $s): string => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');

/**
 * Cache-bust local assets by appending ?v=<filemtime>.
 * - Only versions local absolute web paths like "/common/assets/.."
 * - Leaves external URLs untouched.
 */
$asset = static function (string $webPath): string {
    if ($webPath === '' || $webPath[0] !== '/') {
        return $webPath; // external or empty
    }

    $disk = INSTALL_ROOT . ltrim($webPath, '/');
    $v = @filemtime($disk);
    if (!$v) {
        return $webPath; // fail-safe: no version if file missing
    }

    $sep = (str_contains($webPath, '?')) ? '&' : '?';
    return $webPath . $sep . 'v=' . $v;
};

$css = static function (string $href) use ($h, $asset): string {
    $href = $asset($href);
    return '<link rel="stylesheet" href="' . $h($href) . '">' . "\n";
};

$js = static function (string $src, bool $defer, string $nonce) use ($h, $asset): string {
    $d = $defer ? ' defer' : '';
    $src = $asset($src);
    return '<script' . $d . ' src="' . $h($src) . '" nonce="' . $h($nonce) . '"></script>' . "\n";
};

?><!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Critical Thinking</title>

    <link rel="icon" type="image/png" href="/common/assets/images/favicon.png">

    <!-- Fonts (external: do NOT version) -->
    <link href="https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,300;0,400;0,600;0,700;0,800;1,300;1,400;1,600;1,700;1,800&display=swap" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,300;0,400;0,600;0,700;0,800;1,300;1,400;1,600;1,700;1,800&family=Poppins:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css?family=Roboto+Mono" rel="stylesheet">

    <style>
        body { -webkit-font-smoothing: antialiased; }
    </style>

<?php
// ------------------------------------------------------------------
// Core CSS + Module CSS (HEAD ONLY)
// ------------------------------------------------------------------

// Core (always)
echo $css('/common/assets/css/simulator.css');
echo $css('/common/assets/css/features/menubar/menubar.css');
echo $css('/common/assets/css/simulator-confirm.css');

// Pace
if (!empty($customScriptArr['instructor-paced'])) {
    echo $css('/common/assets/css/instructor-paced.css');
}
if (!empty($customScriptArr['league'])) {
    echo $css('/common/assets/css/league.css');
}

// Skill: Problem
if (!empty($customScriptArr['problem-common'])) {
    echo $css('/common/assets/css/problem-common.css');
}
if (!empty($customScriptArr['problem-information-sources'])) {
    echo $css('/common/assets/css/features/sidebar/sources/sources-shared.css');
    echo $css('/common/assets/css/features/sidebar/sources/inbox.css');
    echo $css('/common/assets/css/features/sidebar/sources/process.css');
    echo $css('/common/assets/css/features/sidebar/sources/maintenance.css');
    echo $css('/common/assets/css/features/sidebar/sources/performance.css');
    echo $css('/common/assets/css/features/sidebar/sources/system-log.css');
    echo $css('/common/assets/css/features/sidebar/sources/inspect-and-act.css');
}
if (!empty($customScriptArr['problem-introduction'])) {
    echo $css('/common/assets/css/problem-introduction.css');
}
if (!empty($customScriptArr['problem-forms'])) {
    echo $css('/common/assets/css/features/problem/forms/forms-shared.css');
    echo $css('/common/assets/css/features/problem/forms/symptoms.css');
    echo $css('/common/assets/css/features/problem/forms/facts.css');
    echo $css('/common/assets/css/features/problem/forms/causes.css');
    echo $css('/common/assets/css/features/problem/forms/actions.css');
}
if (!empty($customScriptArr['problem-result-chart'])) {
    echo $css('/common/assets/css/problem-result-chart.css');
}

// Skill: Risk
if (!empty($customScriptArr['risk'])) {
    echo $css('/common/assets/css/risk.css');
}

// Skill: RCA
if (!empty($customScriptArr['rca'])) {
    echo $css('/common/assets/css/rca.css');
}

// Template: Kepner-Tregoe
if (!empty($customScriptArr['kepner-tregoe'])) {
    echo $css('/common/assets/css/kepner-tregoe.css');
}

// Central
if (!empty($customScriptArr['central'])) {
    echo $css('/common/assets/css/central.css');
}

// Dashboards
if (!empty($customScriptArr['instr-dashboard'])) {
    echo $css('/common/assets/css/instr-dashboard.css');
}
if (!empty($customScriptArr['problem-instr-dashboard'])) {
    echo $css('/common/assets/css/problem-instr-dashboard.css');
}
if (!empty($customScriptArr['risk-instr-dashboard'])) {
    echo $css('/common/assets/css/risk-instr-dashboard.css');
}

// ------------------------------------------------------------------
// Default UI libs (most pages)
// ------------------------------------------------------------------

// jQuery core (non-deferred)
echo $js('/common/assets/lib/jquery-family/jquery/jquery.min.js', false, $nonce);

// DataTables
echo $css('/common/assets/lib/jquery-family/jquery-datatables/dataTables.dataTables.min.css');
echo $js('/common/assets/lib/jquery-family/jquery-datatables/dataTables.min.js', true, $nonce);

// jQuery Confirm
echo $css('/common/assets/lib/jquery-family/jquery-confirm/jquery-confirm.min.css');
echo $js('/common/assets/lib/jquery-family/jquery-confirm/jquery-confirm.min.js', true, $nonce);

// jQuery UI
echo $css('/common/assets/lib/jquery-family/jquery-ui/jquery-ui.css');
echo $js('/common/assets/lib/jquery-family/jquery-ui/jquery-ui.min.js', true, $nonce);

// Touch Punch (depends on jQuery UI)
echo $js('/common/assets/lib/jquery-family/jquery-ui-touch-punch/jquery.ui.touch-punch.min.js', true, $nonce);

// ------------------------------------------------------------------
// Font Awesome (default)
// ------------------------------------------------------------------
echo $css('/common/assets/lib/fontawesome/css/fontawesome.css');
echo $css('/common/assets/lib/fontawesome/css/light.css');
echo $css('/common/assets/lib/fontawesome/css/regular.css');
echo $css('/common/assets/lib/fontawesome/css/solid.css');
echo $css('/common/assets/lib/fontawesome/css/duotone.css');

// ------------------------------------------------------------------
// Optional libs (controlled by $libScriptArr)
// ------------------------------------------------------------------

// Chart.js
if (!empty($libScriptArr['chart'])) {
    echo $js('/common/assets/lib/chart/chart.js', true, $nonce);
    echo $js('/common/assets/lib/chart/chartjs-plugin-annotation.min.js', true, $nonce);
}

// Image rotator
if (!empty($libScriptArr['imagerotator'])) {
    echo $css('/common/assets/webrotate/imagerotator/html/css/round.css');
    echo $js('/common/assets/webrotate/imagerotator/html/js/imagerotator.js', true, $nonce);
}

// Flatpickr
if (!empty($libScriptArr['flatpickr'])) {
    echo $css('/common/assets/lib/flatpickr/flatpickr.min.css');
    echo $js('/common/assets/lib/flatpickr/flatpickr.min.js', true, $nonce);
}

// Popper + Tippy
if (!empty($libScriptArr['popper'])) {
    echo $js('/common/assets/lib/node_modules/@popperjs/core/dist/umd/popper.min.js', true, $nonce);
}
if (!empty($libScriptArr['tippy'])) {
    echo $js('/common/assets/lib/node_modules/tippy.js/dist/tippy-bundle.umd.min.js', true, $nonce);
}

// Lottie player
if (!empty($libScriptArr['lottie'])) {
    echo $js('/common/assets/lib/node_modules/@lottiefiles/lottie-player/dist/lottie-player.js', true, $nonce);
}
?>
</head>
<body data-ctx="<?php echo $h((string)$ctxKey); ?>">