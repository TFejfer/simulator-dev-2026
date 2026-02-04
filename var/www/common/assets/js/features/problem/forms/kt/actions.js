/* /common/assets/js/features/problem/forms/default/actions.js
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
 * Optimal module contract:
 * - export default { render(store, view), bind(ctx, view) }
 * - view.root_id: container selector (e.g. '#display_actions')
 * - view.mode: numeric mode (1 enabled, 2 limited, 3 disabled)
 *
 * Server writes via:
 * - ProblemFormsController.writeForm('actions', crud, payload, store, scope)
 *
 * Notes:
 * - This module does NOT self-register. Registration happens in the template bundle.
 * - Event handlers are delegated and namespaced to avoid duplicate bindings.
 * - All writes go through ProblemFormsHelpers.safeWrite() for consistent feedback + rollback.
 */

/* global $, simulatorShowConfirm, showSimulatorModal, hideSimulatorModal */

const ActionsForm = (() => {
	'use strict';

	const H = window.ProblemFormsHelpers;

	const FORM_KEY = 'actions';
	const EVENT_NS = '.problem_actions';

	// ---------------------------------
	// Term helpers (SIM_SHARED maps)
	// ---------------------------------
	const Common = (id, fallback = '') => H.tMap('common_terms', id, fallback);
	const KT = (id, fallback = '') => H.tMap('kt_terms', id, fallback);

	// ---------------------------------
	// Store helpers
	// ---------------------------------
	const getActions = (store) => {
		const arr = store.get().case?.actions;
		return Array.isArray(arr) ? arr : [];
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

	const actionsCatalogRaw = () => window.SIM_SHARED?.ci_actions
		|| window.SIM_SHARED?.cis_actions
		|| window.SIM_SHARED?.actions_catalog
		|| window.SIM_SHARED?.problem_actions
		|| null;

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

	// Mapping: CI type -> allowed actions. Prefer explicit list on CI row.
	const ciActionsMapRaw = () => window.SIM_SHARED?.cis_actions_mapping
		|| window.SIM_SHARED?.ci_actions_mapping
		|| null;

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
	// Render helpers
	// ---------------------------------
	const buildFieldset = (id, label, content, canEdit) => `
		<fieldset class="${canEdit ? 'action-update-modal clickable case-field' : 'case-field-readonly'}" data-id="${id}">
			<legend class="case-label">${H.esc(label)}</legend>
			<div class="${canEdit ? 'case-item-clickable' : 'case-item'}" contenteditable="false">${H.esc(content)}</div>
		</fieldset>
	`;

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
		const rows = getActions(store);

		let listHtml = '';
		if (rows.length) {
			listHtml = rows.map((a) => {
				const id = parseInt(a.id || 0, 10) || 0;

				const ciId = String(a.ci_id ?? a.ciID ?? '');
				const actId = parseInt(a.action_id ?? a.actionID ?? 0, 10) || 0;

				// Preserve legitimate backslashes (e.g. file paths); normalize only double-escaped.
				const effect = H.normalizeDbText(a.effect_text ?? a.effect ?? '');

				const actionLine = `${ciName(ciId)} - ${actionText(actId)}`;

				return `
					${buildFieldset(id, KT(16, 'Action'), actionLine, canEdit)}
					${buildFieldset(id, KT(73, 'Effect'), effect, canEdit)}
				`;
			}).join('');
		}

		const addBtn = (canEdit && rows.length < 50)
			? `<span id="action_insert_modal" class="clickable link-text">${H.esc(KT(45, 'Add action'))}</span>`
			: (canEdit && rows.length >= 50)
				? `<span class="form-text-limit">${H.esc(KT(14, 'Limit reached'))}</span>`
				: '';

		$(rootId).html(`
			<div class="form-step-header">${H.esc(KT(62, 'Actions'))}</div>

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
	const buildCiSelect = (locked) => {
		const raw = cisRaw();
		let options = '';

		if (Array.isArray(raw)) {
			const rows = raw.slice().sort((a, b) =>
				String(a?.name ?? a?.text_value ?? a?.ci_text ?? '').localeCompare(
					String(b?.name ?? b?.text_value ?? b?.ci_text ?? '')
				)
			);

			options = rows.map((r) => {
				const id = String(r.id ?? r.ci_id ?? '');
				const name = String(r.name ?? r.text_value ?? r.ci_text ?? id);
				return `<option value="${H.esc(id)}">${H.esc(name)}</option>`;
			}).join('');
		} else if (raw && typeof raw === 'object') {
			options = Object.entries(raw).map(([id, v]) => {
				const name = (typeof v === 'string') ? v : String(v?.name ?? v?.text_value ?? v?.ci_text ?? id);
				return `<option value="${H.esc(id)}">${H.esc(name)}</option>`;
			}).join('');
		}

		return `
			<select name="ciSelect" class="form-control" id="ciSelect" ${locked ? 'disabled' : 'required'}>
				<option value="0">-- ${H.esc(KT(21, 'Select object'))} --</option>
				${options}
			</select>
		`;
	};

	const buildActionSelect = (ciId, locked, selectedId = 0) => {
		const allowed = allowedActionIdsForCi(ciId);

		let options = `<option value="0">-- ${H.esc(KT(76, 'Select action'))} --</option>`;
		if (allowed.length) {
			options += allowed.map((id) => `<option value="${id}">${H.esc(actionText(id))}</option>`).join('');
		}

		// Preserve selection even if mapping changed
		if (selectedId > 0 && !allowed.includes(selectedId)) {
			options += `<option value="${selectedId}">${H.esc(actionText(selectedId))}</option>`;
		}

		return `
			<select name="actionSelect" class="form-control" id="actionSelect" ${locked ? 'disabled' : 'required'}>
				${options}
			</select>
		`;
	};

	const modalHtml = (id, locked, ciId, selectedActionId = 0) => {
		return `
			<div class="grid-modal-action">
				<div class="ma-cis">${buildCiSelect(locked)}</div>
				<div class="ma-action">${buildActionSelect(ciId, locked, selectedActionId)}</div>

				<fieldset class="ma-effect case-field">
					<legend class="case-label">${H.esc(KT(73, 'Effect'))}</legend>
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
				<div class="std-btn std-btn-enabled upsert-action" data-id="${id}">${H.esc(Common(287, 'Save'))}</div>
			</div>
		`;
	};

	// ---------------------------------
	// Bind (idempotent, plan-driven)
	// ---------------------------------
	const bind = (ctx, view) => {
		const store = ctx.store;
		const scope = ctx.scope;

		const mode = Number(view?.mode ?? 0);
		if (!H.isEditable(mode)) {
			return;
		}

		// Ensure we do not duplicate event handlers across rebinds.
		$(document).off(EVENT_NS);

		// Open create modal
		$(document).on(`click${EVENT_NS}`, '#action_insert_modal', () => {
			$('#simulator_modal_title').html(H.esc(KT(16, 'Action')));
			$('#simulator_modal_body').html(modalHtml(0, false, '00O', 0));
			$('#simulator_modal_footer').html(modalFooter(0));

			showSimulatorModal('simulator_modal_common');
		});

		// Update action select when CI changes (create modal)
		$(document).on(`change${EVENT_NS}`, '#ciSelect', function () {
			const ciId = String($('#ciSelect option:selected').val() || '00O');
			if (ciId === '00O' || ciId === '0') return;

			$('#actionSelect').replaceWith($(buildActionSelect(ciId, false, 0)));
		});

		// Open edit modal
		$(document).on(`click${EVENT_NS}`, '.action-update-modal', function () {
			const id = parseInt(String($(this).attr('data-id') || '0'), 10) || 0;
			if (!id) return;

			const rows = getActions(store);
			const row = rows.find((r) => parseInt(r.id || 0, 10) === id);
			if (!row) return;

			const ciId = String(row.ci_id ?? row.ciID ?? '');
			const actionId = parseInt(row.action_id ?? row.actionID ?? 0, 10) || 0;
			const effect = H.normalizeDbText(row.effect_text ?? row.effect ?? '');

			$('#simulator_modal_title').html(H.esc(KT(16, 'Action')));
			$('#simulator_modal_body').html(modalHtml(id, true, ciId, actionId));
			$('#simulator_modal_footer').html(modalFooter(id));

			$('#ciSelect').val(ciId);
			$('#actionSelect').replaceWith($(buildActionSelect(ciId, true, actionId)));
			$('#actionSelect').val(String(actionId));
			$('.action[data-field="effect"]').text(effect);

			showSimulatorModal('simulator_modal_common');
		});

		// Create or update action (double-click protection)
		$(document).on(`click${EVENT_NS}`, '.upsert-action.std-btn-enabled', async function (e) {
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

			const id = parseInt(String($btn.attr('data-id') || '0'), 10) || 0;

			const ciId = String($('#ciSelect option:selected').val() || '00O');
			const actionId = parseInt(String($('#actionSelect option:selected').val() || '0'), 10) || 0;
			const effect = String($('.action[data-field="effect"]').text() || '');

			// Validation
			if (ciId === '00O' || ciId === '0' || actionId <= 0) {
				simulatorShowConfirm({
					title: KT(82, 'Notification'),
					content: KT(87, 'You must select object and action.'),
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
			const endpointScope = resolveScope(store, scope);

			const res = await H.safeWrite(
				store,
				() => window.ProblemFormsController.writeForm(FORM_KEY, crud, payload, store, endpointScope),
				'Save failed. Please try again.'
			);
			if (!res) return;

			hideSimulatorModal('simulator_modal_common');
			H.renderPlan(store);
		});

		// Delete action
		$(document).on(`click${EVENT_NS}`, '.delete-action', function () {
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
							const endpointScope = resolveScope(store, scope);

							const res = await H.safeWrite(
								store,
								() => window.ProblemFormsController.writeForm(FORM_KEY, 'delete', { id }, store, endpointScope),
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

export default ActionsForm;