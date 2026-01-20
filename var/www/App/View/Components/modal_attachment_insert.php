<?php
declare(strict_types=1);

/**
 * Attachment insert modal component.
 * No inputs required.
 */
?>
<div id="simulator_modal_attachment_insert" class="simulator-modal">
	<div class="simulator-modal-dialog">
		<div class="simulator-modal-content">
			<div class="simulator-modal-header">
				<h4 id="simulator_modal_attachment_insert_title" class="modal-title">Add image</h4>
				<button type="button" class="simulator-modal-close" data-dismiss="simulator-modal">×</button>
			</div>
			<div id="simulator_modal_attachment_insert_body" class="simulator-modal-body">
				<form id="attachmentForm" method="post" enctype="multipart/form-data">
					<p id="attachmentLimitation">You can attach one image of max 5 MB.</p>
					<p>
						<label id="attachmentSelectImage">Select image</label>
						<input type="file" name="image" id="image" />
					</p>
					<br />
					<button type="submit" id="insertAttachment" class="std-btn std-btn-enabled">Attach</button>
				</form>
			</div>
		</div>
	</div>
</div>