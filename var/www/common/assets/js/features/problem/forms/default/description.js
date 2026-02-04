/* /common/assets/js/features/problem/forms/default/description.js
 *
 * Problem > Description form.
 *
 * Data source (store):
 * - store.get().case.description:
 *   - short_description
 *   - long_description
 *   - work_notes
 *
 * This form renders ONLY the description fields (short + long).
 * Work notes is handled by the separate Worknotes form module.
 *
 * Optimal module contract:
 * - export default { render(store, view), bind(ctx, view) }
 * - view.root_id, view.mode from backend plan
 *
 * Writes:
 * - Uses ProblemFormsController.writeForm('description', 'upsert', payload, store, scope)
 * - Autosave debounce (5s) + flush on blur
 */

/* global $, showSimulatorModal, hideSimulatorModal */

const DescriptionForm = (() => {
	'use strict';

	const H = window.ProblemFormsHelpers;

	const FORM_KEY = 'description';
	const EVENT_NS = '.problem_description';

	// Terms (common)
	const Common = (id, fallback = '') => H.tMap('common_terms', id, fallback);

	// ---------------------------------
	// Store helpers
	// ---------------------------------
	const getDescription = (store) => {
		const d = store.get().case?.description;
		return (d && typeof d === 'object')
			? d
			: { short_description: '', long_description: '', work_notes: '' };
	};

	const setDescriptionField = (store, column, text) => {
		store.get().case.description = store.get().case.description || {};
		store.get().case.description[column] = String(text ?? '');
	};

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
	// Debounce state (module-local)
	// ---------------------------------
	const throttle = {
		timer: null,
		lastSent: { short_description: null, long_description: null },
		delayMs: 5000
	};

	const scheduleSave = (store, scope, column, nextText) => {
		if (throttle.timer) clearTimeout(throttle.timer);

		throttle.timer = setTimeout(async () => {
			await flushSave(store, scope, column, nextText);
		}, throttle.delayMs);
	};

	const flushSave = async (store, scope, column, nextText) => {
		const text = String(nextText ?? '');

		// Only send if changed since last send for this column
		if (throttle.lastSent[column] === text) return null;
		throttle.lastSent[column] = text;

		const endpointScope = resolveScope(store, scope);

		// Build payload from canonical store state to avoid partial updates drifting
		const d = getDescription(store);
		const payload = {
			short_description: String(d.short_description ?? ''),
			long_description: String(d.long_description ?? ''),
			work_notes: String(d.work_notes ?? '')
		};

		// Ensure we include the newly changed column
		payload[column] = text;

		// IMPORTANT: adjust CRUD verb if your endpoint expects 'update' instead of 'upsert'
		const res = await H.safeWrite(
			store,
			() => window.ProblemFormsController.writeForm(FORM_KEY, 'upsert', payload, store, endpointScope),
			'Save failed. Please try again.'
		);

		if (res) {
			// Keep canonical store aligned
			setDescriptionField(store, column, text);
		}

		return res;
	};

	// ---------------------------------
	// Render helpers
	// ---------------------------------
	const fieldsetHtml = (label, column, rows, text, canEdit) => {
		const fieldsetClass = canEdit ? 'case-field' : 'case-field-readonly';
		const textareaClass = canEdit ? 'description-edit clickable' : 'textarea-readonly';

		return `
			<fieldset class="${fieldsetClass}">
				<legend class="case-label">${H.esc(label)}</legend>
				<textarea class="text-description ${textareaClass}" rows="${rows}" data-column="${column}" readonly>${H.esc(text || '')}</textarea>
			</fieldset>
			<br><br>
		`;
	};

	// ---------------------------------
	// Modal
	// ---------------------------------
	const modalHtml = (column, text) => {
		const rows = (column === 'short_description') ? 2 : 10;

		const labels = {
			short_description: Common(545, 'Short description'),
			long_description: Common(152, 'Long description')
		};

		return `
			<fieldset class="case-field">
				<legend class="case-label">${H.esc(labels[column] || column)}</legend>
				<textarea class="throttle-field" data-form="${FORM_KEY}" data-column="${column}" rows="${rows}" autofocus>${H.esc(text || '')}</textarea>
			</fieldset>
		`;
	};

	const openModal = (store, column) => {
		const d = getDescription(store);
		const text = String(d[column] ?? '');

		$('#simulator_modal_title').html('');
		$('#simulator_modal_body').html(modalHtml(column, text));
		$('#simulator_modal_footer').empty();

		showSimulatorModal('simulator_modal_common');

		// Best-effort: move cursor to end
		setTimeout(() => {
			const $ta = $('#simulator_modal_common .throttle-field');
			if (!$ta.length) return;
			const len = ($ta.val() || '').length;
			$ta.focus();
			try { $ta[0].setSelectionRange(len, len); } catch {}
		}, 50);
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
		const d = getDescription(store);

		const shortText = H.normalizeDbText(d.short_description ?? '');
		const longText = H.normalizeDbText(d.long_description ?? '');

		$(rootId).html(`
			<div class="form-step-header">${H.esc(Common(545, 'Description'))}</div>
			${fieldsetHtml(Common(545, 'Short description'), 'short_description', 2, shortText, canEdit)}
			${fieldsetHtml(Common(152, 'Long description'), 'long_description', 10, longText, canEdit)}
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

		$(document).off(EVENT_NS);

		// Open modal on click
		$(document).on(`click${EVENT_NS}`, '#display_description .description-edit', function () {
			const column = String($(this).attr('data-column') || '');
			if (!column) return;
			openModal(store, column);
		});

		// Debounced typing inside modal
		$(document).on(`input${EVENT_NS}`, '#simulator_modal_common .throttle-field[data-form="description"]', function () {
			const column = String($(this).attr('data-column') || '');
			const nextText = String($(this).val() || '');

			if (!column) return;

			// Local immediate update
			setDescriptionField(store, column, nextText);

			// Debounced save
			scheduleSave(store, scope, column, nextText);
		});

		// Flush on blur
		$(document).on(`blur${EVENT_NS}`, '#simulator_modal_common .throttle-field[data-form="description"]', async function () {
			const column = String($(this).attr('data-column') || '');
			const nextText = String($(this).val() || '');
			if (!column) return;

			if (throttle.timer) clearTimeout(throttle.timer);
			throttle.timer = null;

			const res = await flushSave(store, scope, column, nextText);
			if (res) H.renderPlan(store);
		});
	};

	return { render, bind };
})();

export default DescriptionForm;