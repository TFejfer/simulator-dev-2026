(() => {
	'use strict';

	window.PollConsumerProblem = Object.freeze({
		async onLogExercise(ctx, events) {
			// Only react on step-change/state-change/action
			const last = window.PollingHelpers.last(events);
			const kind = String(last?.info_1 || '');
			if (!['step-change','state-change','action'].includes(kind)) return;

			if (typeof window.ProblemPageRefreshState === 'function') {
				await window.ProblemPageRefreshState();
			}

			// Re-render topbar/menu if format/step changed
			try { TopBarEngine.render({ _forceTimerRestart: true }); } catch {}
			try { MenuBarEngine.render(); } catch {}
		}
	});
})();