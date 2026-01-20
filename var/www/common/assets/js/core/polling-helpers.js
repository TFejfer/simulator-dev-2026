/* /var/www/common/assets/js/core/polling-helpers.js
 *
 * Small stateless helpers used by Polling consumers and solutions.
 */

(() => {
	'use strict';

	window.PollingHelpers = {
		last(events) {
			return events && events.length ? events[events.length - 1] : null;
		},

		groupByTbl(events) {
			const buckets = new Map();
			for (const evt of events || []) {
				const tbl = String(evt?.tbl || '');
				if (!tbl) continue;
				if (!buckets.has(tbl)) buckets.set(tbl, []);
				buckets.get(tbl).push(evt);
			}
			return buckets;
		}
	};
})();