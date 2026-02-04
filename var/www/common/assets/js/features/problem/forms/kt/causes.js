/* /common/assets/js/features/problem/forms/default/causes.js
 *
 * Problem > Causes form (migrated from legacy; optimized structure).
 *
 * UI parity with legacy:
 * - Method block (details/summary)
 * - Sortable list (only when editable mode)
 * - Each cause row shows:
 *   - possible/true cause label
 *   - likelihood
 *   - evidence
 * - Modal:
 *   - create cause (select CI + deviation text)
 *   - edit cause (likelihood, evidence, proven/disproven, delete)
 *
 * Optimal module contract:
 * - export default { render(store, view), bind(ctx, view) }
 * - view.root_id: container selector (e.g. '#display_causes')
 * - view.mode: numeric mode (1 enabled, 2 limited, 3 disabled)
 *
 * Server writes via:
 * - ProblemFormsController.writeForm('causes', crud, payload, store, scope)
 *
 * Notes:
 * - This module does NOT self-register. Registration happens in the template bundle.
 * - Event handlers are delegated and namespaced to avoid duplicate bindings.
 * - All writes go through ProblemFormsHelpers.safeWrite() for consistent user feedback + rollback.
 */

/* global $, simulatorShowConfirm, showSimulatorModal, hideSimulatorModal */

const CausesForm = (() => {
	'use strict';

	const H = window.ProblemFormsHelpers;

	const FORM_KEY = 'causes';
	const EVENT_NS = '.problem_causes';

	// ---------------------------------
	// Term helpers (SIM_SHARED maps)
	// ---------------------------------
	const Common = (id, fallback = '') => H.tMap('common_terms', id, fallback);
	const KT = (id, fallback = '') => H.tMap('kt_terms', id, fallback);

	// ---------------------------------
	// Store helpers
	// ---------------------------------
	const getCauses = (store) => {
		const arr = store.get().case?.causes;
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
	// Shared lookup helpers (CIs)
	// ---------------------------------
	// Best-effort CI dataset lookup; supports multiple shapes.
	const cisRaw = () => {
		return window.ProblemExerciseStaticContent?.cis
			|| window.SIM_SHARED?.cis
			|| window.SIM_SHARED?.configuration_items
			|| window.SIM_SHARED?.problem_cis
			|| null;
	};

	const ciName = (ciId) => {
		const raw = cisRaw();

		// Map case: { "50A":"Pump", ... } or { "50A":{name:"Pump"} }
		if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
			const v = raw[String(ciId)];
			if (typeof v === 'string') return v;
			if (v && typeof v === 'object') return String(v.ci_text ?? v.name ?? v.text_value ?? ciId);
			return String(ciId);
		}

		// Array case: [{id:"50A", name:"..."}, ...]
		if (Array.isArray(raw)) {
			const target = String(ciId);
			const r = raw.find((x) => String(x?.id ?? x?.ci_id ?? '') === target);
			return r ? String(r.ci_text ?? r.name ?? r.text_value ?? target) : target;
		}

		return String(ciId);
	};

	// ---------------------------------
	// Sortable (arrange)
	// ---------------------------------
	const enableSortable = (store, scope) => {
		if (!$.fn.sortable) return;

		const $ul = $('#sortable');
		if ($ul.length === 0) return;

		try { $ul.sortable('destroy'); } catch {}

		$ul.sortable({
			stop: async () => {
				const endpointScope = resolveScope(store, scope);
				if (!endpointScope.outline_id || !endpointScope.exercise_no) {
					console.warn('[causes] arrange aborted due to missing scope', endpointScope);
					return;
				}

				const ids = $ul.sortable('toArray')
					.map((s) => parseInt(String(s).split('_')[1] || '0', 10))
					.filter((n) => n > 0);

				// Local: update list_no to match UI order (1..n)
				const causes = getCauses(store);
				const byId = new Map(causes.map((c) => [parseInt(c.id, 10), c]));

				ids.forEach((id, idx) => {
					const row = byId.get(id);
					if (row) row.list_no = idx + 1;
				});

				// Keep canonical ordering locally too
				store.get().case.causes = causes
					.slice()
					.sort((a, b) => (parseInt(a.list_no || 0, 10) - parseInt(b.list_no || 0, 10)));

				// Re-render immediately (snappy UI)
				H.renderPlan(store);

				// Server: persist order (safe write with rollback)
				const res = await H.safeWrite(
					store,
					() => window.ProblemFormsController.writeForm(
						FORM_KEY,
						'arrange',
						{ ids_in_order: ids },
						store,
						endpointScope
					),
					'Save failed. Please try again.'
				);

				// On success, render canonical state (server may normalize)
				if (res) H.renderPlan(store);
			}
		});

		$ul.disableSelection();
	};

	// ---------------------------------
	// Modal builders
	// ---------------------------------
	const modalCreate = (store) => {
		// Build CI options (best-effort)
		const raw = cisRaw();
		let options = '';

		if (Array.isArray(raw)) {
			// Filter to allowed possible causes; if flag missing, keep row.
			const rows = raw
				.slice()
				.filter((r) => parseInt(r?.is_possible_cause ?? 1, 10) !== 0)
				.sort((a, b) => String(a?.ci_text ?? a?.name ?? a?.text_value ?? '').localeCompare(String(b?.ci_text ?? b?.name ?? b?.text_value ?? '')));

			options = rows.map((r) => {
				const id = String(r.id ?? r.ci_id ?? '');
				const name = String(r.ci_text ?? r.name ?? r.text_value ?? id);
				return `<option value="${H.esc(id)}">${H.esc(name)}</option>`;
			}).join('');
		} else if (raw && typeof raw === 'object') {
			options = Object.entries(raw).map(([id, v]) => {
				const name = (typeof v === 'string') ? v : String(v?.name ?? v?.text_value ?? id);
				return `<option value="${H.esc(id)}">${H.esc(name)}</option>`;
			}).join('');
		}

		return `
			<div class="grid-cause-add">
				<div>
					<select name="causeCi" class="form-control" id="causeCi" required>
						<option value="00O">-- ${H.esc(KT(21, 'Select object'))} --</option>
						${options}
					</select>
				</div>

				<fieldset class="case-field">
					<legend class="case-label">${H.esc(KT(155, 'Deviation'))}</legend>
					<div id="text_cause_deviation" class="case-edit" contenteditable></div>
				</fieldset>
			</div>
		`;
	};

	const modalCreateFooter = () => {
		return `
			<div class="grid-buttons-modal">
				<div></div>
				<div></div>
				<div class="std-btn std-btn-enabled insert-cause">${H.esc(Common(287, 'Save'))}</div>
			</div>
		`;
	};

	const modalEdit = (store, id, mode) => {
		const causes = getCauses(store);
		const c = causes.find((x) => parseInt(x.id || 0, 10) === id);
		if (!c) return '<div>Missing cause</div>';

		const ciId = String(c.ci_id || '');
		const title = `${ciName(ciId)} - ${String(c.deviation_text || '')}`;

		const readOnlyLikelihood = !H.isEditable(mode);

		return `
			<div class="grid-cause">
				<fieldset class="cause-text case-field-readonly">
					<legend class="case-label">${H.esc(KT(29, 'Possible cause'))}</legend>
					<div id="edit_cause_possible" class="case-edit-disabled" contenteditable="false">${H.esc(title)}</div>
				</fieldset>

				<fieldset class="cause-liho ${readOnlyLikelihood ? 'case-field-readonly' : 'case-field'}">
					<legend class="case-label">${H.esc(KT(17, 'Likelihood'))}</legend>
					<div id="edit_cause_likelihood" class="${readOnlyLikelihood ? 'case-edit-disabled' : 'case-edit'}" contenteditable="${readOnlyLikelihood ? 'false' : 'true'}">${H.esc(c.likelihood_text ?? '')}</div>
				</fieldset>

				<fieldset class="cause-evid case-field">
					<legend class="case-label">${H.esc(KT(26, 'Evidence'))}</legend>
					<div id="edit_cause_evidence" class="case-edit" contenteditable="true">${H.esc(c.evidence_text ?? '')}</div>
				</fieldset>

				<div class="cause-proof cause-proven ${parseInt(c.is_proven || 0, 10) ? 'cause-selected' : ''}">${H.esc(KT(23, 'Proven'))}</div>
				<div class="cause-proof cause-disproven ${parseInt(c.is_disproven || 0, 10) ? 'cause-selected' : ''}">${H.esc(KT(24, 'Disproven'))}</div>
			</div>
		`;
	};

	const modalEditFooter = (id, mode) => {
		const canEdit = H.isEditable(mode);

		const delBtn = (id > 0 && canEdit)
			? `<div class="delete-cause clickable link-text" data-id="${id}"><i class="fa-solid fa-trash"></i></div>`
			: '';

		return `
			<div class="grid-buttons-modal">
				<div></div>
				<div>${delBtn}</div>
				<div class="std-btn std-btn-enabled update-cause" data-id="${id}">${H.esc(Common(287, 'Save'))}</div>
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
		const causes = getCauses(store);

		let listHtml = '';
		if (causes.length) {
			// Ensure stable ordering by list_no
			const ordered = causes.slice().sort((a, b) => (parseInt(a.list_no || 0, 10) - parseInt(b.list_no || 0, 10)));

			listHtml = ordered.map((c) => {
				const id = parseInt(c.id || 0, 10) || 0;

				const ciId = String(c.ci_id || '');
				const causeText = `${ciName(ciId)} - ${String(c.deviation_text || '')}`;

				const likelihood = String(c.likelihood_text ?? '');
				const evidence = String(c.evidence_text ?? '');

				const isProven = (parseInt(c.is_proven || 0, 10) || 0) > 0;
				const isDisproven = (parseInt(c.is_disproven || 0, 10) || 0) > 0;

				const label = isProven ? KT(25, 'True cause') : KT(29, 'Possible cause');
				const lineThrough = isDisproven ? ' line-through' : '';
				return `
					<li class="ui-state-default" id="caId_${id}">
						<div class="grid-cause-list${canEdit ? ' read-cause' : ''}" data-id="${id}">
							<div class="cause-list-drag${canEdit ? ' dragable' : ''}">
								<i class="fa-solid fa-grip-dots-vertical"></i>
							</div>

							<fieldset class="${canEdit ? 'case-field clickable' : 'case-field-readonly'} cause-list-text ${isProven ? 'true-cause' : ''}">
								<legend class="case-label">${H.esc(label)}</legend>
								<div class="${canEdit ? 'case-item-clickable' : 'case-item'}${lineThrough}" data-field="cause">
									${H.esc(causeText)}
								</div>
							</fieldset>

							<fieldset class="${canEdit ? 'case-field clickable' : 'case-field-readonly'} cause-list-likelihood">
								<legend class="case-label">${H.esc(KT(17, 'Likelihood'))}</legend>
								<div class="${canEdit ? 'case-item-clickable' : 'case-item'}">${H.esc(likelihood)}</div>
							</fieldset>

							<fieldset class="${canEdit ? 'case-field clickable' : 'case-field-readonly'} cause-list-evidence">
								<legend class="case-label">${H.esc(KT(26, 'Evidence'))}</legend>
								<div class="${canEdit ? 'case-item-clickable' : 'case-item'}">${H.esc(evidence)}</div>
							</fieldset>
						</div>
					</li>
				`;
			}).join('');
		}

		const addBtn = (canEdit && causes.length < 50)
			? `<span class="add-cause clickable link-text">${H.esc(KT(36, 'Add possible cause'))}</span>`
			: '';

		$(rootId).html(`
			<div class="form-step-header">${H.esc(KT(4, 'Causes'))}</div>

			<div class="grid-cause-order">
				<div>
					<ul id="sortable">
						${listHtml}
					</ul>
				</div>

				<div id="add_cause_btn">
					${addBtn}
				</div>
			</div>
		`);

		// Keep sortable active after every render; renderPlan() replaces the UL
		// and would otherwise drop the jQuery UI binding.
		if (canEdit) enableSortable(store);
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

		// Enable sortable only when editable and after DOM exists
		enableSortable(store, scope);

		// Open create modal
		$(document).on(`click${EVENT_NS}`, '.add-cause', () => {
			$('#simulator_modal_title').html(H.esc(KT(29, 'Cause')));
			$('#simulator_modal_body').html(modalCreate(store));
			$('#simulator_modal_footer').html(modalCreateFooter());

			showSimulatorModal('simulator_modal_common');
		});

		// Create cause
		$(document).on(`click${EVENT_NS}`, '.insert-cause.std-btn-enabled', async function (e) {
			e.preventDefault();
			e.stopImmediatePropagation();

			const $btn = $(this);

			const ciId = String($('#causeCi option:selected').val() || '00O');
			const deviation = String($('#text_cause_deviation').text() || '').trim();

			if (ciId === '00O') {
				simulatorShowConfirm({
					title: Common(214, 'Notice'),
					content: Common(233, 'Select item first'),
					backgroundDismiss: true
				});
				return;
			}

			if ($btn.data('clicked')) return;
			$btn.data('clicked', true);

			$btn
				.removeClass('std-btn-enabled')
				.addClass('std-btn-disabled')
				.prop('disabled', true)
				.attr({ 'aria-disabled': 'true', 'aria-busy': 'true' })
				.css('pointer-events', 'none');

			const endpointScope = resolveScope(store, scope);

			const res = await H.safeWrite(
				store,
				() => window.ProblemFormsController.writeForm(
					FORM_KEY,
					'create',
					{ ci_id: ciId, deviation_text: deviation },
					store,
					endpointScope
				),
				'Save failed. Please try again.'
			);
			if (!res) return;

			hideSimulatorModal('simulator_modal_common');
			H.renderPlan(store);
		});

		// Open edit modal
		$(document).on(`click${EVENT_NS}`, '.read-cause', function () {
			const id = parseInt(String($(this).attr('data-id') || '0'), 10);
			if (!id) return;

			$('#simulator_modal_title').html(H.esc(KT(29, 'Cause')));
			$('#simulator_modal_body').html(modalEdit(store, id, mode));
			$('#simulator_modal_footer').html(modalEditFooter(id, mode));

			showSimulatorModal('simulator_modal_common');
		});

		// Toggle proven/disproven
		$(document).on(`click${EVENT_NS}`, '.cause-proven', function () {
			$(this).toggleClass('cause-selected');
			$(this).next('.cause-disproven').removeClass('cause-selected');
		});

		$(document).on(`click${EVENT_NS}`, '.cause-disproven', function () {
			$(this).toggleClass('cause-selected');
			$(this).prev('.cause-proven').removeClass('cause-selected');
		});

		// Update cause
		$(document).on(`click${EVENT_NS}`, '.update-cause', async function () {
			const id = parseInt(String($(this).attr('data-id') || '0'), 10);
			if (!id) return;

			const payload = {
				id,
				likelihood_text: String($('#edit_cause_likelihood').text() || ''),
				evidence_text: String($('#edit_cause_evidence').text() || ''),
				is_proven: $('.cause-proven').hasClass('cause-selected') ? 1 : 0,
				is_disproven: $('.cause-disproven').hasClass('cause-selected') ? 1 : 0
			};

			const endpointScope = resolveScope(store, scope);

			const res = await H.safeWrite(
				store,
				() => window.ProblemFormsController.writeForm(FORM_KEY, 'update', payload, store, endpointScope),
				'Save failed. Please try again.'
			);
			if (!res) return;

			hideSimulatorModal('simulator_modal_common');
			H.renderPlan(store);
		});

		// Delete cause
		$(document).on(`click${EVENT_NS}`, '.delete-cause', function () {
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
							hideSimulatorModal('simulator_modal_common');

							const endpointScope = resolveScope(store, scope);

							const res = await H.safeWrite(
								store,
								() => window.ProblemFormsController.writeForm(FORM_KEY, 'delete', { id }, store, endpointScope),
								'Delete failed. Please try again.'
							);
							if (!res) return;

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

export default CausesForm;