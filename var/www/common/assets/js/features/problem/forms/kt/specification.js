/* /common/assets/js/features/problem/forms/kt/specification.js
 *
 * KT PA > Specification (plan-driven form module)
 *
 * State contract:
 * - store.get().case.specification: { [field:string]: string }
 * - store.get().case.causes: Array<{id, ci_id|ciID, deviation, test_what, test_where, test_when, test_extent, ...}>
 * - store.get().case.visibility.specification (0..3)
 * - store.get().meta.is_frontline (0/1)
 *
 * Writes:
 * - specification: ProblemFormsController.writeForm('specification','upsert',{ field, text }, store, scope)
 * - cause tests (legacy parity): ProblemFormsController.writeForm('causes','update',{ id, column, text }, store, scope)
 */

/* global $, showSimulatorModal, hideSimulatorModal */

const KtSpecificationForm = (() => {
	'use strict';

	const H = window.ProblemFormsHelpers;

	const FORM_KEY = 'specification';
	const EVENT_NS = '.kt_specification';

	// ----------------------------
	// Terms (KT)
	// ----------------------------
	const KT = (id, fallback = '') => H.tMap('kt_terms', id, fallback);

	// ---------------------------------
	// KT questions (term-id driven; legacy parity)
	// ---------------------------------
	const KT_SPEC_QUESTIONS_CLASSIC = [
		{ field: 'what_is', seq: 1, tid: 167 },
		{ field: 'what_is', seq: 2, tid: 168 },
		{ field: 'what_isnot', seq: 1, tid: 169 },
		{ field: 'what_isnot', seq: 2, tid: 170 },

		{ field: 'where_is', seq: 1, tid: 171 },
		{ field: 'where_is', seq: 2, tid: 172 },
		{ field: 'where_isnot', seq: 1, tid: 173 },
		{ field: 'where_isnot', seq: 2, tid: 174 },

		{ field: 'when_is', seq: 1, tid: 175 },
		{ field: 'when_is', seq: 2, tid: 176 },
		{ field: 'when_is', seq: 3, tid: 177 },
		{ field: 'when_isnot', seq: 1, tid: 178 },
		{ field: 'when_isnot', seq: 2, tid: 179 },
		{ field: 'when_isnot', seq: 3, tid: 180 },

		{ field: 'extent_is', seq: 1, tid: 181 },
		{ field: 'extent_is', seq: 2, tid: 182 },
		{ field: 'extent_is', seq: 3, tid: 183 },
		{ field: 'extent_isnot', seq: 1, tid: 184 },
		{ field: 'extent_isnot', seq: 2, tid: 185 },
		{ field: 'extent_isnot', seq: 3, tid: 186 },

		{ field: 'what_distinctions', seq: 1, tid: 187 },
		{ field: 'what_distinctions', seq: 2, tid: 188 },
		{ field: 'what_changes', seq: 1, tid: 189 },
		{ field: 'what_changes', seq: 2, tid: 190 },
		{ field: 'what_changes', seq: 3, tid: 191 },

		{ field: 'where_distinctions', seq: 1, tid: 192 },
		{ field: 'where_distinctions', seq: 2, tid: 193 },
		{ field: 'where_changes', seq: 1, tid: 194 },
		{ field: 'where_changes', seq: 2, tid: 195 },
		{ field: 'where_changes', seq: 3, tid: 196 },

		{ field: 'when_distinctions', seq: 1, tid: 197 },
		{ field: 'when_distinctions', seq: 2, tid: 198 },
		{ field: 'when_changes', seq: 1, tid: 199 },
		{ field: 'when_changes', seq: 2, tid: 200 },
		{ field: 'when_changes', seq: 3, tid: 201 },

		{ field: 'extent_distinctions', seq: 1, tid: 202 },
		{ field: 'extent_distinctions', seq: 2, tid: 203 },
		{ field: 'extent_changes', seq: 1, tid: 204 },
		{ field: 'extent_changes', seq: 2, tid: 205 },
		{ field: 'extent_changes', seq: 3, tid: 206 },
	];

	const KT_SPEC_QUESTIONS_FRONTLINE = [
		{ field: 'what_is', seq: 1, tid: 212 },
		{ field: 'what_is', seq: 2, tid: 213 },
		{ field: 'what_isnot', seq: 1, tid: 214 },
		{ field: 'what_isnot', seq: 2, tid: 215 },

		{ field: 'where_is', seq: 1, tid: 216 },
		{ field: 'where_isnot', seq: 1, tid: 217 },

		{ field: 'when_is', seq: 1, tid: 218 },
		{ field: 'when_is', seq: 2, tid: 219 },
		{ field: 'when_isnot', seq: 1, tid: 220 },
		{ field: 'when_isnot', seq: 2, tid: 221 },

		// extent fields intentionally blank in frontline legacy
		{ field: 'extent_is', seq: 1, tid: 0 },
		{ field: 'extent_isnot', seq: 1, tid: 0 },
	];

	const getKtSpecQuestions = (frontline) =>
		frontline ? KT_SPEC_QUESTIONS_FRONTLINE : KT_SPEC_QUESTIONS_CLASSIC;

	const questionsHtmlForField = (frontline, field) => {
		const list = getKtSpecQuestions(frontline)
			.filter((q) => q.field === field)
			.sort((a, b) => a.seq - b.seq);

		return list
			.map((q) => {
				const text = q.tid ? KT(q.tid, '') : '';
				return text ? `<p>${H.esc(text)}</p>` : '';
			})
			.join('');
	};

	// ----------------------------
	// Store helpers
	// ----------------------------
	const getMode = (store) => store.get().case?.visibility?.specification ?? 0;
	const canEdit = (mode) => H.isEditable(mode);

	const isFrontline = (store) => (Number(store.get().meta?.is_frontline || 0) === 1);

	const getSpec = (store) => {
		const s = store.get().case?.specification;
		return (s && typeof s === 'object') ? s : {};
	};

	const setSpecFieldLocal = (store, field, text) => {
		store.get().case.specification = store.get().case.specification || {};
		store.get().case.specification[field] = String(text ?? '');
	};

	const getCauses = (store) => {
		const arr = store.get().case?.causes;
		return Array.isArray(arr) ? arr : [];
	};

	const getCauseById = (store, id) => getCauses(store).find((c) => Number(c?.id || 0) === Number(id));

	// ----------------------------
	// KT Spec config
	// ----------------------------
	const SPEC_ROWS = ['what', 'where', 'when', 'extent'];

	// Classic includes DC columns, frontline hides them
	const SPEC_COLUMNS_CLASSIC = ['is', 'isnot', 'distinctions', 'changes'];
	const SPEC_COLUMNS_FRONTLINE = ['is', 'isnot'];

	const PAIR_QUESTIONS_CLASSIC = { what: 3, where: 3, when: 4, extent: 4 };     // legacy uses variable rows; you can fine tune
	const PAIR_QUESTIONS_FRONT = { what: 3, where: 2, when: 3, extent: 1 };        // minimal; tune as needed

	// Field naming in DB = `${row}_${column}`
	const fieldKey = (row, col) => `${row}_${col}`;

	const getColumns = (store) => (isFrontline(store) ? SPEC_COLUMNS_FRONTLINE : SPEC_COLUMNS_CLASSIC);

	const rowHeaderLabel = (row) => {
		const map = {
			what: KT(8, 'what'),
			where: KT(9, 'where'),
			when: KT(10, 'when'),
			extent: KT(65, 'extent')
		};
		return map[row] || row;
	};

	const colHeaderLabel = (col) => {
		const map = {
			is: KT(64, 'is'),
			isnot: KT(63, 'is not'),
			distinctions: KT(100, 'distinctions'),
			changes: KT(101, 'changes')
		};
		return map[col] || col;
	};

	// ----------------------------
	// DC toggle state
	// ----------------------------
	const isDcVisible = () => {
		const v = sessionStorage.getItem('kt_isDcVisible');
		return v === '1';
	};

	const setDcVisible = (on) => {
		sessionStorage.setItem('kt_isDcVisible', on ? '1' : '0');
	};

	// ----------------------------
	// Auto-resize helpers (optional integration with your existing global helpers)
	// ----------------------------
	const autoResizeContainer = () => {
		// If you have global helpers, call them here:
		// window.simulatorAutoResizeRowsOfTextarea?.('pa_spec_container', 'auto-resize', 'row', SPEC_ROWS);
	};

	// ----------------------------
	// Rendering
	// ----------------------------
	const render = (store, view) => {
		const rootId = String(view?.root_id || '#display_specification');
		const mode = Number(view?.mode ?? getMode(store));

		if (!H.isVisible(mode)) {
			$(rootId).empty();
			return;
		}

		const editable = canEdit(mode);
		const spec = getSpec(store);

		// Causes shown in header + test columns
		let causes = getCauses(store);

		// Cause focus toggle uses store.get().case.possible_cause_in_focus (you can name it as you want; keep consistent)
		const focusId = Number(store.get().case?.possible_cause_in_focus || 0);
		if (!isFrontline(store) && focusId > 0) {
			causes = causes.filter((c) => Number(c?.id || 0) === focusId);
		}
		const causeCount = isFrontline(store) ? 0 : causes.length;

		const cols = getColumns(store);
		const showDc = !isFrontline(store) && isDcVisible();

		const fixedColCount = showDc ? cols.length : 2; // is + isnot always first two
		const totalCols = fixedColCount + causeCount;

		const mergedClass = showDc ? 'merged-cell5' : 'merged-cell3'; // keep your legacy class names if CSS expects them

		// Top labels
		let html = `
			<div class="form-step-header">${KT(61, 'specification')}</div>
			<div id="pa_spec_container" class="pa-spec-container" style="--columns: ${totalCols};">
		`;

		html += `
			<div class="${mergedClass} pa-label pa-label-underlined line-clamp1">
				${KT(103, 'Specify the problem')}
				${(!isFrontline(store) ? `(<span id="toggle_dc" class="clickable link-text">dc</span>)` : '')}
			</div>
		`;

		if (causeCount > 0) {
			html += `
				<div class="pa-label merged-cells pa-label-underlined line-clamp1" style="--cells: ${causeCount};">
					${KT(104, 'Evaluate possible causes')}
				</div>
			`;
		}

		// Problem statement
		const stmtFieldsetClass = editable ? 'case-field' : 'case-field-readonly';
		const stmtTextareaClass = editable ? 'clickable pa-spec-edit' : 'textarea-readonly';

		html += `
			<div class="${mergedClass}">
				<fieldset class="${stmtFieldsetClass}">
					<legend class="case-label">${KT(105, 'problem statement')}</legend>
					<textarea id="problemStatementModal" class="pa-spec auto-resize ${stmtTextareaClass}" rows="1"
						data-row="problem" data-column="statement" readonly>${H.esc(spec.problem_statement || '')}</textarea>
				</fieldset>
			</div>
		`;

		// Cause toggle header cells
		if (causeCount > 0) {
			causes.forEach((c) => {
				const label = String(c?.deviation || '');
				html += `
					<div>
						<div class="pa-stat pa-cause-toggle clickable link-text" data-id="${Number(c.id)}" contenteditable="false">
							<span class="line-clamp2">${H.esc(label)}</span>
						</div>
					</div>
				`;
			});
		}

		// Column headers (fixed)
		const fixedLabels = cols.map(colHeaderLabel);
		// Hide DC columns if not visible
		const fixedToRender = showDc ? cols : cols.slice(0, 2);

		fixedToRender.forEach((label, idx) => {
			const dcClass = (!showDc && idx >= 2) ? ' col-dc' : '';
			// (dcClass kept for CSS parity)
			html += `<div class="pa-spec-column-header line-clamp1${dcClass}">${H.esc(label)}</div>`;
		});

		// Column headers (cause tests)
		if (causeCount > 0) {
			causes.forEach((c) => {
				html += `<div class="pa-spec-column-header col-test line-clamp1" data-id="${Number(c.id)}">${H.esc(KT(106, 'Test'))}</div>`;
			});
		}

		// Rows
		SPEC_ROWS.forEach((row) => {
			html += `<div class="pa-spec-row-header line-clamp1">${H.esc(rowHeaderLabel(row))}</div>`;

			const qCount = isFrontline(store) ? (PAIR_QUESTIONS_FRONT[row] || 2) : (PAIR_QUESTIONS_CLASSIC[row] || 3);
			const rowsAttr = Math.max(1, qCount * 2 - 1);

			// Fixed spec cells
			fixedToRender.forEach((col, colIndex) => {
				const field = fieldKey(row, col);
				const val = String(spec[field] || '');
				const taClass = editable ? 'clickable pa-spec-edit' : 'textarea-readonly';
				const dcClass = (!showDc && colIndex >= 2) ? ' col-dc' : '';

				html += `
					<div class="${dcClass}">
						<fieldset class="${stmtFieldsetClass}">
							<textarea class="pa-spec auto-resize ${taClass}" rows="${rowsAttr}"
								data-row="${row}" data-column="${col}" readonly>${H.esc(val)}</textarea>
						</fieldset>
					</div>
				`;
			});

			// Cause test cells
			if (causeCount > 0) {
				causes.forEach((c) => {
					const id = Number(c.id);
					const testField = `test_${row}`;
					const val = String(c?.[testField] || '');
					const taClass = editable ? 'test-cause clickable' : 'textarea-readonly';

					html += `
						<div>
							<fieldset class="${stmtFieldsetClass}">
								<textarea class="auto-resize ${taClass}" rows="${rowsAttr}"
									data-id="${id}" data-row="${row}" readonly>${H.esc(val)}</textarea>
							</fieldset>
						</div>
					`;
				});
			}
		});

		html += `</div>`;
		$(rootId).html(html);

		// Apply DC visibility via CSS toggles after render
		if (!isFrontline(store)) {
			$('.col-dc').toggle(showDc);
		}

		autoResizeContainer();
	};

	// ----------------------------
	// Modals
	// ----------------------------
	const modalProblemStatement = (store) => {
		const spec = getSpec(store);
		const questions = `
			<p>${H.esc(KT(207, ''))}</p>
			<p>${H.esc(KT(208, ''))}</p>
			<p>${H.esc(KT(209, ''))}</p>
		`;

		return `
			<div class="grid-test-cause-modal">
				<div class="test-cause-question">${questions}</div>
				<fieldset class="test-cause-input case-field">
					<legend class="case-label">${H.esc(KT(105, 'problem statement'))}</legend>
					<textarea id="problemStatementUpsert" class="throttle-field" rows="2"
						data-form="specification" data-column="problem_statement">${H.esc(spec.problem_statement || '')}</textarea>
				</fieldset>
			</div>
		`;
	};

	const specPairModal = (row, column, store) => {
		// Pair: open modal for the selected column + its neighbor (is/isnot, distinctions/changes)
		const cols = getColumns(store);
		const colIndex = cols.indexOf(column);
		const leftIndex = (colIndex % 2 === 0) ? colIndex : colIndex - 1;
		const rightIndex = (colIndex % 2 === 0) ? colIndex + 1 : colIndex;
		const leftCol = cols[leftIndex];
		const rightCol = cols[rightIndex] || cols[leftIndex];

		const spec = getSpec(store);
		const leftField = fieldKey(row, leftCol);
		const rightField = fieldKey(row, rightCol);
		const leftBase = `${row}_${leftCol}`;
		const rightBase = `${row}_${rightCol}`;

		const questionsFor = (field) => questionsHtmlForField(isFrontline(store), field);

		return `
			<div class="grid-spec-modal">
				<div class="spec1-question">${questionsFor(leftBase)}</div>
				<div class="spec2-question">${questionsFor(rightBase)}</div>

				<fieldset class="spec1-input case-field">
					<legend class="case-label">${H.esc(colHeaderLabel(leftCol))}</legend>
					<textarea class="spec-pair throttle-field" rows="8"
						data-form="specification" data-column="${leftBase}">${H.esc(spec[leftField] || '')}</textarea>
				</fieldset>

				<fieldset class="spec2-input case-field">
					<legend class="case-label">${H.esc(colHeaderLabel(rightCol))}</legend>
					<textarea class="spec-pair throttle-field" rows="8"
						data-form="specification" data-column="${rightBase}">${H.esc(spec[rightField] || '')}</textarea>
				</fieldset>
			</div>
		`;
	};

	const causeTestModal = (causeId, row, store) => {
		const c = getCauseById(store, causeId);
		if (!c) return `<div>Error</div>`;

		const spec = getSpec(store);
		const problemStatement = spec.problem_statement
			? `<span style="font-style: italic;">${H.esc(spec.problem_statement)}</span>`
			: '';

		const original = String(KT(163, '')) || '';
		const possibleCause = `<span style="font-style: italic;">${H.esc(c.deviation || '')}</span>`;
		const q1 = original
			.replace('[possible cause]', possibleCause)
			.replace('[problem]', problemStatement);

		const q2 = String(KT(164, '')) || '';
		const field = `test_${row}`;
		const text = String(c?.[field] || '');

		return `
			<div class="grid-test-cause-modal">
				<div class="test-cause-question">
					<p>${q1}</p>
					<p>${H.esc(q2)}</p>
				</div>
				<fieldset class="test-cause-input case-field">
					<legend class="case-label">${H.esc(KT(106, 'Test'))}</legend>
					<textarea class="throttle-field" rows="8"
						data-form="causes" data-id="${Number(causeId)}" data-column="${field}">${H.esc(text)}</textarea>
				</fieldset>
			</div>
		`;
	};

	// ----------------------------
	// Throttle (local, like iterations)
	// ----------------------------
	const throttle = { timer: null, shouldWait: false, last: { key: '', text: null }, delayMs: 5000 };

	const flushThrottle = async (store, scope, form, key, text) => {
		const normalized = String(text ?? '');

		// dedupe by (form+key)
		const dedupeKey = `${form}:${key}`;
		if (throttle.last.key === dedupeKey && throttle.last.text === normalized) return;

		throttle.last.key = dedupeKey;
		throttle.last.text = normalized;

		if (form === 'specification') {
			// local
			setSpecFieldLocal(store, key, normalized);

			// server
			return window.ProblemFormsController.writeForm(
				'specification',
				'upsert',
				{ field: key, text: normalized },
				store,
				scope
			);
		}

		if (form === 'causes') {
			// local
			const id = Number($('#simulator_modal_common .throttle-field').attr('data-id') || 0);
			const c = getCauseById(store, id);
			if (c) c[key] = normalized;

			// server (legacy parity)
			return window.ProblemFormsController.writeForm(
				'causes',
				'update',
				{ id, column: key, text: normalized },
				store,
				scope
			);
		}
	};

	const scheduleThrottle = (store, scope, form, key, text) => {
		if (throttle.timer) clearTimeout(throttle.timer);

		throttle.timer = setTimeout(async () => {
			throttle.timer = null;
			await flushThrottle(store, scope, form, key, text);
		}, throttle.delayMs);
	};

	// ----------------------------
	// Bind
	// ----------------------------
	const bind = (ctx, view) => {
		const store = ctx.store;
		const scope = ctx.scope;

		const mode = Number(view?.mode ?? getMode(store));
		if (!canEdit(mode)) {
			$(document).off(EVENT_NS);
			return;
		}

		$(document).off(EVENT_NS);

		// Toggle DC columns
		$(document).on(`click${EVENT_NS}`, '#toggle_dc', (e) => {
			e.preventDefault();
			e.stopPropagation();
			const on = !isDcVisible();
			setDcVisible(on);
			render(store, view);
		});

		// Cause focus toggle
		$(document).on(`click${EVENT_NS}`, '.pa-cause-toggle', function (e) {
			e.preventDefault();
			e.stopPropagation();

			const id = Number($(this).attr('data-id') || 0);
			const current = Number(store.get().case?.possible_cause_in_focus || 0);

			store.get().case.possible_cause_in_focus = (current === 0 ? id : 0);
			render(store, view);
		});

		// Open spec modal (pair or problem statement)
		$(document).on(`click${EVENT_NS}`, '.pa-spec-edit', function () {
			const row = String($(this).attr('data-row') || '');
			const col = String($(this).attr('data-column') || '');

			$('#simulator_modal_title').html(H.esc(col === 'statement' ? KT(105, 'Specification') : row));
			if (col === 'statement') {
				$('#simulator_modal_body').html(modalProblemStatement(store));
			} else {
				$('#simulator_modal_body').html(specPairModal(row, col, store));
			}
			$('#simulator_modal_footer').empty();

			showSimulatorModal('simulator_modal_common');
		});

		// Open cause test modal
		$(document).on(`click${EVENT_NS}`, '.test-cause', function () {
			const id = Number($(this).attr('data-id') || 0);
			const row = String($(this).attr('data-row') || '');
			if (!id || !row) return;

			$('#simulator_modal_title').html(H.esc(row));
			$('#simulator_modal_body').html(causeTestModal(id, row, store));
			$('#simulator_modal_footer').empty();

			showSimulatorModal('simulator_modal_common');
		});

		// Throttle typing (both spec + causes) - same field class
		$(document).on(`input${EVENT_NS}`, '#simulator_modal_common .throttle-field', function () {
			const $ta = $(this);
			const form = String($ta.attr('data-form') || '');
			const key = String($ta.attr('data-column') || '');
			const text = String($ta.val() || '');

			if (!form || !key) return;

			// local snappy update
			if (form === 'specification') {
				setSpecFieldLocal(store, key, text);
			} else if (form === 'causes') {
				const id = Number($ta.attr('data-id') || 0);
				const c = getCauseById(store, id);
				if (c) c[key] = text;
			}

			// schedule server write
			scheduleThrottle(store, scope, form, key, text);
		});

		// Flush on blur
		$(document).on(`blur${EVENT_NS}`, '#simulator_modal_common .throttle-field', async function () {
			const $ta = $(this);
			const form = String($ta.attr('data-form') || '');
			const key = String($ta.attr('data-column') || '');
			const text = String($ta.val() || '');

			if (!form || !key) return;

			if (throttle.timer) clearTimeout(throttle.timer);
			throttle.timer = null;

			await flushThrottle(store, scope, form, key, text);
		});

		// Resize after window resize
		$(window).off(`resize${EVENT_NS}`).on(`resize${EVENT_NS}`, () => {
			autoResizeContainer();
		});

		// Modal focus parity (keep your existing global helpers if you want)
		$('#simulator_modal_common')
			.off(`transitionend${EVENT_NS}`)
			.on(`transitionend${EVENT_NS}`, () => {
				// Optional: call your global cursor helpers if they exist
				// window.simulatorMoveCursorToEndOfTextarea?.('#problemStatementUpsert');
			});
	};

	return { render, bind };
})();

export default KtSpecificationForm;