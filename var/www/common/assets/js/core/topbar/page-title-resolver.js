/* /var/www/common/assets/js/core/topbar/page-title-resolver.js
 *
 * PageTitleResolver
 * - Returns a localized page title for a given page_key.
 * - Uses SIM_SHARED.common_terms as the default term source.
 * - Allows optional per-page overrides.
 */

/* global window */

(() => {
	'use strict';

	// Helper: read term from common_terms map (your proven working source)
	const termCommon = (id) => {
		const key = String(Number(id || 0));
		const terms = window.SIM_SHARED?.common_terms;
		if (!terms || typeof terms !== 'object') return '';
		return String(terms[key] ?? '');
	};

	// Registry: page_key -> title definition
	// Use either:
	// - { term_id: 123 }  (best)
	// - { text: "..." }   (fallback for pages without term yet)
	const registry = Object.freeze({
        'training-instructor-setup': { term_id: 539 },
		'training-instructor-outline': { term_id: 306 },
		'training-instructor-results': { term_id: 562 },
		'training-instructor-result': { term_id: 107 },
	});

	const resolve = (ctx) => {
		const pageKey = String(ctx?.page_key || '');

		// Allow page scripts to override at runtime
		// e.g. window.PAGE_TITLE_TERM_ID = 123;
		const overrideId = Number(window.PAGE_TITLE_TERM_ID || 0);
		if (overrideId > 0) {
			const t = termCommon(overrideId);
			return t || '';
		}

		const def = registry[pageKey];
		if (!def) {
			// Fallback: show page_key if nothing else exists (optional; you can return '')
			return pageKey.replaceAll('-', ' ');
		}

		if (def.term_id) {
			const t = termCommon(def.term_id);
			return t || '';
		}

		if (def.text) return String(def.text);

		return '';
	};

	window.PageTitleResolver = Object.freeze({
		resolve
	});
})();
