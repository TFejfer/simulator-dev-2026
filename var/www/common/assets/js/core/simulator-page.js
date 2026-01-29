/* /var/www/common/assets/js/core/simulator-page.js
 *
 * SimulatorPage runtime.
 *
 * Guarantees:
 * - Common terms are loaded (blocking) before render.
 * - A loading spinner is shown immediately and removed after first render.
 * - Optional blocking guard: team must be selected (team_no > 0), otherwise route to setup page.
 *
 * Page script responsibilities:
 * - Provide id (string)
 * - Provide features (optional):
 *   - requires_team (bool) default true
 *   - team_setup_route (string) default 'training-instructor-setup'
 * - Provide blocking(ctx): awaited before first render (page-specific blocking)
 * - Provide render(ctx): must be fast and sync
 * - Provide background(ctx): starts after render (non-blocking)
 * - Provide bind(ctx): binds events after render
 */

/* global $, simulatorAjaxRequest, simulatorTerms, simulatorTerm, simulatorCache, simulatorConvertStringPropertiesToIntegers */

(() => {
	'use strict';

	// -----------------------------
	// Low-level helpers
	// -----------------------------

	const readPageData = () => {
		const el = document.getElementById('page-data');
		if (!el) return { DATA: {} };

		try {
			return JSON.parse(el.textContent || '{}');
		} catch {
			return { DATA: {} };
		}
	};

	const normalizeDelivery = (delivery) => {
		if (!delivery || typeof delivery !== 'object') return {};

		try {
			simulatorConvertStringPropertiesToIntegers(delivery);
		} catch {}

		delivery.language_code = delivery.language_code || delivery.languageCode || 'en';
		delivery.first_name = delivery.first_name || delivery.firstName || '';

		// Remove camelCase aliases to keep DELIVERY(_META) snake_case only
		if ('languageCode' in delivery) delete delivery.languageCode;
		if ('firstName' in delivery) delete delivery.firstName;

		return delivery;
	};

	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

	const makeLogger = (debug, prefix) => {
		return (...args) => {
			if (debug) console.log(prefix, ...args);
		};
	};

	const term = (id, bucket = 'common', fallback = '') => {
		return simulatorTerm(id, bucket, fallback);
	};

	const handleAuthFailure = (res) => {
		if (!res) return;
		if (res.status === 401 || res.status === 403) {
			window.location.href = 'logout';
		}
	};

	// -----------------------------
	// Spinner
	// -----------------------------

	const ensureSpinner = () => {
		// Prefer #display_content if present, otherwise fall back to body overlay
		const host = document.getElementById('display_content');

		const html = `
			<div id="simulator-page-loading" style="padding:24px; display:flex; gap:12px; align-items:center;">
				<div class="spinner-border" role="status" aria-hidden="true"></div>
				<div>Loading...</div>
			</div>
		`;

		if (host) {
			host.innerHTML = html;
			return;
		}

		// Fallback overlay (rare: if page skeleton not rendered yet)
		const el = document.createElement('div');
		el.id = 'simulator-page-loading';
		el.style.position = 'fixed';
		el.style.inset = '0';
		el.style.display = 'flex';
		el.style.alignItems = 'center';
		el.style.justifyContent = 'center';
		el.style.background = 'rgba(0,0,0,0.15)';
		el.innerHTML = `<div style="background:white; padding:16px 18px; border-radius:12px; display:flex; gap:12px; align-items:center;">
			<div class="spinner-border" role="status" aria-hidden="true"></div>
			<div>Loading...</div>
		</div>`;
		document.body.appendChild(el);
	};

	const removeSpinner = () => {
		const el = document.getElementById('simulator-page-loading');
		if (el) el.remove();
	};

	// -----------------------------
	// Blocking default: common terms
	// -----------------------------

	const ensureCommonTerms = async (languageCode, dlog) => {
		// Always define loader idempotently (simulatorTerms should replace/ignore duplicates)
		simulatorTerms.defineLoader('common', async () => {
			const res = await simulatorAjaxRequest('/ajax/shared_content.php', 'POST', {}, {
				mode: 'cache',
				cacheKey: `shared_content:common:v1:${languageCode || 'en'}`,
				cacheStore: simulatorCache.session
			});

			if (!res.ok) {
				throw new Error(res.error || 'shared_content failed');
			}

			const shared = res.data;
			
			// Expose shared payload (formats, themes, menu_buttons, etc.) to all page scripts
			window.SIM_SHARED = shared || {};

			if (dlog) {
				dlog('common_terms size', shared?.common_terms ? Object.keys(shared.common_terms).length : 0);
			}

			return shared?.common_terms || {};
		});

		await simulatorTerms.ensure('common');
	};

	// -----------------------------
	// Blocking default: ensure team selected
	// -----------------------------

	const ensureTeamSelected = async (ctx, setupRoute) => {
		// Use server-side truth for routing decisions (do not trust client state)
		const res = await simulatorAjaxRequest('/ajax/setup_status.php', 'POST', {}, { mode: 'dynamic' });

		if (!res || !res.ok) {
			ctx.handleAuthFailure(res);
			throw new Error(res?.error || `http_${res?.status || 0}`);
		}

		const teamNo = Number(res.data?.team_no || 0);

		// Team not selected => route to setup page
		if (!Number.isFinite(teamNo) || teamNo <= 0) {
			window.location.href = setupRoute;
			throw new Error('team_not_selected');
		}
	};

	// -----------------------------
	// Runtime
	// -----------------------------

	const run = async (pageImpl) => {
		const payload = readPageData();
		const debug = Boolean(payload?.DEBUG) || new URLSearchParams(window.location.search).has('debug');

		const dlog = makeLogger(debug, `[${pageImpl.id || 'page'}]`);

		const ctx = {
			debug,
			dlog,
			sleep,
			term: (id, fallback = '') => term(id, 'common', fallback),

			payload,
			page: payload?.DATA?.PAGE || {},
			delivery: normalizeDelivery(payload?.DATA?.DELIVERY || {}),

			// Feature flags:
			// - Page script can override via pageImpl.features
			// - Server can override via DATA.PAGE.features
			features: Object.assign(
				{
					requires_team: true,
					team_setup_route: 'training-instructor-setup'
				},
				pageImpl.features || {},
				payload?.DATA?.PAGE?.features || {}
			),

			handleAuthFailure,
		};

		try {
			ensureSpinner();

			// Always blocking: common terms
			await ensureCommonTerms(ctx.delivery.language_code, debug ? dlog : null);

			// Optional blocking guard: ensure a team is selected
			if (ctx.features.requires_team) {
				await ensureTeamSelected(ctx, ctx.features.team_setup_route);
			}

			// Page-specific blocking init
			if (typeof pageImpl.blocking === 'function') {
				await pageImpl.blocking(ctx);
			}

			// Render (fast, sync)
			if (typeof pageImpl.render === 'function') {
				pageImpl.render(ctx);
			}

			// Remove spinner after render
			removeSpinner();

			// Background tasks (must not block)
			if (typeof pageImpl.background === 'function') {
				try {
					pageImpl.background(ctx);
				} catch (e) {
					if (debug) console.warn('background failed', e);
				}
			}

			// Events
			if (typeof pageImpl.bind === 'function') {
				pageImpl.bind(ctx);
			}

			if (debug) {
				dlog('PAGE', ctx.page);
				dlog('DELIVERY', ctx.delivery);
				dlog('FEATURES', ctx.features);
			}
		} catch (e) {
			removeSpinner();

			// If we intentionally routed away (team guard), do not show an error screen
			if (String(e && e.message) === 'team_not_selected') {
				return;
			}

			console.error('Page init failed:', e);
			$('#display_content').html('<div style="padding:16px">Page could not be initialized. Please reload.</div>');
		}
	};

	window.SimulatorPage = Object.freeze({ run });
})();