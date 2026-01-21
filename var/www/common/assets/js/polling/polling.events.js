/* /var/www/common/assets/js/polling/polling.events.js
 *
 * Central registry of log_poll.tbl event keys.
 *
 * Why:
 * - Avoid typo-bugs (log__broadcast vs log_broadcast)
 * - Single source of truth for event names used by polling mappings/consumers
 *
 * Rules:
 * - Values must match exactly what your server/triggers write into log_poll.tbl
 */

(() => {
	'use strict';

	window.PollingEvents = Object.freeze({
		// Core / shared
		BROADCAST: 'log_broadcast',

		// Access / control
		ACCESS_UNBLOCK: 'log_access_unblock',
		EXERCISE_UNLOCK: 'log_exercise_unlock',

		// Exercise log items (state machine)
		EXERCISE: 'log_exercise',

		// Placeholders (add as you migrate)
		NOTIFICATIONS: 'log_notifications',
		//ACTIVE_USERS: 'log_active_users',

		// Example domain-specific placeholders:
		PROBLEM_FORM_SYMPTOMS: 'problem_form_symptoms',
		RISK_FORM_DISCOVERY: 'risk_form_discovery',
		RCA_FORM: 'rca_form'
	});
})();