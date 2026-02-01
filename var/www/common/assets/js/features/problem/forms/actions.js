/* actions.js
 *
 * UI parity with legacy:
 * - Method block (details/summary)
 * - Grid list: two fieldsets per action row:
 *   - Action (CI + action text)
 *   - Effect (free text)
 * - Modal:
 *   - create action: select CI -> select action (filtered by CI type) -> effect text
 *   - edit action: CI/action selects locked, effect editable, delete available
 *
 * Data model (RUNTIME.problem_form_actions):
 * - id
 * - ci_id (varchar(5))
 * - action_id (smallint)
 * - effect_text (text)
 *
 * Modes (case.visibility.actions):
 * 0 hidden, 1 enabled, 2 limited, 3 disabled
 *
 * Server writes via:
 * ProblemFormsController.writeForm('actions', crud, payload, store, scope)
 */

/* global $, simulatorShowConfirm, showSimulatorModal, hideSimulatorModal */

(() => {
	'use strict';

	const FORM_KEY = 'actions';
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

	// ---------------------------------
	// Store helpers
	// ---------------------------------
	const getMode = (store) => store.get().case?.visibility?.[FORM_KEY] ?? 0;
	const editable = (mode) => mode === 1;

	const getThemeId = (store) => store.get().meta?.theme_id ?? store.get().meta?.exercise?.theme_id ?? 0;

	const getActions = (store) => {
		const arr = store.get().case?.actions;
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
	// Shared lookup helpers
	// ---------------------------------
	const cisRaw = () => {
		return window.ProblemExerciseStaticContent?.cis
			|| window.SIM_SHARED?.cis
			|| window.SIM_SHARED?.configuration_items
			|| window.SIM_SHARED?.problem_cis
			|| null;
	};

	const ciRow = (ciId) => {
		const raw = cisRaw();

		if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
			const v = raw[String(ciId)];
			return (v && typeof v === 'object') ? v : null;
		}

		if (Array.isArray(raw)) {
			return raw.find((x) => String(x?.id ?? x?.ci_id ?? '') === String(ciId)) || null;
		}

		return null;
	};

	const ciName = (ciId) => {
		const raw = cisRaw();

		if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
			const v = raw[String(ciId)];
			if (typeof v === 'string') return v;
			if (v && typeof v === 'object') return String(v.ci_text ?? v.name ?? v.text_value ?? ciId);
			return String(ciId);
		}

		if (Array.isArray(raw)) {
			const r = raw.find((x) => String(x?.id ?? x?.ci_id ?? '') === String(ciId));
			return r ? String(r.ci_text ?? r.name ?? r.text_value ?? ciId) : String(ciId);
		}

		return String(ciId);
	};

	const actionsCatalogRaw = () => window.SIM_SHARED?.ci_actions || window.SIM_SHARED?.cis_actions || window.SIM_SHARED?.actions_catalog || window.SIM_SHARED?.problem_actions || null;

	const actionText = (actionId) => {
		const raw = actionsCatalogRaw();

		if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
			const v = raw[String(actionId)];
			if (typeof v === 'string') return v;
			if (v && typeof v === 'object') return String(v.text ?? v.text_value ?? actionId);
			return String(actionId);
		}

		if (Array.isArray(raw)) {
			const r = raw.find((x) => String(x?.action_id ?? x?.actionID ?? '') === String(actionId));
			return r ? String(r.text ?? r.text_value ?? actionId) : String(actionId);
		}

		return String(actionId);
	};

	// Mapping: CI type -> allowed actions (legacy). Prefer explicit list on CI row.
	// Supported shapes:
	// - CI row: { actions:[2,16] }
	// - array rows: [{ ci_type_id, action_id }, ...]
	// - map: { "10":[1,2], "20":[3], ... }
	const ciActionsMapRaw = () => window.SIM_SHARED?.cis_actions_mapping || window.SIM_SHARED?.ci_actions_mapping || null;

	const ciTypeFromCiId = (ciId) => {
		// Legacy rule: first 2 chars are type digits (e.g. "50A" -> 50)
		const t = String(ciId || '').substring(0, 2);
		const n = parseInt(t, 10);
		return Number.isFinite(n) ? n : 0;
	};

	const allowedActionIdsForCi = (ciId) => {
		const fromRow = ciRow(ciId)?.actions;
		if (Array.isArray(fromRow)) {
			return fromRow.map((x) => parseInt(x, 10)).filter((x) => x > 0);
		}

		const raw = ciActionsMapRaw();
		const ciType = ciTypeFromCiId(ciId);

		if (!ciType) return [];

		// Map case
		if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
			const v = raw[String(ciType)];
			if (Array.isArray(v)) return v.map((x) => parseInt(x, 10)).filter((x) => x > 0);
			return [];
		}

		// Array case
		if (Array.isArray(raw)) {
			return raw
				.filter((r) => parseInt(r?.ci_type_id ?? r?.ciTypeID ?? 0, 10) === ciType)
				.map((r) => parseInt(r?.action_id ?? r?.actionID ?? 0, 10))
				.filter((x) => x > 0);
		}

		return [];
	};

	// ---------------------------------
	// Restore method (actions) – placeholder note
	// Replace with full legacy restore method if needed.
	// ---------------------------------
	const renderRestoreMethod = () => `
		<div id="met_step4">
            <ul>
                <li>
                    <span class="method-question">${Method(35)}</span>
                    <ul>
                        <li><span>${Method(36)}</span></li>
                        <li><span>${Method(37)}</span></li>
                    </ul>
                </li>
                <li>
                    <span class="method-question">${Method(43)}</span>
                    <ul>
                        <li><span>${Method(40)}</span></li>
                    </ul>
                </li>
            </ul>
        </div>
	`;

	// ---------------------------------
	// Render
	// ---------------------------------
	const buildFieldset = (id, label, content, canEdit) => `
		<fieldset class="${canEdit ? 'action-update-modal clickable case-field' : 'case-field-readonly'}" data-id="${id}">
			<legend class="case-label">${esc(label)}</legend>
			<div class="${canEdit ? 'case-item-clickable' : 'case-item'}" contenteditable="false">${esc(content)}</div>
		</fieldset>
	`;

	const render = (store) => {
		const mode = getMode(store);

		if (mode === 0) {
			$(CONTAINER).empty();
			return;
		}

		const canEdit = editable(mode);
		const rows = getActions(store);

		let listHtml = '';
		if (rows.length) {
			listHtml = rows.map((a) => {
				const id = parseInt(a.id || 0, 10) || 0;

				const ciId = String(a.ci_id ?? a.ciID ?? '');
				const actId = parseInt(a.action_id ?? a.actionID ?? 0, 10) || 0;
				const effect = String(a.effect_text ?? a.effect ?? '').replace(/\\/g, '');

				const actionLine = `${ciName(ciId)} - ${actionText(actId)}`;

				return `
					${buildFieldset(id, Problem(16, 'Action'), actionLine, canEdit)}
					${buildFieldset(id, Problem(73, 'Effect'), effect, canEdit)}
				`;
			}).join('');
		}

		const addBtn = (canEdit && rows.length < 50)
			? `<span id="action_insert_modal" class="clickable link-text">${esc(Problem(45, 'Add action'))}</span>`
			: (canEdit && rows.length >= 50)
				? `<span class="form-text-limit">${esc(Problem(14, 'Limit reached'))}</span>`
				: '';

		$(CONTAINER).html(`
			<details class="form-method">
				<summary class="form-step-header">4. ${esc(Problem(12, 'Actions'))}</summary>
				${renderRestoreMethod()}
			</details>

			<div class="grid-actions">
				${listHtml}
			</div>

			<div id="add_action_btn">
				${addBtn}
			</div>
		`);
	};

	// ---------------------------------
	// Modal builders
	// ---------------------------------
	const buildCiSelect = (themeId, locked) => {
		const raw = cisRaw();
		let options = '';

		if (Array.isArray(raw)) {
			// best effort: if your CI rows include theme flags, filter here later
			const rows = raw.slice().sort((a, b) => String(a?.name ?? a?.text_value ?? a?.ci_text ?? '').localeCompare(String(b?.name ?? b?.text_value ?? b?.ci_text ?? '')));
			options = rows.map((r) => {
				const id = String(r.id ?? r.ci_id ?? '');
				const name = String(r.name ?? r.text_value ?? r.ci_text ?? id);
				return `<option value="${esc(id)}">${esc(name)}</option>`;
			}).join('');
		} else if (raw && typeof raw === 'object') {
			options = Object.entries(raw).map(([id, v]) => {
				const name = (typeof v === 'string') ? v : String(v?.name ?? v?.text_value ?? v?.ci_text ?? id);
				return `<option value="${esc(id)}">${esc(name)}</option>`;
			}).join('');
		}

		return `
			<select name="ciSelect" class="form-control" id="ciSelect" ${locked ? 'disabled' : 'required'}>
				<option value="0">-- ${esc(Problem(21, 'Select item'))} --</option>
				${options}
			</select>
		`;
	};

	const buildActionSelect = (ciId, locked, selectedId = 0) => {
		const allowed = allowedActionIdsForCi(ciId);

		let options = `<option value="0">-- ${esc(Problem(76, 'Select action'))} --</option>`;

		if (allowed.length) {
			options += allowed.map((id) => `<option value="${id}">${esc(actionText(id))}</option>`).join('');
		}

		// Preserve selection even if mapping changed
		if (selectedId > 0 && !allowed.includes(selectedId)) {
			options += `<option value="${selectedId}">${esc(actionText(selectedId))}</option>`;
		}

		return `
			<select name="actionSelect" class="form-control" id="actionSelect" ${locked ? 'disabled' : 'required'}>
				${options}
			</select>
		`;
	};

	const modalHtml = (store, id, locked, selectedActionId = 0) => {
		const themeId = getThemeId(store);

		return `
			<div class="grid-modal-action">
				<div class="ma-cis">${buildCiSelect(themeId, locked)}</div>
				<div class="ma-action">${buildActionSelect('00O', locked, selectedActionId)}</div>

				<fieldset class="ma-effect case-field">
					<legend class="case-label">${esc(Problem(73, 'Effect'))}</legend>
					<div class="action case-edit" data-id="${id}" data-field="effect" contenteditable></div>
				</fieldset>
			</div>
		`;
	};

	const modalFooter = (id) => {
		const deleteBtn = `<div class="delete-action clickable link-text" data-id="${id}"><i class="fa-solid fa-trash"></i></div>`;

		return `
			<div class="grid-buttons-modal">
				<div></div>
				<div>${id === 0 ? '' : deleteBtn}</div>
				<div class="std-btn std-btn-enabled upsert-action" data-id="${id}">${esc(Common(287, 'Save'))}</div>
			</div>
		`;
	};

	// ---------------------------------
	// Events
	// ---------------------------------
	const bind = ({ store, scope }) => {
		// Open create modal
		$(document).on('click', '#action_insert_modal', () => {
			if (!editable(getMode(store))) return;

			$('#simulator_modal_title').html(esc(Problem(16, 'Action')));
			$('#simulator_modal_body').html(modalHtml(store, 0, false, 0));
			$('#simulator_modal_footer').html(modalFooter(0));

			showSimulatorModal('simulator_modal_common');
		});

		// Update action select when CI changes (create modal)
		$(document).on('change', '#ciSelect', function () {
			const ciId = String($('#ciSelect option:selected').val() || '00O');
			if (ciId === '00O' || ciId === '0') return;

			$('#actionSelect').replaceWith($(buildActionSelect(ciId, false, 0)));
		});

		// Open edit modal
		$(document).on('click', '.action-update-modal', function () {
			if (!editable(getMode(store))) return;

			const id = parseInt(String($(this).attr('data-id') || '0'), 10) || 0;
			if (!id) return;

			const rows = getActions(store);
			const row = rows.find((r) => parseInt(r.id || 0, 10) === id);
			if (!row) return;

			const ciId = String(row.ci_id ?? row.ciID ?? '');
			const actionId = parseInt(row.action_id ?? row.actionID ?? 0, 10) || 0;
			const effect = String(row.effect_text ?? row.effect ?? '');

			$('#simulator_modal_title').html(esc(Problem(16, 'Action')));
			$('#simulator_modal_body').html(modalHtml(store, id, true, actionId));
			$('#simulator_modal_footer').html(modalFooter(id));

			$('#ciSelect').val(ciId);
			$('#actionSelect').replaceWith($(buildActionSelect(ciId, true, actionId)));
			$('#actionSelect').val(String(actionId));
			$('.action[data-field="effect"]').text(effect);

			showSimulatorModal('simulator_modal_common');
		});

		// Create or update action (double-click protection)
		$(document).on('click', '.upsert-action.std-btn-enabled', async function (e) {
			e.preventDefault();
			e.stopImmediatePropagation();

			if (!editable(getMode(store))) return;

			const $btn = $(this);
			if ($btn.data('clicked')) return;
			$btn.data('clicked', true);

			$btn
				.removeClass('std-btn-enabled')
				.addClass('std-btn-disabled')
				.prop('disabled', true)
				.attr({ 'aria-disabled': 'true', 'aria-busy': 'true' })
				.css('pointer-events', 'none');

			const id = parseInt(String($btn.attr('data-id') || '0'), 10) || 0;

			const ciId = String($('#ciSelect option:selected').val() || '00O');
			const actionId = parseInt(String($('#actionSelect option:selected').val() || '0'), 10) || 0;
			const effect = String($('.action[data-field="effect"]').text() || '');

			// Validation
			if (ciId === '00O' || ciId === '0' || actionId <= 0) {
				simulatorShowConfirm({
					title: Problem(82, 'Notice'),
					content: Problem(87, 'Select item and action first.'),
					backgroundDismiss: true
				});
				$btn
					.removeClass('std-btn-disabled')
					.addClass('std-btn-enabled')
					.prop('disabled', false)
					.removeAttr('aria-disabled')
					.removeAttr('aria-busy')
					.css('pointer-events', '');
				$btn.data('clicked', false);
				return;
			}

			const payload = {
				id,
				ci_id: ciId,
				action_id: actionId,
				effect_text: effect
			};

			const crud = id > 0 ? 'update' : 'create';

			const res = await window.ProblemFormsController.writeForm(FORM_KEY, crud, payload, store, scope);
			hideSimulatorModal('simulator_modal_common');

			if (!res?.ok) console.warn('[actions] upsert failed', res);

			render(store);
		});

		// Delete action
		$(document).on('click', '.delete-action', function () {
			if (!editable(getMode(store))) return;

			const id = parseInt(String($(this).attr('data-id') || '0'), 10) || 0;
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
							const res = await window.ProblemFormsController.writeForm(FORM_KEY, 'delete', { id }, store, scope);
							hideSimulatorModal('simulator_modal_common');
							if (!res?.ok) console.warn('[actions] delete failed', res);
							render(store);
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

	// Expose (optional)
	window.ProblemFormActions = { render, bind };

	// Register
	window.ProblemFormsRegistry.register({ key: FORM_KEY, render, bind });
})();