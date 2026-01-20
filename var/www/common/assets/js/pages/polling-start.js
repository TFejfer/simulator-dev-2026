/* /var/www/training/assets/js/pages/polling-start.js
 *
 * Starts Polling on pages that need real-time updates.
 *
 * Recommended:
 * - Each page sets: window.POLLING_SOLUTION = 'training-instructor-outline' (etc.)
 *
 * This script is generic and should not contain per-solution logic.
 */

(() => {
	'use strict';

	const solution = String(window.POLLING_SOLUTION || '');

	if (!solution) {
		// No polling for this page
		return;
	}

	Polling.start({
		solution,
		delivery: window.delivery || null,
		exercise: window.exercise || null,
		simulator: window.simulator || null,
		debug: false,
		lastId: 0,
		resolveUrl: window.PollingRoutes.resolveUrl
	});
})();