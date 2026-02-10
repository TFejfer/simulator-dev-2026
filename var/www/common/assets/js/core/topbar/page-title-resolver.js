/* /var/www/common/assets/js/core/topbar/page-title-resolver.js
 *
 * PageTitleResolver
 * - Returns a localized page title for a given page_key.
 * - Uses simulatorTerm(id, 'common') as the single term source.
 * - Allows optional per-page overrides.
 */

/* global window */

(() => {
	'use strict';

	const termCommon = (id, fallback = '') => {
		if (typeof window.simulatorTerm !== 'function') return String(fallback || '');
		return String(window.simulatorTerm(Number(id || 0), 'common', fallback));
	};

	const registry = Object.freeze({
		'training-instructor-setup': { term_id: 539 },
		'training-instructor-outline': { term_id: 306 },
		'training-instructor-problem-analysis': { term_id: 561 },
		'training-instructor-problem-action': { term_id: 36 },
		'training-instructor-results': { term_id: 562 },
		'training-instructor-result': { term_id: 107 },
	});

	const resolve = (ctx) => {
		const pageKey = String(ctx?.page_key || '');

		const overrideId = Number(window.PAGE_TITLE_TERM_ID || 0);
		if (overrideId > 0) {
			return termCommon(overrideId, '');
		}

		const def = registry[pageKey];
		if (!def) {
			// Optional fallback: human-readable page key
			return pageKey.replaceAll('-', ' ');
		}

		if (def.term_id) return termCommon(def.term_id, '');
		if (def.text) return String(def.text);

		return '';
	};

	window.PageTitleResolver = Object.freeze({ resolve });
})();