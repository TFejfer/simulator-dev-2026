/* /var/www/common/assets/js/core/topbar/topbar-rules.js
 *
 * TopBarRules
 * - Pure rule evaluation (no DOM).
 * - Returns a layout describing widgets for a1..a5 and timer mode.
 *
 * Your fixed semantics:
 * - a1 team: default on all pages EXCEPT setup
 * - a2 exercise: default on all pages EXCEPT setup/outline/results/result
 * - a3 pageTitle: default on all pages
 * - a4 timer: only on exercise pages (later: based on page/skill/format/step)
 * - a5 role/position: only on exercise pages (later: based on format_no)
 */

/* global window */

(() => {
	'use strict';

	const isSetupPage = (ctx) => String(ctx.page_key || '') === 'training-instructor-setup';

	const isCoursePage = (ctx) => {
		const k = String(ctx.page_key || '');
		return (
			k === 'training-instructor-setup' ||
			k === 'training-instructor-outline' ||
			k === 'training-instructor-results' ||
			k === 'training-instructor-result' ||
			k === 'training-instructor-problem-result'
		);
	};

	const isCompletePage = (ctx) => String(ctx.page_key || '') === 'training-instructor-problem-complete';

	const isExercisePage = (ctx) => !isCoursePage(ctx);

	// Default layout (applied first, then overridden by rules)
	const baseLayout = () => ({
		home: { enabled: true },
		areas: {
			a1: 'team',
			a2: 'exercise',
			a3: 'pageTitle',
			a4: 'none',
			a5: 'none'
		},
		timer: { mode: 'none' }
	});

	// Apply your global fixed rules as defaults
	const applyGlobalDefaults = (ctx, layout) => {
		const out = JSON.parse(JSON.stringify(layout));

		// a3 pageTitle always
		out.areas.a3 = 'pageTitle';

		// a1 team on all pages except setup
		out.areas.a1 = isSetupPage(ctx) ? 'none' : 'team';

		// a2 exercise on all pages except setup/outline/results/result
		out.areas.a2 = isCoursePage(ctx) ? 'none' : 'exercise';

		// a4 timer only on exercise pages (selection later)
		out.areas.a4 = isExercisePage(ctx) ? 'timerCountUp' : 'none';
		out.timer = { mode: isExercisePage(ctx) ? 'countup' : 'none' };

		// a5 role/position only on exercise pages (selection later)
		out.areas.a5 = isExercisePage(ctx) ? 'none' : 'none';

		return out;
	};

	// Override timer mode based on format_no (formats 1/10/11 use countdown when inputs are present)
	const applyTimerRules = (ctx, layout) => {
		const out = JSON.parse(JSON.stringify(layout));
		if (!isExercisePage(ctx)) return out;

		const f = Number(ctx.format_no || 0);
		const hasCountdownInputs = Number(ctx.deadline_unix || 0) > 0 || Number(ctx.seconds_left || 0) > 0;
		const isFinalize = String(ctx.timer_phase || '') === 'finalize' || Number(ctx.step_no || 0) >= 80;

		if (!isCompletePage(ctx) && hasCountdownInputs && (isFinalize || [1, 10, 11].includes(f))) {
			out.areas.a4 = 'timerCountDown';
			out.timer = { mode: 'countdown' };
		} else {
			out.areas.a4 = 'timerCountUp';
			out.timer = { mode: 'countup' };
		}

		return out;
	};

	// Override a5 role/position based on format_no (you said: later)
	// For now we include the hook and demonstrate "format 5 shows rolePositions"
	const applyRoleRules = (ctx, layout) => {
		const out = JSON.parse(JSON.stringify(layout));
		if (!isExercisePage(ctx)) return out;

		const f = Number(ctx.format_no || 0);
		if (f === 5) {
			out.areas.a5 = 'rolePositions';
		} else {
			out.areas.a5 = 'none';
		}

		return out;
	};

	const resolve = (ctx) => {
		let layout = baseLayout();

		// 1) Apply global fixed semantics
		layout = applyGlobalDefaults(ctx, layout);

		// 2) Timer rules (format-based)
		layout = applyTimerRules(ctx, layout);

		// 3) Role rules (format-based)
		layout = applyRoleRules(ctx, layout);

		layout._rule = 'fixed-semantics+format';
		return layout;
	};

	window.TopBarRules = Object.freeze({ resolve });
})();