/* /common/assets/js/core/sim-debug.js
 * Shared debug helpers for ?debug logging across modules.
 * Usage:
 *   const dbg = window.SIM_DEBUG;
 *   dbg.log('[module.js]', 'event', { data });
 *   dbg.check('[module.js]', 'label', true, { details });
 */

(() => {
	'use strict';

	if (window.SIM_DEBUG) return;

	const enabled = (() => {
		try {
			const params = new URLSearchParams(window.location.search || '');
			return params.has('debug');
		} catch {
			return /[?&]debug(=|&|$)/i.test(String(window.location.search || ''));
		}
	})();

	const sessionId = `dbg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

	const log = (prefix, event, data = {}) => {
		if (!enabled) return;
		console.log(prefix, { ts: new Date().toISOString(), sid: sessionId, event, ...data });
	};

	const check = (prefix, label, ok, details = {}) => {
		if (!enabled) return;
		const level = ok ? 'log' : 'warn';
		console[level](prefix, { ts: new Date().toISOString(), sid: sessionId, check: label, ok, ...details });
	};

	window.SIM_DEBUG = {
		enabled: () => enabled,
		sessionId: () => sessionId,
		log,
		check
	};
})();
