/* /common/assets/js/features/problem/forms/default/iterations.js
 *
 * Data model (RUNTIME.problem_form_iterations):
 * - text
 *
 * Optimal module contract:
 * - export default { render(store, view), bind(ctx, view) }
 * - view.root_id: container selector (e.g. '#display_iterations')
 * - view.mode: numeric mode (1 enabled, 2 limited, 3 disabled)
 *
 * Write semantics:
 * - Server handles upsert; we call crud='upsert' with { text }.
 * - Autosave uses debounce (default 5s) + immediate flush on blur.
 *
 * Server writes via:
 * - ProblemFormsController.writeForm('iterations', 'upsert', { text }, store, scope)
 *
 * Notes:
 * - This module does NOT self-register. Registration happens in the template bundle.
 * - Event handlers are delegated and namespaced to avoid duplicate bindings.
 * - All writes go through ProblemFormsHelpers.safeWrite() for consistent feedback + rollback.
 */

/* global $, showSimulatorModal, hideSimulatorModal */

const IterationsForm = (() => {
	'use strict';

	const H = window.ProblemFormsHelpers;

	const FORM_KEY = 'iterations';
	const EVENT_NS = '.problem_iterations';

	// ---------------------------------
	// Term helpers
	// ---------------------------------
	const Common = (id, fallback = '') => H.tMap('common_terms', id, fallback);

	// ---------------------------------
	// Store helpers
	// ---------------------------------
	const getIterations = (store) => {
		const v = store.get().case?.iterations;

		// Accept either object or array payloads; normalize to object.
		if (v && typeof v === 'object' && !Array.isArray(v)) return v;
		if (Array.isArray(v) && v.length && typeof v[0] === 'object') return v[0];

		return { text: '' };
	};

	const setIterationsText = (store, text) => {
		store.get().case.iterations = store.get().case.iterations || {};
		store.get().case.iterations.text = String(text ?? '');
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
	// Debounce state (module-local)
	// ---------------------------------
	const throttle = {
		timer: null,
		lastSentText: null,
		delayMs: 5000
	};

	const scheduleSave = (store, scope, nextText) => {
		// Debounce: cancel previous timer
		if (throttle.timer) clearTimeout(throttle.timer);

		throttle.timer = setTimeout(async () => {
			await flushSave(store, scope, nextText);
		}, throttle.delayMs);
	};

	const flushSave = async (store, scope, nextText) => {
		const text = String(nextText ?? '');

		// Only send if changed since last send
		if (throttle.lastSentText === text) return null;
		throttle.lastSentText = text;

		const endpointScope = resolveScope(store, scope);

		// Persist to server (safe write: shows error + rolls back plan on failure)
		const res = await H.safeWrite(
			store,
			() => window.ProblemFormsController.writeForm(
				FORM_KEY,
				'upsert',
				{ text },
				store,
				endpointScope
			),
			'Save failed. Please try again.'
		);

		// Keep local store aligned
		setIterationsText(store, text);

		return res;
	};

	// ---------------------------------
	// Modal
	// ---------------------------------
	const modalHtml = (text) => {
		return `
			<fieldset class="case-field">
				<legend class="case-label">${H.esc(Common(546, 'Work notes'))}</legend>
				<textarea class="iteration-throttle" rows="20" autofocus>${H.esc(String(text ?? ''))}</textarea>
			</fieldset>
		`;
	};

	const openModal = (store, scope) => {
		const it = getIterations(store);
		const text = String(it.text || '');

		$('#simulator_modal_title').html('');
		$('#simulator_modal_body').html(modalHtml(text));
		$('#simulator_modal_footer').empty();

		showSimulatorModal('simulator_modal_common');

		const focusTextarea = () => {
			const $ta = $('#simulator_modal_common .iteration-throttle');
			if ($ta.length === 0) return;

			const len = ($ta.val() || '').length;
			$ta.focus();
			try {
				$ta[0].setSelectionRange(len, len);
			} catch {
				// setSelectionRange may fail on some browsers; ignore
			}
		};

		// Prefer transitionend to ensure modal is visible
		$('#simulator_modal_common').one('transitionend', focusTextarea);

		// Fallback in case transitionend doesn't fire
		setTimeout(focusTextarea, 50);
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
		const fieldsetClass = (mode < 3) ? 'case-field' : 'case-field-readonly';
		const textareaClass = canEdit ? 'iteration-edit clickable' : 'textarea-readonly';

		const it = getIterations(store);
		const text = String(it.text || '');

		$(rootId).html(`
			<div class="form-step-header">${H.esc(Common(337, 'Iteration'))}</div>
			<fieldset class="${fieldsetClass}">
				<legend class="case-label">${H.esc(Common(546, 'Work notes'))}</legend>
				<textarea class="text-iteration ${textareaClass}" rows="20" data-column="text" readonly>${H.esc(text)}</textarea>
			</fieldset>
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

		// Open modal
		$(document).on(`click${EVENT_NS}`, '#display_iterations .iteration-edit', () => {
			openModal(store, scope);
		});

		// Throttled typing inside modal
		$(document).on(`input${EVENT_NS}`, '#simulator_modal_common .iteration-throttle', function () {
			const nextText = String($(this).val() || '');

			// Local immediate update (snappy UI)
			setIterationsText(store, nextText);

			// Debounced save to server
			scheduleSave(store, scope, nextText);
		});

		// Flush on blur (user leaves field)
		$(document).on(`blur${EVENT_NS}`, '#simulator_modal_common .iteration-throttle', async function () {
			const nextText = String($(this).val() || '');

			// Cancel debounce timer and flush immediately
			if (throttle.timer) clearTimeout(throttle.timer);
			throttle.timer = null;

			const res = await flushSave(store, scope, nextText);

			// On success, re-render full plan to keep UI consistent.
			// On failure, safeWrite already rolled back and showed feedback.
			if (res) H.renderPlan(store);
		});
	};

	return { render, bind };
})();

export default IterationsForm;