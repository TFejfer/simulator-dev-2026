/* iterations.js
 *
 * Data model (RUNTIME.problem_form_iterationss):
 * - text
 *
 * Modes (case.visibility.iterations):
 * 0 hidden, 1 enabled, 2 limited, 3 disabled
 *
 * Write semantics:
 * - Only "update" is used (server handles upsert).
 * - Autosave uses debounce (default 5s) + immediate flush on blur.
 *
 * Server writes via:
 * ProblemFormsController.writeForm('iterations', 'update', { text }, store, scope)
 */

/* global $, showSimulatorModal, hideSimulatorModal */

(() => {
	'use strict';

	const FORM_KEY = 'iterations';
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
	const getMode = (store) => store.get().case?.visibility?.[FORM_KEY] ?? 0;
	const editable = (mode) => mode === 1;

	const getIterations = (store) => {
		const v = store.get().case?.iterations;
		return (v && typeof v === 'object') ? v : { text: '' };
	};

	// ---------------------------------
	// Throttle (debounce) state (module-local)
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
		if (throttle.lastSentText === text) return;
		throttle.lastSentText = text;

		// Server write (canonical)
		const res = await window.ProblemFormsController.writeForm(
			FORM_KEY,
			'upsert',
			{ text },
			store,
			scope
		);

		// Keep local store aligned even if server returns nothing special
		store.get().case.iterations = store.get().case.iterations || {};
		store.get().case.iterations.text = text;

		// Optional: re-render the on-page textarea to reflect latest value
		render(store);

		return res;
	};

	// ---------------------------------
	// Render
	// ---------------------------------
	const render = (store) => {
		const mode = getMode(store);

		if (mode === 0) {
			$(CONTAINER).empty();
			return;
		}

		const canEdit = editable(mode);
		const fieldsetClass = mode < 3 ? 'case-field' : 'case-field-readonly';
		const textareaClass = canEdit ? 'iteration-edit clickable' : 'textarea-readonly';

		const it = getIterations(store);
		const text = String(it.text || '');

		$(CONTAINER).html(`
			<div class="form-step-header">${Common(55, 'Iteration')}</div>
			<fieldset class="${fieldsetClass}">
				<legend class="case-label">${Common(546, 'Work notes')}</legend>
				<textarea class="text-iteration ${textareaClass}" rows="20" data-column="text" readonly>${text}</textarea>
			</fieldset>
		`);
	};

	// ---------------------------------
	// Modal
	// ---------------------------------
	const modalHtml = (text) => {
		return `
			<fieldset class="case-field">
				<legend class="case-label">${Common(546, 'Work notes')}</legend>
				<textarea class="iteration-throttle" rows="20" autofocus>${String(text ?? '')}</textarea>
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
			} catch (e) {
				// setSelectionRange may fail on some browsers; ignore
			}
		};

		// Prefer transitionend (matches legacy behavior) to ensure modal is visible
		$('#simulator_modal_common').one('transitionend', focusTextarea);

		// Fallback in case transitionend doesn't fire
		setTimeout(focusTextarea, 50);

		// Ensure cursor/indent helpers can be added later if you want
		// (you had simulatorPerserveIndent() in legacy; keep that in the global page if needed)
	};

	// ---------------------------------
	// Events
	// ---------------------------------
	const bind = ({ store, scope }) => {
		// Open modal (only if editable)
		$(document).on('click', `${CONTAINER} .iteration-edit`, () => {
			if (!editable(getMode(store))) return;
			openModal(store, scope);
		});

		// Throttled typing inside modal
		$(document).on('input', '#simulator_modal_common .iteration-throttle', function () {
			if (!editable(getMode(store))) return;

			const nextText = String($(this).val() || '');

			// Local immediate update (snappy UI)
			store.get().case.iterations = store.get().case.iterations || {};
			store.get().case.iterations.text = nextText;

			// Debounced save to server
			scheduleSave(store, scope, nextText);
		});

		// Flush on blur (user leaves field)
		$(document).on('blur', '#simulator_modal_common .iteration-throttle', async function () {
			if (!editable(getMode(store))) return;

			const nextText = String($(this).val() || '');

			// Cancel debounce timer and flush immediately
			if (throttle.timer) clearTimeout(throttle.timer);
			throttle.timer = null;

			await flushSave(store, scope, nextText);
		});

		// Optional: flush and close modal when user clicks outside or closes it
		// (leave as-is; your modal system likely handles close buttons)
	};

	// Expose and register
	window.ProblemFormIterations = { render, bind };
	window.ProblemFormsRegistry.register({ key: FORM_KEY, render, bind });
})();