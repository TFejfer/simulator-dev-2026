/* /common/assets/js/features/problem/forms/kt/symptoms.js
 *
 * KT > Symptoms/Clarify (clone of default symptoms module).
 *
 * Differences vs default:
 * - No deviation/function selects (KT form is simpler)
 * - Uses kt_terms bucket instead of problem_terms
 * - Uses clarify_text as the text field (DB column)
 *
 * Everything else (events, classes, safeWrite, renderPlan, priority, delete, etc.)
 * is intentionally identical to default to keep maintenance minimal.
 */

/* global $, simulatorShowConfirm, showSimulatorModal, hideSimulatorModal */

const SymptomsForm = (() => {
	'use strict';

	const H = window.ProblemFormsHelpers;

	const FORM_KEY = 'symptoms';
	const EVENT_NS = '.problem_symptoms'; // keep identical

	// ---------------------------------
	// Term helpers (SIM_SHARED maps)
	// ---------------------------------
	const Common = (id, fallback = '') => H.tMap('common_terms', id, fallback);
	const KT = (id, fallback = '') => H.tMap('kt_terms', id, fallback);

	// ---------------------------------
	// Store helpers
	// ---------------------------------
	const getSymptoms = (store) => {
		const arr = store.get().case?.symptoms;
		return Array.isArray(arr) ? arr : [];
	};

	// ---------------------------------
	// HTML helpers
	// ---------------------------------
	const buildSymptomText = (row) => {
		// KT uses clarify_text only (no deviation/function composition)
		return H.normalizeDbText(row?.clarify_text);
	};

	// KT modal: no selects, only clarify field (same classes as default where possible)
	const modalFormHtml = (id) => {
		return `
			<div class="grid-symptom-edit">
				<div class="symptom-label1 form-explain">${KT(99, 'Separate and clarify')}</div>

				<fieldset class="case-field symptom-clarify">
					<legend class="case-label">${KT(102, 'Concern')}</legend>
					<div class="case-edit specification" data-id="${id}" contenteditable></div>
				</fieldset>
			</div>
		`;
	};

	const modalFooterHtml = (id) => {
		const delBtn = id !== 0
			? `<div class="delete-symptom clickable link-text" data-id="${id}"><i class="fa-solid fa-trash"></i></div>`
			: '';

		return `
			<div class="grid-buttons-modal">
				<div></div>
				<div>${delBtn}</div>
				<div class="std-btn std-btn-enabled upsert-symptom" data-id="${id}">${Common(287, 'Save')}</div>
			</div>
		`;
	};

	// ---------------------------------
	// Render
	// ---------------------------------
	const render = (store, view) => {
		const mode = Number(view?.mode ?? 0);
		const rootId = String(view?.root_id || `#display_${FORM_KEY}`);

		if (!H.isVisible(mode)) {
			$(rootId).empty();
			return;
		}

		const canEdit = H.isEditable(mode);
		const rows = getSymptoms(store);

		const elements = rows.length
			? rows.map((row) => {
				const id = row.id ?? 0;
				const isPrio = (parseInt(row.is_priority || 0, 10) || 0) > 0;
				const icon = isPrio ? 'fa-square-check' : 'fa-square';
				const text = buildSymptomText(row);

				// IMPORTANT: Keep classes identical to default:
				// - symptom-element / symptom-text / symptom-update-modal
				// - symptom-priority / symptom-priority-box
				return `
					<fieldset class="symptom-element ${canEdit ? 'case-field clickable symptom-update-modal' : 'case-field-readonly'}" data-id="${id}">
						<legend class="case-label">${KT(102, 'Concern')}</legend>
						<div class="symptom-text ${canEdit ? 'case-item-clickable' : 'case-item'}" data-id="${id}" contenteditable="false">${H.esc(text)}</div>
					</fieldset>

					<fieldset class="symptom-element ${canEdit ? 'case-field' : 'case-field-readonly'}" data-id="${id}">
						<legend class="case-label">${KT(3, 'Priority')}</legend>
						<div class="symptom-priority-inner ${canEdit ? 'symptom-priority clickable link-text' : ''}" data-id="${id}">
							<i class="symptom-priority-box fa-regular ${icon}"></i>
						</div>
					</fieldset>
				`;
			}).join('')
			: '';

		const addButton = (rows.length < 50 && canEdit)
			? `<div id="symptom_insert_modal" class="clickable link-text" data-id="0">${KT(37, 'Add concern')}</div>`
			: (rows.length >= 50 && canEdit)
				? `<span class="form-text-limit">Limit reached</span>`
				: '';

		// Header: keep same structural wrapper, but KT text.
		$(rootId).html(`
			<div class="form-step-header">${KT(99, 'Separate and clarify')}</div>
			
            <div class="grid-symptoms">
				${elements}
			</div>

			<div id="add_symptom_btn">
				${addButton}
			</div>
		`);
	};

	// ---------------------------------
	// Bind (idempotent, plan-driven)
	// ---------------------------------
	const bind = (ctx, view) => {
		const store = ctx.store;
		const scope = ctx.scope;

		const mode = Number(view?.mode ?? 0);
		if (!H.isEditable(mode)) return;

		// Ensure we do not duplicate handlers across rebinds.
		$(document).off(EVENT_NS);

		// Create
		$(document).on(`click${EVENT_NS}`, '#symptom_insert_modal', () => {
			$('#simulator_modal_title').html(KT(102, 'Concern'));
			$('#simulator_modal_body').html(modalFormHtml(0));
			$('#simulator_modal_footer').html(modalFooterHtml(0));
			showSimulatorModal('simulator_modal_common');
		});

		// Update modal
		$(document).on(`click${EVENT_NS}`, '.symptom-update-modal', function () {
			const id = parseInt(String($(this).attr('data-id') || '0'), 10);
			if (!id) return;

			const rows = getSymptoms(store);
			const row = rows.find((r) => (r.id ?? 0) === id);
			if (!row) return;

			$('#simulator_modal_title').html(KT(102, 'Concern'));
			$('#simulator_modal_body').html(modalFormHtml(id));
			$('#simulator_modal_footer').html(modalFooterHtml(id));

			// Populate editor (keep class ".specification" identical to default)
			$('.specification').text(H.normalizeDbText(row.clarify_text));

			showSimulatorModal('simulator_modal_common');
		});

		// Upsert (same click guard + safeWrite + renderPlan)
		$(document).on(`click${EVENT_NS}`, '.upsert-symptom.std-btn-enabled', async function (e) {
			e.preventDefault();
			e.stopImmediatePropagation();

			const $btn = $(this);
			if ($btn.data('clicked')) return;
			$btn.data('clicked', true);

			$btn
				.removeClass('std-btn-enabled')
				.addClass('std-btn-disabled')
				.prop('disabled', true)
				.attr({ 'aria-disabled': 'true', 'aria-busy': 'true' })
				.css('pointer-events', 'none');

			const id = parseInt(String($btn.attr('data-id') || '0'), 10);

			// KT: no deviation_id / function_id (server will store NULL)
			const payload = {
				id,
				clarify_text: String($('.specification').text() || '')
			};

			const crud = id > 0 ? 'update' : 'create';

			const res = await H.safeWrite(
				store,
				() => window.ProblemFormsController.writeForm(FORM_KEY, crud, payload, store, scope),
				'Save failed. Please try again.'
			);

			if (!res) return;

			hideSimulatorModal('simulator_modal_common');
			H.renderPlan(store);
		});

		// Priority (no deviation/function precondition in KT)
		$(document).on(`click${EVENT_NS}`, '.symptom-priority', async function () {
			const id = parseInt(String($(this).attr('data-id') || '0'), 10);
			if (!id) return;

			const res = await H.safeWrite(
				store,
				() => window.ProblemFormsController.writeForm(FORM_KEY, 'priority', { id }, store, scope),
				'Priority update failed. Please try again.'
			);
			if (!res) return;

			H.renderPlan(store);
		});

		// Delete (same confirm + safeWrite + renderPlan)
		$(document).on(`click${EVENT_NS}`, '.delete-symptom', function () {
			const id = parseInt(String($(this).attr('data-id') || '0'), 10);
			if (!id) return;

			simulatorShowConfirm({
				title: Common(214, 'Confirm'),
				content: Common(158, 'Delete?'),
				backgroundDismiss: true,
				closeIcon: false,
				buttons: {
					ok: {
						text: Common(223, 'OK'),
						action: async () => {
							const res = await H.safeWrite(
								store,
								() => window.ProblemFormsController.writeForm(FORM_KEY, 'delete', { id }, store, scope),
								'Delete failed. Please try again.'
							);
							if (!res) return;

							hideSimulatorModal('simulator_modal_common');
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

		// Optional: focus behavior matching legacy KT (cursor to end).
		// Only add if you already have global helper for it.
		$('#simulator_modal_common').off(`transitionend${EVENT_NS}`).on(`transitionend${EVENT_NS}`, function () {
			// If you have a global "simulatorMoveCursorToEndOfDiv", call it here.
			// Example:
			// if ($('.specification').length) simulatorMoveCursorToEndOfDiv($('.specification')[0].id);
			try {
				const el = document.querySelector('#simulator_modal_common .specification');
				if (!el) return;
				// move caret to end in contenteditable
				const range = document.createRange();
				range.selectNodeContents(el);
				range.collapse(false);
				const sel = window.getSelection();
				sel.removeAllRanges();
				sel.addRange(range);
			} catch (_) {
				// ignore
			}
		});
	};

	return { render, bind };
})();

export default SymptomsForm;