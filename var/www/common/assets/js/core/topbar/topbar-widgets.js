/* /var/www/common/assets/js/core/topbar/topbar-widgets.js
 *
 * TopBarWidgets
 * - Pure widget renderers (return HTML strings).
 * - No DOM mutation here.
 * - Uses existing global builders from simulator.js when available.
 *
 * Widgets are keyed by name and referenced from TopBarRules.
 */

/* global window */

(() => {
	'use strict';

	const safe = (x) => (x === undefined || x === null) ? '' : String(x);

	const hasFn = (name) => typeof window[name] === 'function';

	window.TopBarWidgets = Object.freeze({
		none: () => '',

		team: (ctx) => {
			const team = Number(ctx?.delivery?.team_no || ctx?.delivery?.team || 0);
			if (team <= 0) return '';
			if (hasFn('simulatorTopBarTeamHTML')) return window.simulatorTopBarTeamHTML(team, ctx.simulator);
			return `<div><div class="topbar-label">Team</div><div class="topbar-content">${team}</div></div>`;
		},

		exercise: (ctx) => {
			const exId = Number(ctx?.exercise?.id || ctx?.exercise?.exercise_no || 0);
			if (exId <= 0) return '';
			if (hasFn('simulatorTopBarExerciseHTML')) return window.simulatorTopBarExerciseHTML(exId, ctx.simulator);
			return `<div><div class="topbar-label">Exercise</div><div class="topbar-content">${exId}</div></div>`;
		},

		pageTitle: (ctx) => {
			const title = (window.PageTitleResolver && typeof window.PageTitleResolver.resolve === 'function')
				? window.PageTitleResolver.resolve(ctx)
				: '';

			if (!title) return '';
			return `
				<div>
					<div class="capitalize-all">${safe(title)}</div>
				</div>
			`;
		},

		step: (ctx) => {
			const stepNo = Number(ctx?.step_no || ctx?.exercise?.step_no || ctx?.exercise?.step || 0);
			if (stepNo <= 0) return '';
			const terms = ctx?.step_terms || ctx?.simulator?.C_TERMS || [];
			if (hasFn('simulatorTopBarStepHTML')) return window.simulatorTopBarStepHTML(stepNo, terms);
			return `<div><div class="capitalize-all">${stepNo}</div></div>`;
		},

		rolePositions: (ctx) => {
			const role = safe(ctx?.role?.name || ctx?.role_name || '');
			const pos = safe(ctx?.role?.position || ctx?.role?.position_name || ctx?.position || '');
			if (!role && !pos) return '';
			if (hasFn('simulatorTopBarRolePositionsHTML')) return window.simulatorTopBarRolePositionsHTML(role, pos, ctx.simulator);
			return `<div><div class="topbar-label">Role</div><div class="topbar-content">${role} / ${pos}</div></div>`;
		},

		timerCountDown: (ctx) => {
			if (hasFn('simulatorTopBarCountDownHTML')) return window.simulatorTopBarCountDownHTML(ctx.simulator);
			return `
				<div>
					<div class="topbar-label">Time remaining</div>
					<div class="topbar-content">
						<div id="countDownTimer" class="topbar-content">
							<span class="minutes"></span>:<span class="seconds"></span>
						</div>
					</div>
				</div>
			`;
		},

		timerCountUp: (ctx) => {
			if (hasFn('simulatorTopBarCountUpHTML')) return window.simulatorTopBarCountUpHTML(ctx.simulator);
			return `
				<div>
					<div class="topbar-label">Time in exercise</div>
					<div class="topbar-content">
						<div id="countUpTimer" class="topbar-content">
							<span class="hours"></span>:<span class="minutes"></span>:<span class="seconds"></span>
						</div>
					</div>
				</div>
			`;
		}
	});
})();