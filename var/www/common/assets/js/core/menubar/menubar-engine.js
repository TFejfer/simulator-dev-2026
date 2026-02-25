/* /var/www/common/assets/js/core/menubar/menubar-engine.js
 *
 * MenuBarEngine
 * - Central renderer for menu bar.
 * - No page-specific updateMenuButtons() should be needed.
 *
 * Data sources:
 * - SIM_SHARED.menu_buttons (already loaded from shared_content payload)
 * - Exercise meta/state (page-data preferred, window.EXERCISE fallback)
 * - Visibility map (skill-specific). For Problem: fetched from endpoint.
 */

(() => {
	'use strict';

	const $ = window.jQuery;

	const readBadgeKeyParts = (ctx) => {
		const delivery = ctx?.delivery || {};
		const exercise = ctx?.exercise || {};
		const accessId = Number(delivery.access_id || delivery.accessId || 0);
		const outlineId = Number(exercise.outline_id || exercise.outlineId || 0);
		const stepNo = Number(exercise.step_no || exercise.stepNo || exercise.step || 0);
		if (!accessId || !outlineId || !stepNo) return null;
		return { accessId, outlineId, stepNo };
	};

	const inboxBadgeKey = (ctx) => {
		const parts = readBadgeKeyParts(ctx);
		if (!parts) return '';
		return `badge:dismissed:inb:${parts.accessId}:${parts.outlineId}:${parts.stepNo}`;
	};

	const isInboxBadgeDismissed = (ctx) => {
		const key = inboxBadgeKey(ctx);
		if (!key) return false;
		try {
			return window.localStorage?.getItem(key) === '1';
		} catch {
			return false;
		}
	};

	const dismissInboxBadge = (ctx) => {
		const key = inboxBadgeKey(ctx);
		if (!key) return;
		try {
			window.localStorage?.setItem(key, '1');
		} catch {}

		const badgeEl = document.getElementById('badge_inb');
		if (badgeEl) badgeEl.classList.remove('button-badge');

		if (window.SIM_VISIBILITY?.problem && Number(window.SIM_VISIBILITY.problem.inb || 0) === 2) {
			window.SIM_VISIBILITY.problem.inb = 1;
		}
	};

	const applyInboxBadgeOverride = (visibilityMap, ctx) => {
		if (!visibilityMap || typeof visibilityMap !== 'object') return visibilityMap;
		if (Number(visibilityMap.inb || 0) !== 2) return visibilityMap;
		if (!isInboxBadgeDismissed(ctx)) return visibilityMap;
		visibilityMap.inb = 1;
		return visibilityMap;
	};

	const readPageData = () => {
		const el = document.getElementById('page-data');
		if (!el) return null;
		try { return JSON.parse(el.textContent || '{}'); } catch { return null; }
	};

	const getCtx = () => {
		const pd = readPageData() || {};
		const delivery = pd?.DATA?.DELIVERY || {};
		const exMeta = pd?.DATA?.EXERCISE || pd?.DATA?.EXERCISE_META || window.EXERCISE || {};

		return {
			page_key: String(pd?.CTX_KEY || ''),
			delivery,
			exercise: exMeta,
			simulator: window.simulator || window.SIMULATOR || null
		};
	};

	const inferSkillId = (ctx) => {
		// Prefer explicit field if present
		const ex = ctx.exercise || {};
		const direct =
			Number(ex.skill_id || ex.skillId || ex.skill || 0);

		if (direct > 0) return direct;

		// Fallback: infer from page_key naming
		const k = String(ctx.page_key || '');
		if (k.includes('-problem-')) return 1;
		if (k.includes('-risk-')) return 2;
		if (k.includes('-rca-')) return 3;

		// Last fallback: delivery.skill_id if available
		const d = Number(ctx.delivery?.skill_id || 0);
		return d > 0 ? d : 0;
	};

	const filterButtons = (items, context, skillId) => {
		return (items || [])
			.filter((it) => String(it?.context || '') === context)
			.filter((it) => {
				const s = Number(it?.skill_id || 0);
				return s === 0 || s === skillId;
			})
			.sort((a, b) => Number(a.sequence_no || 0) - Number(b.sequence_no || 0));
	};

	const renderInto = (selector, html) => {
		const el = document.querySelector(selector);
		if (!el) return;
		if ($) {
			$(selector).html(html || '');
		} else {
			el.innerHTML = html || '';
		}
	};

	const fetchProblemVisibility = async (ctx) => {
		// Build request from exercise meta
		const ex = ctx.exercise || {};

		const body = {
			format_id: Number(ex.format_id || ex.formatId || ex.format_no || ex.format || 0),
			step_no: Number(ex.step_no || ex.stepNo || ex.step || 0),
			position_count: Number(ex.position_count || ex.positionCount || ex.positions || 0),
			role_id: Number(ex.role_id || ex.roleId || ex.role || 0),
			theme_id: Number(ex.theme_id || ex.themeId || ex.theme || 0),
			scenario_id: Number(ex.scenario_id || ex.scenarioId || ex.scenario || 0)
		};

		const res = await window.simulatorAjaxRequest(
			'/ajax/problem_menu_visibility_read.php',
			'POST',
			body,
			{ mode: 'dynamic', timeoutMs: 15000 }
		);

		if (!res.ok) {
			window.PollingDebug?.log('menubar.problem_visibility.error', { error: res.error, status: res.status }, 'info');
			return null;
		}

		return res.data && typeof res.data === 'object' ? res.data : null;
	};

	const MenuBarEngine = {
		_lastKey: '',

		async render() {
			const ctx = getCtx();

			const all = window.SIM_SHARED?.menu_buttons;
			if (!Array.isArray(all)) return;

			const skillId = inferSkillId(ctx);

			// Decide which contexts should be rendered on this page
			const showCourse = window.MenuBarRules?.shouldRenderCourse?.(ctx) === true;
			const showExercise = window.MenuBarRules?.shouldRenderExercise?.(ctx) === true;
			const showDoc = window.MenuBarRules?.shouldRenderDocumentation?.(ctx) === true;

			// Bind click handler once
			window.MenuBarBind?.bindOnce?.();

			// Visibility map (only needed for exercise context)
			let visibilityMap = null;

			// For now: focus on Problem (skill_id=1)
			if (showExercise && skillId === 1) {
				visibilityMap = await fetchProblemVisibility(ctx);
				visibilityMap = applyInboxBadgeOverride(visibilityMap, ctx);
				if (visibilityMap) {
					window.SIM_VISIBILITY = window.SIM_VISIBILITY || {};
					window.SIM_VISIBILITY.problem = visibilityMap;
					if (window.ProblemInfoSidebar?.prepare) {
						try { window.ProblemInfoSidebar.prepare(); } catch {}
					}
				}
			}

			// Render course buttons
			if (showCourse) {
				const items = filterButtons(all, 'course', 0);
				renderInto('#menuButtonsCourse', window.MenuBarRender.render(items, null));
			} else {
				renderInto('#menuButtonsCourse', '');
			}

			// Render exercise buttons
			if (showExercise) {
				const items = filterButtons(all, 'exercise', skillId);
				renderInto('#menuButtonsExercise', window.MenuBarRender.render(items, visibilityMap));
			} else {
				renderInto('#menuButtonsExercise', '');
			}

			// Render documentation buttons
			if (showDoc) {
				const items = filterButtons(all, 'documentation', skillId);
				renderInto('#menuButtonsDocumentation', window.MenuBarRender.render(items, null));
			} else {
				renderInto('#menuButtonsDocumentation', '');
			}

			window.PollingDebug?.log('menubar.render', {
				page_key: ctx.page_key,
				skill_id: skillId,
				show: { course: showCourse, exercise: showExercise, documentation: showDoc }
			}, 'trace');
		}
	};

	window.MenuBarEngine = Object.freeze(MenuBarEngine);
	window.MenuBarBadge = Object.freeze({
		dismissInbox: dismissInboxBadge,
		isInboxDismissed: isInboxBadgeDismissed,
		applyInboxOverride: applyInboxBadgeOverride
	});
})();