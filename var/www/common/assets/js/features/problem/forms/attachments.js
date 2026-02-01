/* attachments.js
 *
 * Problem > Attachments (separate form, rendered below Facts).
 *
 * UI parity with legacy facts-attachment block:
 * - Paperclip icon (insert/view)
 * - Filename link (insert/view)
 * - Delete x (only when editable)
 * - Insert modal + View modal (existing templates)
 *
 * Visibility mode (case.visibility.attachment):
 * 0 hidden
 * 1 enabled (editable)
 * 2 limited (visible, no actions)
 * 3 disabled (visible, locked)
 *
 * Endpoints (new structure):
 * - POST /ajax/problem/attachments/read.php
 * - POST /ajax/problem/attachments/delete.php
 * - POST /ajax/problem/attachments/upload.php (multipart)
 */

/* global $, simulatorShowConfirm, showSimulatorModal, hideSimulatorModal, simulatorAjaxRequest */

(() => {
	'use strict';

	const FORM_KEY = 'attachments';
	const CONTAINER = `#display_${FORM_KEY}`;

	// ---------------------------------
	// Term helpers (SIM_SHARED maps)
	// ---------------------------------
	const tMap = (bucket, id, fallback = '') => {
		const src = window.SIM_SHARED?.[bucket];
		if (!src || typeof src !== 'object') return fallback;
		const v = src[String(id)];
		return (typeof v === 'string' && v !== '') ? v : fallback;
	};

	const Common = (id, fallback = '') => tMap('common_terms', id, fallback);

	// ---------------------------------
	// Store helpers
	// ---------------------------------
	const getMode = (store) => store.get().case?.visibility?.attachment ?? 0;
	const editable = (mode) => mode === 1;

	const getAttachment = (store) => {
		const a = store.get().case?.attachments;
		return (a && typeof a === 'object')
			? a
			: { id: 0, file_name: null };
	};

	const setAttachmentMeta = (store, id, fileName) => {
		store.get().case.attachments = store.get().case.attachments || {};
		store.get().case.attachments.id = id || 0;
		store.get().case.attachments.file_name = fileName || null;
	};

	// ---------------------------------
	// Render (small block shown under facts)
	// ---------------------------------
	const render = (store) => {
		const mode = getMode(store);

		if (mode === 0) {
			$(CONTAINER).empty();
			return;
		}

		const canEdit = editable(mode);
		const a = getAttachment(store);
		const hasFile = !!a.file_name;

		const clipClass = canEdit ? 'insert-attachment' : 'view-attachment';
		const nameClass = (canEdit && !hasFile) ? 'insert-attachment' : 'view-attachment link-text';

		const deleteHtml = (canEdit && hasFile)
			? `<span class="link-text delete-attachment">&times;</span>`
			: '';

		$(CONTAINER).html(`
			<div class="grid-attachment-link">
				<div id="attachmentClip" class="link-text ${clipClass}">
					<i class="fa-regular fa-paperclip"></i>
				</div>
				<div id="attachmentFileName" class="${nameClass}" data-id="${a.id || 0}">
					${hasFile ? a.file_name : ''}
				</div>
				<div id="attachmentDelete">${deleteHtml}</div>
				<div></div>
			</div>
		`);
	};

	// ---------------------------------
	// API helpers
	// ---------------------------------
	const readAttachmentFile = async (store, scope, id) => {
		const res = await simulatorAjaxRequest(
			'/ajax/problem/attachments/read.php',
			'POST',
			{ ...scope, id }
		);

		return res;
	};

	const deleteAttachment = async (store, scope) => {
		const res = await simulatorAjaxRequest(
			'/ajax/problem/attachments/delete.php',
			'POST',
			{ ...scope }
		);

		return res;
	};

	const uploadAttachment = async (store, scope, formEl) => {
		const formData = new FormData(formEl);

		// append scope fields (server uses session for access_id/team_no)
		formData.append('outline_id', String(scope.outline_id || 0));
		formData.append('exercise_no', String(scope.exercise_no || 0));

		const res = await simulatorAjaxRequest(
			'/ajax/problem/attachments/upload.php',
			'POST',
			formData
		);

		return res;
	};

	// ---------------------------------
	// Validation (legacy rules)
	// ---------------------------------
	const validateFile = (fileInput) => {
		const fileName = fileInput.val();
		if (!fileName) return { ok: false, termId: 427 };

		const ext = fileName.split('.').pop().toLowerCase();
		if (!['gif', 'png', 'jpg', 'jpeg'].includes(ext)) return { ok: false, termId: 428 };

		const size = fileInput[0]?.files?.[0]?.size || 0;
		if (size > 5242880) return { ok: false, termId: 429 };

		return { ok: true, termId: 0 };
	};

	// ---------------------------------
	// Events
	// ---------------------------------
	const bind = ({ store, scope }) => {
		// Open insert modal
		$(document).on('click', '.insert-attachment', () => {
			if (!editable(getMode(store))) return;

			// Set modal text (existing DOM ids from your templates)
			$('#simulator_modal_attachment_insert_title').text(Common(301, 'Attachment'));
			$('#attachmentLimitation').text(Common(299, 'Limitations'));
			$('#attachmentSelectImage').text(Common(300, 'Select image'));
			$('#insertAttachment').text(Common(301, 'Insert'));

			showSimulatorModal('simulator_modal_attachment_insert');
			$('#attachmentForm')[0]?.reset?.();
		});

		// Open view modal
		$(document).on('click', '.view-attachment', async function () {
			const id = parseInt(String($(this).attr('data-id') || $('#attachmentFileName').attr('data-id') || '0'), 10) || 0;
			if (!id) return;

			showSimulatorModal('simulator_modal_attachment_view');
			$('#display_simulator_attachment').text('loading...');

			try {
				const res = await readAttachmentFile(store, scope, id);
				if (!res?.ok) throw new Error('Read failed');

				// Expect: { ok:true, data:{ id, file_name, file_html } }
				const d = res.data || {};
				$('#display_simulator_attachment').html(d.file_html || '');
			} catch (err) {
				console.warn('[attachments] read failed', err);
				$('#display_simulator_attachment').text('Error');
				simulatorShowConfirm({
					title: Common(214, 'Notice'),
					content: Common(428, 'Unable to load attachment'),
					backgroundDismiss: true
				});
			}
		});

		// Delete attachment
		$(document).on('click', '.delete-attachment', () => {
			if (!editable(getMode(store))) return;

			simulatorShowConfirm({
				title: Common(214, 'Confirm'),
				content: Common(158, 'Delete?'),
				backgroundDismiss: true,
				closeIcon: false,
				buttons: {
					ok: {
						text: Common(223, 'OK'),
						action: async () => {
							const prev = { ...getAttachment(store) };

							try {
								const res = await deleteAttachment(store, scope);
								if (!res?.ok) throw new Error('Delete failed');

								setAttachmentMeta(store, 0, null);
								render(store);
								$('#display_simulator_attachment').empty();
							} catch (err) {
								console.warn('[attachments] delete failed', err);
								setAttachmentMeta(store, prev.id, prev.file_name);
								render(store);
								simulatorShowConfirm({
									title: Common(214, 'Notice'),
									content: Common(428, 'Unable to delete attachment'),
									backgroundDismiss: true
								});
							}
						}
					},
					cancel: {
						text: Common(206, 'Cancel'),
						btnClass: 'btn-blue'
					}
				}
			});
		});

		// Upload submit
		$(document).on('submit', '#attachmentForm', async function (e) {
			e.preventDefault();
			if (!editable(getMode(store))) return;

			const fileInput = $('#image');
			const v = validateFile(fileInput);

			if (!v.ok) {
				simulatorShowConfirm({
					title: Common(214, 'Notice'),
					content: Common(v.termId, 'Invalid file'),
					backgroundDismiss: true
				});
				return;
			}

			const $submit = $('#insertAttachment');
			$submit.prop('disabled', true);

			let res;
			try {
				res = await uploadAttachment(store, scope, this);
				if (!res?.ok) throw new Error('Upload failed');

				// Expect: { ok:true, data:{ id, file_name } }
				const d = res.data || {};
				setAttachmentMeta(store, parseInt(d.id || 0, 10) || 0, d.file_name || null);
				render(store);
				$('#attachmentForm')[0]?.reset?.();
				hideSimulatorModal('simulator_modal_attachment_insert');
			} catch (err) {
				console.warn('[attachments] upload failed', err || res);
				simulatorShowConfirm({
					title: Common(214, 'Notice'),
					content: Common(428, 'Unable to upload attachment'),
					backgroundDismiss: true
				});
			} finally {
				$submit.prop('disabled', false);
			}
		});
	};

	// Expose and register
	window.ProblemFormAttachments = { render, bind };
	window.ProblemFormsRegistry.register({ key: FORM_KEY, render, bind });
})();