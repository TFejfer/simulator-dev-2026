/* /common/assets/js/features/sidebar/sources/maintenance.js
 * Maintenance (legacy-compatible rendering + DataTables).
 * Fix: NEVER init DataTables while the table (or parent) has width 0.
 *
 * INPUTS (data + format):
 * - window.ProblemExerciseStaticContent / window.ProblemExerciseStateContent
 *   - .sources.maintenance (object)
 *   - .history (array) rows with: days_back, item_date, time_start, time_end, sentence, is_monthly
 *   - .monthly (array) strings or objects (rendered into Monthly maintenance details)
 * - window.SIM_SHARED (object) may include: themes, menu_buttons
 * - window.simulatorTerm(id, scope, fallback) (optional) for localization
 * - ctx: { delivery, exercise } resolved from #page-data
 *
 * REQUIRED LIBRARIES:
 * - jQuery (window.jQuery)
 * - DataTables (jQuery.fn.DataTable)
 *
 * REQUIRED EXTERNAL FUNCTIONS:
 * - window.ProblemInfoSources.register
 * - window.ProblemInfoSourceUtils.getMenuButtonLabel
 * - window.SIM_DEBUG (optional shared helper; /common/assets/js/core/sim-debug.js)
 *
 * DEBUG MODE:
 * - Enable by adding ?debug to the URL (or &debug).
 * - Logs validation of inputs, libraries, functions, and pipeline steps.
 * - All debug entries are prefixed with [maintenance.js].
 */

(() => {
	'use strict';

	if (!window.ProblemInfoSources?.register || !window.ProblemInfoSourceUtils) return;

	const { getMenuButtonLabel } = window.ProblemInfoSourceUtils;

	const esc = (s) => {
		const str = String(s ?? '');
		return str
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	};

	const term = (id, fallback = '') =>
		(typeof window.simulatorTerm === 'function' ? window.simulatorTerm(id, 'common', fallback) : fallback);

	/* =========================
	 * Debug helpers (?debug)
	 * ========================= */
	const SIM_DEBUG = window.SIM_DEBUG || (() => {
		const enabled = (() => {
			try {
				const params = new URLSearchParams(window.location.search || '');
				return params.has('debug');
			} catch {
				return /[?&]debug(=|&|$)/i.test(String(window.location.search || ''));
			}
		})();

		return {
			enabled: () => enabled,
			log(prefix, event, data = {}) {
				if (!enabled) return;
				console.log(prefix, { ts: new Date().toISOString(), event, ...data });
			},
			check(prefix, label, ok, details = {}) {
				if (!enabled) return;
				const level = ok ? 'log' : 'warn';
				console[level](prefix, { ts: new Date().toISOString(), check: label, ok, ...details });
			}
		};
	})();

	const dbg = (event, data = {}) => SIM_DEBUG.log('[maintenance.js]', event, data);
	const debugCheck = (label, ok, details = {}) => SIM_DEBUG.check('[maintenance.js]', label, ok, details);

	// Debug: verify libraries and external functions are available
	debugCheck('lib:jQuery', !!window.jQuery);
	debugCheck('lib:DataTable', !!window.jQuery?.fn?.DataTable);
	debugCheck('fn:ProblemInfoSources.register', !!window.ProblemInfoSources?.register);
	debugCheck('fn:ProblemInfoSourceUtils.getMenuButtonLabel', !!window.ProblemInfoSourceUtils?.getMenuButtonLabel);
	debugCheck('fn:simulatorTerm(optional)', typeof window.simulatorTerm === 'function' || window.simulatorTerm === undefined);

	const renderEmpty = (title) => `
		<div class="simulator-info-source" data-code="mai">
			<div class="sidebar-title">${esc(title)}</div>
			<p style="opacity:0.7">Maintenance content is not available yet.</p>
		</div>
	`;

	// Same idea as legacy buildMm()
	const buildMonthlyDetails = (monthly = [], summaryLabel = 'Monthly maintenance') => {
		if (!Array.isArray(monthly) || !monthly.length) return '';
		return `
			<details class="monthlyMaintenanceDetails">
				<summary>${esc(summaryLabel)}</summary>
				<br>
				<ul>
					${monthly.map((m) => `<li>${esc(m)}</li>`).join('')}
				</ul>
			</details>
		`;
	};

	// Derive a base date so we can generate dates for missing days like legacy i=0..100
	const deriveBaseDate = (history = []) => {
		const rows = Array.isArray(history) ? history : [];
		if (!rows.length) return null;

		const zero = rows.find((r) => Number(r?.days_back) === 0 && r?.item_date);
		if (zero) return new Date(`${zero.item_date}T00:00:00`);

		let best = null;
		for (const r of rows) {
			const db = Number(r?.days_back);
			if (!Number.isFinite(db) || !r?.item_date) continue;
			if (!best || db < best.days_back) best = { days_back: db, item_date: r.item_date };
		}
		if (!best) return null;

		const d = new Date(`${best.item_date}T00:00:00`);
		d.setDate(d.getDate() + best.days_back);
		return d;
	};

	const isoDateMinusDays = (baseDate, daysBack) => {
		if (!(baseDate instanceof Date) || Number.isNaN(baseDate.getTime())) return '';
		const d = new Date(baseDate.getTime());
		d.setDate(d.getDate() - Number(daysBack || 0));
		const yyyy = d.getFullYear();
		const mm = String(d.getMonth() + 1).padStart(2, '0');
		const dd = String(d.getDate()).padStart(2, '0');
		return `${yyyy}-${mm}-${dd}`;
	};

	// Legacy-style rows: i=0..100 with empty-day rows
	const buildRowsLegacyStyle = (history = [], monthly = [], monthlyLabel = 'Monthly maintenance') => {
		const rows = Array.isArray(history) ? history : [];
		if (!rows.length) return '';

		const baseDate = deriveBaseDate(rows);

		const byDays = new Map();
		for (const r of rows) {
			const db = Number(r?.days_back);
			if (!Number.isFinite(db)) continue;
			if (!byDays.has(db)) byDays.set(db, []);
			byDays.get(db).push(r);
		}

		let html = '';
		for (let i = 0; i <= 100; i++) {
			const bucket = byDays.get(i);

			if (bucket && bucket.length) {
				for (const r of bucket) {
					const date = r?.item_date || isoDateMinusDays(baseDate, i) || '';
					const start = r?.time_start || '';
					const end = r?.time_end || '';
					const sentence = r?.sentence || '';

					const detail = r?.is_monthly
						? `
							<div class="mai-monthly-cell">
								${buildMonthlyDetails(monthly, sentence)}
							</div>
						`
						: esc(sentence);

					html += `
						<tr>
							<td>${esc(date)}</td>
							<td>${esc(start)}</td>
							<td>${esc(end)}</td>
							<td>${detail || ''}</td>
						</tr>
					`;
				}
			} else {
				const date = isoDateMinusDays(baseDate, i) || '';
				html += `
					<tr>
						<td>${esc(date)}</td>
						<td></td>
						<td></td>
						<td></td>
					</tr>
				`;
			}
		}

		return html;
	};

	// IMPORTANT: wait until element (and parents) have non-zero width before DataTables init.
	const waitForNonZeroWidth = ($el, opts = {}) => {
		const $ = window.jQuery;
		const maxFrames = Number(opts.maxFrames || 120); // ~2s @60fps
		const minWidth = Number(opts.minWidth || 50);

		return new Promise((resolve, reject) => {
			let n = 0;

			const tick = () => {
				n++;

				// If removed from DOM, abort
				if (!$el || !$el.length || !document.body.contains($el.get(0))) {
					reject(new Error('maintenance: table not in DOM'));
					return;
				}

				// Use parent width (DataTables cares about layout container)
				const w = $el.parent().width() || $el.width() || 0;

				if (w >= minWidth) {
					resolve(w);
					return;
				}

				if (n >= maxFrames) {
					reject(new Error(`maintenance: still zero width after ${maxFrames} frames (w=${w})`));
					return;
				}

				window.requestAnimationFrame(tick);
			};

			window.requestAnimationFrame(tick);
		});
	};

	const render = (ctx, source, shared = window.SIM_SHARED || {}) => {
		const title = getMenuButtonLabel(window.SIM_SHARED?.menu_buttons || [], 'mai', 'Maintenance');
		const hasContent = source && typeof source === 'object' && Object.keys(source).length;
		dbg('render:start', { hasContent, hasHistory: Array.isArray(source?.history) });
		if (!hasContent) return renderEmpty(title);

		const exercise = ctx?.exercise || {};
		const themesMap = shared?.themes || window.SIM_SHARED?.themes || {};
		const themeName = themesMap?.[exercise.theme_id] || themesMap?.[String(exercise.theme_id)] || exercise.theme_name || exercise.theme || '';
		const scenario = exercise.scenario || exercise.scenario_id || '';
		const openAttribute = exercise.format === 10 ? 'open' : '';

		// Header labels (exactly like legacy term IDs)
		const thDate = term(35, 'Date');
		const thStart = term(150, 'Start');
		const thEnd = term(151, 'End');
		const thEvent = term(152, 'Event');

		// Put the rows in a template so bind() can inject before init (like your other sources)
		const monthlyLabel = term(72, 'Monthly maintenance');
		const rowsHtml = buildRowsLegacyStyle(source.history, source.monthly, monthlyLabel);

		const summarySuffix = [themeName, scenario].filter(Boolean).map(esc).join('-');

		return `
			<div class="simulator-info-source" data-code="mai">
				<div class="grid-maintenance">
					<div class="mai-title">
						<div class="sidebar-title">${esc(title)}</div>
						<details id="maintenanceDetails" ${openAttribute}>
							<summary>${esc(term(54, 'Maintenance'))}${summarySuffix ? `: ${summarySuffix}` : ''}</summary>
							<p>${esc(term(55, ''))}</p>
							<p>${esc(term(131, ''))}</p>
						</details>
					</div>

					<div class="mai-content">
						<table id="maintenanceTable" class="display" style="width:100%">
							<thead>
								<tr>
									<th class="info-src-header-log">${esc(thDate)}</th>
									<th class="info-src-header-log">${esc(thStart)}</th>
									<th class="info-src-header-log">${esc(thEnd)}</th>
									<th class="info-src-header-log">${esc(thEvent)}</th>
								</tr>
							</thead>
							<tbody></tbody>
						</table>

						<template class="maintenance-rows-template">${rowsHtml}</template>
					</div>
				</div>
			</div>
		`;
	};

	const initDataTableLegacy = ($table) => {
		const $ = window.jQuery;

		// Destroy if already initialized
		if ($.fn.DataTable.isDataTable($table)) {
			try { $table.DataTable().destroy(); } catch (_) {}
		}

		$table.DataTable({
			paging: false,
			searching: true,
			scrollY: '60vh',
			scrollCollapse: true,
			info: false,
			order: [[0, 'desc']],
			ordering: false,
			language: typeof window.datatableTerms === 'function'
				? window.datatableTerms()
				: undefined,
			columnDefs: [
				{ targets: 0, className: 'dt-head-left dt-body-left' },
				{ targets: 1, className: 'dt-head-left dt-body-left' },
				{ targets: 2, className: 'dt-head-left dt-body-left' },
				{ targets: 3, className: 'dt-head-left dt-body-left' },
			],
			drawCallback: function () {
				// Legacy rowspan logic (BODY only)
				const api = this.api();
				const rows = api.rows({ page: 'current' }).nodes();
				let lastDate = null;

				if (api.search()) {
					api.column(0, { page: 'current' }).nodes().each(function (cell) {
						const date = api.cell(cell).data();
						$(cell).text(date).attr('rowspan', 1).css('display', 'table-cell');
					});
					return;
				}

				api.column(0, { page: 'current' }).data().each(function (date, i) {
					const cell = $(rows).eq(i).find('td:first');

					if (lastDate !== date) {
						const rowspanCount = api
							.column(0, { page: 'current' })
							.data()
							.filter((x) => x === date).length;

						cell
							.attr('rowspan', rowspanCount)
							.css('vertical-align', 'middle')
							.text(date)
							.css('display', 'table-cell');

						lastDate = date;
					} else {
						cell.css('display', 'none');
					}
				});
			},
		});
	};

	const bind = async ($root) => {
		const $ = window.jQuery;
		dbg('bind:start', { hasJquery: !!$, hasDataTable: !!$.fn?.DataTable });
		if (!$ || !$.fn?.DataTable) return;

		const $table = $root.find('#maintenanceTable');
		if (!$table.length) return;

		// Inject rows BEFORE init, like legacy did
		const $tmpl = $root.find('.maintenance-rows-template').first();
		if ($tmpl.length) {
			$table.find('tbody').html($tmpl.html());
		}

		// Force CSS width so DT has something to work with
		$table.css('width', '100%');

		// Wait until the table container is actually measurable (fixes style="width:0px" + col widths 0px)
		try {
			await waitForNonZeroWidth($table, { minWidth: 80, maxFrames: 180 });
			dbg('bind:width-ready');
		} catch (e) {
			// If it never becomes visible, do NOT init DT (better than breaking layout).
			// You can log if needed:
			// console.warn(String(e));
			dbg('bind:width-timeout', { error: String(e) });
			return;
		}

		// Init exactly like legacy
		initDataTableLegacy($table);
		dbg('bind:datatable-init');

		// After init: one hard adjust pass (important for scrollY)
		try {
			const dt = $table.DataTable();
			dt.columns.adjust().draw(false);
		} catch (_) {}

		// If your sidebar opens/closes via details or any toggle, re-adjust on toggle.
		const $details = $root.find('#maintenanceDetails');
		if ($details.length) {
			$details.off('.mai_dt').on('toggle.mai_dt', () => {
				try {
					const dt = $table.DataTable();
					dt.columns.adjust().draw(false);
				} catch (_) {}
			});
		}

		$(window).off('resize.mai_dt').on('resize.mai_dt', () => {
			try {
				const dt = $table.DataTable();
				dt.columns.adjust().draw(false);
			} catch (_) {}
		});
	};

	window.ProblemInfoSources.register({
		code: 'mai',
		aliases: ['maintenance'],
		kind: 'static',
		sourceKey: 'maintenance',
		render,
		bind
	});
})();