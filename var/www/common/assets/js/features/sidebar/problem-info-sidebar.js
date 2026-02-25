/* /common/assets/js/features/sidebar/problem-info-sidebar.js
 * Router for problem info sources sidebar.
 * - Pre-renders all sources into a hidden staging area so they are ready when opened.
 * - Delegates rendering to per-source files registered in ProblemInfoSources.
 */

(() => {
	'use strict';

	const utils = window.ProblemInfoSourceUtils;
	const registry = window.ProblemInfoSources;
	if (!utils || !registry) return;

	const $ = window.jQuery;
	let prepared = false;
	let mounted = false;
	const rendered = Object.create(null);

	const readPageData = (() => {
		let cache = null;
		return () => {
			if (cache) return cache;
			const fallback = { delivery: {}, exercise: {}, pageKey: '' };
			const el = document.getElementById('page-data');
			if (!el) return fallback;
			try {
				const parsed = JSON.parse(el.textContent || '{}');
				const delivery = Object.assign(
					{},
					parsed?.DATA?.DELIVERY_META || {},
					parsed?.DATA?.DELIVERY || {}
				);
				cache = {
					delivery,
					exercise: parsed?.DATA?.EXERCISE_META || parsed?.DATA?.EXERCISE || {},
					pageKey: parsed?.CTX_KEY || ''
				};
				return cache;
			} catch {
				return fallback;
			}
		};
	})();

	const readCachedSources = (kind, ctx) => {
		if (!window.simulatorCache?.session?.get) return null;
		const exercise = ctx.exercise || {};
		const lang = ctx.delivery?.language_code || 'en';
		const theme = Number(exercise.theme_id || 0);
		const scenario = Number(exercise.scenario_id || 0);
		if (!theme || !scenario) return null;
		let key = '';
		if (kind === 'static') {
			key = `exercise_static:problem:v1:${theme}:${scenario}:${lang}`;
		}
		if (kind === 'state') {
			const state = Number(exercise.current_state || exercise.state || 0);
			if (!state) return null;
			key = `exercise_state:problem:v1:${theme}:${scenario}:${state}:${lang}`;
		}
		if (!key) return null;
		const cached = window.simulatorCache.session.get(key);
		return cached?.data?.sources || null;
	};

	const resolveStaticSources = (ctx) => {
		if (window.ProblemExerciseStaticContent?.sources) return window.ProblemExerciseStaticContent.sources;
		return readCachedSources('static', ctx);
	};

	const resolveStateSources = (ctx) => {
		if (window.ProblemExerciseStateContent?.sources) return window.ProblemExerciseStateContent.sources;
		return readCachedSources('state', ctx);
	};

	const renderFallback = (code) => `
		<div class="simulator-info-source" data-code="${code}">
			<div class="sidebar-title">${code}</div>
			<p style="opacity:0.7">No content available yet.</p>
		</div>
	`;

	const prepare = () => {
		const ctx = readPageData();
		const staticSources = resolveStaticSources(ctx) || {};
		const stateSources = resolveStateSources(ctx) || {};
		const shared = window.SIM_SHARED || {};
		Object.keys(rendered).forEach((k) => delete rendered[k]);

		registry.all().forEach((def) => {
			const srcKey = def.sourceKey || def.code;
			const payload = def.kind === 'state'
				? (stateSources?.[srcKey] || {})
				: (staticSources?.[srcKey] || {});

			let html = '';
			try {
				html = def.render(ctx, payload, shared) || '';
			} catch (e) {
				console.warn('[problem-info-sidebar] render failed', def.code, e);
			}
			rendered[def.code] = html || renderFallback(def.code);
		});

		prepared = true;
	};

	const renderContainers = (codes) => {
		let html = '<div class="sidebar-container">';
		codes.forEach((code) => {
			html += `<div id="info_source_${code}" class="simulator-info-source" data-code="${code}"></div>`;
		});
		html += '</div>';
		return html;
	};

	const mountAll = () => {
		if (!prepared) prepare();
		const $body = utils.ensureSidebarBody();
		if (!$body || !$body.length) return;

		const codes = registry.all().map((d) => d.code);
		$body.html(renderContainers(codes));

		registry.all().forEach((def) => {
			const $target = $body.find(`.simulator-info-source[data-code="${def.code}"]`).first();
			if (!$target.length) return;

			// Render template; many legacy renderers return a wrapped .simulator-info-source. Unwrap to avoid nested hidden containers.
			$target.html(rendered[def.code] || renderFallback(def.code));
			const $inner = $target.children('.simulator-info-source').first();
			if ($inner.length) {
				$target.html($inner.html());
			}
			$target
				.removeClass('active')
				.attr('aria-hidden', 'true')
				.css('display', 'block'); // keep paintable off-screen instead of display none

			if (typeof def.bind === 'function') {
				try { def.bind($target, { ctx: readPageData() }); } catch (e) { console.warn('[problem-info-sidebar] bind failed', def.code, e); }
			}
		});

		mounted = true;
	};

	const open = (code) => {
		const def = registry.get(code);
		if (!def) {
			if (code === 'hel' && window.HelpSidebar?.open) {
				window.HelpSidebar.open();
				return true;
			}
			return false;
		}

		// Close action modal when switching info source (avoid stale overlay)
		if ($) {
			const $actModal = $('#simulator_modal_act');
			if ($actModal.length) {
				$actModal
					.removeClass('simulator-show')
					.attr('aria-hidden', 'true')
					.css('display', 'none');
				$('body').removeClass('modal-open');
			}
		}

		if (!prepared) prepare();
		if (!mounted) mountAll();

		if (def.code === 'inb') {
			try { window.MenuBarBadge?.dismissInbox?.(readPageData()); } catch {}
		}

		const $body = utils.ensureSidebarBody();
		if (!$body || !$body.length) return false;

		const all = $body.find('.simulator-info-source');
		all
			.removeClass('active')
			.attr('aria-hidden', 'true');

		const $target = $body.find(`.simulator-info-source[data-code="${def.code}"]`).first();
		if (!$target.length) return false;

		utils.openSidebarShell();
		$target
			.addClass('active')
			.attr('aria-hidden', 'false');
		return true;
	};

	const bindCloseButton = () => {
		if (!$) return;
		$(document).off('click.problemInfoSidebarClose', '#sideBar .closebtn');
		$(document).on('click.problemInfoSidebarClose', '#sideBar .closebtn', (e) => {
			e.preventDefault();
			utils.closeSidebarShell();
		});
	};

	const installMenuBridge = () => {
		const prevOpen = window.MenuBarActions?.open;
		window.MenuBarActions = Object.assign({}, window.MenuBarActions, {
			open(code) {
				const handled = open(code);
				if (!handled && typeof prevOpen === 'function') return prevOpen(code);
				return handled;
			}
		});
	};

	const prewarmHidden = () => {
		try {
			prepare();
			mountAll();
		} catch (e) {
			console.warn('[problem-info-sidebar] prepare failed', e);
		}
	};

	window.ProblemInfoSidebar = {
		open,
		prepare: prewarmHidden,
		resolveStaticSources,
		resolveStateSources,
		bindCloseButton,
		close: utils.closeSidebarShell
	};

	installMenuBridge();
	bindCloseButton();
	setTimeout(prewarmHidden, 0);
})();
