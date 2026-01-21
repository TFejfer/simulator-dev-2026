/* /var/www/common/assets/js/features/outline/outline-status.js
 *
 * Outline status refresh module.
 *
 * - Fetches status payload from /ajax/training_instructor_outline_status_read.php
 * - Applies it via OutlineUI.applyStatusUpdate()
 */

/* global window */

(() => {
	'use strict';

	const buildUiCtx = () => {
		'use strict';

		const termFn = (id) => {
			const key = String(Number(id || 0));
			const terms = window.SIM_SHARED?.common_terms || null;
			if (!terms || typeof terms !== 'object') return '';
			return String(terms[key] ?? '');
		};

		return { term: termFn };
	};

	window.OutlineStatus = Object.freeze({
		async refresh(pollCtx) {
			if (!window.OutlineUI || typeof window.OutlineUI.applyStatusUpdate !== 'function') {
				window.PollingDebug?.log('outline.status.missing_outline_ui', {}, 'info');
				return;
			}

			const res = await window.simulatorAjaxRequest(
				'/ajax/training_instructor_outline_status_read.php',
				'POST',
				{ window_seconds: 60 },
				{ mode: 'dynamic', timeoutMs: 15000 }
			);

			if (!res.ok) {
				window.PollingDebug?.log('outline.status.fetch_error', { error: res.error, status: res.status }, 'info');
				return;
			}

			const payload = res.data;
			if (!payload || typeof payload !== 'object') {
				window.PollingDebug?.log('outline.status.bad_payload', { payloadType: typeof payload }, 'info');
				return;
			}

			const uiCtx = buildUiCtx();

			window.PollingDebug?.log('outline.status.apply', {
				exercises: Array.isArray(payload.exercises) ? payload.exercises.length : 0,
				locks: Array.isArray(payload.locks) ? payload.locks.length : 0
			}, 'trace');

			window.OutlineUI.applyStatusUpdate(uiCtx, payload);
		}
	});
})();