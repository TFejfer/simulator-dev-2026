/* /var/www/common/assets/js/core/topbar/topbar-timer.js
 *
 * TopBarTimer (Safari-safe)
 * - requestAnimationFrame loop
 * - DOM updates only on second changes
 * - stop/start control to avoid multiple loops
 *
 * Context fields:
 * - server_now_unix: unix seconds baseline
 * - countup: exercise_start_unix OR timer_start_unix
 * - countdown: deadline_unix OR seconds_left
 */

/* global window, document */

(() => {
	'use strict';

	let rafId = 0;
	let activeMode = 'none';

	let baseServerNow = 0;
	let perfStart = 0;
	let lastRenderedSecond = -1;

	let countUpStartUnix = 0;
	let countDownEndUnix = 0;

	let visibilityHooked = false;

	const perfNow = () => {
		try { return performance.now(); } catch { return Date.now(); }
	};

	const stop = () => {
		if (rafId) cancelAnimationFrame(rafId);
		rafId = 0;
		activeMode = 'none';
		lastRenderedSecond = -1;
	};

	const pad2 = (n) => String(n).padStart(2, '0');

	const computeNowUnix = () => {
		const elapsed = (perfNow() - perfStart) / 1000;
		return Math.floor(baseServerNow + elapsed);
	};

	const renderCountUp = (tSeconds) => {
		const el = document.getElementById('countUpTimer');
		if (!el) return;

		const h = Math.floor(tSeconds / 3600);
		const m = Math.floor((tSeconds % 3600) / 60);
		const s = tSeconds % 60;

		const hEl = el.querySelector('.hours');
		const mEl = el.querySelector('.minutes');
		const sEl = el.querySelector('.seconds');

		if (hEl) hEl.textContent = pad2(h);
		if (mEl) mEl.textContent = pad2(m);
		if (sEl) sEl.textContent = pad2(s);
	};

	const renderCountDown = (tSeconds) => {
		const el = document.getElementById('countDownTimer');
		if (!el) return;

		const m = Math.floor(tSeconds / 60);
		const s = tSeconds % 60;

		const mEl = el.querySelector('.minutes');
		const sEl = el.querySelector('.seconds');

		if (mEl) mEl.textContent = pad2(m);
		if (sEl) sEl.textContent = pad2(s);
	};

	const tick = () => {
		rafId = requestAnimationFrame(tick);

		if (activeMode === 'countup' && !document.getElementById('countUpTimer')) {
			stop();
			return;
		}
		if (activeMode === 'countdown' && !document.getElementById('countDownTimer')) {
			stop();
			return;
		}

		const nowUnix = computeNowUnix();

		if (nowUnix === lastRenderedSecond) return;
		lastRenderedSecond = nowUnix;

		if (activeMode === 'countup') {
			const t = Math.max(0, nowUnix - countUpStartUnix);
			renderCountUp(t);
			return;
		}

		if (activeMode === 'countdown') {
			const t = Math.max(0, countDownEndUnix - nowUnix);
			renderCountDown(t);

			if (t <= 0) stop();
		}
	};

	const hookVisibilityOnce = () => {
		if (visibilityHooked) return;
		visibilityHooked = true;

		document.addEventListener('visibilitychange', () => {
			if (document.hidden) return;

			baseServerNow = computeNowUnix();
			perfStart = perfNow();
		});
	};

	const start = (mode, ctx) => {
		const m = String(mode || 'none');

		if (m === activeMode) return;

		stop();
		if (m === 'none') return;

		const serverNow = Number(ctx?.server_now_unix || 0);
		if (!Number.isFinite(serverNow) || serverNow <= 0) return;

		baseServerNow = Math.floor(serverNow);
		perfStart = perfNow();
		lastRenderedSecond = -1;

		if (m === 'countup') {
			const startUnix = Number(ctx?.exercise_start_unix || ctx?.timer_start_unix || 0);
			if (!Number.isFinite(startUnix) || startUnix <= 0) return;

			countUpStartUnix = Math.floor(startUnix);
			activeMode = 'countup';

			hookVisibilityOnce();
			tick();
			return;
		}

		if (m === 'countdown') {
			const deadlineUnix = Number(ctx?.deadline_unix || 0);
			const secondsLeft = Number(ctx?.seconds_left || 0);

			let endUnix = 0;
			if (Number.isFinite(deadlineUnix) && deadlineUnix > 0) {
				endUnix = Math.floor(deadlineUnix);
			} else if (Number.isFinite(secondsLeft) && secondsLeft > 0) {
				endUnix = Math.floor(baseServerNow + secondsLeft);
			} else {
				return;
			}

			countDownEndUnix = endUnix;
			activeMode = 'countdown';

			hookVisibilityOnce();
			tick();
		}
	};

	window.TopBarTimer = Object.freeze({ start, stop });
})();