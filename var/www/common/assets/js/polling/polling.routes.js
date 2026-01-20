/* /var/www/common/assets/js/polling/polling.routes.js
 *
 * Route solution -> polling endpoint URL.
 *
 * Your current implementation:
 * - training-instructor-outline uses /ajax/training_instructor_paced_poll.php
 *
 * Expand this map as you add more polling endpoints.
 */

(() => {
	'use strict';

	window.PollingRoutes = {
		resolveUrl(solution) {
			const s = String(solution || '');

			// Outline (shared instructor-paced)
			if (s === 'training-instructor-outline' || s === 'training-1-outline') {
				return '/ajax/training_instructor_paced_poll.php';
			}

			// TEMP default:
			// If the rest of training pages still use the old poll endpoint, return it here.
			// If you don't have one yet, keep returning the outline endpoint until you build others
			// (but then all pages will hit the outline poll, which may not be what you want).
			return '/ajax/training_instructor_paced_poll.php';
		}
	};
})();