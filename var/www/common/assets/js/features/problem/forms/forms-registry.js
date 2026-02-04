/* /common/assets/js/features/problem/forms/forms-registry.js
 *
 * Problem Forms Registry (optimal, no legacy).
 *
 * Responsibilities:
 * - Register form modules by canonical form code (e.g. 'symptoms', 'facts', ...)
 * - Render and bind forms strictly in the DB-defined order (backend plan: data.case.forms)
 *
 * Backend plan contract (array, ordered):
 * - form_code: string
 * - mode: number (1=enabled, 2=limited, 3=disabled)
 * - component: string (optional; debugging/traceability)
 *
 * Module contract (required):
 * - render(store, view)
 * - bind(ctx, view)
 *
 * View object passed to modules:
 * - form_code: string
 * - mode: number
 * - component: string
 * - root_id: string (e.g. '#display_symptoms')
 */

(() => {
	'use strict';

	// Map: canonical form_code => module
	const byCode = Object.create(null);

	// Log missing modules only once per page load (avoid console spam)
	const missingLogged = new Set();

	/**
	 * Normalize a form code to a stable canonical key.
	 */
	const normCode = (code) => String(code || '').trim().toLowerCase();

	/**
	 * Register a form module by canonical code.
	 *
	 * @param {string} formCode	Canonical form code (must match DB form_rule.form)
	 * @param {object} module	Form module implementing render(store, view) and bind(ctx, view)
	 */
	const register = (formCode, module) => {
		const code = normCode(formCode);

		if (!code) {
			throw new Error('[problemFormsRegistry] register(): formCode is empty');
		}
		if (!module || typeof module !== 'object') {
			throw new Error(`[problemFormsRegistry] register(): module is invalid for ${code}`);
		}
		if (typeof module.render !== 'function') {
			throw new Error(`[problemFormsRegistry] register(): module.render missing for ${code}`);
		}
		if (typeof module.bind !== 'function') {
			throw new Error(`[problemFormsRegistry] register(): module.bind missing for ${code}`);
		}

		byCode[code] = module;
	};

	/**
	 * Render forms strictly following the backend plan order.
	 *
	 * @param {object} store	The forms store
	 * @param {Array} plan	Ordered plan array from backend (data.case.forms)
	 */
	const renderPlan = (store, plan) => {
		if (!store) {
			throw new Error('[problemFormsRegistry] renderPlan(): store is required');
		}
		if (!Array.isArray(plan)) {
			throw new Error('[problemFormsRegistry] renderPlan(): plan must be an array');
		}

		plan.forEach((p) => {
			const code = normCode(p?.form_code);
			if (!code) {
				throw new Error('[problemFormsRegistry] renderPlan(): plan item missing form_code');
			}

			const mod = byCode[code];
			if (!mod) {
				if (!missingLogged.has(code)) {
					missingLogged.add(code);
					console.error('[problemFormsRegistry] missing module for form_code:', code);
				}
				return;
			}

			const view = {
				form_code: code,
				mode: Number(p?.mode ?? 3),
				component: String(p?.component || ''),
				root_id: `#display_${code}`
			};

			mod.render(store, view);
		});
	};

	/**
	 * Bind form handlers strictly following the backend plan order.
	 *
	 * @param {object} ctx	Binding context, e.g. { store, scope }
	 * @param {Array} plan	Ordered plan array from backend (data.case.forms)
	 */
	const bindPlan = (ctx, plan) => {
		if (!ctx || typeof ctx !== 'object') {
			throw new Error('[problemFormsRegistry] bindPlan(): ctx is required');
		}
		if (!Array.isArray(plan)) {
			throw new Error('[problemFormsRegistry] bindPlan(): plan must be an array');
		}

		plan.forEach((p) => {
			const code = normCode(p?.form_code);
			if (!code) {
				throw new Error('[problemFormsRegistry] bindPlan(): plan item missing form_code');
			}

			const mod = byCode[code];
			if (!mod) {
				/* Fail-soft:
				* Missing modules must not break the entire page.
				* This allows incremental form rollout (e.g. symptoms+facts first).
				*/
				if (!missingLogged.has(code)) {
					missingLogged.add(code);
					console.error('[problemFormsRegistry] missing module for form_code:', code);
				}
				return;
			}

			const view = {
				form_code: code,
				mode: Number(p?.mode ?? 3),
				component: String(p?.component || ''),
				root_id: `#display_${code}`
			};

			mod.bind(ctx, view);
		});
	};

	// Export canonical global
	window.problemFormsRegistry = {
		register,
		renderPlan,
		bindPlan
	};
})();