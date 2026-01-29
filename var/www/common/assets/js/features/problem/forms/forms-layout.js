/* forms-layout.js
 *
 * Creates and manages the DOM layout for problem forms.
 */

(() => {
	'use strict';

	const ensureLayout = (rootSelector) => {
		const $root = $(rootSelector);
		if ($root.length === 0) return;

		if ($root.find('.problem-form-container').length > 0) return;

		$root.html(`
			<div class="problem-form-container">
				<div id="display_symptoms"></div>
				<div id="display_facts"></div>
				<div id="display_causes"></div>
				<div id="display_actions"></div>
				<div id="display_iteration"></div>
				<div id="display_description"></div>
				<div id="display_reflection"></div>
			</div>
		`);
	};

	window.ProblemFormsLayout = { ensureLayout };
})();