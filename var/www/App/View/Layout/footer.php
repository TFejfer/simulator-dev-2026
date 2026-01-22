<?php
declare(strict_types=1);

if (!defined('INSTALL_ROOT')) define('INSTALL_ROOT', '/var/www/');

/**
 * /var/www/App/View/Layout/footer.php
 *
 * New standalone footer (no legacy helpers).
 * Expects these variables to exist in scope (set by header.php / entrypoint):
 * - $nonce
 * - $customScriptArr
 * - $pageScript
 */

$h = static fn(string $s): string => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');

$asset = static function (string $webPath): string {
    // Map web path -> disk path under /var/www
    $disk = INSTALL_ROOT . ltrim($webPath, '/'); // kræver INSTALL_ROOT = '/var/www/'
    $v = @filemtime($disk);
    if (!$v) {
        return $webPath; // fail-safe: ingen versionering hvis fil ikke findes
    }
    $sep = (str_contains($webPath, '?')) ? '&' : '?';
    return $webPath . $sep . 'v=' . $v;
};

$js = static function (string $src, bool $defer, string $nonce) use ($h, $asset): string {
    $d = $defer ? ' defer' : '';
    $src = $asset($src);
    return '<script' . $d . ' src="' . $h($src) . '" nonce="' . $h($nonce) . '"></script>' . "\n";
};

// Ensure arrays exist even if caller forgot
$customScriptArr = isset($customScriptArr) && is_array($customScriptArr) ? $customScriptArr : [];
$pageScript = isset($pageScript) && is_string($pageScript) ? $pageScript : '';

echo "\n<!-- App footer scripts -->\n";

// -------------------------------------------------
// Core JS (load early)
// -------------------------------------------------
if (!empty($customScriptArr['simulator'])) {
    echo $js('/common/assets/js/simulator.js', true, $nonce);
    echo $js('/common/assets/js/simulator-terms.js', true, $nonce);
    echo $js('/common/assets/js/core/simulator-cache.js', true, $nonce);
    echo $js('/common/assets/js/core/simulator-ajax.js', true, $nonce);
    echo $js('/common/assets/js/core/simulator-page.js', true, $nonce);

    echo $js('/common/assets/js/core/topbar/page-title-resolver.js', true, $nonce);
    echo $js('/common/assets/js/core/topbar/topbar-widgets.js', true, $nonce);
    echo $js('/common/assets/js/core/topbar/topbar-rules.js', true, $nonce);
    echo $js('/common/assets/js/core/topbar/topbar-timer.js', true, $nonce);
    echo $js('/common/assets/js/core/topbar/topbar-engine.js', true, $nonce);
    echo $js('/common/assets/js/core/topbar/topbar-exercise-hooks.js', true, $nonce);

    echo $js('/common/assets/js/core/menubar/menubar-render.js', true, $nonce);
    echo $js('/common/assets/js/core/menubar/menubar-rules.js', true, $nonce);
    echo $js('/common/assets/js/core/menubar/menubar-bind.js', true, $nonce);
    echo $js('/common/assets/js/core/menubar/menubar-engine.js', true, $nonce);

    echo $js('/common/assets/js/simulator-confirm.js', true, $nonce);
}

// Optional: polling (only when enabled)
if (!empty($customScriptArr['simulator-polling'])) {
    
    echo $js('/common/assets/js/core/polling-debug.js', true, $nonce);
    echo $js('/common/assets/js/core/polling-helpers.js', true, $nonce);
    echo $js('/common/assets/js/core/polling.js', true, $nonce);

    echo $js('/common/assets/js/polling/polling.events.js', true, $nonce);

    echo $js('/common/assets/js/polling/protocol/protocol.training-instructor.js', true, $nonce);
    echo $js('/common/assets/js/polling/polling.routes.js', true, $nonce);

    echo $js('/common/assets/js/polling/consumers/consumer.shared.js', true, $nonce);
    echo $js('/common/assets/js/polling/consumers/consumer.outline.js', true, $nonce);
    //echo $js('/common/assets/js/polling/consumers/consumer.problem.js', true, $nonce);
    //echo $js('/common/assets/js/polling/consumers/consumer.risk.js', true, $nonce);
    //echo $js('/common/assets/js/polling/consumers/consumer.rca.js', true, $nonce);

    echo $js('/common/assets/js/polling/polling.solutions.js', true, $nonce);
    echo $js('/common/assets/js/polling/polling-start.js', true, $nonce);
}

// -------------------------------------------------
// Pace modules
// -------------------------------------------------
if (!empty($customScriptArr['instructor-paced'])) {
    echo $js('/common/assets/js/instructor-paced.js', true, $nonce);
}

if (!empty($customScriptArr['league'])) {
    echo $js('/common/assets/js/league.js', true, $nonce);
}

// -------------------------------------------------
// Skill: Problem
// -------------------------------------------------
if (!empty($customScriptArr['problem-common'])) {
    echo $js('/common/assets/js/problem-common.js', true, $nonce);
}
if (!empty($customScriptArr['problem-information-sources'])) {
    echo $js('/common/assets/js/problem-information-sources.js', true, $nonce);
}
if (!empty($customScriptArr['problem-introduction'])) {
    echo $js('/common/assets/js/problem-introduction.js', true, $nonce);
}
if (!empty($customScriptArr['problem-forms'])) {
    echo $js('/common/assets/js/problem-forms.js', true, $nonce);
}
if (!empty($customScriptArr['problem-result'])) {
    echo $js('/common/assets/js/problem-result.js', true, $nonce);
}
if (!empty($customScriptArr['problem-result-chart'])) {
    echo $js('/common/assets/js/problem-result-chart.js', true, $nonce);
}

// -------------------------------------------------
// Skill: Risk
// -------------------------------------------------
if (!empty($customScriptArr['risk'])) {
    echo $js('/common/assets/js/risk.js', true, $nonce);
}

// -------------------------------------------------
// Skill: RCA
// -------------------------------------------------
if (!empty($customScriptArr['rca'])) {
    echo $js('/common/assets/js/rca.js', true, $nonce);
}

// -------------------------------------------------
// Template: Kepner-Tregoe
// -------------------------------------------------
if (!empty($customScriptArr['kepner-tregoe'])) {
    echo $js('/common/assets/js/kepner-tregoe.js', true, $nonce);
}

// -------------------------------------------------
// Central base + dashboards
// -------------------------------------------------
if (!empty($customScriptArr['central'])) {
    echo $js('/common/assets/js/central.js', true, $nonce);
}

if (!empty($customScriptArr['instr-dashboard'])) {
    echo $js('/common/assets/js/instr-dashboard.js', true, $nonce);
}
if (!empty($customScriptArr['problem-instr-dashboard'])) {
    echo $js('/common/assets/js/problem-instr-dashboard.js', true, $nonce);
}
if (!empty($customScriptArr['risk-instr-dashboard'])) {
    echo $js('/common/assets/js/risk-instr-dashboard.js', true, $nonce);
}
if (!empty($customScriptArr['rca-instr-dashboard'])) {
    echo $js('/common/assets/js/rca-instr-dashboard.js', true, $nonce);
}
if (!empty($customScriptArr['kt-instr-dashboard'])) {
    echo $js('/common/assets/js/kt-instr-dashboard.js', true, $nonce);
}

// -------------------------------------------------
// Animations
// -------------------------------------------------
if (!empty($customScriptArr['lottie'])) {
    echo $js('/common/assets/js/lottie.js', true, $nonce);
}

// -------------------------------------------------
// Page-specific JS assets (load before page entrypoint)
// -------------------------------------------------
$assetsJs = $view['assets']['js'] ?? [];
if (is_array($assetsJs)) {
	foreach ($assetsJs as $src) {
		if (!is_string($src) || $src === '') continue;

		// Avoid double-loading the page entrypoint if someone added it to assets by mistake
		if ($pageScript !== '' && $src === $pageScript) continue;

		echo $js($src, true, $nonce);
	}
}

// -------------------------------------------------
// Page entrypoint (load last)
// -------------------------------------------------
if ($pageScript !== '') {
    echo $js($pageScript, true, $nonce);
}

?>
</body>
</html>