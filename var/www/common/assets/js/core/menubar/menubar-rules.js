/* /var/www/common/assets/js/core/menubar/menubar-rules.js
 *
 * MenuBarRules
 * - Pure functions: classify page scope and decide which contexts to render.
 *
 * Containers (PHP skeleton):
 * - #menuButtonsCourse (only on training-instructor-outline)
 * - #menuButtonsExercise (exercise pages)
 * - #menuButtonsDocumentation (result pages: training-*-instructor-result)
 */

(() => {
	'use strict';

	const pageKey = (ctx) => String(ctx?.page_key || '');

	const isCourseOutline = (ctx) => pageKey(ctx) === 'training-instructor-outline';

	const isDocumentationResultPage = (ctx) => {
		// Examples you gave:
		// - training-problem-instructor-result
		// - training-risk-instructor-result
		// - training-rca-instructor-result
		const k = pageKey(ctx);
		return (/(-instructor-result|-problem-result)$/.test(k) && k.startsWith('training-'));
	};

	const shouldRenderCourse = (ctx) => isCourseOutline(ctx);

	const shouldRenderExercise = (ctx) => {
		// You said: menuButtonsExercise exists on most exercise pages, a few do not.
		// We render if the container exists; engine will check DOM.
		// Here we only exclude course outline and documentation result pages if you want.
		const k = pageKey(ctx);
		if (k === 'training-instructor-setup') return false;
		if (isCourseOutline(ctx)) return false;
		if (isDocumentationResultPage(ctx)) return false;
		return k.startsWith('training-');
	};

	const shouldRenderDocumentation = (ctx) => isDocumentationResultPage(ctx);

	window.MenuBarRules = Object.freeze({
		shouldRenderCourse,
		shouldRenderExercise,
		shouldRenderDocumentation
	});
})();