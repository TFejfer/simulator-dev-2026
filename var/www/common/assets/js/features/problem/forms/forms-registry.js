/* forms-registry.js
 *
 * Registers and orchestrates all problem form modules.
 */

(() => {
	'use strict';

	const forms = [];

	const register = (formModule) => {
		forms.push(formModule);
	};

	const renderAll = (store) => {
		forms.forEach(f => f.render && f.render(store));
	};

	const bindAll = (ctx) => {
		forms.forEach(f => f.bind && f.bind(ctx));
	};

	window.ProblemFormsRegistry = {
		register,
		renderAll,
		bindAll
	};
})();