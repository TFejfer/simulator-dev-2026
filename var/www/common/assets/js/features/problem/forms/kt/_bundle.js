/* /common/assets/js/features/problem/forms/kt/_bundle.js */

window.__PROBLEM_FORMS_READY__ = false;
window.__PROBLEM_FORMS_READY_PROMISE__ = new Promise((resolve) => {
	window.__PROBLEM_FORMS_READY_RESOLVE__ = resolve;
});

const V = window.__ASSET_VER__ || String(Date.now());
const reg = window.problemFormsRegistry;
if (!reg) throw new Error('[bundle] problemFormsRegistry missing');

// Kun: “hvilke moduler findes i denne template”
// Rækkefølge er irrelevant, fordi DB/forms_plan bestemmer visning.
const formsToLoad = [
	'symptoms',
	'specification',
	'attachments',
	'causes',
	'actions',
	'worknotes',
	'reflections'
];

const load = async (code) => {
	try {
		const mod = await import(`./${code}.js?v=${V}`);

		// Robust: accepter både default og named export
		const api = mod.default || mod.kt;
		if (!api) throw new Error(`Missing export default/kt in ${code}.js`);

		reg.register(code, api);

		if (typeof window.__PROBLEM_FORMS_ON_MODULE__ === 'function') {
			window.__PROBLEM_FORMS_ON_MODULE__(code);
		}
		return true;
	} catch (e) {
		console.error('[bundle] failed to load', code, e);
		return false;
	}
};

await Promise.all(formsToLoad.map(load));

window.__PROBLEM_FORMS_READY__ = true;
if (typeof window.__PROBLEM_FORMS_READY_RESOLVE__ === 'function') {
	window.__PROBLEM_FORMS_READY_RESOLVE__(true);
}

console.log('[bundle] problem/kt loaded');
