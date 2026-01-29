/* facts.js
 *
 * Facts form – placeholder implementation.
 */

/* global $ */

(() => {
	'use strict';

	const FORM_KEY = 'facts';
	const CONTAINER = '#display_facts';

	const render = (store) => {
		const ex = store.get();
		const mode = ex.case?.visibility?.[FORM_KEY] ?? 0;

		// Hidden
		if (mode === 0) {
			$(CONTAINER).empty();
			return;
		}

		$(CONTAINER).html(`
			<div class="form-block">
				<h3>Facts</h3>
				<p>Placeholder – rows: ${(ex.case?.facts || []).length}</p>
			</div>
		`);
	};

	const bind = ({ store, scope }) => {
		// No events yet (placeholder)
	};

	window.ProblemFormFacts = { key: FORM_KEY, render, bind };
	window.ProblemFormsRegistry.register(window.ProblemFormFacts);
})();