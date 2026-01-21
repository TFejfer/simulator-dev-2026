/* /var/www/common/assets/js/core/topbar/topbar-exercise-hooks.js
 *
 * Helper to feed TopBarEngine timer inputs on exercise-related pages.
 *
 * Uses:
 * - delivery.serverTimeNow (unix seconds)
 * - exercise.log[0].epochTs (unix seconds)
 * - exercise.deadline (unix seconds) OR exercise.seconds_left
 *
 * This does not start timers directly. It only calls TopBarEngine.render(...)
 * which chooses countup/countdown via TopBarRules and runs TopBarTimer accordingly.
 */

/* global window */

(() => {
	'use strict';

	const n = (x) => {
		const v = Number(x || 0);
		return Number.isFinite(v) ? v : 0;
	};

	const firstLogEpoch = (exercise) => {
		if (!exercise || !Array.isArray(exercise.log) || exercise.log.length === 0) return 0;
		return n(exercise.log[0]?.epochTs);
	};

	const lastLogEpoch = (exercise) => {
		if (!exercise || !Array.isArray(exercise.log) || exercise.log.length === 0) return 0;
		return n(exercise.log[exercise.log.length - 1]?.epochTs);
	};

	/**
	 * Feed timer inputs to the top bar.
	 *
	 * @param {object} delivery - delivery object (must include serverTimeNow)
	 * @param {object} exercise - exercise object (must include log[] and possibly deadline)
	 * @param {object} opts
	 *	- forceRestart: boolean
	 */
	window.TopBarExerciseHooks = Object.freeze({
		applyTimers(delivery, exercise, opts = {}) {
			if (!window.TopBarEngine) return;

			// Baseline: required for stable timers (TopBarTimer uses this)
			const serverNow = n(delivery?.serverTimeNow);

			// Count-up start: first log epoch
			const startUnix = firstLogEpoch(exercise);

			// Count-down target: prefer absolute deadline if present
			const deadlineUnix = n(exercise?.deadline);

			// Optional: if you ever provide seconds_left instead of absolute deadline
			const secondsLeft = n(exercise?.seconds_left);

			// Optional: when exercise completes (step >= 100), freeze countup at last log epoch
			// (TopBarTimer can also be extended to support "freeze", but this keeps it simple)
			const completed = n(exercise?.step) >= 100;
			const endUnix = completed ? lastLogEpoch(exercise) : 0;

			window.TopBarEngine.render({
				// Timer baseline used by TopBarTimer
				server_now_unix: serverNow,

				// Count-up / Count-down inputs
				exercise_start_unix: startUnix,
				deadline_unix: deadlineUnix,
				seconds_left: secondsLeft,

				// Optional end timestamp (if you want to use it later)
				timer_end_unix: endUnix,

				// If timer inputs changed after the widget was already rendered,
				// force a restart so TopBarTimer re-reads inputs.
				_forceTimerRestart: !!opts.forceRestart
			});
		}
	});
})();