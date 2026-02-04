/* /common/assets/js/features/problem/forms/default/worknotes.js
 *
 * Problem > Work notes form.
 *
 * Uses the same DB row as Description (problem_form_description),
 * but renders ONLY the work_notes field.
 *
 * Writes:
 * - Uses ProblemFormsController.writeForm('description', 'upsert', payload, store, scope)
 *   because the underlying table is problem_form_description.
 *
 * Optimal module contract:
 * - export default { render(store, view), bind(ctx, view) }
 */

/* global $, showSimulatorModal */

const WorknotesForm = (() => {
	'use strict';

	const H = window.ProblemFormsHelpers;

	// IMPORTANT:
	// - Plan form_code is 'worknotes'
	// - Backend persistence lives under 'description' endpoint/table
	const FORM_CODE = 'worknotes';
	const WRITE_FORM_KEY = 'description';
	const EVENT_NS = '.problem_worknotes';

	const Common = (id, fallback = '') => H.tMap('common_terms', id, fallback);

	const getDescription = (store) => {
		const d = store.get().case?.description;
		return (d && typeof d === 'object')
			? d
			: { short_description: '', long_description: '', work_notes: '' };
	};

	const setWorkNotes = (store, text) => {
		store.get().case.description = store.get().case.description || {};
		store.get().case.description.work_notes = String(text ?? '');

		// Mirror into the read-only textarea immediately so the user sees updates behind the modal.
		$('#display_worknotes .text-worknotes').text(String(text ?? ''));
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

	// Debounce
	const throttle = {
		timer: null,
		lastSentText: null,
		delayMs: 5000
	};

	const scheduleSave = (store, scope, nextText) => {
		if (throttle.timer) clearTimeout(throttle.timer);
		throttle.timer = setTimeout(async () => {
			await flushSave(store, scope, nextText);
		}, throttle.delayMs);
	};

	const flushSave = async (store, scope, nextText) => {
		const text = String(nextText ?? '');

		if (throttle.lastSentText === text) return null;
		throttle.lastSentText = text;

		const endpointScope = resolveScope(store, scope);

		const d = getDescription(store);
		const payload = {
			short_description: String(d.short_description ?? ''),
			long_description: String(d.long_description ?? ''),
			work_notes: text
		};

		// IMPORTANT: adjust CRUD verb if your endpoint expects 'update'
		const res = await H.safeWrite(
			store,
			() => window.ProblemFormsController.writeForm(WRITE_FORM_KEY, 'upsert', payload, store, endpointScope),
			'Save failed. Please try again.'
		);

		if (res) {
			setWorkNotes(store, text);
			H.renderPlan(store); // re-render the plan so the behind-modal form reflects the saved value
		}

		return res;
	};

	const modalHtml = (text) => {
		return `
			<fieldset class="case-field">
				<legend class="case-label">${H.esc(Common(546, 'Work notes'))}</legend>
				<textarea class="throttle-field" data-form="${FORM_CODE}" data-column="work_notes" rows="20" autofocus>${H.esc(text || '')}</textarea>
			</fieldset>
		`;
	};

	const openModal = (store) => {
		const d = getDescription(store);
		const text = String(d.work_notes ?? '');

		$('#simulator_modal_title').html('');
		$('#simulator_modal_body').html(modalHtml(text));
		$('#simulator_modal_footer').empty();

		showSimulatorModal('simulator_modal_common');

		setTimeout(() => {
			const $ta = $('#simulator_modal_common .throttle-field');
			if (!$ta.length) return;
			const len = ($ta.val() || '').length;
			$ta.focus();
			try { $ta[0].setSelectionRange(len, len); } catch {}
		}, 50);
	};

	const render = (store, view) => {
		const mode = Number(view?.mode ?? 0);
		const rootId = String(view?.root_id || `#display_${FORM_CODE}`);

		if (!H.isVisible(mode)) {
			$(rootId).empty();
			return;
		}

		const canEdit = H.isEditable(mode);
		const d = getDescription(store);
		const text = H.normalizeDbText(d.work_notes ?? '');

		const fieldsetClass = (mode < 3) ? 'case-field' : 'case-field-readonly';
		const textareaClass = canEdit ? 'worknotes-edit clickable' : 'textarea-readonly';

		$(rootId).html(`
			<div class="form-step-header"></div>
			<fieldset class="${fieldsetClass}">
				<legend class="case-label">${H.esc(Common(546, 'Work notes'))}</legend>
				<textarea class="text-worknotes ${textareaClass}" rows="20" readonly>${H.esc(text)}</textarea>
			</fieldset>
		`);
	};

	const bind = (ctx, view) => {
		const store = ctx.store;
		const scope = ctx.scope;

		const mode = Number(view?.mode ?? 0);
		if (!H.isEditable(mode)) return;

		$(document).off(EVENT_NS);

		$(document).on(`click${EVENT_NS}`, '#display_worknotes .worknotes-edit', () => {
			openModal(store);
		});

		$(document).on(`input${EVENT_NS}`, '#simulator_modal_common .throttle-field[data-form="worknotes"]', function () {
			const nextText = String($(this).val() || '');

			setWorkNotes(store, nextText);
			scheduleSave(store, scope, nextText);
		});

		$(document).on(`blur${EVENT_NS}`, '#simulator_modal_common .throttle-field[data-form="worknotes"]', async function () {
			const nextText = String($(this).val() || '');

			if (throttle.timer) clearTimeout(throttle.timer);
			throttle.timer = null;

			const res = await flushSave(store, scope, nextText);
			if (res) H.renderPlan(store);
		});
	};

	return { render, bind };
})();

export default WorknotesForm;