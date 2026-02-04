/* /var/www/common/assets/js/core/topbar/topbar-engine.js
 *
 * TopBarEngine
 * - Builds TopBarContext from #page-data + overrides
 * - Resolves layout via TopBarRules
 * - Renders widgets into #topBarArea1..#topBarArea5
 * - Controls TopBarTimer
 *
 * Internal state lives in closure (safe with Object.freeze).
 */

/* global window, document */

(() => {
	'use strict';

	const $ = window.jQuery;

	const readPageData = () => {
		const el = document.getElementById('page-data');
		if (!el) return null;
		try {
			return JSON.parse(el.textContent || '{}');
		} catch {
			return null;
		}
	};

	const merge = (base, patch) => {
		const out = { ...base };
		for (const k in (patch || {})) out[k] = patch[k];
		return out;
	};

	const clearTimerColors = () => {
		if (!$) return;
		$('#topBarArea4').removeClass('timer-color-yellow timer-color-red');
	};

	const countdownTickHandler = (ctx) => {
		const format = Number(ctx?.format_no || ctx?.format || 0);
		const shouldColor = [1, 10, 11].includes(format);
		let blink = false;
		let firedTimesUp = false;

		const triggerTimesUp = () => {
			if (firedTimesUp) return;
			firedTimesUp = true;

			try {
				window.fetch('/ajax/training_instructor_timesup.php', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: '{}'
				}).finally(() => {
					window.location.href = '/training-problem-instructor-timesup.php';
				});
			} catch {
				window.location.href = '/training-problem-instructor-timesup.php';
			}
		};

		return (tSeconds) => {
			if (!$) return;
			const area = $('#topBarArea4');
			if (!area || area.length === 0) return;

			area.removeClass('timer-color-yellow timer-color-red');

			if (!Number.isFinite(tSeconds)) return;

			if (tSeconds <= 0) {
				triggerTimesUp();
				return;
			}

			if (!shouldColor) return;

			if (tSeconds < 60) {
				blink = !blink;
				if (blink) area.addClass('timer-color-red');
				return;
			}

			if (tSeconds < 300) {
				area.addClass('timer-color-red');
				return;
			}

			if (tSeconds < 600) {
				area.addClass('timer-color-yellow');
			}
		};
	};

	const buildCtx = (overrides = {}) => {
		const pd = readPageData() || {};
		const page_key = String(pd?.CTX_KEY || '');

		const delivery = pd?.DATA?.DELIVERY || {};
		const exercise = pd?.DATA?.EXERCISE || pd?.DATA?.EXERCISE_META || {};

		const server_now_unix = Number(delivery?.serverTimeNow || delivery?.server_now_unix || 0);

		const ctx = {
			page_key,
			delivery,
			exercise,
			simulator: window.simulator || window.SIMULATOR || null,

			format_no: Number(exercise?.format_no || exercise?.format || 0),
			step_no: Number(exercise?.step_no || exercise?.step || 0),

			server_now_unix: Number.isFinite(server_now_unix) ? server_now_unix : 0,

			exercise_start_unix: Number(exercise?.exercise_start_unix || 0),
			timer_start_unix: Number(exercise?.timer_start_unix || 0),
			deadline_unix: Number(exercise?.deadline_unix || 0),
			timer_end_unix: Number(exercise?.timer_end_unix || 0),
			seconds_left: Number(exercise?.seconds_left || 0),

			role: pd?.DATA?.ROLE || null
		};

		// Fallback countdown durations for formats that must count down even when backend omits deadline/seconds_left.
		const sharedParams = window.SIM_SHARED?.exercise_parameters || {};
		const sharedDiscovery = Number(sharedParams.problem_discovery_time || sharedParams.discovery_time || 0);
		const fallbackSeconds = { 1: 25 * 60, 10: 25 * 60, 11: 25 * 60 };
		const fallback = sharedDiscovery > 0 ? sharedDiscovery : (fallbackSeconds[ctx.format_no] || 0);
		if (fallback && ctx.exercise_start_unix > 0 && ctx.server_now_unix > 0
			&& ctx.deadline_unix <= 0 && ctx.seconds_left <= 0) {
			const elapsed = Math.max(0, ctx.server_now_unix - ctx.exercise_start_unix);
			const remaining = Math.max(0, fallback - elapsed);
			ctx.deadline_unix = ctx.exercise_start_unix + fallback;
			ctx.seconds_left = remaining;
		}

		return merge(ctx, overrides);
	};

	const renderArea = (selector, html) => {
		if (!$) return;
		$(selector).html(html || '');
	};

	const ensureHomeButton = (layout) => {
		if (!$) return;

		const enabled = layout?.home?.enabled !== false;
		if (!enabled) {
			$('#topBarHome').removeClass('clickable');
			return;
		}

		$('#topBarHome').addClass('clickable');

		const href = String(layout?.home?.href || '');
		if (href) {
			$('#topBarHome').off('click.topbar').on('click.topbar', () => { window.location.href = href; });
		}
	};

	let lastAreasKey = '';
	let lastRule = '';
	let lastTimerMode = 'none';

	const render = (overrides = {}) => {
		if (!window.TopBarRules || !window.TopBarWidgets) return;

		const ctx = buildCtx(overrides);
		const layout = window.TopBarRules.resolve(ctx);

		ensureHomeButton(layout);

		const areasKey = JSON.stringify(layout?.areas || {});
		if (areasKey !== lastAreasKey) {
			lastAreasKey = areasKey;
			lastRule = String(layout?._rule || '');

			const w = window.TopBarWidgets;

			const a1 = w[layout.areas.a1] ? w[layout.areas.a1](ctx) : '';
			const a2 = w[layout.areas.a2] ? w[layout.areas.a2](ctx) : '';
			const a3 = w[layout.areas.a3] ? w[layout.areas.a3](ctx) : '';
			const a4 = w[layout.areas.a4] ? w[layout.areas.a4](ctx) : '';
			const a5 = w[layout.areas.a5] ? w[layout.areas.a5](ctx) : '';

			renderArea('#topBarArea1', a1);
			renderArea('#topBarArea2', a2);
			renderArea('#topBarArea3', a3);
			renderArea('#topBarArea4', a4);
			renderArea('#topBarArea5', a5);
		}

		const mode = String(layout?.timer?.mode || 'none');

		if (mode !== lastTimerMode) {
			lastTimerMode = mode;
			if (window.TopBarTimer) window.TopBarTimer.start(mode, ctx);
		} else {
			if (overrides && overrides._forceTimerRestart && window.TopBarTimer) {
				window.TopBarTimer.start(mode, ctx);
			}
		}

		if (window.TopBarTimer?.setTickHandler) {
			if (mode === 'countdown') {
				window.TopBarTimer.setTickHandler(countdownTickHandler(ctx));
			} else {
				window.TopBarTimer.setTickHandler(null);
				clearTimerColors();
			}
		}

		window.PollingDebug?.log('topbar.render', {
			page_key: ctx.page_key,
			rule: lastRule,
			format_no: ctx.format_no,
			step_no: ctx.step_no,
			timer: mode
		}, 'trace');
	};

	const reset = () => {
		lastAreasKey = '';
		lastRule = '';
		lastTimerMode = 'none';
		try { window.TopBarTimer?.stop?.(); } catch {}
	};

	window.TopBarEngine = Object.freeze({ render, reset });
})();