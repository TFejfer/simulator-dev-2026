/* causes.js
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
 * Modes (case.visibility.causes):
 * 0 hidden, 1 enabled, 2 limited, 3 disabled
 *
 * Server writes via:
 * ProblemFormsController.writeForm('causes', crud, payload, store, scope)
 */

/* global $, simulatorShowConfirm, showSimulatorModal, hideSimulatorModal */

(() => {
	'use strict';

	const FORM_KEY = 'causes';
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

	const getCauses = (store) => {
		const arr = store.get().case?.causes;
		return Array.isArray(arr) ? arr : [];
	};

	// ---------------------------------
	// Shared lookup helpers (CIs)
	// ---------------------------------
	// You may have CIs in SIM_SHARED under another key.
	// This tries a few common keys; if not found, it will still render ci_id raw.
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

	const esc = (s) => {
		return String(s ?? '')
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#039;');
	};

	// ---------------------------------
	// Restore method (causes) – placeholder, keep structure
	// You can replace with the full legacy method block later if needed.
	// ---------------------------------
	const renderRestoreMethod = () => {
		return `
			<div id="met_step3">
                <ul>
					<li>
						<span class="method-question">${Method(27)}</span>
						<ul>
							<li><span>${Method(28)}</span></li>
							<li><span>${Method(29)}</span></li>
						</ul>
					</li>
					<li>
						<span class="method-question">${Method(30)}</span>
						<ul>
							<li><span>${Method(31)}</span></li>
							<li><span>${Method(39)}</span></li>
						</ul>
					</li>
					<li>
						<span class="method-question">${Method(33)}</span>
						<ul>
							<li><span>${Method(34)}</span></li>
							<li><span>${Method(44)}</span></li>
						</ul>
					</li>
                </ul>
            </div>
		`;
	};

	// ---------------------------------
	// Sortable (arrange)
	// ---------------------------------
	const enableSortable = ({ store, scope }) => {
		if (!$.fn.sortable) return;

		$('#sortable').sortable({
			stop: async () => {
				const endpointScope = resolveScope(store, scope);
				if (!endpointScope.outline_id || !endpointScope.exercise_no) {
					console.warn('[causes] arrange aborted due to missing scope', endpointScope);
					return;
				}

				const ids = $('#sortable').sortable('toArray')
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
				render(store);

				// Server: persist order
				await window.ProblemFormsController.writeForm(
					FORM_KEY,
					'arrange',
					{ ids_in_order: ids },
					store,
					endpointScope
				);

				// Re-render again (canonical from server, if server normalizes)
				render(store);
			}
		});

		$('#sortable').disableSelection();
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

				const proven = (parseInt(c.proven || 0, 10) || 0) > 0;
				const disproven = (parseInt(c.disproven || 0, 10) || 0) > 0;

				const label = proven ? Problem(25, 'True cause') : Problem(29, 'Possible cause');
				const lineThrough = disproven ? ' line-through' : '';

				return `
					<li class="ui-state-default" id="caId_${id}">
						<div class="grid-cause-list${canEdit ? ' read-cause' : ''}" data-id="${id}">
							<div class="cause-list-drag${canEdit ? ' dragable' : ''}">
								<i class="fa-solid fa-grip-dots-vertical"></i>
							</div>

							<fieldset class="${canEdit ? 'case-field clickable' : 'case-field-readonly'} cause-list-text ${proven ? 'true-cause' : ''}">
								<legend class="case-label">${esc(label)}</legend>
								<div class="${canEdit ? 'case-item-clickable' : 'case-item'}${lineThrough}" data-field="cause">
									${esc(causeText)}
								</div>
							</fieldset>

							<fieldset class="${canEdit ? 'case-field clickable' : 'case-field-readonly'} cause-list-likelihood">
								<legend class="case-label">${esc(Problem(17, 'Likelihood'))}</legend>
								<div class="${canEdit ? 'case-item-clickable' : 'case-item'}">${esc(likelihood)}</div>
							</fieldset>

							<fieldset class="${canEdit ? 'case-field clickable' : 'case-field-readonly'} cause-list-evidence">
								<legend class="case-label">${esc(Problem(26, 'Evidence'))}</legend>
								<div class="${canEdit ? 'case-item-clickable' : 'case-item'}">${esc(evidence)}</div>
							</fieldset>
						</div>
					</li>
				`;
			}).join('');
		}

		const addBtn = (canEdit && causes.length < 50)
			? `<span class="add-cause clickable link-text">${esc(Problem(36, 'Add possiblecause'))}</span>`
			: '';

		$(CONTAINER).html(`
			<details class="form-method">
				<summary class="form-step-header">3. ${esc(Problem(4, 'Causes'))}</summary>
				${renderRestoreMethod()}
			</details>

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

		// Enable sortable only when editable

		if (canEdit) {
			const endpointScope = resolveScope(store, window._problemFormsScope || null);
			enableSortable({ store, scope: endpointScope });
		}
	};

	// ---------------------------------
	// Modal builders
	// ---------------------------------
	const modalCreate = (store) => {
		const themeId = getThemeId(store);

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
				return `<option value="${esc(id)}">${esc(name)}</option>`;
			}).join('');
		} else if (raw && typeof raw === 'object') {
			options = Object.entries(raw).map(([id, v]) => {
				const name = (typeof v === 'string') ? v : String(v?.name ?? v?.text_value ?? id);
				return `<option value="${esc(id)}">${esc(name)}</option>`;
			}).join('');
		} else {
			// Fallback if no CI dataset exists
			options = '';
		}

		return `
			<div class="grid-cause-add">
				<div>
					<select name="causeCi" class="form-control" id="causeCi" required>
						<option value="00O">-- ${esc(Problem(21, 'Select item'))} --</option>
						${options}
					</select>
				</div>

				<fieldset class="case-field">
					<legend class="case-label">${esc(Problem(58, 'Deviation'))}</legend>
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
				<div class="std-btn std-btn-enabled insert-cause">${esc(Common(287, 'Save'))}</div>
			</div>
		`;
	};

	const modalEdit = (store, id) => {
		const causes = getCauses(store);
		const c = causes.find((x) => parseInt(x.id || 0, 10) === id);
		if (!c) return '<div>Missing cause</div>';

		const ciId = String(c.ci_id || '');
		const title = `${ciName(ciId)} - ${String(c.deviation_text || '')}`;

		const mode = getMode(store);
		const readOnlyLikelihood = mode !== 1;

		return `
			<div class="grid-cause">
				<fieldset class="cause-text case-field-readonly">
					<legend class="case-label">${esc(Problem(29, 'Possible cause'))}</legend>
					<div id="edit_cause_possible" class="case-edit-disabled" contenteditable="false">${esc(title)}</div>
				</fieldset>

				<fieldset class="cause-liho ${readOnlyLikelihood ? 'case-field-readonly' : 'case-field'}">
					<legend class="case-label">${esc(Problem(17, 'Likelihood'))}</legend>
					<div id="edit_cause_likelihood" class="${readOnlyLikelihood ? 'case-edit-disabled' : 'case-edit'}" contenteditable="${readOnlyLikelihood ? 'false' : 'true'}">${esc(c.likelihood_text ?? '')}</div>
				</fieldset>

				<fieldset class="cause-evid case-field">
					<legend class="case-label">${esc(Problem(26, 'Evidence'))}</legend>
					<div id="edit_cause_evidence" class="case-edit" contenteditable="true">${esc(c.evidence_text ?? '')}</div>
				</fieldset>

				<div class="cause-proof cause-proven ${parseInt(c.proven || 0, 10) ? 'cause-selected' : ''}">${esc(Problem(23, 'Proven'))}</div>
				<div class="cause-proof cause-disproven ${parseInt(c.disproven || 0, 10) ? 'cause-selected' : ''}">${esc(Problem(24, 'Disproven'))}</div>
			</div>
		`;
	};

	const modalEditFooter = (store, id) => {
		const mode = getMode(store);
		const canEdit = editable(mode);

		const delBtn = (id > 0 && canEdit)
			? `<div class="delete-cause clickable link-text" data-id="${id}"><i class="fa-solid fa-trash"></i></div>`
			: '';

		return `
			<div class="grid-buttons-modal">
				<div></div>
				<div>${delBtn}</div>
				<div class="std-btn std-btn-enabled update-cause" data-id="${id}">${esc(Common(287, 'Save'))}</div>
			</div>
		`;
	};

	// ---------------------------------
	// Events
	// ---------------------------------
	const bind = ({ store, scope }) => {
		// Save scope for sortable callback (render() calls enableSortable)
		window._problemFormsScope = scope;

		// Open create modal
		$(document).on('click', '.add-cause', () => {
			if (!editable(getMode(store))) return;

			$('#simulator_modal_title').html(esc(Problem(29, 'Cause')));
			$('#simulator_modal_body').html(modalCreate(store));
			$('#simulator_modal_footer').html(modalCreateFooter());

			showSimulatorModal('simulator_modal_common');
		});

		// Create cause
		$(document).on('click', '.insert-cause.std-btn-enabled', async function (e) {
			e.preventDefault();
			e.stopImmediatePropagation();

			if (!editable(getMode(store))) return;

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

			hideSimulatorModal('simulator_modal_common');

			await window.ProblemFormsController.writeForm(
				FORM_KEY,
				'create',
				{ ci_id: ciId, deviation_text: deviation },
				store,
				scope
			);

			render(store);
		});

		// Open edit modal
		$(document).on('click', '.read-cause', function () {
			const id = parseInt(String($(this).attr('data-id') || '0'), 10);
			if (!id) return;

			$('#simulator_modal_title').html(esc(Problem(29, 'Cause')));
			$('#simulator_modal_body').html(modalEdit(store, id));
			$('#simulator_modal_footer').html(modalEditFooter(store, id));

			showSimulatorModal('simulator_modal_common');
		});

		// Toggle proven/disproven
		$(document).on('click', '.cause-proven', function () {
			$(this).toggleClass('cause-selected');
			$(this).next('.cause-disproven').removeClass('cause-selected');
		});

		$(document).on('click', '.cause-disproven', function () {
			$(this).toggleClass('cause-selected');
			$(this).prev('.cause-proven').removeClass('cause-selected');
		});

		// Update cause
		$(document).on('click', '.update-cause', async function () {
			if (!editable(getMode(store))) return;

			const id = parseInt(String($(this).attr('data-id') || '0'), 10);
			if (!id) return;

			const payload = {
				id,
				likelihood_text: String($('#edit_cause_likelihood').text() || ''),
				evidence_text: String($('#edit_cause_evidence').text() || ''),
				proven: $('.cause-proven').hasClass('cause-selected') ? 1 : 0,
				disproven: $('.cause-disproven').hasClass('cause-selected') ? 1 : 0
			};

			hideSimulatorModal('simulator_modal_common');

			await window.ProblemFormsController.writeForm(FORM_KEY, 'update', payload, store, scope);
			render(store);
		});

		// Delete cause
		$(document).on('click', '.delete-cause', function () {
			if (!editable(getMode(store))) return;

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
							await window.ProblemFormsController.writeForm(FORM_KEY, 'delete', { id }, store, scope);
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

	// Expose for cross-form refresh (optional)
	window.ProblemFormCauses = { render, bind };

	window.ProblemFormsRegistry.register({ key: FORM_KEY, render, bind });
})();