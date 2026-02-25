/* /common/assets/js/features/sidebar/sources/system-log.js
 * System log rendering with DataTables and custom find/highlight.
 *
 * INPUTS (data + format):
 * - window.ProblemExerciseStaticContent / window.ProblemExerciseStateContent
 *   - .sources.system_log (object)
 *   - .sls or .should (array) rows: [index, time, from, to, text]
 *   - .sla or .actual (array) rows: [index, time, from, to, text]
 * - window.SIM_SHARED (object) may mirror the same structures
 * - window.simulatorTerm(id, scope, fallback) (optional) for localization
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
 * - All debug entries are prefixed with [system-log.js].
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

	const ensureVisibility = (ctx) => {
		if (window.SIM_VISIBILITY?.problem) return window.SIM_VISIBILITY.problem;
		if (window.__PROBLEM_VIS_REQUESTED__ || !window.simulatorAjaxRequest) return null;

		const ex = ctx?.exercise || {};
		const body = {
			format_id: Number(ex.format_id || ex.formatId || ex.format_no || ex.format || 0),
			step_no: Number(ex.step_no || ex.stepNo || ex.step || 0),
			position_count: Number(ex.position_count || ex.positionCount || ex.positions || 0),
			role_id: Number(ex.role_id || ex.roleId || ex.role || 0),
			theme_id: Number(ex.theme_id || ex.themeId || ex.theme || 0),
			scenario_id: Number(ex.scenario_id || ex.scenarioId || ex.scenario || 0)
		};

		window.__PROBLEM_VIS_REQUESTED__ = true;
		window.simulatorAjaxRequest(
			'/ajax/problem_menu_visibility_read.php',
			'POST',
			body,
			{ mode: 'dynamic', timeoutMs: 15000 }
		).then((res) => {
			if (!res?.ok || !res.data || typeof res.data !== 'object') return;
			window.SIM_VISIBILITY = window.SIM_VISIBILITY || {};
			window.SIM_VISIBILITY.problem = res.data;
			if (window.ProblemInfoSidebar?.prepare) {
				try { window.ProblemInfoSidebar.prepare(); } catch {}
			}
		}).catch(() => {});

		return null;
	};

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

	const dbg = (event, data = {}) => SIM_DEBUG.log('[system-log.js]', event, data);
	const debugCheck = (label, ok, details = {}) => SIM_DEBUG.check('[system-log.js]', label, ok, details);

	// Debug: verify libraries and external functions are available
	debugCheck('lib:jQuery', !!window.jQuery);
	debugCheck('lib:DataTable', !!window.jQuery?.fn?.DataTable);
	debugCheck('fn:ProblemInfoSources.register', !!window.ProblemInfoSources?.register);
	debugCheck('fn:ProblemInfoSourceUtils.getMenuButtonLabel', !!window.ProblemInfoSourceUtils?.getMenuButtonLabel);
	debugCheck('fn:simulatorTerm(optional)', typeof window.simulatorTerm === 'function' || window.simulatorTerm === undefined);

	const renderEmpty = (title) => `
		<div class="simulator-info-source" data-code="log">
			<div class="sidebar-title">${esc(title)}</div>
			<p style="opacity:0.7">System log content is not available yet.</p>
		</div>
	`;

	const buildRows = (logType, rows = []) => {
		if (!Array.isArray(rows) || !rows.length) return '';

		return rows
			.map((row) => {
				const r = Array.isArray(row) ? row : [];
				const index = r[0] ?? '';
				const time = Number.parseFloat(r[1]);
				const formattedTime = Number.isFinite(time) ? time.toFixed(3) : esc(r[1] ?? '');
				const from = r[2] ?? '';
				const to = r[3] ?? '';
				const text = r[4] ?? '';

				return `
					<tr>
						<td><input type="checkbox" name="${logType}ItemCheckBox" /></td>
						<td>${esc(index)}</td>
						<td>${esc(formattedTime)}</td>
						<td>${esc(from)}</td>
						<td>${esc(to)}</td>
						<td>${esc(text)}</td>
					</tr>
				`;
			})
			.join('');
	};

	const logTable = (logType, titleId, rowsHtml) => {
		const heading = esc(term(titleId, logType === 'sla' ? 'System alerts' : 'System logs'));
		const th1 = esc(term(27, 'Index'));
		const th2 = esc(term(28, 'Time'));
		const th3 = esc(term(29, 'From'));
		const th4 = esc(term(30, 'To'));
		const th5 = esc(term(31, 'Description'));
		const bodyId = `${logType}Body`;

		return `
			<div class="grid-log-table system-log-panel" data-log="${logType}">
				<div class="log-table-title sidebar-title">${heading}</div>
				<div class="log-table-content">
					<div class="system-log-search">
						<div style="position: relative; display: inline-block;">
							<input class="system-log-search-input" type="search" id="find-${logType}Table" placeholder="Find" aria-label="Find in ${heading}">
							<button type="button" id="clear-${logType}Table" style="
								position: absolute;
								right: 6px;
								top: 50%;
								transform: translateY(-50%);
								border: none;
								background: transparent;
								cursor: pointer;
								font-size: 14px;
								line-height: 1;
								padding: 0;
								display: none;
							">✖</button>
						</div>
						<button id="prev-highlight-${logType}Table" type="button"> < </button>
						<button id="next-highlight-${logType}Table" type="button"> > </button>
						<span id="${logType}-hit-count" class="hit-count">0 / 0</span>
					</div>
					<table id="${logType}Table" class="display system-log-table" style="width:100%;">
						<thead>
							<tr>
								<th><span class="${logType}Check"><i class="fa-regular fa-square"></i></span></th>
								<th>${th1}</th>
								<th>${th2}</th>
								<th>${th3}</th>
								<th>${th4}</th>
								<th>${th5}</th>
							</tr>
						</thead>
						<tbody id="${bodyId}"></tbody>
					</table>
					<template class="system-log-rows" data-log="${logType}">${rowsHtml}</template>
				</div>
			</div>
		`;
	};

	const render = (ctx, source) => {
		const title = getMenuButtonLabel(window.SIM_SHARED?.menu_buttons || [], 'log', 'System log');
		const step = Number(ctx?.exercise?.step_no || 0);
		const vis = ensureVisibility(ctx) || window.SIM_VISIBILITY?.problem || null;
		const slsAllowed = (vis?.sls ?? 1) > 0;
		const slaAllowed = (vis?.sla ?? 1) > 0;

		const slsRows = slsAllowed ? buildRows('sls', source?.sls || source?.should) : '';
		const rawSlaRows = slaAllowed ? buildRows('sla', source?.sla || source?.actual) : '';
		const slaRows = step === 80 && slsRows ? slsRows : rawSlaRows;
		const hasContent = Boolean(slsRows || slaRows);

		dbg('render', { hasContent, hasSls: Boolean(slsRows), hasSla: Boolean(slaRows) });

		if (!hasContent) return renderEmpty(title);

		return `
			<div class="simulator-info-source" data-code="log">
				<div class="sidebar-title">${esc(title)}</div>
				<div class="grid-log-side-by-side">
					${slsRows ? logTable('sls', 23, slsRows) : ''}
					${slaRows ? logTable('sla', 24, slaRows) : ''}
				</div>
			</div>
		`;
	};

	// Waits for the table to have a measurable width before initializing DataTables
	const waitForNonZeroWidth = ($el, opts = {}) => {
		const $ = window.jQuery;
		const maxFrames = Number(opts.maxFrames || 360);
		const minWidth = Number(opts.minWidth || 50);

		return new Promise((resolve, reject) => {
			let n = 0;

			const tick = () => {
				n++;

				if (!$el || !$el.length || !document.body.contains($el.get(0))) {
					reject(new Error('system-log: table not in DOM'));
					return;
				}

				const w = $el.parent().width() || $el.width() || 0;
				if (w >= minWidth) {
					resolve(w);
					return;
				}

				if (n >= maxFrames) {
					reject(new Error(`system-log: still zero width after ${maxFrames} frames (w=${w})`));
					return;
				}

				window.requestAnimationFrame(tick);
			};

			window.requestAnimationFrame(tick);
		});
	};

	// Initializes DataTables with simulator defaults and translations when available
	const initDataTable = ($table) => {
		const $ = window.jQuery;

		if ($.fn.DataTable.isDataTable($table)) {
			try { $table.DataTable().destroy(); } catch (_) {}
		}

		$table.DataTable({
			destroy: true,
			scrollY: '60vh',
			scrollCollapse: true,
			paging: false,
			autoWidth: true,
			language: typeof window.datatableTerms === 'function'
				? window.datatableTerms()
				: undefined,
			order: [[1, "desc"]],
			columnDefs: [{
				targets: 0,
				className: 'dt-center',
				orderable: false
			}],
		});
	};

	// Injects rows, waits for layout, and wires DataTables for a log table
	const bindTable = async ($root, logType) => {
		const $ = window.jQuery;
		const $table = $root.find(`#${logType}Table`);
		if (!$table.length) return null;

		dbg('bind:table', { logType, hasTable: true });

		const $tmpl = $root.find(`.system-log-rows[data-log="${logType}"]`).first();
		if ($tmpl.length) {
			$table.find('tbody').html($tmpl.html());
		}

		$table.css('width', '100%');

		try {
			await waitForNonZeroWidth($table, { minWidth: 80, maxFrames: 180 });
		} catch (e) {
			dbg('bind:table:wait-failed', { logType, error: String(e?.message || e) });
			return null;
		}

		initDataTable($table);

		try {
			$table.DataTable().columns.adjust().draw(false);
		} catch (_) {}

		return $table;
	};

	// Adds find/highlight controls shared by both log tables
	const bindFindControls = ($root) => {
		const $ = window.jQuery;
		const state = {
			sls: { highlights: [], current: -1 },
			sla: { highlights: [], current: -1 }
		};

		const escapeRegExp = (text) => String(text ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

		const updateHitCount = (logType, current, total) => {
			$root.find(`#${logType}-hit-count`).text(`${current} / ${total}`);
		};

		const clearHighlights = (logType) => {
			const selector = `#${logType}Table td`;
			$root.find(selector).each(function () {
				const $cell = $(this);

				$cell.find('span.highlight').each(function () {
					$(this).replaceWith($(this).text());
				});

				$cell.removeClass('current-highlight');
			});

			state[logType].highlights = [];
			state[logType].current = -1;
			updateHitCount(logType, 0, 0);
		};

		const highlightText = (logType, searchText) => {
			clearHighlights(logType);
			const text = String(searchText || '').trim();
			if (!text) return;

			const regex = new RegExp(`(${escapeRegExp(text)})`, 'gi');
			const selector = `#${logType}Table td`;
			$root.find(selector).each(function () {
				const $cell = $(this);
				if ($cell.find('input[type="checkbox"]').length) return;

				const cellText = $cell.text();
				if (!cellText.match(regex)) return;

				const highlighted = cellText.replace(regex, '<span class="highlight">$1</span>');
				$cell.html(highlighted);

				$cell.find('.highlight').each(function () {
					state[logType].highlights.push(this);
				});
			});

			updateHitCount(logType, 0, state[logType].highlights.length);
		};

		const navigate = (logType, direction) => {
			const arr = state[logType].highlights;
			if (!arr.length) {
				updateHitCount(logType, 0, 0);
				return -1;
			}

			if (state[logType].current >= 0 && state[logType].current < arr.length) {
				$(arr[state[logType].current]).removeClass('current-highlight');
			}

			if (direction === 'next') {
				state[logType].current = (state[logType].current + 1) % arr.length;
			} else if (direction === 'prev') {
				state[logType].current = (state[logType].current - 1 + arr.length) % arr.length;
			}

			const el = $(arr[state[logType].current]);
			el.addClass('current-highlight');
			el.get(0)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

			updateHitCount(logType, state[logType].current + 1, arr.length);
			return state[logType].current;
		};

		$root.off('.system-log');

		$root.on('input.system-log', '#find-slsTable', function () {
			const val = $(this).val();
			highlightText('sls', val);
			$root.find('#clear-slsTable').toggle(Boolean(val));
		});

		$root.on('input.system-log', '#find-slaTable', function () {
			const val = $(this).val();
			highlightText('sla', val);
			$root.find('#clear-slaTable').toggle(Boolean(val));
		});

		$root.on('click.system-log', '#clear-slsTable', function () {
			$root.find('#find-slsTable').val('');
			clearHighlights('sls');
			$(this).hide();
		});

		$root.on('click.system-log', '#clear-slaTable', function () {
			$root.find('#find-slaTable').val('');
			clearHighlights('sla');
			$(this).hide();
		});

		$root.on('click.system-log', '#next-highlight-slsTable', () => {
			navigate('sls', 'next');
		});

		$root.on('click.system-log', '#prev-highlight-slsTable', () => {
			navigate('sls', 'prev');
		});

		$root.on('click.system-log', '#next-highlight-slaTable', () => {
			navigate('sla', 'next');
		});

		$root.on('click.system-log', '#prev-highlight-slaTable', () => {
			navigate('sla', 'prev');
		});

		$root.on('click.system-log', '.slsCheck', () => {
			$root.find("input[name='slsItemCheckBox']").prop('checked', false);
		});

		$root.on('click.system-log', '.slaCheck', () => {
			$root.find("input[name='slaItemCheckBox']").prop('checked', false);
		});
	};

	// Orchestrates table binding with a few retries for slow layout/render cases
	const bind = async ($root) => {
		const $ = window.jQuery;
		if (!$ || !$.fn?.DataTable) return;

		dbg('bind:start');

		const tables = await Promise.all([
			bindTable($root, 'sls'),
			bindTable($root, 'sla'),
		]);

		const hasTable = tables.some(Boolean);
		if (!hasTable) {
			dbg('bind:retry', { retries: Number($root.data('systemLogBindRetries') || 0) });
			const retries = Number($root.data('systemLogBindRetries') || 0);
			if (retries < 3) {
				$root.data('systemLogBindRetries', retries + 1);
				window.setTimeout(() => bind($root), 200 + (retries * 200));
			}
			return;
		}

		$root.removeData('systemLogBindRetries');
		bindFindControls($root);
	};

	window.ProblemInfoSources.register({
		code: 'log',
		aliases: ['system_log'],
		kind: 'state',
		sourceKey: 'system_log',
		render,
		bind
	});
})();
