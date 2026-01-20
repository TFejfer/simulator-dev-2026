/* /var/www/common/assets/js/polling/consumers/consumer.outline.js
 *
 * Polling consumer for outline-only events.
 */

/* global window */

(() => {
	'use strict';

	window.PollConsumerOutline = Object.freeze({
		async onExerciseUnlock(ctx, events) {
			if (!window.OutlineStatus || typeof window.OutlineStatus.refresh !== 'function') {
				window.PollingDebug?.log('outline.unlock.missing_outline_status', {}, 'info');
				return;
			}

			window.PollingDebug?.log('outline.unlock.signal', {
				solution: ctx?.solution || '',
				n: Array.isArray(events) ? events.length : 0
			}, 'trace');

			await window.OutlineStatus.refresh(ctx);
		}
	});
})();