/* /common/assets/js/features/problem/forms/default/reflections.js
 *
 * Problem > Reflections form.
 *
 * Data source (store):
 * - store.get().case.reflections:
 *   - keep_text
 *   - improve_text
 *
 * Table: RUNTIME.problem_form_reflections
 *
 * Optimal module contract:
 * - export default { render(store, view), bind(ctx, view) }
 *
 * Writes:
 * - Uses ProblemFormsController.writeForm('reflections', 'upsert', payload, store, scope)
 * - Autosave debounce (5s) + flush on blur
 */

/* global $, showSimulatorModal */

const ReflectionsForm = (() => {
	'use strict';

	const H = window.ProblemFormsHelpers;

	const FORM_KEY = 'reflections';
	const EVENT_NS = '.problem_reflections';

	const Common = (id, fallback = '') => H.tMap('common_terms', id, fallback);
	const Problem = (id, fallback = '') => H.tMap('problem_terms', id, fallback);

	const getReflections = (store) => {
		const r = store.get().case?.reflections;
		return (r && typeof r === 'object')
			? r
			: { keep_text: '', improve_text: '' };
	};

	const setReflectionField = (store, column, text) => {
		store.get().case.reflections = store.get().case.reflections || {};
		store.get().case.reflections[column] = String(text ?? '');
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
		lastSent: { keep_text: null, improve_text: null },
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

		if (throttle.lastSent[column] === text) return null;
		throttle.lastSent[column] = text;

		const endpointScope = resolveScope(store, scope);

		const r = getReflections(store);
		const payload = {
			keep_text: String(r.keep_text ?? ''),
			improve_text: String(r.improve_text ?? '')
		};

		payload[column] = text;

		// IMPORTANT: adjust CRUD verb if your endpoint expects 'update'
		const res = await H.safeWrite(
			store,
			() => window.ProblemFormsController.writeForm(FORM_KEY, 'upsert', payload, store, endpointScope),
			'Save failed. Please try again.'
		);

		if (res) setReflectionField(store, column, text);

		return res;
	};

	const modalHtml = (title, label, column, text) => {
		return `
			<div style="padding-bottom: 2em;">${H.esc(title)}</div>
			<fieldset class="case-field">
				<legend class="case-label">${H.esc(label)} <i class="fa-solid fa-circle-info"></i></legend>
				<textarea class="throttle-field" data-form="${FORM_KEY}" data-column="${column}" rows="4" autofocus>${H.esc(text || '')}</textarea>
			</fieldset>
		`;
	};

	const openModal = (store, column) => {
		const r = getReflections(store);
		const text = String(r[column] ?? '');

		const title = Problem(88, 'Reflection');
		const label = (column === 'keep_text') ? Problem(86, 'Keep') : Problem(87, 'Improve');

		$('#simulator_modal_title').html('');
		$('#simulator_modal_body').html(modalHtml(title, label, column, text));
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
		const rootId = String(view?.root_id || `#display_${FORM_KEY}`);

		if (!H.isVisible(mode)) {
			$(rootId).empty();
			return;
		}

		const canEdit = H.isEditable(mode);
		const r = getReflections(store);

		const keep = H.normalizeDbText(r.keep_text ?? '');
		const improve = H.normalizeDbText(r.improve_text ?? '');

		const fieldsetClass = canEdit ? 'case-field clickable' : 'case-field-readonly';
		const textareaClass = canEdit ? 'edit-refl clickable' : 'textarea-readonly';

		$(rootId).html(`
			<div class="sidebar-title">${H.esc(Problem(88, 'Reflection'))}</div>

			<fieldset class="edit-refl ${fieldsetClass}" data-column="keep_text">
				<legend class="case-label ${canEdit ? 'edit-refl clickable' : ''}" data-column="keep_text">
					${H.esc(Problem(86, 'Keep'))}
				</legend>
				<textarea class="text-reflection ${textareaClass}" data-column="keep_text" rows="4" readonly>${H.esc(keep)}</textarea>
			</fieldset>

			<br>

			<fieldset class="edit-refl ${fieldsetClass}" data-column="improve_text">
				<legend class="case-label ${canEdit ? 'edit-refl clickable' : ''}" data-column="improve_text">
					${H.esc(Problem(87, 'Improve'))}
				</legend>
				<textarea class="text-reflection ${textareaClass}" data-column="improve_text" rows="4" readonly>${H.esc(improve)}</textarea>
			</fieldset>
		`);
	};

	const bind = (ctx, view) => {
		const store = ctx.store;
		const scope = ctx.scope;

		const mode = Number(view?.mode ?? 0);
		if (!H.isEditable(mode)) return;

		$(document).off(EVENT_NS);

		$(document).on(`click${EVENT_NS}`, '#display_reflections .edit-refl', function () {
			const column = String($(this).attr('data-column') || '');
			if (!column) return;
			openModal(store, column);
		});

		$(document).on(`input${EVENT_NS}`, '#simulator_modal_common .throttle-field[data-form="reflections"]', function () {
			const column = String($(this).attr('data-column') || '');
			const nextText = String($(this).val() || '');
			if (!column) return;

			setReflectionField(store, column, nextText);
			scheduleSave(store, scope, column, nextText);
		});

		$(document).on(`blur${EVENT_NS}`, '#simulator_modal_common .throttle-field[data-form="reflections"]', async function () {
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

export default ReflectionsForm;