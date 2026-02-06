/* /common/assets/js/features/sidebar/problem-info-sources-registry.js
 * Registry for problem info sidebar sources.
 */

(() => {
	'use strict';

	const sources = new Map();
	const aliasToCode = new Map();

	const register = (def) => {
		if (!def || !def.code || typeof def.render !== 'function') return;
		const code = String(def.code);
		sources.set(code, Object.freeze(def));

		const aliases = Array.isArray(def.aliases) ? def.aliases : [];
		aliases.forEach((a) => aliasToCode.set(String(a), code));
		aliasToCode.set(code, code);
	};

	const get = (code) => {
		if (!code) return null;
		const canon = aliasToCode.get(String(code)) || String(code);
		return sources.get(canon) || null;
	};

	const all = () => Array.from(sources.values());

	window.ProblemInfoSources = Object.freeze({ register, get, all });
})();
