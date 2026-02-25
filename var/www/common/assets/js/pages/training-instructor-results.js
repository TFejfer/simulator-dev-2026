/* /var/www/common/assets/js/pages/training-instructor-results.js
 *
 * Instructor results list.
 */

/* global $, SimulatorPage, simulatorAjaxRequest, simulatorLogout, MenuBarEngine, TopBarEngine */

(() => {
	'use strict';

	const state = {
		results: [],
		table: null,
	};

	const renderContainer = () => {
		return `
			<div class="results-list">
				<table id="resultsTable" class="display" style="width:100%">
					<thead>
						<tr>
							<th data-col="exercise"></th>
							<th data-col="action"></th>
						</tr>
					</thead>
					<tbody></tbody>
				</table>
			</div>
		`;
	};

	const setHeaderLabels = (ctx) => {
		const $exercise = $('#resultsTable thead th[data-col="exercise"]');
		const $action = $('#resultsTable thead th[data-col="action"]');

		$exercise.text(ctx.term(237, 'Exercise'));
		$action.text('');
	};

	const renderEmptyState = (ctx) => {
		$('#display_content').html(`
			<div style="padding:24px;">
				${ctx.term(564, 'No completed exercises yet.')}
			</div>
		`);
	};

	const initTable = (ctx) => {
		if (!Array.isArray(state.results) || state.results.length === 0) {
			renderEmptyState(ctx);
			return;
		}

		$('#display_content').html(renderContainer());
		setHeaderLabels(ctx);

		state.table = $('#resultsTable').DataTable({
			data: state.results,
			searching: false,
			paging: false,
			info: false,
			scrollY: '60vh',
			scrollCollapse: true,
			ordering: false,
			columns: [
				{ data: 'exercise' },
				{
					data: 'step',
					render: function (data, type, row) {
						if (type !== 'display') return '';

						if (Number(row.format) === 10) {
							return ctx.term(112, 'Results');
						}

						if (Number(row.skill || 0) !== 1) {
							return ctx.term(112, 'Results');
						}

						return `
							<span
								class="goto-result link-text"
								data-ex="${row.exercise}"
								data-sk="${row.skill}"
								data-fo="${row.format}"
								data-th="${row.theme}"
								data-sc="${row.scenario}"
							>
								${ctx.term(590, 'Go to results')}
							</span>`;
					}
				},
			],
			columnDefs: [
				{ targets: 0, className: 'dt-head-center dt-body-center' }
			]
		});
	};

	const bindCourseMenuButtons = () => {
		$(document).off('click.courseMenu', '#menuBar .menu-btn');

		$(document).on('click.courseMenu', '#menuBar .menu-btn', function (e) {
			e.preventDefault();

			const code = String($(this).attr('data-code') || $(this).data('code') || '');

			switch (code) {
				case 'res':
					window.location.href = 'training-instructor-results';
					break;

				case 'set':
					window.location.href = 'training-instructor-setup';
					break;

				case 'hel':
					if (window.HelpSidebar && typeof window.HelpSidebar.open === 'function') {
						window.HelpSidebar.open();
					}
					break;

				default:
					break;
			}
		});
	};

	const navigateToResult = (row) => {
		const ex = Number(row.exercise || 0);
		if (!ex) return;
		if (Number(row.skill || 0) !== 1) return;

		const params = new URLSearchParams({
			exercise: String(ex),
			skill: String(Number(row.skill || 0)),
			format: String(Number(row.format || 0)),
			theme: String(Number(row.theme || 0)),
			scenario: String(Number(row.scenario || 0)),
		});

		window.location.href = `training-problem-instructor-result?${params.toString()}`;
	};

	SimulatorPage.run({
		id: 'training-instructor-results',

		blocking: async (ctx) => {
			const res = await simulatorAjaxRequest('/ajax/training_instructor_results_read.php', 'POST', {}, { mode: 'dynamic' });

			if (!res || !res.ok) {
				ctx.handleAuthFailure(res);
				throw new Error(res?.error || `http_${res?.status || 0}`);
			}

			state.results = Array.isArray(res.data?.results) ? res.data.results : [];
		},

		render: (ctx) => {
			if (window.TopBarEngine?.render) window.TopBarEngine.render();
			if (window.MenuBarEngine?.render) window.MenuBarEngine.render();

			initTable(ctx);
		},

		bind: () => {
			bindCourseMenuButtons();

			if (window.HelpSidebar && typeof window.HelpSidebar.bindCloseButton === 'function') {
				window.HelpSidebar.bindCloseButton();
			}

			$('#topBar').off('click.resultsLogout', '#logoutSim');
			$('#topBar').on('click.resultsLogout', '#logoutSim', function () {
				if (typeof simulatorLogout === 'function') {
					try {
						simulatorLogout();
						return;
					} catch {}
				}
				window.location.href = 'logout';
			});

			$('#topBar').off('click.resultsHome', '#topBarHome');
			$('#topBar').on('click.resultsHome', '#topBarHome', function () {
				window.location.href = 'training-instructor-outline';
			});

			$('#display_content').off('click.gotoResult', '.goto-result');
			$('#display_content').on('click.gotoResult', '.goto-result', function () {
				const $el = $(this);
				navigateToResult({
					exercise: $el.attr('data-ex'),
					skill: $el.attr('data-sk'),
					format: $el.attr('data-fo'),
					theme: $el.attr('data-th'),
					scenario: $el.attr('data-sc'),
				});
			});
		}
	});
})();
