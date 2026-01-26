/* /var/www/common/assets/js/pages/training-problem-instructor-analysis.js
 *
 * Problem instructor analysis (blueprint).
 *
 * Flow:
 * - Blocking: load static payload (info sources, menus) + state payload (forms + exercise meta/log)
 * - Render: topbar + menubar + main layout containers
 * - Bind: delegated menu button clicks + help sidebar + any form events (later)
 * - Polling: already auto-starts; consumer triggers refreshState() on log_exercise events
 */

/* global $, SimulatorPage, simulatorAjaxRequest, simulatorCache */

(() => {
	'use strict';

	// Debug
	console.log('[analysis] page script loaded');
	if (!document.getElementById('page-data')) {
		console.error('[analysis] missing #page-data script tag');
		return;
	}
	if (typeof SimulatorPage === 'undefined') {
		console.error('[analysis] SimulatorPage is undefined (core js not loaded?)');
		return;
	}

	const PAGE = (() => {
		try { return JSON.parse(document.getElementById('page-data')?.textContent || '{}'); }
		catch { return {}; }
	})();

	const EXERCISE_META = PAGE?.DATA?.EXERCISE_META || null;

	// Debug
	console.log('[analysis] EXERCISE_META', EXERCISE_META);

	const state = {
		staticData: null,	// published payload (info sources etc.)
		stateData: null,	// runtime state (forms etc.)
	};

	const refreshState = async () => {
		// NOTE: log_exercise_id/outline_id are not used for server ETag anymore,
		// but keep them if you want for debugging/telemetry.
		const payload = {
			client_log_exercise_id: EXERCISE_META?.log_exercise_id || 0,
			outline_id: EXERCISE_META?.outline_id || 0
		};

		console.log('[analysis] calling state endpoint payload', payload);

		// Use cache-mode so the ajax helper can reuse cached payload on 304 (if supported).
		// Cache key must match what the server uses to decide "same state":
		// theme_id + scenario_id + current_state + language_code
		const res = await simulatorAjaxRequest('/ajax/problem_exercise_state_content.php', 'POST', payload, {
			mode: 'cache',
			cacheKey: `problem_state:v1:${EXERCISE_META.theme_id}:${EXERCISE_META.scenario_id}:${EXERCISE_META.current_state}:${EXERCISE_META.language_code}`,
			cacheStore: simulatorCache.session
		});

		console.log('[analysis] state response', res);

		// Treat 304 as OK: keep existing stateData (or use cached if helper provides it)
		if (res?.status === 304) {
			console.log('[analysis] state 304 not modified');
			return;
		}

		if (!res?.ok) return;

		// Some helpers return payload directly, others wrap in {data:...}
		state.stateData = res.data ?? state.stateData;

		if (state.stateData?.state) {
			EXERCISE_META.current_state = state.stateData.state;
		}

		// Apply to UI (to be implemented in your feature files)
		if (window.ProblemFormsUI?.applyState) {
			window.ProblemFormsUI.applyState(state.stateData);
		}
		if (window.ProblemAnalysisUI?.applyState) {
			window.ProblemAnalysisUI.applyState(state.stateData);
		}
	};

	SimulatorPage.run({
		id: 'training-problem-instructor-analysis',

		blocking: async (ctx) => {
			console.log('[analysis] blocking start', ctx);

			// Ensure DOM mount exists
			$('#display_content').html(`
				<div id="problem_analysis_layout">
					<div id="problem_instruction"></div>
					<div id="problem_forms"></div>
					<div id="problem_sidebar_panels"></div>
				</div>
			`);

			console.log('[analysis] calling static endpoint');

			// 1) Static payload (cacheable / published)
			const resStatic = await simulatorAjaxRequest('/ajax/problem_exercise_static_content.php', 'POST', {}, {
				mode: 'cache',
				cacheKey: `problem_static:v1:${EXERCISE_META.theme_id}:${EXERCISE_META.scenario_id}:${EXERCISE_META.language_code}`,
				cacheStore: simulatorCache.session
			});
			if (!resStatic?.ok) {
				ctx.handleAuthFailure(resStatic);
				throw new Error(resStatic?.error || 'static load failed');
			}
			state.staticData = resStatic.data;

			console.log('[analysis] static ok', resStatic?.ok, resStatic);

			// 2) State payload (dynamic)
			await refreshState();
		},

		render: (ctx) => {
			if (window.TopBarEngine?.render) window.TopBarEngine.render();
			if (window.MenuBarEngine?.render) window.MenuBarEngine.render();

			// Apply static payload (info sources etc.)
			if (window.ProblemInfoSourcesUI?.applyStatic) {
				window.ProblemInfoSourcesUI.applyStatic(state.staticData);
			}
			if (window.ProblemFormsUI?.applyStatic) {
				window.ProblemFormsUI.applyStatic(state.staticData);
			}

			// Apply state payload (forms and current exercise state)
			if (window.ProblemFormsUI?.applyState) {
				window.ProblemFormsUI.applyState(state.stateData);
			}
			if (window.ProblemAnalysisUI?.applyState) {
				window.ProblemAnalysisUI.applyState(state.stateData);
			}
		},

		background: (ctx) => {
			// optional heartbeat etc.
		},

		bind: (ctx) => {
			// Help sidebar close binding (if used)
			if (window.HelpSidebar?.bindCloseButton) window.HelpSidebar.bindCloseButton();

			// Menu button clicks should be delegated in menubar-bind.js or your sidebar system
			// Keep page-specific handlers minimal.
		}
	});

	// Expose refresh for polling consumer
	window.ProblemPageRefreshState = refreshState;
})();