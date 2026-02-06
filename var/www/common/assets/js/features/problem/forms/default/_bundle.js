/* /common/assets/js/features/problem/forms/default/_bundle.js
 *
 * Default template bundle (dynamic imports with cache-busting).
 *
 * Performance:
 * - Loads all modules in parallel (Promise.all) to avoid sequential waits.
 *
 * Notes:
 * - This file only registers modules. Render order is DB-driven via forms_plan.
 */

/* /common/assets/js/features/problem/forms/default/_bundle.js */

window.__PROBLEM_FORMS_READY__ = false;
window.__PROBLEM_FORMS_READY_PROMISE__ = new Promise((resolve) => {
	window.__PROBLEM_FORMS_READY_RESOLVE__ = resolve;
});

const V = window.__ASSET_VER__ || String(Date.now());
const debugEnabled = window.SIM_DEBUG?.enabled?.() || /[?&]debug(=|&|$)/i.test(String(window.location.search || ''));
const dlog = (...args) => { if (debugEnabled) console.log('[bundle]', ...args); };

const reg = window.problemFormsRegistry;
if (!reg) throw new Error('[bundle] problemFormsRegistry missing');

const load = async (code) => {
	try {
		const mod = await import(`./${code}.js?v=${V}`);
		// Each module exports default { render, bind }
		reg.register(code, mod.default);

		// Optional hook (keep cheap; do NOT render here)
		if (typeof window.__PROBLEM_FORMS_ON_MODULE__ === 'function') {
			window.__PROBLEM_FORMS_ON_MODULE__(code);
		}

		return true;
	} catch (e) {
		console.error('[bundle] failed to load', code, e);
		return false;
	}
};

// List the forms you expect for this template.
// Rendering order is NOT defined here (DB forms_plan decides).
const formsToLoad = [
	'symptoms',
	'facts',
	'attachments',
	'causes',
	'actions',
	'iterations',
	'description',
	'worknotes',
	'reflections'
];

// Load all in parallel
await Promise.all(formsToLoad.map(load));

window.__PROBLEM_FORMS_READY__ = true;
if (typeof window.__PROBLEM_FORMS_READY_RESOLVE__ === 'function') {
	window.__PROBLEM_FORMS_READY_RESOLVE__(true);
}

dlog('problem/default loaded');