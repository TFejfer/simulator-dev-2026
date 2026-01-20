<?php
declare(strict_types=1);

/**
 * Assign button component.
 *
 * Inputs (via $vm array):
 * - status (string) required
 * - location (string) required
 *
 * If status or location is missing, nothing is rendered.
 */

$status = isset($vm['status']) ? (string)$vm['status'] : '';
$location = isset($vm['location']) ? (string)$vm['location'] : '';

if ($status === '' || $location === '') {
	return;
}
?>
<div id="btn_assign" class="proceed-button proceed-button-<?php echo htmlspecialchars($status, ENT_QUOTES); ?>" data-location="<?php echo htmlspecialchars($location, ENT_QUOTES); ?>">
	<div class="icon-center">
		<i class="fa-light fa-paper-plane"></i>
	</div>
</div>