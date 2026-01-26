/* /var/www/common/assets/js/pages/training-problem-instructor-analysis.js
 *
 * Problem instructor analysis (blueprint).
 *
 * Goals:
 * - shared_content is loaded by SimulatorPage BEFORE this script runs (blocking, required for UI/terms).
 * - exercise_static and exercise_state are fetched here and cached via ETag/304.
 * - UI features (TopBar/MenuBar/InfoSources/Forms) render from cached payloads when available.
 * - Polling consumer can call window.ProblemPageRefreshState() to refresh state when needed.
 */

/* global $, SimulatorPage, simulatorAjaxRequest, simulatorCache */

(() => {
	'use strict';

	// ------------------------------------------------------------
	// 0) Guardrails (fail fast with clear console errors)
	// ------------------------------------------------------------
	console.log('[analysis] page script loaded');

	if (!document.getElementById('page-data')) {
		console.error('[analysis] missing #page-data script tag');
		return;
	}

	if (typeof SimulatorPage === 'undefined') {
		console.error('[analysis] SimulatorPage is undefined (core js not loaded?)');
		return;
	}

	// ------------------------------------------------------------
	// 1) Parse server-provided page data
	// ------------------------------------------------------------
	const PAGE = (() => {
		try {
			return JSON.parse(document.getElementById('page-data')?.textContent || '{}');
		} catch {
			return {};
		}
	})();

	// Exercise meta is server truth (from DB -> session -> page-data).
	// It is stable enough to build cache keys and drive initial state selection.
	const EXERCISE_META = PAGE?.DATA?.EXERCISE_META || null;

	console.log('[analysis] EXERCISE_META', EXERCISE_META);

	// ------------------------------------------------------------
	// 2) Local state container (in-memory)
	// ------------------------------------------------------------
	const state = {
		// Published payload (cacheable): info sources, menus, static definitions, etc.
		staticData: null,

		// Runtime/published state payload (cacheable via ETag): built for current (theme, scenario, state, language)
		stateData: null,
	};

	// ------------------------------------------------------------
	// 3) Refresh state payload (ETag-aware via cache-mode)
	//
	// Server-side 304 rule for exercise_state:
	// - ETag is derived from theme_id + scenario_id + current_state + language_code
	//
	// Client-side:
	// - We request in cache-mode so the ajax helper can:
	//   - send If-None-Match automatically (if it has cached ETag)
	//   - return cached data on 304 (or at least report status=304)
	// ------------------------------------------------------------
	const refreshState = async () => {
		// Payload is not used for server ETag anymore (ETag is fingerprint-based),
		// but it is useful for telemetry/debugging and future extensions.
		const payload = {
			client_log_exercise_id: EXERCISE_META?.log_exercise_id || 0,
			outline_id: EXERCISE_META?.outline_id || 0
		};

		console.log('[analysis] calling state endpoint payload', payload);

		const res = await simulatorAjaxRequest('/ajax/problem_exercise_state_content.php', 'POST', payload, {
			mode: 'cache',

			// IMPORTANT:
			// Cache key must match the server’s publish key drivers for state.
			cacheKey: `problem_state:v1:${EXERCISE_META.theme_id}:${EXERCISE_META.scenario_id}:${EXERCISE_META.current_state}:${EXERCISE_META.language_code}`,
			cacheStore: simulatorCache.session
		});

		console.log('[analysis] state response', res);

		// 304 means "nothing changed": keep existing stateData.
		// (If your ajax helper returns cached data on 304, it will typically set res.data anyway,
		//  but we do not require it here.)
		if (res?.status === 304) {
			console.log('[analysis] state 304 not modified');
			return;
		}

		if (!res?.ok) return;

		// Some helpers return payload directly, others wrap in {data:...}.
		// Keep the previous stateData if the response provides none.
		state.stateData = res.data ?? state.stateData;

		// If server includes "state" in the payload, keep EXERCISE_META aligned.
		// This ensures future cacheKey calculations are correct after a state transition.
		if (state.stateData?.state) {
			EXERCISE_META.current_state = state.stateData.state;
		}

		// Apply to UI features (if present).
		// These modules should be tolerant to partial/late state updates.
		if (window.ProblemFormsUI?.applyState) {
			window.ProblemFormsUI.applyState(state.stateData);
		}
		if (window.ProblemAnalysisUI?.applyState) {
			window.ProblemAnalysisUI.applyState(state.stateData);
		}
	};

	// ------------------------------------------------------------
	// 4) Page lifecycle
	// ------------------------------------------------------------
	SimulatorPage.run({
		id: 'training-problem-instructor-analysis',

		// blocking():
		// - Keep this lightweight to speed up first paint.
		// - shared_content is already loaded by SimulatorPage before we get here.
		blocking: async (ctx) => {
			console.log('[analysis] blocking start', ctx);

			// Ensure DOM mount exists (workspace skeleton)
			$('#display_content').html(`
				<div id="problem_analysis_layout">
					<div id="problem_instruction"></div>
					<div id="problem_forms"></div>
					<div id="problem_sidebar_panels"></div>
				</div>
			`);

			// --------------------------------------------------------
			// 4.1) Static payload (published + cacheable via ETag/304)
			// Server publish key drivers for static:
			// - theme_id + scenario_id + language_code
			// --------------------------------------------------------
			console.log('[analysis] calling static endpoint');

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

			// --------------------------------------------------------
			// 4.2) State payload (ETag-aware, often 304)
			// - We load it here to have initial state ready for render().
			// - If you want faster first paint, move this call to background()
			//   and gate menu clicks on "ready".
			// --------------------------------------------------------
			await refreshState();
		},

		// render():
		// - Render chrome + apply whatever data we already have.
		// - Feature modules should be robust if payloads are missing/late.
		render: (ctx) => {
			if (window.TopBarEngine?.render) window.TopBarEngine.render();
			if (window.MenuBarEngine?.render) window.MenuBarEngine.render();

			// Apply static payload
			if (window.ProblemInfoSourcesUI?.applyStatic) {
				window.ProblemInfoSourcesUI.applyStatic(state.staticData);
			}
			if (window.ProblemFormsUI?.applyStatic) {
				window.ProblemFormsUI.applyStatic(state.staticData);
			}

			// Apply state payload
			if (window.ProblemFormsUI?.applyState) {
				window.ProblemFormsUI.applyState(state.stateData);
			}
			if (window.ProblemAnalysisUI?.applyState) {
				window.ProblemAnalysisUI.applyState(state.stateData);
			}
		},

		// background():
		// - Optional: heartbeat, background refreshers, non-critical prefetch.
		// - If you choose to load state in background instead of blocking,
		//   call refreshState() here and ensure menu clicks wait for readiness.
		background: (ctx) => {
			// Example (optional):
			// refreshState();
		},

		// bind():
		// - Bind minimal page-specific handlers.
		// - Menu button handlers should live in shared feature scripts.
		bind: (ctx) => {
			if (window.HelpSidebar?.bindCloseButton) {
				window.HelpSidebar.bindCloseButton();
			}
		}
	});

	// ------------------------------------------------------------
	// 5) Expose refresh hook for polling consumers
	// ------------------------------------------------------------
	window.ProblemPageRefreshState = refreshState;
})();