/* /var/www/common/assets/js/pages/training-instructor-outline.js
 *
 * Training outline page.
 *
 * Uses SimulatorPage runtime:
 * - Common terms are loaded blocking before render
 * - Spinner is handled automatically
 * - Team guard runs automatically (requires_team=true by default)
 *
 * Scope:
 * - Load outline data (blocking) from /ajax/training_outline.php (temporary endpoint)
 * - Render outline grid
 * - Bind:
 *   - logout + home
 *   - outline item clicks
 *   - course menu buttons (res/set/hel)
 *
 * Help:
 * - Help UI is implemented in /common/assets/js/features/sidebar/help-sidebar.js
 * - This page only triggers HelpSidebar.open(...) when the menu button is clicked.
 */

/* global $, SimulatorPage, simulatorAjaxRequest, simulatorLogout,
		  INSTRUCTOR_PACED_AUTO_TIMER_INTERVALS, instructorPacedActiveUserUpdate,
		  simulatorCache */

(() => {
	'use strict';

	/**
	 * Local page state.
	 */
	const state = {
		outline: [],
	};

	/* ============================================================
	 * Menu binding (outline page)
	 * ============================================================
	 */

	/**
	 * Bind course menu buttons on outline page.
	 *
	 * IMPORTANT:
	 * - Delegated binding on document to survive MenuBarEngine re-renders.
	 * - Menu buttons use data-code as canonical identifier.
	 *
	 * Requirements:
	 * - MenuBarEngine renders buttons with: .menu-btn[data-code="res|set|hel"]
	 * - help-sidebar.js is loaded on this page (as a page-asset)
	 */
	const bindCourseMenuButtons = () => {
		$(document).off('click.courseMenu', '#menuBar .menu-btn');

		$(document).on('click.courseMenu', '#menuBar .menu-btn', function (e) {
			e.preventDefault();

			const code = String($(this).attr('data-code') || $(this).data('code') || '');

			switch (code) {
				case 'res':
					window.location.href = 'training-instructor-results';
					break;

				case 'set':
					window.location.href = 'training-instructor-setup';
					break;

				case 'hel':
					if (window.HelpSidebar && typeof window.HelpSidebar.open === 'function') {
						window.HelpSidebar.open();
					}
					break;

				default:
					// Unknown code => ignore.
					break;
			}
		});
	};

	/* ============================================================
	 * SimulatorPage lifecycle
	 * ============================================================
	 */

	SimulatorPage.run({
		id: 'training-instructor-outline',

		/**
		 * Blocking: load outline data before first render.
		 */
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

		/**
		 * Render: fast and synchronous.
		 */
		render: (ctx) => {
			TopBarEngine.render();
			MenuBarEngine.render();

			$('#display_content').html(window.OutlineUI.renderOutlineHtml(ctx, state.outline));

			// Apply current DB status once after initial render.
			if (window.OutlineStatus && typeof window.OutlineStatus.refresh === 'function') {
				requestAnimationFrame(() => {
					window.OutlineStatus.refresh({ simulator: window.simulator });
				});
			}
		},

		/**
		 * Background: heartbeat (keep it minimal for now).
		 */
		background: (ctx) => {
			setTimeout(() => {
				try {
					instructorPacedActiveUserUpdate();
				} catch {}
			}, INSTRUCTOR_PACED_AUTO_TIMER_INTERVALS.VERYLONG);
		},

		/**
		 * Events: logout + home + outline clicks + menu buttons.
		 */
		bind: (ctx) => {
			/* ----------------------------
			 * Course menu buttons
			 * ---------------------------- */
			bindCourseMenuButtons();

			// Bind sidebar close behavior from help feature (delegated; safe to call multiple times).
			if (window.HelpSidebar && typeof window.HelpSidebar.bindCloseButton === 'function') {
				window.HelpSidebar.bindCloseButton();
			}

			/* ----------------------------
			 * Logout (topbar)
			 * ---------------------------- */
			$('#topBar').on('click', '#logoutSim', function () {
				if (typeof simulatorLogout === 'function') {
					try {
						simulatorLogout();
						return;
					} catch {}
				}
				window.location.href = 'logout';
			});

			/* ----------------------------
			 * Home button
			 * ---------------------------- */
			$('#topBar').on('click', '#topBarHome', function () {
				window.location.href = 'training-instructor-outline';
			});

			/* ----------------------------
			 * Outline item click (minimal)
			 * ---------------------------- */
			$('#display_content').on('click', '.outline-item', function () {
				const item = String($(this).attr('data-item') || '');
				const exercise = Number($(this).attr('data-exercise') || 0);

				if (item === 'terminology') {
					// Temporary routing (adjust later to your new routes)
					window.location.href = 'delivery-1-2-tfu';
					return;
				}

				if (item === 'exercise' && exercise > 0) {
					// Safe placeholder until you implement proper skill-based routing.
					window.location.href = 'training-instructor-problem-analysis';
				}
			});
		}
	});
})();