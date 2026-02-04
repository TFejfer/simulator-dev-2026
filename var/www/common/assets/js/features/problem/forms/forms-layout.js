/* /common/assets/js/features/problem/forms/forms-layout.js
 *
 * Creates and manages the DOM layout for problem forms (data-driven order).
 *
 * Contract:
 * - Call ensureLayout(rootSelector)
 * - Call applyFormPlan(rootSelector, plan)
 *   where plan is the ordered array from backend: state.case.forms
 */

(() => {
	'use strict';

	const ensureLayout = (rootSelector) => {
		const $root = $(rootSelector);
		if ($root.length === 0) return null;

		let $container = $root.find('.problem-form-container');
		if ($container.length === 0) {
			$root.html(`<div class="problem-form-container"></div>`);
			$container = $root.find('.problem-form-container');
		}
		return $container;
	};

	const applyFormPlan = (rootSelector, plan) => {
		const $container = ensureLayout(rootSelector);
		if (!$container) return;

		const forms = Array.isArray(plan) ? plan : [];

		// Build desired container IDs in order
		const desired = forms
			.map(x => (x && x.form_code) ? String(x.form_code).trim() : '')
			.filter(Boolean)
			.map(code => `display_${code}`);

		// If nothing, clear
		if (desired.length === 0) {
			$container.empty();
			return;
		}

		// Rebuild only if the order/contents differ (cheap diff)
		const current = $container.children('div[id]').map((_, el) => el.id).get();
		const same =
			current.length === desired.length &&
			current.every((id, i) => id === desired[i]);

		if (same) return;

		$container.empty();
		desired.forEach((id) => {
			$container.append(`<div id="${id}"></div>`);
		});
	};

	window.ProblemFormsLayout = { ensureLayout, applyFormPlan };
})();