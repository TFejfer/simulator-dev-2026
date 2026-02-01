/* facts.js
 *
 * Problem > Facts form (migrated from legacy; optimized structure).
 *
 * Includes fixes:
 * 1) what_not is computed from prioritized symptom and updates immediately.
 * 2) what_ok modal stays open; can add multiple items; list shows delete "x".
 * 3) when modal delete removes item immediately and stays consistent (rebuild from store).
 *
 * UI parity with legacy:
 * - 2-column grid (NOT WORKING vs WORKING)
 * - Fieldsets for: what/where/when/other
 * - Modals:
 *   - what_ok: list + add multiple + delete x
 *   - where: toggle buttons create/delete
 *   - when: flatpickr add + delete x
 *   - other: textarea update/create
 */

/* global $, simulatorShowConfirm, showSimulatorModal, hideSimulatorModal */

(() => {
	'use strict';

	const FORM_KEY = 'facts';
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
	const Problem = (id, fallback = '') => tMap('problem_terms', id, fallback);
	const Method = (id, fallback = '') => tMap('troubleshooting_methods', id, fallback);
	const Themes = (id, fallback = '') => tMap('themes', id, fallback);

	// ---------------------------------
	// Shared lookup helpers
	// ---------------------------------
	const normalitiesMap = () => {
		const m = window.SIM_SHARED?.normality;
		return (m && typeof m === 'object') ? m : {};
	};

	const normalityText = (normalityId) => normalitiesMap()[String(normalityId)] || '';

	const functionsRaw = () => window.SIM_SHARED?.functions;

	const functionText = (themeId, functionId) => {
		const raw = functionsRaw();

		if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
			return raw[String(functionId)] || '';
		}

		if (Array.isArray(raw)) {
			const row = raw.find((r) =>
				String(r?.theme_id ?? '') === String(themeId) &&
				String(r?.function_id ?? '') === String(functionId)
			);
			return String(row?.text_value ?? '');
		}

		return '';
	};

	// ---------------------------------
	// Store helpers
	// ---------------------------------
	const getMode = (store) => store.get().case?.visibility?.[FORM_KEY] ?? 0;
	const editable = (mode) => mode === 1;

	const getThemeId = (store) => store.get().meta?.theme_id ?? store.get().meta?.exercise?.theme_id ?? 0;

	const getFacts = (store) => {
		const arr = store.get().case?.facts;
		return Array.isArray(arr) ? arr : [];
	};

	const getSymptoms = (store) => {
		const arr = store.get().case?.symptoms;
		return Array.isArray(arr) ? arr : [];
	};

	const esc = (s) => {
		return String(s ?? '')
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#039;');
	};

	// ---------------------------------
	// Facts helpers
	// ---------------------------------
	const byMeta = (facts, keyMeta) => facts.filter((r) => String(r.key_meta) === String(keyMeta));

	const getPrioritySymptomText = (store) => {
		const themeId = getThemeId(store);
		const s = getSymptoms(store).find((r) => (parseInt(r.is_priority || 0, 10) || 0) === 1);
		if (!s) return '';

		const deviationId = parseInt(s.deviation_id || 0, 10) || 0;
		const functionId = parseInt(s.function_id || 0, 10) || 0;
		const clarify = String(s.clarify_text || '');

		const dText = (window.SIM_SHARED?.deviations || {})[String(deviationId)] || '';
		const fText = functionText(themeId, functionId);

		return `${dText} ${fText}. ${clarify}`.trim();
	};

	const parseWhatOkKeyValue = (kv) => {
		try {
			const o = JSON.parse(String(kv || '{}'));
			return {
				normality_id: parseInt(o.normalityID ?? o.normality_id ?? 0, 10) || 0,
				function_id: parseInt(o.functionID ?? o.function_id ?? 0, 10) || 0
			};
		} catch {
			return { normality_id: 0, function_id: 0 };
		}
	};

	const buildWhatOkLine = (row, themeId) => {
		const kv = parseWhatOkKeyValue(row.key_value);
		const nText = normalityText(kv.normality_id);
		const fText = functionText(themeId, kv.function_id);
		const clarify = String(row.text || '').replace(/\\/g, '');
		return `${nText} ${fText}. ${clarify}`.trim();
	};

	const buildFactContent = (facts, themeId, keyMeta, allowDelete = false) => {
		const arr = byMeta(facts, keyMeta);
		if (!arr.length) return '';

		if (keyMeta === 'what_ok') {
			return arr.map((row) => `
				<div class="fact-line">
					${esc(buildWhatOkLine(row, themeId))}
					${allowDelete ? `<span class="clickable delete-fact" data-field="what_ok" data-id="${row.id}">×</span>` : ''}
				</div>
			`).join('');
		}

		if (keyMeta === 'where_not' || keyMeta === 'where_ok') {
			const sorted = [...arr].sort((a, b) => (parseInt(a.key_value, 10) || 0) - (parseInt(b.key_value, 10) || 0));
			return sorted.map((row) => `
				<div class="fact-line">
					${(String(row.key_value) === '0') ? esc(Problem(89, 'No comparable system')) : esc(`${Themes(themeId)}-${row.key_value}`)}
				</div>
			`).join('');
		}

		if (keyMeta === 'when_not' || keyMeta === 'when_ok') {
			const sorted = [...arr].sort((a, b) => String(a.key_value).localeCompare(String(b.key_value)));
			return sorted.map((row) => `<div class="fact-line">${esc(row.key_value)}</div>`).join('');
		}

		const first = arr[0];
		return esc(first?.text || '');
	};

	const getOtherRow = (facts, keyMeta) => {
		const row = facts.find((r) => String(r.key_meta) === String(keyMeta));
		return row || { id: 0, key_meta: keyMeta, key_value: '', text: '' };
	};

	// ---------------------------------
	// Modal list refresh helpers (canonical from store)
	// ---------------------------------
	const refreshWhatOkModalList = (store) => {
		const themeId = getThemeId(store);
		const facts = getFacts(store);
		$('#whatOkList').html(buildFactContent(facts, themeId, 'what_ok', true));
	};

	const refreshWhenModalLists = (store) => {
		const facts = getFacts(store);
		const wn = byMeta(facts, 'when_not').sort((a, b) => String(a.key_value).localeCompare(String(b.key_value)));
		const wo = byMeta(facts, 'when_ok').sort((a, b) => String(a.key_value).localeCompare(String(b.key_value)));

		$('#whenNotList').html(wn.map((r) => `
			<div class="fact-when-element">
				${esc(r.key_value)}
				<span class="clickable delete-fact" data-field="when_not" data-id="${r.id}">
					<i class="fa-solid fa-xmark"></i>
				</span>
			</div>
		`).join(''));

		$('#whenOkList').html(wo.map((r) => `
			<div class="fact-when-element">
				${esc(r.key_value)}
				<span class="clickable delete-fact" data-field="when_ok" data-id="${r.id}">
					<i class="fa-solid fa-xmark"></i>
				</span>
			</div>
		`).join(''));
	};

	// ---------------------------------
	// Flatpickr initialisation (WHEN modal only)
	// ---------------------------------
	const initWhenPickers = (store, scope) => {
		if (!window.flatpickr) return;

		const opts = (keyMeta) => ({
			enableTime: true,
			time_24hr: true,
			dateFormat: 'Y-m-d H:i',
			onClose: async (selectedDates, dateStr, instance) => {
				if (!dateStr) return;

				const res = await window.ProblemFormsController.writeForm(
					'facts',
					'create',
					{ key_meta: keyMeta, key_value: dateStr, text: '' },
					store,
					scope
				);

				if (!res?.ok) console.warn('[facts] create when failed', res);

				instance.clear();
				refreshWhenModalLists(store);
			}
		});

		window.flatpickr('#whenNotPicker', opts('when_not'));
		window.flatpickr('#whenOkPicker', opts('when_ok'));
	};

	// ---------------------------------
	// Restore method (facts)
	// ---------------------------------
	const renderRestoreMethod = () => `
		<div id="met_step2">
			<ul>
				<li><span class="method-question">${Method(10)}</span></li>
			</ul>
			<div class="table-responsive method-facts-table">
				<table class="table table-bordered method-facts-table-content">
					<tr>
						<td></td>
						<td class="method-facts-labels method-facts-center">${Method(11)}</td>
						<td class="method-facts-labels method-facts-center">${Method(12)}</td>
					</tr>
					<tr><td class="method-facts-labels">${Method(13)}</td><td>${Method(14)}</td><td>${Method(15)}</td></tr>
					<tr><td class="method-facts-labels">${Method(16)}</td><td>${Method(17)}</td><td>${Method(18)}</td></tr>
					<tr><td class="method-facts-labels">${Method(19)}</td><td>${Method(20)}</td><td>${Method(21)}</td></tr>
					<tr><td class="method-facts-labels">${Method(22)}</td><td>${Method(23)}</td><td>${Method(24)}</td></tr>
				</table>
			</div>
			<p class="method-facts-post-text">${Method(25)}</p>
		</div>
	`;

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
		const themeId = getThemeId(store);
		const facts = getFacts(store);
		const whatNotText = getPrioritySymptomText(store);

		$(CONTAINER).html(`
			<details class="form-method">
				<summary class="form-step-header">2. ${Problem(5, 'Facts')}</summary>
				${renderRestoreMethod()}
			</details>

			<div class="grid-facts">
				<div class="facts-top-not capitalize-all">${Problem(6, 'Not working')}</div>
				<div class="facts-top-ok capitalize-all">${Problem(7, 'Working')}</div>

				<fieldset class="${canEdit ? 'case-field edit-fact clickable' : 'case-field-readonly'}" data-factpair="what">
					<legend class="case-label">${Problem(8, 'What')}</legend>
					<div class="fact ${canEdit ? 'case-item-clickable' : 'case-item'}" data-fact="what_not">
						${esc(whatNotText)}
					</div>
				</fieldset>

				<fieldset class="${canEdit ? 'case-field edit-fact clickable' : 'case-field-readonly'}" data-factpair="what">
					<legend class="case-label">${Problem(8, 'What')}</legend>
					<div class="fact ${canEdit ? 'case-item-clickable' : 'case-item'}" data-fact="what_ok">
						${buildFactContent(facts, themeId, 'what_ok', false)}
					</div>
				</fieldset>

				<fieldset class="${canEdit ? 'case-field edit-fact clickable' : 'case-field-readonly'}" data-factpair="where">
					<legend class="case-label">${Problem(9, 'Where')}</legend>
					<div class="fact ${canEdit ? 'case-item-clickable' : 'case-item'}" data-fact="where_not">
						${buildFactContent(facts, themeId, 'where_not')}
					</div>
				</fieldset>

				<fieldset class="${canEdit ? 'case-field edit-fact clickable' : 'case-field-readonly'}" data-factpair="where">
					<legend class="case-label">${Problem(9, 'Where')}</legend>
					<div class="fact ${canEdit ? 'case-item-clickable' : 'case-item'}" data-fact="where_ok">
						${buildFactContent(facts, themeId, 'where_ok')}
					</div>
				</fieldset>

				<fieldset class="${canEdit ? 'case-field edit-fact clickable' : 'case-field-readonly'}" data-factpair="when">
					<legend class="case-label">${Problem(10, 'When')}</legend>
					<div class="fact ${canEdit ? 'case-item-clickable' : 'case-item'}" data-fact="when_not">
						${buildFactContent(facts, themeId, 'when_not')}
					</div>
				</fieldset>

				<fieldset class="${canEdit ? 'case-field edit-fact clickable' : 'case-field-readonly'}" data-factpair="when">
					<legend class="case-label">${Problem(10, 'When')}</legend>
					<div class="fact ${canEdit ? 'case-item-clickable' : 'case-item'}" data-fact="when_ok">
						${buildFactContent(facts, themeId, 'when_ok')}
					</div>
				</fieldset>

				<fieldset class="${canEdit ? 'case-field edit-fact clickable' : 'case-field-readonly'}" data-factpair="other">
					<legend class="case-label">${Problem(32, 'Other')}</legend>
					<textarea class="other-fact ${canEdit ? 'clickable' : 'textarea-readonly'}" data-factpair="other" rows="4" readonly>${esc(buildFactContent(facts, themeId, 'other_not'))}</textarea>
				</fieldset>

				<fieldset class="${canEdit ? 'case-field edit-fact clickable' : 'case-field-readonly'}" data-factpair="other">
					<legend class="case-label">${Problem(32, 'Other')}</legend>
					<textarea class="other-fact ${canEdit ? 'clickable' : 'textarea-readonly'}" data-factpair="other" rows="4" readonly>${esc(buildFactContent(facts, themeId, 'other_ok'))}</textarea>
				</fieldset>
			</div>
		`);
	};

	// ---------------------------------
	// Modal builders (WHERE + OTHER included)
	// ---------------------------------
	const modalWhatOk = (store) => {
		const themeId = getThemeId(store);

		const nOptions = Object.entries(normalitiesMap())
			.sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10))
			.map(([id, text]) => `<option value="${id}">${esc(text)}</option>`)
			.join('');

		const raw = functionsRaw();
		let fOptions = '';

		if (Array.isArray(raw)) {
			fOptions = raw
				.filter((r) => String(r?.theme_id ?? '') === String(themeId))
				.map((r) => `<option value="${r.function_id}">${esc(r.text_value || '')}</option>`)
				.join('');
		} else if (raw && typeof raw === 'object') {
			fOptions = Object.entries(raw)
				.sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10))
				.map(([id, text]) => `<option value="${id}">${esc(text)}</option>`)
				.join('');
		}

		return `
			<fieldset class="case-field case-field-not-editable">
				<legend class="case-label">${Problem(41, 'What works')}</legend>
				<div id="whatOkList" class="case-edit"></div>
			</fieldset>

			<div class="grid-what-ok-insert">
				<div class="what-ok-label1 form-explain">${Problem(41, 'What works')}?</div>

				<div class="what-ok-deviation">
					<select name="normality" class="form-control" id="normality" required>
						<option value="0">-- ${Problem(75, 'Select normality')} --</option>
						${nOptions}
					</select>
				</div>

				<div class="what-ok-function">
					<select name="function" class="form-control" id="function" required>
						<option value="0">-- ${Problem(31, 'Select function')} --</option>
						${fOptions}
					</select>
				</div>

				<fieldset class="case-field what-ok-clarify">
					<legend class="case-label">${Problem(38, 'Clarify')}</legend>
					<div id="whatOkClarify" class="case-edit specification" contenteditable></div>
				</fieldset>
			</div>
		`;
	};

	const modalWhere = (store) => {
		const themeId = getThemeId(store);

		const buildButtons = (keyMeta) => {
			let out = '';
			for (let i = 1; i <= 16; i++) {
				out += `<div class="modal-fact-where add-fact-where" data-fact="${keyMeta}" data-nmb="${i}">${i}</div>`;
			}
			if (keyMeta === 'where_ok') {
				out += `<div class="modal-fact-where add-fact-where no-comparable-system line-clamp1" data-fact="where_ok" data-nmb="0">${Problem(89, 'No comparable system')}</div>`;
			}
			return out;
		};

		return `
			<div class="grid-facts-modal">
				<div class="fact1-explain">${Problem(6, 'Not working')}</div>
				<div class="fact2-explain">${Problem(7, 'Working')}</div>

				<fieldset class="fact1-content facts-where-not case-field">
					<legend class="case-label">${Problem(9, 'Where')}</legend>
					<div class="case-edit">
						${Themes(themeId)}:
						<div class="grid-facts-where-modal" data-fact="where_not">
							${buildButtons('where_not')}
						</div>
					</div>
				</fieldset>

				<fieldset class="fact2-content facts-where-ok case-field">
					<legend class="case-label">${Problem(9, 'Where')}</legend>
					<div class="case-edit">
						${Themes(themeId)}:
						<div class="grid-facts-where-modal" data-fact="where_ok">
							${buildButtons('where_ok')}
						</div>
					</div>
				</fieldset>
			</div>
		`;
	};

	const modalWhen = () => `
		<div class="grid-facts-modal">
			<div class="fact1-explain">${Problem(999, 'When not working')}</div>
			<div class="fact2-explain">${Problem(999, 'When working')}</div>

			<fieldset class="fact1-content facts-when-not case-field">
				<legend class="case-label">${Problem(10, 'When')}</legend>
				<div class="case-edit" style="overflow-x:hidden;">
					<div id="whenNotList" class="grid-fact-when"></div>
					<div id="when_not_add">
						<input type="text" id="whenNotPicker" name="when_not" placeholder="${Problem(85, 'Pick date/time')}">
					</div>
				</div>
			</fieldset>

			<fieldset class="fact2-content facts-when-ok case-field">
				<legend class="case-label">${Problem(10, 'When')}</legend>
				<div class="case-edit" style="overflow-x:hidden;">
					<div id="whenOkList" class="grid-fact-when"></div>
					<div id="when_ok_add">
						<input type="text" id="whenOkPicker" name="when_ok" placeholder="${Problem(85, 'Pick date/time')}">
					</div>
				</div>
			</fieldset>
		</div>
	`;

	const modalOther = (store) => {
		const facts = getFacts(store);
		const otherNot = getOtherRow(facts, 'other_not');
		const otherOk = getOtherRow(facts, 'other_ok');

		return `
			<div class="grid-facts-modal">
				<div class="fact1-explain">${Problem(999, 'Other (not working)')}</div>
				<div class="fact2-explain">${Problem(999, 'Other (working)')}</div>

				<fieldset class="fact1-content facts-other-not case-field">
					<legend class="case-label">${Problem(32, 'Other')}</legend>
					<textarea class="other-fact throttle-field" rows="4" data-column="other_not" data-id="${otherNot.id}">${esc(otherNot.text || '')}</textarea>
				</fieldset>

				<fieldset class="fact2-content facts-other-ok case-field">
					<legend class="case-label">${Problem(32, 'Other')}</legend>
					<textarea class="other-fact throttle-field" rows="4" data-column="other_ok" data-id="${otherOk.id}">${esc(otherOk.text || '')}</textarea>
				</fieldset>
			</div>
		`;
	};

	// ---------------------------------
	// Events
	// ---------------------------------
	const bind = ({ store, scope }) => {
		// Block click on what_not (avoid opening the what_ok modal)
		$(document).on('click', `.fact[data-fact="what_not"].case-item-clickable`, (e) => {
			e.preventDefault();
			e.stopPropagation();
			e.stopImmediatePropagation();
			simulatorShowConfirm({
				title: Problem(82, 'Notice'),
				content: Problem(84, 'The primary symptom is used here.'),
				backgroundDismiss: true
			});
		});

		// Open edit modal (all fact pairs)
		$(document).on('click', '.edit-fact', function () {
			if (!editable(getMode(store))) return;

			const factpair = String($(this).attr('data-factpair') || '');
			$('#simulator_modal_title').html('');

			if (factpair === 'what') {
				$('#simulator_modal_body').html(modalWhatOk(store));
				$('#simulator_modal_footer').html(`
					<div class="grid-buttons-modal">
						<div></div>
						<div></div>
						<div class="std-btn std-btn-enabled insert-what-ok">${Common(596, 'Insert')}</div>
					</div>
				`);
				showSimulatorModal('simulator_modal_common');
				refreshWhatOkModalList(store);
				return;
			}

			if (factpair === 'where') {
				$('#simulator_modal_body').html(modalWhere(store));
				$('#simulator_modal_footer').empty();
				showSimulatorModal('simulator_modal_common');

				// Mark selected buttons based on store (canonical)
				const facts = getFacts(store);
				byMeta(facts, 'where_not').forEach((r) => {
					$(`.modal-fact-where[data-fact="where_not"][data-nmb="${r.key_value}"]`)
						.removeClass('add-fact-where')
						.addClass('remove-fact-where')
						.attr('data-id', r.id);
				});
				byMeta(facts, 'where_ok').forEach((r) => {
					$(`.modal-fact-where[data-fact="where_ok"][data-nmb="${r.key_value}"]`)
						.removeClass('add-fact-where')
						.addClass('remove-fact-where')
						.attr('data-id', r.id);
				});
				return;
			}

			if (factpair === 'when') {
				$('#simulator_modal_body').html(modalWhen());
				$('#simulator_modal_footer').empty();
				showSimulatorModal('simulator_modal_common');
				refreshWhenModalLists(store);
				initWhenPickers(store, scope);
				return;
			}

			if (factpair === 'other') {
				$('#simulator_modal_body').html(modalOther(store));
				$('#simulator_modal_footer').empty();
				showSimulatorModal('simulator_modal_common');
				return;
			}
		});

		// Insert what_ok (keep modal open)
		$(document).on('click', '.insert-what-ok', async () => {
			if (!editable(getMode(store))) return;

			const normalityId = parseInt(String($('#normality option:selected').val() || '0'), 10);
			const functionId = parseInt(String($('#function option:selected').val() || '0'), 10);
			const clarify = String($('#whatOkClarify').text() || '');

			if (normalityId <= 0 || functionId <= 0) {
				simulatorShowConfirm({
					title: Problem(82, 'Notice'),
					content: Problem(86, 'Select normality and function first.'),
					backgroundDismiss: true
				});
				return;
			}

			const payload = {
				key_meta: 'what_ok',
				key_value: JSON.stringify({ normalityID: normalityId, functionID: functionId }),
				text: clarify
			};

			const res = await window.ProblemFormsController.writeForm(FORM_KEY, 'create', payload, store, scope);
			if (!res?.ok) console.warn('[facts] create what_ok failed', res);

			refreshWhatOkModalList(store);
			$('#normality').prop('selectedIndex', 0);
			$('#function').prop('selectedIndex', 0);
			$('#whatOkClarify').empty();

			render(store);
		});

		// Delete a fact row (works for what_ok, when_ok, when_not)
		$(document).on('click', '.delete-fact', async function () {
			if (!editable(getMode(store))) return;

			const id = parseInt(String($(this).attr('data-id') || '0'), 10);
			if (!id) return;

			// Optimistic modal removal
			const $item = $(this).closest('.fact-when-element, .fact-line');
			if ($item.length) $item.remove();

			const field = String($(this).attr('data-field') || '');

			const res = await window.ProblemFormsController.writeForm(FORM_KEY, 'delete', { id }, store, scope);
			if (!res?.ok) console.warn('[facts] delete failed', res);

			// Rebuild modal lists from canonical store
			if (field === 'what_ok') refreshWhatOkModalList(store);
			if (field === 'when_ok' || field === 'when_not') refreshWhenModalLists(store);

			render(store);
		});

		// Create or delete where fact
		$(document).on('click', '.modal-fact-where', async function () {
			if (!editable(getMode(store))) return;

			const $el = $(this);
			const keyMeta = String($el.attr('data-fact') || '');
			const keyValue = String($el.attr('data-nmb') || '');
			const id = parseInt(String($el.attr('data-id') || '0'), 10);

			// CREATE
			if ($el.hasClass('add-fact-where')) {
				$el.addClass('remove-fact-where').removeClass('add-fact-where');

				const res = await window.ProblemFormsController.writeForm(
					FORM_KEY,
					'create',
					{ key_meta: keyMeta, key_value: keyValue, text: '' },
					store,
					scope
				);

				if (!res?.ok) console.warn('[facts] create where failed', res);

				// ensure modal button has id (canonical)
				// simplest: rebuild by reopening logic: just re-render main + keep modal state best-effort
				render(store);
				return;
			}

			// DELETE
			if ($el.hasClass('remove-fact-where') && id > 0) {
				$el.addClass('add-fact-where').removeClass('remove-fact-where');
				$el.attr('data-id', '');

				const res = await window.ProblemFormsController.writeForm(FORM_KEY, 'delete', { id }, store, scope);
				if (!res?.ok) console.warn('[facts] delete where failed', res);

				render(store);
			}
		});

		// Other: update on blur (id+text only, matches your FormsService)
		$(document).on('blur', '.throttle-field[data-column="other_not"], .throttle-field[data-column="other_ok"]', async function () {
			if (!editable(getMode(store))) return;

			const id = parseInt(String($(this).attr('data-id') || '0'), 10);
			const column = String($(this).attr('data-column') || '');
			const text = String($(this).val() || '');

			if (!column) return;

			// If there is no row yet, create it first
			if (!id) {
				const resCreate = await window.ProblemFormsController.writeForm(
					FORM_KEY,
					'create',
					{ key_meta: column, key_value: '', text },
					store,
					scope
				);
				if (!resCreate?.ok) console.warn('[facts] create other failed', resCreate);
				render(store);
				return;
			}

			const res = await window.ProblemFormsController.writeForm(
				FORM_KEY,
				'update',
				{ id, text },
				store,
				scope
			);

			if (!res?.ok) console.warn('[facts] update other failed', res);
			render(store);
		});
	};

	// Expose so symptoms can trigger facts re-render
	window.ProblemFormFacts = { render, bind };

	window.ProblemFormsRegistry.register({ key: FORM_KEY, render, bind });
})();