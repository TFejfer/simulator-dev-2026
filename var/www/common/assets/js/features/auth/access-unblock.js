/* /var/www/common/assets/js/features/auth/access-unblock.js
 *
 * Default handler for "log_access_unblock" events.
 *
 * Behavior:
 * - Ensure it runs once
 * - Stop polling to avoid repeated triggers
 * - Call server logout endpoint (best effort)
 * - Redirect to login
 */

/* global window */

(() => {
	'use strict';

	const STORAGE_KEY = 'sim_access_unblock_handled';

	const once = () => {
		try {
			if (sessionStorage.getItem(STORAGE_KEY) === '1') return false;
			sessionStorage.setItem(STORAGE_KEY, '1');
			return true;
		} catch {
			// If sessionStorage is blocked, still attempt once per runtime
			return true;
		}
	};

	window.handleLogAccessUnblock = async () => {
		if (!once()) return;

		// Stop polling immediately (prevents multiple redirects)
		try { window.Polling?.stop?.(); } catch {}

		// Best-effort logout call (optional but recommended)
		// If you do not want an AJAX logout endpoint, skip this and just redirect.
		try {
			await window.simulatorAjaxRequest('/ajax/logout.php', 'POST', {}, { mode: 'dynamic', timeoutMs: 8000 });
		} catch {}

		// Hard redirect
		window.location.href = '/login';
	};
})();