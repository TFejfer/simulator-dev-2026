/* /var/www/common/assets/js/pages/training-instructor-problem-analysis.js
 *
 * Problem instructor analysis (minimal bring-up).
 *
 * Purpose:
 * - Prove page lifecycle works (blocking/render/bind)
 * - Show a visible placeholder in #problem_forms
 * - Load runtime state from /ajax/problem/exercise/state.php (optional for now)
 * - Prepare the ground for ProblemFormsLayout + ProblemFormsRegistry
 *
 * Notes:
 * - Uses SimulatorPage.run({ blocking, render, bind }) (hook-object signature).
 * - Does NOT require forms to be loaded globally; only this page needs them.
 */

/* global $, SimulatorPage, simulatorAjaxRequest, simulatorCache */

(() => {
	'use strict';

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

	const DELIVERY_META = PAGE?.DATA?.DELIVERY_META || null;
	if (!DELIVERY_META) console.error('[analysis] missing DELIVERY_META in page-data');

	const EXERCISE_META = PAGE?.DATA?.EXERCISE_META || null;
	if (!EXERCISE_META) console.error('[analysis] missing EXERCISE_META in page-data');
	console.log('[analysis] EXERCISE_META', EXERCISE_META);

	// Local runtime store payload
	const EXERCISE_DATA = {
		ui:{
			team_no: Number(DELIVERY_META.team_no || 0),
			language_code: String(DELIVERY_META.language_code || 'en'),
		},
		meta: {
			outline_id: Number(EXERCISE_META.outline_id || 0),
			skill_id: Number(EXERCISE_META.skill_id || 0),
			exercise_no: Number(EXERCISE_META.exercise_no || 0),
			theme_id: Number(EXERCISE_META.theme_id || 0),
			scenario_id: Number(EXERCISE_META.scenario_id || 0),
			format_id: Number(EXERCISE_META.format_id || 0),
			step_no: Number(EXERCISE_META.step_no || 0),
			current_state: Number(EXERCISE_META.current_state || 0),
			next_state: Number(EXERCISE_META.next_state || 0),		
			has_causality: Number(EXERCISE_META.has_causality || 0) === 1,
			number_of_causes: Number(EXERCISE_META.number_of_causes || 0),
			position_count: Number(EXERCISE_META.position_count || 0),
			role_id: Number(EXERCISE_META.role_id || 0),
			log_exercise_id: Number(EXERCISE_META.log_exercise_id || 0),
			created_at: String(EXERCISE_META.created_at || ''),
		},
		case: {
			versions: {},
			visibility: {},
			symptoms: [],
			facts: [],
			causes: [],
			actions: [],
			iteration: { text: '', },
			description: { short_description: '', long_description: '', work_notes: '', },
			reflection: { keep_text: '', improve_text: '', },
			attachments: { id: 0, file_name: null, }
		}
	};

	// Scope for endpoints
	const scope = {
		outline_id: Number(EXERCISE_META.outline_id || 0),
		exercise_no: Number(EXERCISE_META.exercise_no || 0),
		theme_id: Number(EXERCISE_META.theme_id || 0),
		scenario_id: Number(EXERCISE_META.scenario_id || 0)
	};

	// These will be initialized in blocking()
	let store = null;
	let exerciseStaticContent = null;
	let exerciseStateContent = null;

	// Make globals predictable for debugging (avoid undefined)
	window.ProblemExerciseStaticContent = null;
	window.ProblemExerciseStateContent = null;

	// ------------------------------------------------------------
	// 1b) Published exercise content (non-blocking)
	// ------------------------------------------------------------
	const loadExerciseStaticContent = async () => {
		const lang = EXERCISE_DATA.ui.language_code || 'en';
		const cacheKey = `exercise_static:problem:v1:${scope.theme_id}:${scope.scenario_id}:${lang}`;

		const res = await simulatorAjaxRequest('/ajax/problem_exercise_static_content.php', 'POST', {}, {
			mode: 'cache',
			cacheKey,
			cacheStore: simulatorCache?.session
		});

		if (!res?.ok) {
			console.warn('[analysis] static content load failed', res);
			return null;
		}

		exerciseStaticContent = res.data || null;
		window.ProblemExerciseStaticContent = exerciseStaticContent;
		console.log('[analysis] static content loaded', exerciseStaticContent);
		return exerciseStaticContent;
	};

	const loadExerciseStateContent = async () => {
		const lang = EXERCISE_DATA.ui.language_code || 'en';
		const state = Number(EXERCISE_META.current_state || 0) || 0;
		const cacheKey = `exercise_state:problem:v1:${scope.theme_id}:${scope.scenario_id}:${state}:${lang}`;

		const res = await simulatorAjaxRequest('/ajax/problem_exercise_state_content.php', 'POST', {}, {
			mode: 'cache',
			cacheKey,
			cacheStore: simulatorCache?.session
		});

		if (!res?.ok) {
			console.warn('[analysis] state content load failed', res);
			return null;
		}

		exerciseStateContent = res.data || null;
		window.ProblemExerciseStateContent = exerciseStateContent;
		console.log('[analysis] state content loaded', exerciseStateContent);
		return exerciseStateContent;
	};

	// ------------------------------------------------------------
	// 2) State loader (runtime forms)
	// ------------------------------------------------------------
	const refreshState = async () => {
		if (!store) return;

		const res = await simulatorAjaxRequest('/ajax/problem/exercise/state.php', 'POST', scope);

		if (!res?.ok) {
			console.warn('[analysis] state load failed', res);
			return;
		}

		const data = res.data || {};
		const versions = data.versions || {};
		const forms = data.forms || {};

		// Versions
		Object.keys(versions).forEach((k) => {
			store.setVersion(k, versions[k]);
		});

		// Forms
		if (forms.symptoms) store.get().case.symptoms = forms.symptoms;
		if (forms.facts) store.get().case.facts = forms.facts;
		if (forms.causes) store.get().case.causes = forms.causes;
		if (forms.actions) store.get().case.actions = forms.actions;
		if (forms.iterations) store.get().case.iterations = forms.iterations;
		//if (forms.description) store.get().case.description = forms.description;
		if (forms.reflections) store.get().case.reflections = forms.reflections;
		if (forms.attachments) store.get().case.attachments = forms.attachments;

		// KT forms: concerns and specifications


		// Visibility (optional – may be added later)
		if (data.case && data.case.visibility) {
			store.get().case.visibility = data.case.visibility;
		}

		console.log('[analysis] state refreshed');
	};

	// ------------------------------------------------------------
	// 3) Page lifecycle (hook-object signature)
	// ------------------------------------------------------------
	SimulatorPage.run({
		id: 'training-instructor-problem-analysis',

		blocking: async (ctx) => {
			console.log('[analysis] blocking entered');

			// Always create the mount skeleton
			$('#display_content').html(`
				<div id="problem_analysis_layout">
					<div id="problem_instruction"></div>
					<div id="problem_forms"></div>
					<div id="problem_sidebar_panels"></div>
				</div>
			`);

			// Visible proof (placeholder)
			$('#problem_forms').html(`
				<div style="padding:12px;border:2px solid #0a0;">
					FORMS PLACEHOLDER: layout mounted
				</div>
			`);

			// Build store (forms-core must be loaded for this page)
			if (!window.simulatorFormsStore?.createStore) {
				console.error('[analysis] simulatorFormsStore.createStore missing (forms store not loaded on this page)');
				return;
			}

			store = window.simulatorFormsStore.createStore(EXERCISE_DATA);
			window._debugStore = store;

			// Optional: ensure containers (if the layout module is loaded)
			if (window.ProblemFormsLayout?.ensureLayout) {
				window.ProblemFormsLayout.ensureLayout('#problem_forms');
			}

			// Static exercise content is needed by forms (e.g., CI names); load before first render
			await loadExerciseStaticContent();

			// Load runtime state once (safe even if forms registry isn't present yet)
			await refreshState();
		},

		render: (ctx) => {
			// Chrome
			if (window.TopBarEngine?.render) window.TopBarEngine.render();
			if (window.MenuBarEngine?.render) window.MenuBarEngine.render();

			// If a forms registry is present, render all forms (placeholder modules)
			if (store && window.ProblemFormsRegistry?.renderAll) {
				window.ProblemFormsRegistry.renderAll(store);
			}
		},

		bind: (ctx) => {
			// Bind common UI close buttons if available
			if (window.HelpSidebar?.bindCloseButton) {
				window.HelpSidebar.bindCloseButton();
			}

			// Bind placeholder form handlers (only if registry exists)
			if (store && window.ProblemFormsRegistry?.bindAll) {
				window.ProblemFormsRegistry.bindAll({
					store,
					scope
				});
			}
		},

		// Background: remaining published exercise content (state) without blocking render
		background: async () => {
			try {
				await loadExerciseStateContent();
			} catch (e) {
				console.warn('[analysis] background content load failed', e);
			}
		}
	});

	// ------------------------------------------------------------
	// 4) Expose refresh hook for polling consumers
	// ------------------------------------------------------------
	window.ProblemPageRefreshState = refreshState;
})();