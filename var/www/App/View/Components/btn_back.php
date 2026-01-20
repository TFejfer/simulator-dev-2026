<?php
declare(strict_types=1);

/**
 * Back button component.
 *
 * Inputs (via $vm array):
 * - status (string) required
 *
 * If status is missing, nothing is rendered.
 */

$status = isset($vm['status']) ? (string)$vm['status'] : '';
if ($status === '') {
	return;
}
?>
<div id="btn_back" class="back-button back-button-<?php echo htmlspecialchars($status, ENT_QUOTES); ?>">
	<div class="icon-center">
		<i class="fa-light fa-arrow-left"></i>
	</div>
</div>