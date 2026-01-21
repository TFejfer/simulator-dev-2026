/* /var/www/common/assets/js/polling/consumers/consumer.outline.js
 *
 * Polling consumer for outline-only events.
 *
 * This consumer intentionally stays "signal-only":
 * - It does not interpret log_poll as payload.
 * - It refreshes real state via OutlineStatus.refresh().
 *
 * Events handled here:
 * - log_exercise_unlock: always refresh outline status
 * - log_exercise: refresh ONLY when info_1 === 'step-change'
 */

/* global window */

(() => {
	'use strict';

	const last = (events) => window.PollingHelpers.last(events);

	window.PollConsumerOutline = Object.freeze({
		async onOutlineStatusRefresh(ctx, events) {
			const evt = last(events);
			if (!evt) return;

			const tbl = String(evt.tbl || '');
			const info1 = String(evt.info_1 || '');

			// Filter: log_exercise should only trigger refresh on step-change
			if (tbl === window.PollingEvents.EXERCISE) {
				if (info1 !== 'step-change') {
					window.PollingDebug?.log('outline.refresh.skip', { tbl, info_1: info1 }, 'trace');
					return;
				}
			}

			// log_exercise_unlock always refreshes
			if (tbl === window.PollingEvents.EXERCISE_UNLOCK) {
				window.PollingDebug?.log('outline.refresh.unlock', { id: Number(evt.id || 0) }, 'trace');
			}

			if (!window.OutlineStatus || typeof window.OutlineStatus.refresh !== 'function') {
				window.PollingDebug?.log('outline.refresh.missing_outline_status', {}, 'info');
				return;
			}

			window.PollingDebug?.log('outline.refresh.run', {
				tbl,
				id: Number(evt.id || 0),
				info_1: info1 || null
			}, 'trace');

			await window.OutlineStatus.refresh(ctx);
		}
	});
})();