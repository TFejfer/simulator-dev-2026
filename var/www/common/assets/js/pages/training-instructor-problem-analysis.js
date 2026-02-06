/* /var/www/common/assets/js/pages/training-instructor-problem-analysis.js */

/* global $, SimulatorPage, simulatorAjaxRequest, simulatorCache */

(() => {
	'use strict';

	const debugEnabled = window.SIM_DEBUG?.enabled?.() || /[?&]debug(=|&|$)/i.test(String(window.location.search || ''));
	const dlog = (...args) => { if (debugEnabled) console.log('[analysis]', ...args); };
	const dwarn = (...args) => { if (debugEnabled) console.warn('[analysis]', ...args); };

	dlog('page script loaded');

	if (!document.getElementById('page-data')) {
		console.error('[analysis] missing #page-data script tag');
		return;
	}
	if (typeof SimulatorPage === 'undefined') {
		console.error('[analysis] SimulatorPage is undefined (core js not loaded?)');
		return;
	}

	// ------------------------------------------------------------
	// 0) Helpers
	// ------------------------------------------------------------

	const waitForFormsReady = async () => {
		// If bundle hasn't created the promise yet, wait a little for it to appear.
		for (let i = 0; i < 40; i++) { // ~2s
			if (window.__PROBLEM_FORMS_READY_PROMISE__) break;
			await new Promise(r => setTimeout(r, 50));
		}

		if (window.__PROBLEM_FORMS_READY_PROMISE__) {
			await window.__PROBLEM_FORMS_READY_PROMISE__;
			return true;
		}

		// Fallback (should not happen): proceed without blocking forever
		return false;
	};

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
	dlog('EXERCISE_META', EXERCISE_META);

	// Local runtime store payload (keep keys aligned with backend contract)
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
			forms_plan: [],
			// Data payloads (match backend keys)
			symptoms: [],
			facts: [],
			causes: [],
			actions: [],
			iterations: [],
			description: { short_description: '', long_description: '', work_notes: '', },
			reflections: { keep_text: '', improve_text: '', },
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
			dwarn('static content load failed', res);
			return null;
		}

		exerciseStaticContent = res.data || null;
		window.ProblemExerciseStaticContent = exerciseStaticContent;
		dlog('static content loaded', exerciseStaticContent);
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
			dwarn('state content load failed', res);
			return null;
		}

		exerciseStateContent = res.data || null;
		window.ProblemExerciseStateContent = exerciseStateContent;
		dlog('state content loaded', exerciseStateContent);
		return exerciseStateContent;
	};

	// ------------------------------------------------------------
	// 2) State loader (runtime forms)
	// ------------------------------------------------------------
	const refreshState = async () => {
		if (!store) return;

		const res = await simulatorAjaxRequest('/ajax/problem/exercise/state.php', 'POST', scope);

		if (!res?.ok) {
			dwarn('state load failed', res);
			return;
		}

		const data = res.data || {};
		const versions = data.versions || {};
		const forms = data.forms || {};
		const uiPlan = data?.case?.forms || null;

		// Persist plan in store so render/bind can follow DB order
		store.get().case.forms_plan = Array.isArray(uiPlan) ? uiPlan : [];

		// 🔑 Build dynamic form containers in the DB-defined order
		if (uiPlan && window.ProblemFormsLayout?.applyFormPlan) {
			window.ProblemFormsLayout.applyFormPlan('#problem_forms', uiPlan);
		}

		// Versions
		Object.keys(versions).forEach((k) => {
			store.setVersion(k, versions[k]);
		});

		// Forms (only set what exists)
		if (forms.symptoms) store.get().case.symptoms = forms.symptoms;
		if (forms.facts) store.get().case.facts = forms.facts;
		if (forms.causes) store.get().case.causes = forms.causes;
		if (forms.actions) store.get().case.actions = forms.actions;
		if (forms.iterations) store.get().case.iterations = forms.iterations;
		if (forms.description) store.get().case.description = forms.description;
		if (forms.reflections) store.get().case.reflections = forms.reflections;
		if (forms.attachments) store.get().case.attachments = forms.attachments;

		// Visibility (backwards compatible)
		if (data.case && data.case.visibility) {
			store.get().case.visibility = data.case.visibility;
		}

		dlog('state refreshed');
	};

	// ------------------------------------------------------------
	// 3) Page lifecycle
	// ------------------------------------------------------------
	SimulatorPage.run({
		id: 'training-instructor-problem-analysis',

		blocking: async () => {
			dlog('blocking entered');

			$('#display_content').html(`
				<div id="problem_analysis_layout">
					<div id="problem_instruction"></div>
					<div id="problem_forms"></div>
					<div id="problem_sidebar_panels"></div>
				</div>
			`);

			// Build store
			if (!window.simulatorFormsStore?.createStore) {
				console.error('[analysis] simulatorFormsStore.createStore missing (forms store not loaded on this page)');
				return;
			}

			store = window.simulatorFormsStore.createStore(EXERCISE_DATA);
			window._debugStore = store;

			// Ensure base container exists
			if (window.ProblemFormsLayout?.ensureLayout) {
				window.ProblemFormsLayout.ensureLayout('#problem_forms');
			}

						// Static content first (needed for CI lookups etc.)
						await loadExerciseStaticContent();
						if (window.ProblemInfoSidebar?.prepare) {
							try { window.ProblemInfoSidebar.prepare(); } catch {}
						}

			// Render-throttle for incremental module arrivals (must be set BEFORE bundle finishes).
			let renderTimer = null;
			window.__PROBLEM_FORMS_ON_MODULE__ = () => {
				// Skip early renders until the bundle finishes to avoid missing-module noise.
				if (!window.__PROBLEM_FORMS_READY__) return;
				if (renderTimer) return;
				renderTimer = setTimeout(() => {
					renderTimer = null;
					const plan = Array.isArray(store.get().case.forms_plan) ? store.get().case.forms_plan : [];
					if (plan.length && window.problemFormsRegistry?.renderPlan) {
						window.problemFormsRegistry.renderPlan(store, plan);
					}
				}, 50);
			};

			// Load runtime state (builds plan + containers)
			await refreshState();

			// Wait for bundle completion before first render/bind to avoid missing-module errors.
			await waitForFormsReady();

			const plan = Array.isArray(store.get().case.forms_plan) ? store.get().case.forms_plan : [];
			if (plan.length && window.problemFormsRegistry?.renderPlan) {
				window.problemFormsRegistry.renderPlan(store, plan);
			}

			if (plan.length && window.problemFormsRegistry?.bindPlan) {
				window.problemFormsRegistry.bindPlan({ store, scope }, plan);
			}
		},

		render: () => {
			if (window.TopBarEngine?.render) window.TopBarEngine.render();
			if (window.MenuBarEngine?.render) window.MenuBarEngine.render();
			// Do NOT render forms here; we render once after bundle is ready in blocking().
		},

		bind: () => {
			if (window.HelpSidebar?.bindCloseButton) {
				window.HelpSidebar.bindCloseButton();
			}
			if (window.ProblemInfoSidebar?.bindCloseButton) {
				window.ProblemInfoSidebar.bindCloseButton();
			}
			// Do NOT bind forms here; we bind once after bundle is ready in blocking().
		},

		background: async () => {
			try {
				await loadExerciseStateContent();
				if (window.ProblemInfoSidebar?.prepare) {
					try { window.ProblemInfoSidebar.prepare(); } catch {}
				}
			} catch (e) {
				dwarn('background content load failed', e);
			}
		}
	});

	// ------------------------------------------------------------
	// 4) Expose refresh hook for polling consumers
	// ------------------------------------------------------------
	window.ProblemPageRefreshState = refreshState;
})();