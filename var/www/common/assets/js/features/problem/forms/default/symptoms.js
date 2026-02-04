/* /common/assets/js/features/problem/forms/default/symptoms.js
 *
 * Problem > Symptoms form (MAP-based term payloads).
 *
 * Optimal module contract:
 * - export default { render(store, view), bind(ctx, view) }
 * - view.root_id: container selector (e.g. '#display_symptoms')
 * - view.mode: numeric mode (1 enabled, 2 limited, 3 disabled)
 *
 * Notes:
 * - This module does NOT self-register. Registration happens in the template bundle.
 * - Event handlers are delegated and namespaced to avoid duplicate bindings.
 * - All writes go through ProblemFormsHelpers.safeWrite() for consistent error feedback + rollback.
 */

/* global $, simulatorShowConfirm, showSimulatorModal, hideSimulatorModal */

const SymptomsForm = (() => {
	'use strict';

	const H = window.ProblemFormsHelpers;

	const FORM_KEY = 'symptoms';
	const EVENT_NS = '.problem_symptoms';

	// ---------------------------------
	// Term helpers (SIM_SHARED maps)
	// ---------------------------------
	const Common = (id, fallback = '') => H.tMap('common_terms', id, fallback);
	const Problem = (id, fallback = '') => H.tMap('problem_terms', id, fallback);
	const Method = (id, fallback = '') => H.tMap('troubleshooting_methods', id, fallback);
	const DeviationExpl = (id, fallback = '') => H.tMap('deviation_explanation', id, fallback);

	// ---------------------------------
	// Shared lookup helpers
	// ---------------------------------
	const deviationsMap = () => {
		const m = window.SIM_SHARED?.deviations;
		return (m && typeof m === 'object') ? m : {};
	};

	const functionsRaw = () => window.SIM_SHARED?.functions;

	const functionText = (themeId, functionId) => {
		const raw = functionsRaw();

		// Map case: { "1": "Reset", ... }
		if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
			return raw[String(functionId)] || '';
		}

		// Row array case: [{theme_id, function_id, text_value}, ...]
		if (Array.isArray(raw)) {
			const row = raw.find((r) =>
				String(r?.theme_id ?? '') === String(themeId) &&
				String(r?.function_id ?? '') === String(functionId)
			);
			return String(row?.text_value ?? '');
		}

		return '';
	};

	const deviationText = (deviationId) => deviationsMap()[String(deviationId)] || '';

	// ---------------------------------
	// Store helpers
	// ---------------------------------
	const getThemeId = (store) => {
		const d = store.get();
		return d?.meta?.theme_id ?? d?.meta?.exercise?.theme_id ?? 0;
	};

	const getSymptoms = (store) => {
		const arr = store.get().case?.symptoms;
		return Array.isArray(arr) ? arr : [];
	};

	// ---------------------------------
	// HTML helpers
	// ---------------------------------
	const buildSymptomText = (row, themeId) => {
		const deviationId = parseInt(row.deviation_id || 0, 10) || 0;
		const functionId = parseInt(row.function_id || 0, 10) || 0;

		// Preserve legitimate backslashes (e.g. file paths). Only normalize double-escaped text.
		const clarify = H.normalizeDbText(row.clarify_text);

		if (deviationId > 0 && functionId > 0) {
			const d = deviationText(deviationId);
			const f = functionText(themeId, functionId);
			return `${d} ${f}. ${clarify}`.trim();
		}

		return clarify;
	};

	const renderRestoreMethod = () => {
		return `
			<div class="method-step">
				<ul>
					<li>
						<span class="method-question">${Method(2)}</span>
						<ul>
							<li>${Method(3)}</li>
							<li>${Method(42)}</li>
						</ul>
					</li>
					<li>
						<span class="method-question">${Method(4)}</span>
						<ul>
							<li>${Method(5)}</li>
						</ul>
					</li>
					<li>
						<span class="method-question">${Method(6)}</span>
						<ul>
							<li>${Method(7)}</li>
						</ul>
					</li>
				</ul>
			</div>
		`;
	};

	const buildDeviationSelect = () => {
		const entries = Object.entries(deviationsMap())
			.sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10));

		return `
			<select name="deviation" class="form-control" id="deviation" required>
				<option value="0">-- ${Problem(31, 'Select deviation')} --</option>
				${entries.map(([id, text]) => `<option value="${id}">${H.esc(text)}</option>`).join('')}
			</select>
		`;
	};

	const buildFunctionSelect = (themeId) => {
		const raw = functionsRaw();

		// Map case (no theme dimension)
		if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
			const entries = Object.entries(raw)
				.sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10));

			return `
				<select name="function" class="form-control" id="function" required>
					<option value="0">-- ${Problem(74, 'Select function')} --</option>
					${entries.map(([id, text]) => `<option value="${id}">${H.esc(text)}</option>`).join('')}
				</select>
			`;
		}

		// Row array case (theme dimension)
		const rows = Array.isArray(raw)
			? raw.filter((r) => String(r?.theme_id ?? '') === String(themeId))
			: [];

		return `
			<select name="function" class="form-control" id="function" required>
				<option value="0">-- ${Problem(74, 'Select function')} --</option>
				${rows.map((r) => `<option value="${r.function_id}">${H.esc(r.text_value || '')}</option>`).join('')}
			</select>
		`;
	};

	const modalFormHtml = (id, themeId, lockSelects) => {
		const deviationSelect = buildDeviationSelect();
		const functionSelect = buildFunctionSelect(themeId);

		const explanation = [1, 2, 3, 4].map((i) => `
			<div>
				<span class="deviation-term">${H.esc(deviationText(i))}</span> :
				<span class="deviation-definition">${H.esc(DeviationExpl(i))}.</span>
			</div>
		`).join('');

		const devSelectHtml = lockSelects ? deviationSelect.replace('required', 'disabled') : deviationSelect;
		const fnSelectHtml = lockSelects ? functionSelect.replace('required', 'disabled') : functionSelect;

		return `
			<div class="grid-symptom-edit">
				<div class="symptom-label1 form-explain">${Problem(54)}?</div>
				<div class="symptom-deviation">${devSelectHtml}</div>
				<div class="symptom-function">${fnSelectHtml}</div>

				<fieldset class="case-field symptom-clarify">
					<legend class="case-label">${Problem(38, 'Clarify')}</legend>
					<div class="case-edit specification" data-id="${id}" contenteditable></div>
				</fieldset>

				<div class="symptom-explanation">
					<details>
						<summary>${Problem(81, 'Explanation')} (${Problem(58, 'Why')})</summary>
						${explanation}
					</details>
				</div>
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
		const themeId = getThemeId(store);
		const rows = getSymptoms(store);

		const elements = rows.length
			? rows.map((row) => {
				const id = row.id ?? 0;
				const isPrio = (parseInt(row.is_priority || 0, 10) || 0) > 0;
				const icon = isPrio ? 'fa-square-check' : 'fa-square';
				const text = buildSymptomText(row, themeId);

				return `
					<fieldset class="symptom-element ${canEdit ? 'case-field clickable symptom-update-modal' : 'case-field-readonly'}" data-id="${id}">
						<legend class="case-label">${Problem(1, 'Symptom')}</legend>
						<div class="symptom-text ${canEdit ? 'case-item-clickable' : 'case-item'}" data-id="${id}" contenteditable="false">${H.esc(text)}</div>
					</fieldset>

					<fieldset class="symptom-element ${canEdit ? 'case-field' : 'case-field-readonly'}" data-id="${id}">
						<legend class="case-label">${Problem(3, 'Priority')}</legend>
						<div class="symptom-priority-inner ${canEdit ? 'symptom-priority clickable link-text' : ''}" data-id="${id}">
							<i class="symptom-priority-box fa-regular ${icon}"></i>
						</div>
					</fieldset>
				`;
			}).join('')
			: '';

		const addButton = (rows.length < 50 && canEdit)
			? `<div id="symptom_insert_modal" class="clickable link-text" data-id="0">${Problem(37, 'Add symptom')}</div>`
			: (rows.length >= 50 && canEdit)
				? `<span class="form-text-limit">Limit reached</span>`
				: '';

		$(rootId).html(`
			<details class="form-method">
				<summary class="form-step-header">1. ${Problem(2, 'Symptoms')}</summary>
				${renderRestoreMethod()}
			</details>

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
		if (!H.isEditable(mode)) {
			// Non-editable: do not bind any write actions.
			return;
		}

		// Ensure we do not duplicate event handlers across rebinds.
		$(document).off(EVENT_NS);

		$(document).on(`click${EVENT_NS}`, '#symptom_insert_modal', () => {
			const themeId = getThemeId(store);

			$('#simulator_modal_title').html(Problem(1, 'Symptom'));
			$('#simulator_modal_body').html(modalFormHtml(0, themeId, false));
			$('#simulator_modal_footer').html(modalFooterHtml(0));

			showSimulatorModal('simulator_modal_common');
		});

		$(document).on(`click${EVENT_NS}`, '.symptom-update-modal', function () {
			const id = parseInt(String($(this).attr('data-id') || '0'), 10);
			if (!id) return;

			const themeId = getThemeId(store);
			const rows = getSymptoms(store);
			const row = rows.find((r) => (r.id ?? 0) === id);
			if (!row) return;

			$('#simulator_modal_title').html(Problem(1, 'Symptom'));
			$('#simulator_modal_body').html(modalFormHtml(id, themeId, true));
			$('#simulator_modal_footer').html(modalFooterHtml(id));

			$('select[name="deviation"]').val(String(row.deviation_id || 0));
			$('select[name="function"]').val(String(row.function_id || 0));

			// Preserve legitimate backslashes when populating the editor
			$('.specification').text(H.normalizeDbText(row.clarify_text));

			showSimulatorModal('simulator_modal_common');
		});

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

			const payload = {
				id,
				deviation_id: parseInt(String($('#deviation option:selected').val() || '0'), 10),
				function_id: parseInt(String($('#function option:selected').val() || '0'), 10),
				clarify_text: String($('.specification').text() || '')
			};

			const crud = id > 0 ? 'update' : 'create';

			const res = await H.safeWrite(
				store,
				() => window.ProblemFormsController.writeForm(FORM_KEY, crud, payload, store, scope),
				'Save failed. Please try again.'
			);
			if (!res) {
				// Keep modal open so user can retry
				return;
			}

			hideSimulatorModal('simulator_modal_common');

			// Re-render the full plan to keep dependent forms consistent (e.g. Facts what_not)
			H.renderPlan(store);
		});

		$(document).on(`click${EVENT_NS}`, '.symptom-priority', async function () {
			const id = parseInt(String($(this).attr('data-id') || '0'), 10);
			if (!id) return;

			const rows = getSymptoms(store);
			const row = rows.find((r) => (r.id ?? 0) === id);
			if (!row) return;

			const hasDeviationAndFunction = (parseInt(row.deviation_id || 0, 10) || 0) > 0
				&& (parseInt(row.function_id || 0, 10) || 0) > 0;

			if (!hasDeviationAndFunction) {
				simulatorShowConfirm({
					title: Problem(82, 'Notice'),
					content: Problem(83, 'Please select deviation and function first.'),
					backgroundDismiss: true
				});
				return;
			}

			const res = await H.safeWrite(
				store,
				() => window.ProblemFormsController.writeForm(FORM_KEY, 'priority', { id }, store, scope),
				'Priority update failed. Please try again.'
			);
			if (!res) return;

			H.renderPlan(store);
		});

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
	};

	return { render, bind };
})();

export default SymptomsForm;