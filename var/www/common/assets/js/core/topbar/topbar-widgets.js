/* /var/www/common/assets/js/core/topbar/topbar-widgets.js
 *
 * TopBarWidgets
 * - Pure widget renderers (return HTML strings).
 * - Uses simulator.js builders if present.
 * - Otherwise uses simulatorTerm(id, 'common') for labels (no hardcoded English).
 */

/* global window */

(() => {
	'use strict';

	const safe = (x) => (x === undefined || x === null) ? '' : String(x);

	const hasFn = (name) => typeof window[name] === 'function';

	const t = (id, fallback = '') => {
		if (typeof window.simulatorTerm !== 'function') return String(fallback || '');
		return String(window.simulatorTerm(Number(id || 0), 'common', fallback));
	};

	// TODO: Set these to your real common_terms IDs
	const TERM = Object.freeze({
		TEAM: 341,
		EXERCISE: 237,
		ROLE: 292,
		TIME_REMAINING: 75,
		TIME_IN_EXERCISE: 563,
	});

	window.TopBarWidgets = Object.freeze({
		none: () => '',

		team: (ctx) => {
			const team = Number(ctx?.delivery?.team_no || ctx?.delivery?.team || 0);
			if (team <= 0) return '';
			if (hasFn('simulatorTopBarTeamHTML')) return window.simulatorTopBarTeamHTML(team, ctx.simulator);

			return `
				<div>
					<div class="topbar-label">${t(TERM.TEAM)}</div>
					<div class="topbar-content">${team}</div>
				</div>
			`;
		},

		exercise: (ctx) => {
			const exId = Number(ctx?.exercise?.id || ctx?.exercise?.exercise_no || 0);
			if (exId <= 0) return '';
			if (hasFn('simulatorTopBarExerciseHTML')) return window.simulatorTopBarExerciseHTML(exId, ctx.simulator);

			return `
				<div>
					<div class="topbar-label">${t(TERM.EXERCISE)}</div>
					<div class="topbar-content">${exId}</div>
				</div>
			`;
		},

		pageTitle: (ctx) => {
			const title = (window.PageTitleResolver && typeof window.PageTitleResolver.resolve === 'function')
				? window.PageTitleResolver.resolve(ctx)
				: '';
			if (!title) return '';
			return `<div><div class="topbar-content capitalize-all">${safe(title)}</div></div>`;
		},

		rolePositions: (ctx) => {
			const role = safe(ctx?.role?.name || ctx?.role_name || '');
			const pos = safe(ctx?.role?.position || ctx?.role?.position_name || ctx?.position || '');
			if (!role && !pos) return '';
			if (hasFn('simulatorTopBarRolePositionsHTML')) return window.simulatorTopBarRolePositionsHTML(role, pos, ctx.simulator);

			return `
				<div>
					<div class="topbar-label">${t(TERM.ROLE)}</div>
					<div class="topbar-content">${role} / ${pos}</div>
				</div>
			`;
		},

		timerCountDown: (ctx) => {
			if (hasFn('simulatorTopBarCountDownHTML')) return window.simulatorTopBarCountDownHTML(ctx.simulator);

			return `
				<div>
					<div class="topbar-label">${t(TERM.TIME_REMAINING)}</div>
					<div class="topbar-content">
						<div id="countDownTimer" class="topbar-content">
							<span class="minutes"></span>:<span class="seconds"></span>
						</div>
					</div>
				</div>
			`;
		},

		timerCountDownHidden: (ctx) => {
			if (hasFn('simulatorTopBarCountDownHTML')) return window.simulatorTopBarCountDownHTML(ctx.simulator);

			return `
				<div style="position:absolute; left:-9999px; width:1px; height:1px; overflow:hidden;">
					<div id="countDownTimer" class="topbar-content">
						<span class="minutes"></span>:<span class="seconds"></span>
					</div>
				</div>
			`;
		},

		timerCountUp: (ctx) => {
			if (hasFn('simulatorTopBarCountUpHTML')) return window.simulatorTopBarCountUpHTML(ctx.simulator);

			return `
				<div>
					<div class="topbar-label">${t(TERM.TIME_IN_EXERCISE)}</div>
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