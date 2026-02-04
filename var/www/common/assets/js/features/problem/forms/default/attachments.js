/* /common/assets/js/features/problem/forms/default/attachments.js
 *
 * Problem > Attachments (separate form, rendered below Facts).
 *
 * UI parity with legacy facts-attachment block:
 * - Paperclip icon (insert/view)
 * - Filename link (insert/view)
 * - Delete x (only when editable)
 * - Insert modal + View modal (existing templates)
 *
 * Optimal module contract:
 * - export default { render(store, view), bind(ctx, view) }
 * - view.root_id: container selector (e.g. '#display_attachments')
 * - view.mode: numeric mode (1 enabled, 2 limited, 3 disabled)
 *
 * Endpoints (new structure):
 * - POST /ajax/problem/attachments/read.php
 * - POST /ajax/problem/attachments/delete.php
 * - POST /ajax/problem/attachments/upload.php (multipart)
 *
 * Notes:
 * - This module does NOT self-register. Registration happens in the template bundle.
 * - Event handlers are delegated and namespaced to avoid duplicate bindings.
 */

/* global $, simulatorShowConfirm, showSimulatorModal, hideSimulatorModal, simulatorAjaxRequest */

const AttachmentsForm = (() => {
	'use strict';

	const H = window.ProblemFormsHelpers;

	const FORM_KEY = 'attachments';
	const EVENT_NS = '.problem_attachments';

	// ---------------------------------
	// Term helpers (SIM_SHARED maps)
	// ---------------------------------
	const Common = (id, fallback = '') => H.tMap('common_terms', id, fallback);

	// ---------------------------------
	// Store helpers
	// ---------------------------------
	const getAttachment = (store) => {
		const a = store.get().case?.attachments;
		return (a && typeof a === 'object')
			? a
			: { id: 0, file_name: null };
	};

	const setAttachmentMeta = (store, id, fileName) => {
		store.get().case.attachments = store.get().case.attachments || {};
		store.get().case.attachments.id = parseInt(String(id || 0), 10) || 0;
		store.get().case.attachments.file_name = fileName ? String(fileName) : null;
	};

	/**
	 * Resolve endpoint scope (outline_id/exercise_no/theme_id/scenario_id).
	 * Uses ctx.scope first, with store meta as fallback.
	 */
	const resolveScope = (store, scope) => {
		const meta = store?.get?.().meta || {};
		const metaExercise = meta.exercise || {};

		return {
			outline_id: Number(scope?.outline_id ?? meta.outline_id ?? metaExercise.outline_id ?? 0),
			exercise_no: Number(scope?.exercise_no ?? meta.exercise_no ?? metaExercise.exercise_no ?? 0),
			theme_id: Number(scope?.theme_id ?? meta.theme_id ?? metaExercise.theme_id ?? 0),
			scenario_id: Number(scope?.scenario_id ?? meta.scenario_id ?? metaExercise.scenario_id ?? 0)
		};
	};

	// ---------------------------------
	// API helpers
	// ---------------------------------
	const readAttachmentFile = async (scope, id) => {
		return simulatorAjaxRequest(
			'/ajax/problem/attachments/read.php',
			'POST',
			{ ...scope, id }
		);
	};

	const deleteAttachment = async (scope) => {
		return simulatorAjaxRequest(
			'/ajax/problem/attachments/delete.php',
			'POST',
			{ ...scope }
		);
	};

	const uploadAttachment = async (scope, formEl) => {
		const formData = new FormData(formEl);

		// Append scope fields (server uses session for access_id/team_no)
		formData.append('outline_id', String(scope.outline_id || 0));
		formData.append('exercise_no', String(scope.exercise_no || 0));

		return simulatorAjaxRequest(
			'/ajax/problem/attachments/upload.php',
			'POST',
			formData
		);
	};

	// ---------------------------------
	// Validation (legacy rules)
	// ---------------------------------
	const validateFile = (fileInput) => {
		const fileName = String(fileInput.val() || '');
		if (!fileName) return { ok: false, termId: 427 };

		const ext = fileName.split('.').pop().toLowerCase();
		if (!['gif', 'png', 'jpg', 'jpeg'].includes(ext)) return { ok: false, termId: 428 };

		const size = fileInput[0]?.files?.[0]?.size || 0;
		if (size > 5242880) return { ok: false, termId: 429 };

		return { ok: true, termId: 0 };
	};

	// ---------------------------------
	// Render (small block shown under facts)
	// ---------------------------------
	const render = (store, view) => {
		const mode = Number(view?.mode ?? 0);
		const rootId = String(view?.root_id || `#display_${FORM_KEY}`);

		if (!H.isVisible(mode)) {
			$(rootId).empty();
			return;
		}

		const canEdit = H.isEditable(mode);
		const a = getAttachment(store);
		const hasFile = !!a.file_name;

		// Decide which action class is active
		const clipClass = canEdit ? 'insert-attachment' : 'view-attachment';
		const nameClass = (canEdit && !hasFile) ? 'insert-attachment' : 'view-attachment link-text';

		const deleteHtml = (canEdit && hasFile)
			? `<span class="link-text delete-attachment">&times;</span>`
			: '';

		$(rootId).html(`
			<div class="grid-attachment-link">
				<div class="link-text ${clipClass}">
					<i class="fa-regular fa-paperclip"></i>
				</div>
				<div class="${nameClass}" data-id="${a.id || 0}">
					${hasFile ? H.esc(a.file_name) : ''}
				</div>
				<div>${deleteHtml}</div>
				<div></div>
			</div>
		`);
	};

	// ---------------------------------
	// Bind (idempotent, plan-driven)
	// ---------------------------------
	const bind = (ctx, view) => {
		const store = ctx.store;
		const scope = resolveScope(store, ctx.scope);

		const mode = Number(view?.mode ?? 0);
		if (!H.isEditable(mode) && mode !== 2 && mode !== 3) {
			// Hidden or invalid: nothing to bind
			return;
		}

		// Prevent duplicate bindings across rebinds.
		$(document).off(EVENT_NS);

		// Open insert modal (editable only)
		$(document).on(`click${EVENT_NS}`, '#display_attachments .insert-attachment', () => {
			if (!H.isEditable(mode)) return;

			// Set modal text (existing DOM ids from your templates)
			$('#simulator_modal_attachment_insert_title').text(Common(301, 'Attachment'));
			$('#attachmentLimitation').text(Common(299, 'Limitations'));
			$('#attachmentSelectImage').text(Common(300, 'Select image'));
			$('#insertAttachment').text(Common(301, 'Insert'));

			showSimulatorModal('simulator_modal_attachment_insert');
			$('#attachmentForm')[0]?.reset?.();
		});

		// Open view modal (view or editable)
		$(document).on(`click${EVENT_NS}`, '#display_attachments .view-attachment', async function () {
			const id = parseInt(String($(this).attr('data-id') || '0'), 10) || 0;
			if (!id) return;

			showSimulatorModal('simulator_modal_attachment_view');
			$('#display_simulator_attachment').text('loading...');

			const res = await readAttachmentFile(scope, id);
			if (!res?.ok) {
				$('#display_simulator_attachment').text('Error');
				simulatorShowConfirm({
					title: Common(214, 'Notice'),
					content: Common(428, 'Unable to load attachment'),
					backgroundDismiss: true
				});
				return;
			}

			// Expect: { ok:true, data:{ id, file_name, file_html } }
			const d = res.data || {};
			$('#display_simulator_attachment').html(d.file_html || '');
		});

		// Delete attachment (editable only)
		$(document).on(`click${EVENT_NS}`, '#display_attachments .delete-attachment', () => {
			if (!H.isEditable(mode)) return;

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

							const res = await H.safeWrite(
								store,
								() => deleteAttachment(scope),
								Common(428, 'Unable to delete attachment')
							);

							// On failure, safeWrite already showed feedback and rolled back plan.
							if (!res) {
								setAttachmentMeta(store, prev.id, prev.file_name);
								return;
							}

							setAttachmentMeta(store, 0, null);
							$('#display_simulator_attachment').empty();
							H.renderPlan(store);
						}
					},
					cancel: {
						text: Common(206, 'Cancel'),
						btnClass: 'btn-blue'
					}
				}
			});
		});

		// Upload submit (editable only)
		$(document).on(`submit${EVENT_NS}`, '#attachmentForm', async function (e) {
			e.preventDefault();
			if (!H.isEditable(mode)) return;

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

			const res = await H.safeWrite(
				store,
				() => uploadAttachment(scope, this),
				Common(428, 'Unable to upload attachment')
			);

			if (res) {
				// Expect: { ok:true, data:{ id, file_name } }
				const d = res.data || {};
				setAttachmentMeta(store, parseInt(d.id || 0, 10) || 0, d.file_name || null);

				$('#attachmentForm')[0]?.reset?.();
				hideSimulatorModal('simulator_modal_attachment_insert');

				H.renderPlan(store);
			}

			$submit.prop('disabled', false);
		});
	};

	return { render, bind };
})();

export default AttachmentsForm;