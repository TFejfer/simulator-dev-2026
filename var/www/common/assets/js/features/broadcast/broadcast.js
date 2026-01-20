/* ============================================
 * Polling handler: log__broadcast
 * ============================================
 *
 * Triggered by log_poll tbl='log__broadcast' (signal).
 * Fetches the real payload from:
 *	/ajax/training_instructor_paced_broadcast_read.php
 *
 * Deduplication:
 * - Broadcast messages may be signaled multiple times.
 * - We keep the last seen broadcast id to avoid repeat UI.
 */

(() => {
	'use strict';

	// Keep last seen id in memory (per page lifecycle)
	let lastBroadcastId = 0;

	// Optional: persist across reloads in this tab
	const STORAGE_KEY = 'sim_poll_last_broadcast_id';

	try {
		const v = Number(sessionStorage.getItem(STORAGE_KEY) || 0);
		if (v > 0) lastBroadcastId = v;
	} catch {}

	/**
	 * Global polling handler (used by consumer.shared.js).
	 * @param {object} simulator - Your simulator runtime object (optional).
	 */
	window.handleLogBroadcast = async (simulator) => {
		// Fetch latest message from server
		const res = await window.simulatorAjaxRequest(
			'/ajax/training_instructor_paced_broadcast_read.php',
			'POST',
			{ lookback_seconds: 120 },
			{ mode: 'dynamic', timeoutMs: 15000 }
		);

		if (!res.ok) {
			window.PollingDebug?.log('broadcast.fetch_error', { error: res.error, status: res.status }, 'info');
			return;
		}

		const msg = res.data;
		if (!msg || typeof msg !== 'object') {
			window.PollingDebug?.log('broadcast.none', {}, 'trace');
			return;
		}

		const id = Number(msg.id || 0);
		const text = String(msg.message || '').trim();
		if (id <= 0 || text === '') return;

		// Dedup
		if (id === lastBroadcastId) {
			window.PollingDebug?.log('broadcast.dup', { id }, 'trace');
			return;
		}

		lastBroadcastId = id;
		try { sessionStorage.setItem(STORAGE_KEY, String(id)); } catch {}

		window.PollingDebug?.log('broadcast.show', { id, created_at: msg.created_at || '' }, 'info');

		// Minimal UI: alert fallback if you have no toast system on this page yet
		// Replace this with your existing modal/toast renderer if you have one.
		if (typeof window.simulatorShowConfirm === 'function') {
			window.simulatorShowConfirm({
				title: 'Broadcast',
				content: text,
				columnClass: 'medium',
				backgroundDismiss: true,
				buttons: {
					ok: { text: 'OK', btnClass: 'btn-blue' }
				}
			});
			return;
		}

		alert(text);
	};
})();