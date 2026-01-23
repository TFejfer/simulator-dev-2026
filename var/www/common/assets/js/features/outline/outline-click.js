/* /var/www/common/assets/js/features/outline/outline-click.js
 *
 * Outline click handler (backend-authoritative).
 *
 * - Click sends outline_id to decision endpoint.
 * - Backend returns action/status.
 * - Client only shows UI (modal) or navigates.
 */

/* global window, document */

(() => {
	'use strict';

	const $ = window.jQuery;

	const postJson = async (url, body) => {
		return await window.simulatorAjaxRequest(url, 'POST', body, { mode: 'dynamic', timeoutMs: 15000 });
	};

	const showInfo = (sim, titleId, contentId) => {
		window.simulatorShowConfirm({
			title: window.simulatorTerm(titleId, 'common'),
			content: window.simulatorTerm(contentId, 'common'),
			backgroundDismiss: true
		});
	};

	const bindOnce = () => {
		if (!$) return;
		if (window.__outlineClickBound) return;
		window.__outlineClickBound = true;

		$('#display_content').on('click', '.grid-outline-item.clickable[data-item="exercise"]', async function() {
			const outlineId = Number($(this).attr('data-outline-id') || 0);
			if (!outlineId) return;

			// Decision
			const res = await postJson('/ajax/training_outline_click_decision.php', { outline_id: outlineId });
			if (!res.ok) {
				alert('Outline decision failed: ' + (res.error || 'unknown'));
				return;
			}

			const d = res.data || {};

			const status = String(d.status || '');
			const nav = String(d.navigate_to || '');
			const isMulti = !!d.is_multi_position;

			// Navigate directly
			if (d.action === 'navigate' && nav) {
				window.location.href = nav;
				return;
			}

			// Modal responses (backend-authoritative)
			if (status === 'lock') {
				// Use your existing term ids for lock message
				showInfo(window.simulator, 214, 207);
				return;
			}

			if (status === 'nogo') {
				showInfo(window.simulator, 214, 208);
				return;
			}

			const startExercise = async (positionCount, roleId) => {
				const startRes = await postJson('/ajax/training_outline_start_exercise.php', {
					outline_id: outlineId,
					position_count: positionCount,
					role_id: roleId
				});

				if (!startRes.ok) {
					alert('Start failed: ' + (startRes.error || startRes.data || 'unknown'));
					return;
				}

				const to = String(startRes.data?.navigate_to || '');
				if (!to) {
					alert('Start failed: missing navigate_to');
					return;
				}

				window.location.href = to;
			};

			// Role selection
			if (status === 'role' || isMulti) {
				// Basic role selection modal (uses your existing terms 203/202 etc. if defined)
				window.simulatorShowConfirm({
					title: window.simulatorTerm(203, 'common'),
					content: window.simulatorTerm(202, 'common'),
					backgroundDismiss: true,
					closeIcon: true,
					buttons: {
						one: { text: '1', action: () => startExercise(1, 1) },
						two: { text: '2', action: () => startExercise(2, 2) },
						three: { text: '3', action: () => startExercise(3, 3) },
						four: { text: '4', action: () => startExercise(4, 4) }
					}
				});
				return;
			}

			// Warn/confirm start
			if (status === 'warn') {
				window.simulatorShowConfirm({
					title: window.simulatorTerm(212, 'common'),
					content: window.simulatorTerm(209, 'common'),
					backgroundDismiss: true,
					closeIcon: false,
					buttons: {
						ok: { text: window.simulatorTerm(205, 'common'), action: () => startExercise(1, 1) },
						cancel: { text: window.simulatorTerm(206, 'common'), btnClass: 'btn-blue' }
					}
				});
				return;
			}

			alert('Unhandled outline decision response');
		});
	};

	window.OutlineClick = Object.freeze({ bindOnce });
})();