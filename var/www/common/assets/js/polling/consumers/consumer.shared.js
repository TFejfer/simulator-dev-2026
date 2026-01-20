/* /var/www/common/assets/js/polling/consumers/consumer.shared.js
 *
 * Shared polling consumers for instructor-paced pages (outline etc.).
 *
 * This is "shared" because the outline flow is not Problem/Risk/RCA-specific,
 * even if some legacy function names contain "Problem".
 */

(() => {
	'use strict';

	const { last } = window.PollingHelpers;

	window.PollConsumerShared = {
		async onAccessUnblock(ctx, events) {
			window.location.reload();
		},

		async onBroadcast(ctx, events) {
			return handleLogBroadcast(ctx.simulator);
		},

		async onExerciseLock(ctx, events) {
			return handleLogExerciseLock(ctx.delivery, ctx.simulator);
		},

		async onOutlineExerciseActions(ctx, events) {
			const evt = last(events);
			if (!evt) return;
			// Legacy function name, but shared outline behavior
			return handleProblemInstrPacedTrainingOutline(evt, ctx.simulator);
		}
	};
})();