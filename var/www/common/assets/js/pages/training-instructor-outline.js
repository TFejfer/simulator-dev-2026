/* /var/www/common/assets/js/pages/training-instructor-outline.js
 *
 * Training outline page.
 *
 * Uses SimulatorPage runtime:
 * - Common terms are loaded blocking before render
 * - Spinner is handled automatically
 * - Team guard runs automatically (requires_team=true by default)
 *
 * Initial scope:
 * - Load outline data (blocking) from /ajax/training_outline.php (temporary endpoint)
 * - Render outline grid
 * - Hook basic click navigation (exercise/terminology)
 *
 * Later iterations:
 * - Replace /ajax/training_outline.php with real OutlineRepository/published payload
 * - Add item status + lock timing endpoints
 * - Add sidebar/menu sources + polling 
 */

/* global $, SimulatorPage, simulatorAjaxRequest, simulatorLogout,
		  INSTRUCTOR_PACED_AUTO_TIMER_INTERVALS, instructorPacedActiveUserUpdate */

(() => {
	'use strict';

	const state = {
		outline: [],
	};

	const updateTopBar = (ctx) => {
		// Example: show team number + page title
		$('#topBarArea1').text(`Team ${Number(ctx.delivery.team || 0)}`);
		$('#topBarArea3').text('Training outline');
	};

	SimulatorPage.run({
		id: 'training-instructor-outline',

		// Blocking: load outline data before first render
		blocking: async (ctx) => {
			// Ensure main container exists (BasePage workspace skeleton only provides #main)
			$('#main').html('<div id="display_content"></div>');

			// Outline is delivery-static => cache per delivery_id
			const deliveryId = String(
				ctx.delivery.delivery_id ||
				ctx.delivery.deliveryId ||
				''
			);

			if (!deliveryId) {
				throw new Error('Missing delivery_id in delivery meta');
			}

			const res = await simulatorAjaxRequest('/ajax/training_outline.php', 'POST', {}, {
				mode: 'cache',
				cacheKey: `training_outline:v1:${deliveryId}`,
				cacheStore: simulatorCache.session
			});

			if (!res || !res.ok) {
				ctx.handleAuthFailure(res);
				throw new Error(res?.error || `http_${res?.status || 0}`);
			}

			state.outline = Array.isArray(res.data?.outline) ? res.data.outline : [];
		},

		// Render: fast and synchronous
		render: (ctx) => {
			updateTopBar(ctx);
			$('#display_content').html(window.OutlineUI.renderOutlineHtml(ctx, state.outline));
			window.OutlineUI.initStatusUI();
		},

		// Background: heartbeat (keep it minimal for now)
		background: (ctx) => {
			setTimeout(() => {
				try {
					instructorPacedActiveUserUpdate();
				} catch {}
			}, INSTRUCTOR_PACED_AUTO_TIMER_INTERVALS.VERYLONG);
		},

		// Events: logout + outline clicks
		bind: (ctx) => {
			// Logout (topbar)
			$('#topBar').on('click', '#logoutSim', function () {
				if (typeof simulatorLogout === 'function') {
					try {
						simulatorLogout();
						return;
					} catch {}
				}
				window.location.href = 'logout';
			});

			// Home button (optional behavior)
			$('#topBar').on('click', '#topBarHome', function () {
				window.location.href = 'training-instructor-outline';
			});

			// Outline item click (minimal)
			$('#display_content').on('click', '.outline-item', function () {
				const item = String($(this).attr('data-item') || '');
				const exercise = Number($(this).attr('data-exercise') || 0);

				if (item === 'terminology') {
					// Temporary routing (adjust later to your new routes)
					window.location.href = 'delivery-1-2-tfu';
					return;
				}

				if (item === 'exercise' && exercise > 0) {
					// Temporary routing (replace with your new exercise routing later)
					window.location.href = `training-instructor-${skill}-analysis`;
				}
			});
		}
	});
})();