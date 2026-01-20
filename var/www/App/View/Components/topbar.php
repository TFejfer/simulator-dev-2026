<?php
declare(strict_types=1);

/**
 * Topbar component.
 *
 * Inputs (via $vm array):
 * - home_html (string) HTML for the home area icon/logo
 * - show_logout (bool) whether to render the logout icon
 */

$homeHtml = (string)($vm['home_html'] ?? '<i class="fa-regular fa-house"></i>');
$showLogout = !empty($vm['show_logout']);
?>
<div id="topBar">
	<div class="topbar-grid">
		<div id="topBarHome">
			<div class="icon-container"><?php echo $homeHtml; ?></div>
		</div>
		<div id="topBarArea1"></div>
		<div id="topBarArea2"></div>
		<div id="topBarArea3" class="capitalize-all"></div>
		<div id="topBarArea4"></div>
		<div id="topBarArea5"></div>
		<div id="topBarArea6">
			<?php if ($showLogout): ?>
				<div id="logoutSim" class="icon-center clickable">
					<i class="fa-regular fa-arrow-right-from-bracket"></i>
				</div>
			<?php endif; ?>
		</div>
	</div>
</div>