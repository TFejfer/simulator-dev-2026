/* /common/assets/js/features/sidebar/sources/inspect-and-act.js
 * Inspect & Act (WebRotate 360 + action modal).
 *
 * INPUTS (data + format):
 * - window.ProblemExerciseStaticContent / window.ProblemExerciseStateContent
 *   - .sources.inspect_and_act (object)
 *   - .cis (array or object) with items containing: ci_id/id, ci_type_id/type_id, name/text/ci_text, has_multiple_images/sImg
 *   - .ci_descriptions (array) rows with: ci_type_id/ciTypeID/type_id, text/ci_text, sequence_no/sequence
 *   - .ci_actions_mapping (array or object) rows with: ci_type_id/ciTypeID, action_id/actionID
 *   - .ci_action_benefits (array) rows with: ci_type_id/ciTypeID/type_id, action_id/actionID, text
 *   - .ci_action_time_and_cost (array) rows with: ci_type_id/ciTypeID/type_id, action_id/actionID, time_min/time, cost
 * - window.SIM_SHARED (object) may mirror the same structures
 * - window.simulatorCache.session.get (optional cache)
 * - window.simulatorTerm(id, scope, fallback) (optional) for localization
 * - ctx: { delivery, exercise } resolved from #page-data
 *
 * REQUIRED LIBRARIES:
 * - jQuery (window.jQuery)
 * - WebRotate 360 jQuery plugin (jQuery.fn.rotator)
 *
 * REQUIRED EXTERNAL FUNCTIONS:
 * - window.ProblemInfoSources.register
 * - window.ProblemInfoSourceUtils.getMenuButtonLabel
 * - window.ProblemInfoSidebar.resolveStateSources (optional)
 * - window.SIM_DEBUG (optional shared helper; /common/assets/js/core/sim-debug.js)
 *
 * DEBUG MODE:
 * - Enable by adding ?debug to the URL (or &debug).
 * - Logs validation of inputs, libraries, functions, and pipeline steps.
 * - All debug entries are prefixed with [inspect-and-act.js].
 */

(() => {
	'use strict';

	if (!window.ProblemInfoSources?.register || !window.ProblemInfoSourceUtils) return;

	const $ = window.jQuery;
	const { getMenuButtonLabel } = window.ProblemInfoSourceUtils;

	const esc = (s) => String(s ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');

	const term = (id, fallback = '') => (
		typeof window.simulatorTerm === 'function'
			? window.simulatorTerm(id, 'common', fallback)
			: fallback
	);

	const shared = () => window.SIM_SHARED || {};

	const isSwitchType = (type) => type === 23 || type === 24;

	/* =========================
	 * Debug helpers (?debug)
	 * ========================= */
	const SIM_DEBUG = window.SIM_DEBUG || (() => {
		const enabled = (() => {
			try {
				const params = new URLSearchParams(window.location.search || '');
				return params.has('debug');
			} catch {
				return /[?&]debug(=|&|$)/i.test(String(window.location.search || ''));
			}
		})();

		return {
			enabled: () => enabled,
			log(prefix, event, data = {}) {
				if (!enabled) return;
				console.log(prefix, { ts: new Date().toISOString(), event, ...data });
			},
			check(prefix, label, ok, details = {}) {
				if (!enabled) return;
				const level = ok ? 'log' : 'warn';
				console[level](prefix, { ts: new Date().toISOString(), check: label, ok, ...details });
			}
		};
	})();

	const dbg = (event, data = {}) => SIM_DEBUG.log('[inspect-and-act.js]', event, data);
	const debugCheck = (label, ok, details = {}) => SIM_DEBUG.check('[inspect-and-act.js]', label, ok, details);

	// Debug: verify libraries and external functions are available
	debugCheck('lib:jQuery', !!window.jQuery);
	debugCheck('lib:rotator', !!window.jQuery?.fn?.rotator);
	debugCheck('fn:ProblemInfoSources.register', !!window.ProblemInfoSources?.register);
	debugCheck('fn:ProblemInfoSourceUtils.getMenuButtonLabel', !!window.ProblemInfoSourceUtils?.getMenuButtonLabel);
	debugCheck('fn:simulatorTerm(optional)', typeof window.simulatorTerm === 'function' || window.simulatorTerm === undefined);

	/* =========================
	 * Debug + race control
	 * ========================= */

	const IAA_DEBUG = window.SIM_DEBUG?.enabled?.() || /[?&]debug(=|&|$)/i.test(String(window.location.search || ''));

	const iaaId = (() => {
		const s = Math.random().toString(36).slice(2, 8);
		return `iaa_${Date.now()}_${s}`;
	})();

	const debugSid = window.SIM_DEBUG?.sessionId?.();

	const log = (event, data = {}) => {
		if (!IAA_DEBUG) return;
		console.debug('[inspect-and-act]', { ts: new Date().toISOString(), iaaId, sid: debugSid, event, ...data });
	};

	const warn = (event, data = {}) => {
		console.warn('[inspect-and-act]', { ts: new Date().toISOString(), iaaId, sid: debugSid, event, ...data });
	};

	const err = (event, data = {}) => {
		console.error('[inspect-and-act]', { ts: new Date().toISOString(), iaaId, sid: debugSid, event, ...data });
	};

	const elInfo = (el) => {
		if (!el) return null;
		const r = el.getBoundingClientRect();
		const cs = window.getComputedStyle(el);
		return {
			tag: el.tagName,
			id: el.id,
			className: el.className,
			inDom: document.body.contains(el),
			rect: { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) },
			style: {
				display: cs.display,
				visibility: cs.visibility,
				opacity: cs.opacity,
				position: cs.position,
				overflow: cs.overflow
			}
		};
	};

	const countId = (id) => document.querySelectorAll(`#${CSS.escape(id)}`).length;

	const installGlobalDebugHooksOnce = (() => {
		let installed = false;
		return () => {
			if (installed) return;
			installed = true;

			window.addEventListener('error', (e) => {
				const t = e.target;
				if (t && (t.tagName === 'IMG' || t.tagName === 'SCRIPT' || t.tagName === 'LINK')) {
					err('resource_error', { tag: t.tagName, src: t.src || t.href, outer: (t.outerHTML || '').slice(0, 200) });
				} else {
					err('window_error', { message: e.message, filename: e.filename, lineno: e.lineno, colno: e.colno });
				}
			}, true);

			window.addEventListener('unhandledrejection', (e) => {
				err('unhandledrejection', { reason: String(e.reason?.message || e.reason || '') });
			});
		};
	})();

	// Race cancellation token
	let iaaInitSeq = 0;
	let iaaInitTimer = null;
	let iaaInitInFlight = false;
	let iaaInitPending = null;
	let iaaLastInitKey = '';
	let iaaLastInitOk = false;

	const nextInitToken = () => (++iaaInitSeq);
	const clearInitTimer = () => {
		if (iaaInitTimer) {
			clearTimeout(iaaInitTimer);
			iaaInitTimer = null;
		}
	};

	const queueInit = (payload) => {
		iaaInitPending = payload;
		dbg('init:queued', { token: payload?.token, current: iaaInitSeq });
	};

	const finishInit = (reason) => {
		if (!iaaInitInFlight) return;
		iaaInitInFlight = false;
		dbg('init:done', { reason });
		if (!iaaInitPending) return;
		const pending = iaaInitPending;
		iaaInitPending = null;
		if (pending?.token === iaaInitSeq) {
			dbg('init:dequeue', { token: pending.token, reason });
			initWebRotate(pending.$root, pending.ctx, pending.source, pending.token);
		}
	};

	const hasViewerContent = ($player) => {
		const el = $player?.get?.(0);
		if (!el) return false;
		const hasCanvas = !!el.querySelector('canvas');
		const hasImgs = (el.querySelectorAll('img')?.length || 0) > 0;
		return hasCanvas || hasImgs;
	};

	/* =========================
	 * Image Preloading
	 * ========================= */

	/*
	 * PRELOAD STRATEGY OVERVIEW:
	 * 
	 * Problem: When users click on hotspots in the WebRotate 360 viewer to open the action modal,
	 * the top-left CI (Configuration Item) image takes 1-2 seconds to load and display, causing
	 * a noticeable delay and poor user experience.
	 * 
	 * Solution: Implement a two-tier preloading strategy that balances performance with resource usage:
	 * 
	 * 1. DELAYED BACKGROUND PRELOAD (30 seconds after page load):
	 *    - Users typically don't access the modal for a couple of minutes after page load
	 *    - Initial page load already fetches critical resources (data, scripts, stylesheets)
	 *    - We delay preloading by 30 seconds to avoid competing with these critical resources
	 *    - Uses requestIdleCallback to only load during browser idle time (non-blocking)
	 *    - Preloads ALL possible CI images for the current theme in the background
	 * 
	 * 2. IMMEDIATE PRELOAD (when modal opens):
	 *    - When a user clicks a hotspot and opens the modal, that specific image loads normally
	 *    - We immediately preload it again to ensure it's in the browser cache
	 *    - Next time the user opens that same modal, the image loads instantly from cache
	 * 
	 * Benefits:
	 * - Zero impact on initial page load performance
	 * - Images ready when users need them (after ~30 seconds)
	 * - Fallback for immediate preload if background preload hasn't completed yet
	 * - Smart caching prevents redundant downloads
	 * - Non-blocking implementation using idle callbacks
	 */

	// Track which images have been preloaded to avoid redundant downloads
	let preloadedImages = new Set();
	
	// Flag to prevent multiple simultaneous preload operations
	let preloadInProgress = false;
	
	// Timer reference for the 30-second delayed preload
	let preloadTimer = null;

	/**
	 * Generate array of CI image URLs to preload based on current context
	 * 
	 * @param {Object} ctx - The exercise context containing theme information
	 * @returns {string[]} Array of unique image URLs to preload
	 * 
	 * This function:
	 * - Iterates through all Configuration Items (CIs) in the catalog
	 * - Determines the correct image path based on CI type and theme
	 * - Some CIs have theme-specific images (has_multiple_images = true)
	 * - Others use a generic image (suffix '00') regardless of theme
	 * - Returns only unique URLs to avoid preloading duplicates
	 * 
	 * Example paths:
	 * - /common/assets/images/configimages/config_0100.png (CI type 01, generic)
	 * - /common/assets/images/configimages/config_0203.png (CI type 02, theme 03)
	 */
	const generatePreloadImageUrls = (ctx) => {
		const cis = ciCatalog();
		if (!Array.isArray(cis) || !cis.length) return [];

		const theme = Number(ctx?.exercise?.theme_id ?? ctx?.exercise?.theme ?? 0);
		const themeSuffix = String(theme || 0).padStart(2, '0');

		return cis
			.map(ci => {
				const type = parseInt(ci.ci_type_id ?? ci.type_id ?? 0, 10);
				if (!type) return null;

				const typePrefix = isSwitchType(type) ? 'SW' : String(type).padStart(2, '0');
				const hasMultiple = isSwitchType(type) ||
								   ci?.has_multiple_images === true ||
								   ci?.has_multiple_images === 1 ||
								   ci?.has_multiple_images === '1' ||
								   ci?.sImg === true || ci?.sImg === 1 || ci?.sImg === '1';

				const suffix = isSwitchType(type) ? '00' : (hasMultiple ? themeSuffix : '00');
				return `/common/assets/images/configimages/config_${typePrefix}${suffix}.png`;
			})
			.filter((url, index, self) => url && self.indexOf(url) === index); // unique URLs only
	};

	/**
	 * Preload images by creating Image objects and setting their src attributes
	 * 
	 * @param {string[]} urls - Array of image URLs to preload
	 * @returns {Promise<Object[]>} Promise resolving to array of results with success/failure status
	 * 
	 * How browser image preloading works:
	 * - Creating a new Image() object and setting img.src triggers a network request
	 * - The browser fetches and caches the image even though it's not in the DOM
	 * - When the same URL is later used in an <img> tag, it loads instantly from cache
	 * - This is the standard browser mechanism for image preloading
	 * 
	 * Implementation details:
	 * - Skips images already in the preloadedImages Set (already cached)
	 * - Creates a Promise for each image to track success/failure
	 * - Never rejects - failed images resolve with success: false
	 * - Logs progress for debugging (when IAA_DEBUG = true)
	 */
	const preloadImages = (urls) => {
		if (!urls || !urls.length) {
			log('preload_skip', { reason: 'no urls' });
			return Promise.resolve([]);
		}

		// Filter already preloaded images to avoid redundant network requests
		const toLoad = urls.filter(url => !preloadedImages.has(url));

		if (!toLoad.length) {
			log('preload_skip', { reason: 'all cached', count: urls.length });
			return Promise.resolve(urls.map(() => true));
		}

		log('preload_start', { total: urls.length, toLoad: toLoad.length });

		const promises = toLoad.map((src, index) => {
			return new Promise((resolve) => {
				const img = new Image();

				img.onload = () => {
					preloadedImages.add(src);
					log('preload_success', { src, index: index + 1, total: toLoad.length });
					resolve({ src, success: true });
				};

				img.onerror = (error) => {
					warn('preload_failed', { src, error: String(error) });
					// Still resolve (not reject) to prevent Promise.all from failing
					resolve({ src, success: false });
				};

				// Trigger the browser to fetch and cache the image
				img.src = src;
			});
		});

		return Promise.all(promises).then(results => {
			const successCount = results.filter(r => r.success).length;
			log('preload_complete', {
				success: successCount,
				failed: results.length - successCount,
				total: results.length
			});
			return results;
		});
	};

	/**
	 * Schedule a delayed background preload of all CI images
	 * 
	 * @param {Object} ctx - The exercise context
	 * 
	 * TIMING RATIONALE:
	 * - Initial page load is resource-intensive (data fetching, script parsing, rendering)
	 * - Users typically don't open the modal for 1-2 minutes after page load
	 * - 30-second delay ensures critical page load resources are prioritized
	 * - After 30 seconds, most page resources are loaded and browser is more idle
	 * 
	 * IDLE CALLBACK APPROACH:
	 * - requestIdleCallback runs code during browser idle periods
	 * - Won't block user interactions or animations
	 * - Automatically yields to higher priority tasks
	 * - Falls back to setTimeout if not supported (older browsers)
	 * - timeout: 5000 means "run within 5 seconds even if not idle"
	 * 
	 * This approach ensures:
	 * - Zero impact on initial page load performance
	 * - Images are ready when users need them
	 * - Doesn't block or interfere with user interactions
	 */
	const scheduleDelayedPreload = (ctx) => {
		// Prevent multiple preload operations from running simultaneously
		if (preloadInProgress || preloadTimer) {
			log('preload_already_scheduled');
			return;
		}

		// Wait 30 seconds after component initialization to avoid initial page load contention
		preloadTimer = setTimeout(() => {
			preloadTimer = null;

			const urls = generatePreloadImageUrls(ctx);
			if (!urls.length) {
				log('preload_no_urls');
				return;
			}

			// Use requestIdleCallback for non-blocking preload (fallback to setTimeout)
			// This ensures preloading only happens when the browser is idle
			const scheduleIdle = window.requestIdleCallback || ((cb) => setTimeout(cb, 100));

			preloadInProgress = true;
			scheduleIdle(() => {
				log('preload_idle_start', { urlCount: urls.length });
				preloadImages(urls).finally(() => {
					preloadInProgress = false;
				});
			}, { timeout: 5000 }); // Run within 5 seconds even if browser never becomes idle

		}, 30000); // 30,000ms = 30 seconds delay
	};

	/**
	 * Cancel any scheduled preload operation
	 * 
	 * This can be used if:
	 * - Component is unmounted before preload starts
	 * - User navigates away from the page
	 * - Preload needs to be rescheduled with different parameters
	 */
	const cancelScheduledPreload = () => {
		if (preloadTimer) {
			clearTimeout(preloadTimer);
			preloadTimer = null;
			log('preload_cancelled');
		}
	};

	/**
	 * Preload a single CI image immediately (called when modal opens)
	 * 
	 * @param {string} ciId - The Configuration Item ID
	 * @param {Object} ctx - The exercise context
	 * 
	 * PURPOSE:
	 * - When a user opens the modal, the current image loads normally (not from cache yet)
	 * - We immediately preload it so it's in cache for the NEXT time they open this modal
	 * - Also serves as a fallback if the 30-second background preload hasn't completed yet
	 * 
	 * USER EXPERIENCE:
	 * - First modal open: Image may take 1-2 seconds to load (normal)
	 * - Second+ modal open: Image loads instantly from cache
	 * - If background preload completed: Even first open is instant
	 * 
	 * This creates a progressive enhancement where the experience gets better:
	 * 1. If background preload done: All modals instant from first open
	 * 2. If not: First open normal, subsequent opens instant
	 */
	const preloadImageImmediately = (ciId, ctx) => {
		if (!ciId) return;

		const url = ciImageSrc(ciId, ctx);
		
		// Check if already cached from background preload
		if (preloadedImages.has(url)) {
			log('image_already_cached', { ciId, url });
			return;
		}

		log('preload_immediate', { ciId, url });

		// Create Image object to trigger browser caching
		const img = new Image();
		img.onload = () => {
			preloadedImages.add(url);
			log('preload_immediate_success', { ciId, url });
		};
		img.onerror = () => {
			warn('preload_immediate_failed', { ciId, url });
		};
		
		// Trigger the fetch - browser will cache this for next time
		img.src = url;
	};

	/* =========================
	 * Existing logic
	 * ========================= */

	const isSw = (ciId) => String(ciId || '').toUpperCase().startsWith('SW');

	const ciSuffix = (ciId) => {
		const s = String(ciId || '');
		// ciSuffix = ciID.substring(2,3) (SWx eller 21A osv.)
		return s.length >= 3 ? s.substring(2, 3) : '';
	};

	// SW exception: modal samler 2 typer i samme modal
	// Type 23 -> action 13
	// Type 24 -> action 24
	const SW_ACTIONS = [
		{ ci_type_id: 23, action_id: 13 },
		{ ci_type_id: 24, action_id: 21 }
	];

	// Title for SW is "Switch <suffix>"
	const actionTitleText = (ciId) => {
		if (isSw(ciId)) return `${esc(term(47, 'Switch'))} ${esc(ciSuffix(ciId))}`;
		return ciName(ciId);
	};

	// Bracket replacement (tire size example)
	const replaceTextInBrackets = (typeId, text, ctx) => {
		const str = String(text ?? '');
		const before = str.split('[')[0];
		if (before === str) return str;

		const after = str.includes(']') ? str.substring(str.indexOf(']') + 1) : '';
		let replace = '';

		switch (String(typeId)) {
			case '70':
				replace = (Number(ctx?.exercise?.theme ?? ctx?.exercise?.theme_id ?? 0) === 7) ? '37 x 22' : '43.2 x 22';
				break;
			default:
				return str;
		}
		return `${before}${replace}${after}`;
	};

	const actionsDisabled = (ctx) => {
		const exercise = ctx?.exercise || {};
		const info = exercise?.infoSrc?.webrotate || {};
		if (info.actionsActive === false) return true;
		const meta = resolveExerciseMeta(ctx);
		if (meta.stepNo > 60) return true;
		if (meta.stepNo > 0 && meta.stepNo < 20) return true;
		if (meta.formatId === 1 && isTimeExpired(meta)) return true;
		return false;
	};

	const resolveExerciseMeta = (ctx) => {
		const ex = ctx?.exercise || {};
		const stepNo = Number(ex.step_no ?? ex.stepNo ?? ex.step ?? 0) || 0;
		const formatId = Number(ex.format_id ?? ex.formatId ?? ex.format ?? ex.format_no ?? 0) || 0;
		const currentState = Number(
			ex.current_state
			?? ex.currentState
			?? ex.state
			?? window.ProblemExerciseStateContent?.state
			?? 0
		) || 0;
		const deadlineUnix = Number(ex.deadline_unix ?? ex.deadline ?? ex.deadlineUnix ?? 0) || 0;
		const secondsLeft = Number(ex.seconds_left ?? ex.secondsLeft ?? 0) || 0;
		return { stepNo, formatId, currentState, deadlineUnix, secondsLeft };
	};

	const isTimeExpired = (meta) => {
		const now = Math.floor(Date.now() / 1000);
		if (meta.deadlineUnix > 0) return now >= meta.deadlineUnix;
		if (meta.secondsLeft !== 0) return meta.secondsLeft <= 0;
		return false;
	};

	const isValidStepState = (stepNo, stateNo) => {
		if (stepNo >= 20 && stepNo < 60 && stateNo > 10 && stateNo < 20) return true;
		if (stepNo === 60 && stateNo > 20 && stateNo < 99) return true;
		return false;
	};

	const actionGuard = (ctx) => {
		const meta = resolveExerciseMeta(ctx);
		if (meta.stepNo < 20 || meta.stepNo > 60) {
			return { ok: false, reason: 'Action is not allowed in the current step.' };
		}
		if (meta.formatId === 1 && isTimeExpired(meta)) {
			return { ok: false, reason: 'Action is not allowed after time is up in discovery.' };
		}
		if (!isValidStepState(meta.stepNo, meta.currentState)) {
			return { ok: false, reason: 'Step/state combination is not valid for actions.' };
		}
		return { ok: true, reason: '' };
	};

	const showActionGuardError = (message) => {
		if (typeof window.simulatorShowConfirm === 'function') {
			window.simulatorShowConfirm({
				title: term(214, 'Notification'),
				content: message,
				backgroundDismiss: true
			});
		}
	};

	const problemLogPerformedAction = async (ciId, actionId, ctx) => {
		if (typeof window.simulatorAjaxRequest !== 'function') return false;
		const ex = ctx?.exercise || {};
		const meta = resolveExerciseMeta(ctx);
		const params = {
			ci_id: String(ciId ?? ''),
			action_id: Number(actionId || 0),
			outline_id: Number(ex.outline_id ?? ex.outlineId ?? 0),
			step_no: Number(meta.stepNo || 0),
			current_state: Number(meta.currentState || 0)
		};

		const res = await window.simulatorAjaxRequest('/ajax/log_problem_action.php', 'POST', params, { mode: 'dynamic' });
		if (res?.ok) return true;
		let errMsg = String(res?.error || res?.errorMsg || 'Action could not be registered.');

		// If backend returned diagnostics, surface them (escaped) to avoid blind guessing.
		if (res?.data && typeof res.data === 'object') {
			const details = [];
			if (Number.isFinite(Number(res.data.skill_id))) details.push(`skill_id=${esc(res.data.skill_id)}`);
			if (Number.isFinite(Number(res.data.format_id))) details.push(`format_id=${esc(res.data.format_id)}`);
			if (Number.isFinite(Number(res.data.step_no))) details.push(`step_no=${esc(res.data.step_no)}`);
			if (typeof res.data.policy_found !== 'undefined') details.push(`policy_found=${esc(res.data.policy_found)}`);
			if (typeof res.data.is_action_allowed !== 'undefined') details.push(`is_action_allowed=${esc(res.data.is_action_allowed)}`);
			if (Array.isArray(res.data.available_formats)) details.push(`available_formats_count=${esc(res.data.available_formats.length)}`);
			if (Array.isArray(res.data.available_steps)) details.push(`available_steps_count=${esc(res.data.available_steps.length)}`);
			if (Array.isArray(res.data.drilldown_errors) && res.data.drilldown_errors.length) details.push(`drilldown_errors=${esc(res.data.drilldown_errors.join(' | '))}`);
			if (res.data.db_info && typeof res.data.db_info === 'object') {
				const di = res.data.db_info;
				if (di.database) details.push(`db=${esc(di.database)}`);
				if (di.hostname) details.push(`db_host=${esc(di.hostname)}`);
				if (typeof di.row_exists !== 'undefined' && di.row_exists !== null) details.push(`row_exists=${esc(di.row_exists)}`);
				if (typeof di.rows_for_skill !== 'undefined' && di.rows_for_skill !== null) details.push(`rows_for_skill=${esc(di.rows_for_skill)}`);
				if (typeof di.rows_for_skill_format !== 'undefined' && di.rows_for_skill_format !== null) details.push(`rows_for_skill_format=${esc(di.rows_for_skill_format)}`);
			}

			if (details.length) {
				errMsg += `\nDetails: ${details.join(', ')}`;
			}

			// Preview steps (first 10) if provided
			if (Array.isArray(res.data.available_steps) && res.data.available_steps.length) {
				const preview = res.data.available_steps
					.slice(0, 10)
					.map((r) => `${esc(r?.step_no)}:${esc(r?.is_action_allowed)}`)
					.join(', ');
				errMsg += `\nSteps preview: ${preview}${res.data.available_steps.length > 10 ? ', ...' : ''}`;
			}
		}

		if (res?.request_id) {
			errMsg += `\nrequest_id: ${esc(res.request_id)}`;
		}

		showActionGuardError(errMsg);
		return false;
	};

	const ciCatalog = () => (
		window.ProblemExerciseStaticContent?.cis
		|| shared().cis
		|| shared().configuration_items
		|| shared().problem_cis
		|| []
	);

	const findCi = (ciId) => {
		const data = ciCatalog();
		if (Array.isArray(data)) {
			return data.find((r) => String(r?.ci_id ?? r?.id ?? '') === String(ciId)) || null;
		}
		if (data && typeof data === 'object') {
			const v = data[String(ciId)];
			return (v && typeof v === 'object') ? v : null;
		}
		return null;
	};

	const ciName = (ciId) => {
		const ci = findCi(ciId);
		if (!ci) return esc(ciId);
		const val = ci.ci_text ?? ci.name ?? ci.text ?? ci.text_value ?? ciId;
		return esc(val);
	};

	const ciTypeFromId = (ciId) => {
		const ci = findCi(ciId);
		if (ci?.ci_type_id) return parseInt(ci.ci_type_id, 10) || 0;
		const str = String(ciId || '');
		if (/^SW/i.test(str)) return 23; // switch group defaults to subtype 23
		const prefix = str.substring(0, 2);
		const n = parseInt(prefix, 10);
		if (Number.isFinite(n)) return n;
		const m = str.match(/(\d{2})/);
		return m ? parseInt(m[1], 10) || 0 : 0;
	};

	const actionsCatalog = (source) =>
		source?.ci_actions || source?.actions_catalog || shared().ci_actions || {};

	const actionText = (actionId, source) => {
		const map = actionsCatalog(source);

		if (Array.isArray(map)) {
			const row = map.find((r) => String(r?.action_id ?? r?.actionID ?? '') === String(actionId));
			const txt = row?.text_value ?? row?.text;
			return esc(txt || actionId);
		}

		if (map && typeof map === 'object') {
			const v = map[String(actionId)] ?? map[actionId];
			if (typeof v === 'string') return esc(v);
			return esc(v?.text_value ?? v?.text ?? actionId);
		}

		return esc(actionId);
	};

	const actionsMapping = () => shared().ci_actions_mapping || shared().cis_actions_mapping || null;

	const allowedActionIdsForCi = (ciId) => {
		const ci = findCi(ciId);
		if (Array.isArray(ci?.actions)) {
			return ci.actions
				.map((x) => parseInt(x, 10))
				.filter((x) => Number.isFinite(x) && x > 0);
		}

		const map = actionsMapping();
		const ciType = ciTypeFromId(ciId);
		if (!ciType || !map) return [];

		const pushRow = (list, actionId, typeId) => {
			if (!Number.isFinite(actionId) || actionId <= 0) return;
			list.push({ action_id: actionId, ci_type_id: typeId });
		};

		const collect = [];

		if (Array.isArray(map)) {
			map.forEach((r) => {
				const typeId = parseInt(r?.ci_type_id ?? r?.ciTypeID ?? 0, 10);
				if (typeId === ciType || (isSwitchType(ciType) && isSwitchType(typeId))) {
					pushRow(collect, parseInt(r?.action_id ?? r?.actionID ?? 0, 10), typeId || ciType);
				}
			});
		} else if (typeof map === 'object') {
			const typeKeys = isSwitchType(ciType) ? ['23', '24'] : [String(ciType)];
			typeKeys.forEach((key) => {
				const val = map[key] ?? map[parseInt(key, 10)];
				if (Array.isArray(val)) {
					val.forEach((x) => pushRow(collect, parseInt(x, 10), parseInt(key, 10) || ciType));
				}
			});
		}

		return collect.length ? collect : [];
	};

	const formatCost = (v) => {
		if (v === null || v === undefined) return '';
		if (typeof v === 'string' && v.trim() !== '') return esc(v);
		const n = Number(v);
		if (!Number.isFinite(n)) return '';
		return `$${n.toLocaleString()}`;
	};

	const formatTime = (minutes) => {
		const n = Number(minutes);
		if (!Number.isFinite(n) || n <= 0) return '';
		const h = Math.floor((n / 60) % 24);
		const m = Math.max(0, Math.round(n % 60));
		const hLabel = term(117, 'h');
		const mLabel = term(118, 'm');
		const parts = [];
		if (h > 0) parts.push(`${h}${hLabel ? ` ${hLabel}` : 'h'}`);
		parts.push(`${m}${mLabel ? ` ${mLabel}` : 'm'}`);
		return parts.join(' ').trim();
	};

	const cablingMapRows = (source) => (Array.isArray(source?.cabling_map) ? source.cabling_map : []);
	const descriptionRows = (source) => (Array.isArray(source?.ci_descriptions) ? source.ci_descriptions : []);
	const benefitsRows = (source) => (Array.isArray(source?.ci_action_benefits) ? source.ci_action_benefits : []);
	const timeCostRows = (source) => (Array.isArray(source?.ci_action_time_and_cost) ? source.ci_action_time_and_cost : []);

	const descriptionHtml = (ciId, ctx, source) => {
		// SW exception: use type 23 + 24 descriptions
		if (isSw(ciId)) {
			const rows = descriptionRows(source)
				.filter((r) => {
					const tid = parseInt(r.ci_type_id ?? r.ciTypeID ?? r.type_id ?? 0, 10);
					return tid === 23 || tid === 24;
				})
				.sort((a, b) => (parseInt(a.sequence_no ?? a.sequence ?? 0, 10) || 0) - (parseInt(b.sequence_no ?? b.sequence ?? 0, 10) || 0));

			if (rows.length) {
				return rows
					.map((r) => {
						const tid = parseInt(r.ci_type_id ?? r.ciTypeID ?? r.type_id ?? 0, 10) || 0;
						const text = replaceTextInBrackets(tid, (r.ci_text ?? r.text ?? ''), ctx);
						return `<p>${esc(text)}</p>`;
					})
					.join('');
			}

			return '<p style="opacity:0.7">No description available yet.</p>';
		}

		// default behavior
		const type = ciTypeFromId(ciId);
		const rows = descriptionRows(source)
			.filter((r) => parseInt(r.ci_type_id ?? r.ciTypeID ?? r.type_id ?? 0, 10) === type)
			.sort((a, b) => (parseInt(a.sequence_no ?? a.sequence ?? 0, 10) || 0) - (parseInt(b.sequence_no ?? b.sequence ?? 0, 10) || 0));

		if (rows.length) {
			return rows.map((r) => `<p>${esc(replaceTextInBrackets(type, (r.ci_text ?? r.text ?? ''), ctx))}</p>`).join('');
		}

		const ci = findCi(ciId);
		const fallback = ci?.description ?? ci?.desc ?? '';
		if (fallback) return `<p>${esc(fallback)}</p>`;

		return '<p style="opacity:0.7">No description available yet.</p>';
	};

	const uniqueTextList = (items = []) => {
		const seen = new Set();
		const out = [];
		items.forEach((item) => {
			const text = String(item ?? '').trim();
			if (!text) return;
			const key = text;
			if (seen.has(key)) return;
			seen.add(key);
			out.push(text);
		});
		return out;
	};

	const benefitsListHtml = (ciId, actionId, source, forcedType = null) => {
		const type = forcedType ? parseInt(forcedType, 10) : ciTypeFromId(ciId);
		if (!type) return '';

		const rows = benefitsRows(source)
			.filter((r) => {
				const aid = parseInt(r.action_id ?? r.actionID ?? r.actionId ?? r.ac ?? 0, 10);
				const tid = parseInt(r.ci_type_id ?? r.ciTypeID ?? r.type_id ?? r.typeID ?? 0, 10);
				return aid === actionId && tid === type;
			})
			.sort((a, b) => (parseInt(a.sequence_no ?? a.sequence ?? r.seq ?? 0, 10) || 0) - (parseInt(b.sequence_no ?? b.sequence ?? r.seq ?? 0, 10) || 0));

		if (!rows.length) return '';
		const items = uniqueTextList(rows.map((r) => r.text ?? r.ci_text ?? r.benefit ?? ''));
		return items.map((text) => `<li><i class="fa-solid fa-circle-check"></i>${esc(text)}</li>`).join('');
	};

	const timeCostForTypeAction = (type, actionId, source) => {
		const tid = parseInt(type, 10) || 0;
		const aid = parseInt(actionId, 10) || 0;
		if (!tid || !aid) return null;

		const rows = timeCostRows(source).filter((r) => {
			const ra = parseInt(r.action_id ?? r.actionID ?? r.actionId ?? r.ac ?? 0, 10);
			const rt = parseInt(r.ci_type_id ?? r.ciTypeID ?? r.type_id ?? r.typeID ?? 0, 10);
			return ra === aid && rt === tid;
		});

		return rows[0] || null;
	};

	const timeCostForAction = (ciId, actionId, source, typeHint = null) => {
		const baseType = typeHint ?? ciTypeFromId(ciId);
		const types = isSwitchType(baseType) ? [23, 24] : [baseType];
		const rows = timeCostRows(source).filter((r) => {
			const aid = parseInt(r.action_id ?? r.actionID ?? r.actionId ?? 0, 10);
			const tid = parseInt(r.ci_type_id ?? r.ciTypeID ?? r.type_id ?? 0, 10);
			return aid === actionId && types.includes(tid);
		});
		return rows[0] || null;
	};

	const buildCablingList = (ciId, ctx, source) => {
		const rows = cablingMapRows(source);
		if (!rows.length) return '';

		// Cabling diagram should only display for CI type 21
		const type = ciTypeFromId(ciId);
		if (String(ciId || '').startsWith('21') || type === 21) {
			const ports = ['', 'A', 'B', 'C', 'D'];
			const cu = String(ciId) === '21A' ? '22A' : '22B';
			const cablingHeader = ciName(cu);
			const theme = Number(ctx?.exercise?.theme ?? ctx?.exercise?.theme_id ?? 0);

			const pickRow = rows.find((r) => {
				const rCu = String(r.cu ?? r.cu_id ?? r.cu_ci_id ?? '');
				const rTheme = Number(r.theme ?? r.theme_id ?? 0);
				return rCu === String(cu) && (!rTheme || rTheme === theme);
			}) || rows.find((r) => String(r.cu ?? r.cu_id ?? r.cu_ci_id ?? '') === String(cu));

			const getPort = (row, key) => row?.[`port_${key}`] ?? row?.[`port${key}`] ?? row?.[key] ?? '';

			const portMap = { A: '', B: '', C: '', D: '', 1: '', 2: '', 3: '', 4: '' };
			const suffixFromId = (id) => {
				const s = String(id || '');
				if (s.length >= 3) return s.substring(2, 3);
				return s.length ? s.slice(-1) : '';
			};
			const labelWithSuffix = (name, suffix) => {
				const n = String(name || '').trim();
				if (!n) return '';
				const s = String(suffix || '').trim();
				if (!s) return n;
				return n.endsWith(` ${s}`) || n.endsWith(s) ? n : `${n} ${s}`;
			};
			rows
				.filter((r) => String(r.cu ?? r.cu_id ?? r.cu_ci_id ?? '') === String(cu))
				.forEach((r) => {
					const code = String(r.port_code ?? r.port ?? '').trim();
					if (!code) return;
					if (portMap.hasOwnProperty(code)) {
						const connectedId = r.connected_ci_id ?? r.connected_ci ?? r.target_ci_id ?? r.target_id;
						const baseName = ciName(connectedId);
						portMap[code] = labelWithSuffix(baseName, suffixFromId(connectedId));
					}
				});

			let output = `
				<p>
					<details class="iaa-cabling">
						<summary>${esc(term(15, 'Cabling'))}</summary>
						<div class="cabling-header">${esc(cablingHeader)}</div>
						<div class="cabling-container">
			`;

			for (let i = 1; i < 5; i++) {
				const ciLeftId = pickRow ? getPort(pickRow, ports[i]) : '';
				const ciRightId = pickRow ? getPort(pickRow, i) : '';
				const ciLeft = ciLeftId
					? labelWithSuffix(ciName(ciLeftId), suffixFromId(ciLeftId))
					: (portMap[ports[i]] || '');
				const ciRight = ciRightId
					? labelWithSuffix(ciName(ciRightId), suffixFromId(ciRightId))
					: (portMap[String(i)] || '');

				output += `
					<div>${ciLeft || ''}</div>
					<div class="cabling-connect"><div></div><div></div></div>
					<div>${ports[i]}</div>
					<div></div>
					<div>${i}</div>
					<div class="cabling-connect"><div></div><div></div></div>
					<div>${ciRight || ''}</div>
				`;
			}

			output += `
					</div>
					<center>${esc(term(16, 'Connected to'))}</center>
				</details>
				</p>
			`;

			return output;
		}

		// No cabling diagram for other types
		return '';
		const filtered = rows.filter((r) => {
			if (!ciId) return true;
			return String(r.cu_ci_id) === String(ciId) || String(r.connected_ci_id) === String(ciId);
		});

		const list = (filtered.length ? filtered : rows).map((r) => `
			<tr>
				<td>${esc(r.port_code ?? '')}</td>
				<td>${ciName(r.connected_ci_id)}</td>
			</tr>
		`).join('');

		const summaryLabel = term(15, 'Cabling');
		const portLabel = term(150, 'Port');
		const targetLabel = term(16, 'Connected to');

		return `
			<details class="iaa-cabling">
				<summary>${esc(summaryLabel)}</summary>
				<table class="cabling-table">
					<thead>
						<tr><th>${esc(portLabel)}</th><th>${esc(targetLabel)}</th></tr>
					</thead>
					<tbody>${list}</tbody>
				</table>
			</details>
		`;
	};

	const pickActionRows = (ciId, source) => {
		if (isSw(ciId)) {
			// Always two actions in SW modal
			return SW_ACTIONS.map((r) => ({ action_id: r.action_id, ci_type_id: r.ci_type_id }));
		}

		// Default behavior
		const fromSource = Array.isArray(source?.actions)
			? source.actions.filter((r) => {
				const cid = r.ci_id ?? r.ciId ?? r.ciID;
				const type = r.ci_type_id ?? r.ciTypeID ?? null;
				return cid ? String(cid) === String(ciId) : (type ? parseInt(type, 10) === ciTypeFromId(ciId) : false);
			})
			: [];

		if (fromSource.length) return fromSource;

		return allowedActionIdsForCi(ciId).map((aid) => ({ action_id: aid }));
	};

	const buildActionCards = (ciId, ctx, source) => {
		const rows = pickActionRows(ciId, source);
		if (!rows.length) {
			return '<p style="opacity:0.7">Actions are not available for this configuration item yet.</p>';
		}

		const suf = ciSuffix(ciId);

		return rows.map((row) => {
			const actionId = parseInt(row.action_id ?? row.actionID ?? row.actionId ?? 0, 10) || 0;

			// Effective type for lookups in SW modal
			const effType = isSw(ciId)
				? (parseInt(row.ci_type_id ?? row.ciTypeID ?? 0, 10) || 0)
				: ciTypeFromId(ciId);

			// Action label
			const baseLabel = actionText(actionId, source);

			// SW label: "Action | <CI name>"
			const swLabel = (isSw(ciId) && effType)
				? `${baseLabel} | ${ciName(`${effType}${suf}`)}`
				: baseLabel;

			// Time/cost by type+action (SW) or row/timeCost (default)
			const tc = (isSw(ciId) && effType)
				? timeCostForTypeAction(effType, actionId, source)
				: timeCostForAction(ciId, actionId, source);

			const cost = formatCost(row.cost ?? row.cost_value ?? tc?.cost);
			const time = formatTime(row.time ?? row.time_minutes ?? row.minutes ?? tc?.time_min);

			const benefits = Array.isArray(row.benefits)
				? uniqueTextList(row.benefits).map((b) => `<li><i class="fa-solid fa-circle-check"></i>${esc(b)}</li>`).join('')
				: benefitsListHtml(ciId, actionId, source, (isSw(ciId) ? effType : null));

			// Button CI: adjusted id in SW modal
			const btnCi = isSw(ciId) ? `${effType}${suf}` : ciId;

			return `
				<div class="perform-action-column">
					<div class="perform-action-row row-1">${swLabel}</div>
					<div class="perform-action-row row-2">${cost || '&nbsp;'}</div>
					<div class="perform-action-row row-3">${time || '&nbsp;'}</div>
					<hr class="perform-action-row-divider">
					<div class="perform-action-row row-4">
						<div class="perform-action-bullet-list">
							<ul>${benefits || ''}</ul>
						</div>
					</div>
					<div class="perform-action-row perform-action-action-row">
						<div class="act-action clickable" data-ci="${esc(btnCi)}" data-ac="${actionId}">
							${esc(term(43, 'Select'))}
						</div>
					</div>
				</div>
			`;
		}).join('');
	};

	const ciImageSrc = (ciId, ctx) => {
		// SW modal: always use dedicated SW image
		if (isSw(ciId)) {
			return `/common/assets/images/configimages/config_SW00.png`;
		}

		const type = ciTypeFromId(ciId);
		if (!type) return '/common/assets/images/configimages/config_placeholder.png';

		const theme = Number(ctx?.exercise?.theme_id ?? ctx?.exercise?.theme ?? 0);
		const ci = findCi(ciId);
		const hasMultiple = ci?.has_multiple_images === true || ci?.has_multiple_images === 1 || ci?.has_multiple_images === '1';
		const themeSuffix = hasMultiple ? String(Number.isFinite(theme) ? theme : 0).padStart(2, '0') : '00';
		const typePrefix = String(type || '00').padStart(2, '0');

		return `/common/assets/images/configimages/config_${typePrefix}${themeSuffix}.png`;
	};

	const buildActionContent = (ciId, ctx, source) => {
		const title = actionTitleText(ciId);
		return `
			<div class="perform-action-content">
				<div class="perform-action-header">
					<img src="${ciImageSrc(ciId, ctx)}" alt="${title}" class="perform-action-image">
					<h1 class="perform-action-title">${title}</h1>
				</div>
				<div class="perform-action-text">
					${descriptionHtml(ciId, ctx, source)}
					${buildCablingList(ciId, ctx, source)}
				</div>
				<div class="perform-action-columns">
					${buildActionCards(ciId, ctx, source)}
				</div>
			</div>
		`;
	};

	const ensureModalShell = () => {
		// Ensure unique modal (avoid duplicate IDs)
		if (document.getElementById('simulator_modal_act')) return;

		const shell = document.createElement('div');
		shell.innerHTML = `
			<div id="simulator_modal_act" class="simulator-modal">
				<div class="simulator-modal-dialog">
					<div class="simulator-modal-content">
						<div class="simulator-modal-header">
							<button type="button" class="simulator-modal-close" data-dismiss="simulator-modal">×</button>
						</div>
						<div id="simulator_modal_act_body" class="simulator-modal-body"></div>
					</div>
				</div>
			</div>
		`;
		document.body.appendChild(shell.firstElementChild);
	};

	const showHideModal = (id, show = true) => {
		const $m = $ && $(`#${id}`);
		if (!$m || !$m.length) return;
		const el = $m.get(0);

		if (show) {
			if (el._iaaHideTimer) {
				clearTimeout(el._iaaHideTimer);
				el._iaaHideTimer = null;
			}

			$m.css('display', 'block');
			$m.attr('aria-hidden', 'false');
			$('body').addClass('modal-open');
			// Force a reflow so transitions can run, then add show class next frame
			void el.offsetWidth;
			requestAnimationFrame(() => {
				$m.addClass('simulator-show');
			});
			log('modal show', { id });
			return;
		}

		const finalizeHide = () => {
			$m.css('display', 'none');
			el.removeEventListener('transitionend', onTransitionEnd);
			if (el._iaaHideTimer) {
				clearTimeout(el._iaaHideTimer);
				el._iaaHideTimer = null;
			}
		};

		const onTransitionEnd = (e) => {
			if (e.target !== el) return;
			finalizeHide();
		};

		$m.removeClass('simulator-show');
		$m.attr('aria-hidden', 'true');
		$('body').removeClass('modal-open');
		el.addEventListener('transitionend', onTransitionEnd);
		el._iaaHideTimer = setTimeout(finalizeHide, 550);
		log('modal hide', { id });
	};


	const openActionModal = (ciId, ctx, source) => {
		ensureModalShell();
		log('openActionModal', { ciId });

		// Preload this image immediately to ensure it's ready for next modal open
		preloadImageImmediately(ciId, ctx);

		const html = buildActionContent(ciId, ctx, source);
		const $body = $('#simulator_modal_act_body');
		$body.html(html);

		$('#simulator_modal_act .simulator-modal-dialog').css({ width: 'auto', 'max-height': '90vh', 'max-width': '90vw' });
		$body.css({ overflow: 'auto', 'max-height': '80vh' });

		if (actionsDisabled(ctx)) {
			$body.find('.perform-action-action-row').children('div').removeClass('act-action clickable').addClass('act-action-clicked');
		}

		showHideModal('simulator_modal_act', true);

		$('#simulator_modal_act')
			.off('click.iaaClose', '.simulator-modal-close, [data-dismiss="simulator-modal"]')
			.on('click.iaaClose', '.simulator-modal-close, [data-dismiss="simulator-modal"]', (e) => {
				e.preventDefault();
				showHideModal('simulator_modal_act', false);
			});
	};

	const configUrlFromSource = (source, ctx) => {
		// 1) direct link (already full URL/path)
		const direct =
			String(source?.xml_link || source?.webrotateXmlFileName || source?.configFileURL || '').trim();

		if (direct) {
			if (/^(https?:)?\/\//i.test(direct) || direct.startsWith('/')) {
				return direct.endsWith('.xml') ? direct : `${direct}.xml`;
			}
			return `/common/assets/webrotate/xml/${direct.endsWith('.xml') ? direct : `${direct}.xml`}`;
		}

		// 2) actionXML key (filename without .xml)
		const actionXML =
			source?.actionXML ||
			source?.action_xml ||
			ctx?.exercise?.infoSrc?.webrotate?.actionXML ||
			ctx?.exercise?.infoSrc?.webrotate?.action_xml ||
			ctx?.exercise?.infoSrc?.webrotate?.xml;

		if (!actionXML) return '';

		return `/common/assets/webrotate/xml/${String(actionXML).trim()}.xml`;
	};

	const unloadWebRotate = ($root) => {
		if (!window.jQuery) return;
		try {
			if (window.productViewer) window.productViewer = null;
			$root.find('#wr360PlayerId').empty();
			$(document).off('.iaaHotspot');
			log('unloadWebRotate');
		} catch (e) {
			warn('unloadWebRotate_error', { error: String(e?.message || e) });
		}
	};

	const bindHotspots = (ctx, source) => {
		if (!$) return;

		$(document).off('pointerdown.iaaHotspot', '.wr360rollover_wr360PlayerId');
		$(document).on('pointerdown.iaaHotspot', '.wr360rollover_wr360PlayerId', function (event) {
			event.preventDefault();
			event.stopPropagation();
			event.stopImmediatePropagation();

			const classes = (this.className || '').split(/\s+/);
			const rolloverClasses = classes.filter((c) => /_rollover$/.test(c) && c !== 'wr360rollover_wr360PlayerId');

			const regexSpecific = /^(?:\d{2}[A-Z]|[A-Z]{3})_rollover$/;
			const specific = rolloverClasses.find((c) => regexSpecific.test(c));
			const rolloverClass = specific || rolloverClasses.find((c) => c !== 'hotspot_rollover') || rolloverClasses[0];
			if (!rolloverClass) {
				log('hotspot click but no rollover class', { classes });
				return;
			}

			const ciIdRaw = rolloverClass.replace(/_rollover$/, '');
			const ciIdFallback =
				this.getAttribute('data-hotspot') ||
				this.getAttribute('data-hotspotid') ||
				this.getAttribute('data-hotspot-name') ||
				this.getAttribute('data-name') ||
				this.getAttribute('name') ||
				this.getAttribute('title');

			const ciId = ciIdFallback || ciIdRaw;

			log('hotspot hit', { ciId, raw: ciIdRaw, rolloverClass, classesCount: classes.length });
			setTimeout(() => openActionModal(ciId, ctx, source), 0);
		});
	};

	const waitForPaintable = ($el, minW = 120, minH = 120, maxFrames = 600, shouldCancel = null) =>
		new Promise((resolve, reject) => {
			let n = 0;

			const tick = () => {
				n++;

				if (typeof shouldCancel === 'function' && shouldCancel()) {
					return reject(new Error('cancelled'));
				}

				if (!$el || !$el.length) return reject(new Error('missing $el'));
				const el = $el.get(0);
				if (!el) return reject(new Error('missing element'));

				// If detached, just keep waiting unless cancelled (prevents noisy warnings)
				if (!document.body.contains(el)) {
					if (n >= maxFrames) return reject(new Error('timeout waiting for paintable'));
					return requestAnimationFrame(tick);
				}

				const r = el.getBoundingClientRect();
				const cs = window.getComputedStyle(el);

				// For prewarm we keep elements offscreen/opacity 0; only size matters for paintable readiness
				const ok = r.width >= minW && r.height >= minH;

				if (ok) return resolve({
					frames: n,
					rect: { w: Math.round(r.width), h: Math.round(r.height) },
					style: { display: cs.display, visibility: cs.visibility, opacity: cs.opacity }
				});

				if (n >= maxFrames) return reject(new Error('timeout waiting for paintable'));
				requestAnimationFrame(tick);
			};

			requestAnimationFrame(tick);
		});

	const initWebRotate = async ($root, ctx, source, token) => {
		dbg('init:start', { token, hasRoot: !!$root?.length, hasCtx: !!ctx, sourceKeys: Object.keys(source || {}) });
		debugCheck('lib:jQuery', !!window.jQuery);
		debugCheck('lib:rotator', !!window.jQuery?.fn?.rotator);
		debugCheck('data:configUrl', !!configUrlFromSource(source, ctx));
		installGlobalDebugHooksOnce();

		const configUrl = configUrlFromSource(source, ctx);
		const $playerPre = $root.find('#wr360PlayerId');
		const lastKey = `${configUrl || ''}|${$playerPre?.get?.(0) ? 'player' : 'noplayer'}`;
		if (iaaLastInitOk && lastKey === iaaLastInitKey && $playerPre.length && hasViewerContent($playerPre)) {
			dbg('init:skip_unchanged', { token, lastKey });
			return;
		}

		if (iaaInitInFlight) {
			queueInit({ $root, ctx, source, token });
			return;
		}
		iaaInitInFlight = true;

		// Only the newest init may proceed
		if (token !== iaaInitSeq) {
			finishInit('cancelled_before_start');
			return warn('init_cancelled_before_start', { token, current: iaaInitSeq });
		}

		if (!$) {
			finishInit('abort_no_jquery');
			return warn('abort_no_jquery', { token });
		}
		if (!$.fn?.rotator) {
			finishInit('abort_no_rotator_plugin');
			return warn('abort_no_rotator_plugin', { token });
		}

		// Detect duplicate IDs (symptom of DOM reuse / multiple mounts)
		const dupWr = countId('wr360PlayerId');
		const dupModal = countId('simulator_modal_act');
		if (dupWr > 1 || dupModal > 1) warn('duplicate_ids_detected', { token, dupWr, dupModal });

		const $player = $root.find('#wr360PlayerId');
		if (!$player.length) {
			finishInit('abort_no_player');
			return warn('abort_no_player', { token, root: elInfo($root.get(0)) });
		}

		if (!configUrl) {
			finishInit('abort_no_configUrl');
			return warn('abort_no_configUrl', { token, sourceKeys: Object.keys(source || {}) });
		}

		iaaLastInitOk = false;
		iaaLastInitKey = `${configUrl}|player`;
		log('init_start', { token, configUrl, player: elInfo($player.get(0)), root: elInfo($root.get(0)) });

		// Wait until the element is actually paintable (visible + has size)
		let paintInfo;
		try {
			// Increase frames a bit; your sidebar takes time to settle
			paintInfo = await waitForPaintable(
			$player,
			120,
			120,
			600,
			() => token !== iaaInitSeq // cancel if newer init started
		);
		} catch (e) {
			const msg = String(e?.message || e);
			if (msg === 'cancelled') {
				finishInit('wait_cancelled');
				return log('wait_cancelled', { token, current: iaaInitSeq });
			}
			finishInit('abort_wait_paintable_failed');
			return warn('abort_wait_paintable_failed', { token, error: msg, player: elInfo($player.get(0)) });
		}

		// Cancel if a newer init happened while we were waiting
		if (token !== iaaInitSeq) {
			finishInit('cancelled_after_wait');
			return warn('init_cancelled_after_wait', { token, current: iaaInitSeq });
		}

		log('paintable_ok', { token, ...paintInfo });

		// Guard against DOM replacement
		const playerEl = $player.get(0);
		if (!playerEl || !document.body.contains(playerEl)) {
			finishInit('abort_player_detached_after_wait');
			return warn('abort_player_detached_after_wait', { token, player: elInfo(playerEl) });
		}

		// Clean up any previous instance
		unloadWebRotate($root);

		// Cancel if someone triggered a newer init right after unload
		if (token !== iaaInitSeq) {
			finishInit('cancelled_before_rotator');
			return warn('init_cancelled_before_rotator', { token, current: iaaInitSeq });
		}

		let ready = false;
		let didRetry = false;

		const startRotator = () => {
			log('rotator_call', { token, configUrl });

			$player.rotator({
				licenseFileURL: '/common/assets/webrotate/license.lic',
				configFileURL: configUrl,
				graphicsPath: '/common/assets/webrotate/imagerotator/html/img/round',
				responsiveBaseWidth: 1260,
				googleEventTracking: false,
				apiReadyCallback(api) {
					// Ignore stale callbacks
					if (token !== iaaInitSeq) {
						dbg('api_ready_ignored_due_to_newer_init', { token, current: iaaInitSeq });
						return;
					}

					ready = true;
					window.productViewer = api;
					log('viewer_ready', { token, player: elInfo($player.get(0)) });
					iaaLastInitOk = true;
					finishInit('ready');

					const removeHotspots = () => {
						const exercise = ctx?.exercise || {};
						const meta = resolveExerciseMeta(ctx);
						const info = exercise?.infoSrc?.webrotate || {};
						const paceId = Number(ctx?.delivery?.paceID ?? ctx?.delivery?.paceId ?? ctx?.delivery?.pace_id ?? 0) || 0;
						const stepNo = Number(meta.stepNo || 0) || 0;
						const formatId = Number(meta.formatId || 0) || 0;

						if (info.showHotSpots === false || stepNo === 80) {
							$('.wr360rollover_wr360PlayerId').remove();
						}

						if (formatId === 2 && stepNo === 20) {
							$('.wr360rollover_wr360PlayerId').not('.11O_rollover').remove();
						}

						if (formatId === 2 && stepNo > 20 && stepNo < 50) {
							$('.wr360rollover_wr360PlayerId').not('.11O_rollover, .12O_rollover').remove();
						}

						if (formatId === 4 && stepNo === 20) {
							$('.wr360rollover_wr360PlayerId').not('.11O_rollover, .12O_rollover').remove();
						}

						if ((formatId === 4 || formatId === 11) && stepNo > 30 && stepNo < 80) {
							$('.wr360rollover_wr360PlayerId.12O_rollover').remove();
						}

						if (formatId === 10 && stepNo === 27) {
							$('#wr360HotspotsButton_wr360PlayerId').remove();
						}

						if (paceId === 2) {
							$('.wr360rollover_wr360PlayerId.11O_rollover').remove();
						}
					};

					removeHotspots();
					log('hotspots_after_removal', { token, count: $('.wr360rollover_wr360PlayerId').length });

					// Keep removing on frame updates
					api.images.onFrame(() => removeHotspots());

					// Bind click handling
					bindHotspots(ctx, source);

					// Post-ready check: did we actually get content?
					setTimeout(() => {
						const el = $player.get(0);
						const hasCanvas = !!el?.querySelector('canvas');
						const hasImgs = (el?.querySelectorAll('img')?.length || 0) > 0;
						log('post_ready_render_check', { token, hasCanvas, hasImgs, player: elInfo(el) });
					}, 800);
				}
			});
		};

		startRotator();


		// Watchdog: if apiReadyCallback never fires, retry once
		setTimeout(() => {
			if (ready) return;
			if (token !== iaaInitSeq) {
				finishInit('timeout_newer_init');
				return; // newer init took over
			}

			err('viewer_ready_timeout', { token, configUrl, player: elInfo($player.get(0)), root: elInfo($root.get(0)) });

			if (!didRetry) {
				didRetry = true;
				warn('retry_init_once', { token });
				try {
					unloadWebRotate($root);
					startRotator();
				} catch (e) {
					err('retry_failed', { token, error: String(e?.message || e) });
					finishInit('retry_failed');
				}
			}
		}, 6000);
	};

	const resolveSource = (ctx) => {
		dbg('resolveSource:start');
		const fromSidebar = window.ProblemInfoSidebar?.resolveStateSources?.(ctx);
		if (fromSidebar?.inspect_and_act) return fromSidebar.inspect_and_act;
		if (window.ProblemExerciseStateContent?.sources?.inspect_and_act) {
			return window.ProblemExerciseStateContent.sources.inspect_and_act;
		}
		return {};
	};

	const renderEmpty = (title) => `
		<div class="simulator-info-source" data-code="iaa">
			<div class="sidebar-title">${esc(title)}</div>
			<p style="opacity:0.7">Inspect & Act content is not available yet.</p>
		</div>
	`;

	const render = (ctx, source = {}) => {
		dbg('render:start', { hasCtx: !!ctx, sourceKeys: Object.keys(source || {}) });
		debugCheck('data:ctx.delivery', !!ctx?.delivery);
		debugCheck('data:ctx.exercise', !!ctx?.exercise);
		debugCheck('data:source.inspect_and_act', !!source && typeof source === 'object');
		debugCheck('data:cis', Array.isArray(ciCatalog()) || (ciCatalog() && typeof ciCatalog() === 'object'));
		debugCheck('data:ci_descriptions', Array.isArray(source?.ci_descriptions) || Array.isArray(shared()?.ci_descriptions), {
			fromSource: Array.isArray(source?.ci_descriptions),
			fromShared: Array.isArray(shared()?.ci_descriptions)
		});
		const title = getMenuButtonLabel(window.SIM_SHARED?.menu_buttons || [], 'act', 'Inspect & Act');
		const configUrl = configUrlFromSource(source, ctx);
		const hasContent = !!configUrl || cablingMapRows(source).length;

		if (!hasContent) return renderEmpty(title);

		// NOTE: Removed inline modal shell from render to avoid duplicate IDs.
		// Modal is created once via ensureModalShell() when needed.
		// NOTE: Replaced #content with class to avoid duplicate IDs.
		return `
			<div class="simulator-info-source" data-code="iaa">
				<div class="sidebar-title">${esc(title)}</div>
				<div class="reload-text">
					${esc(term(130, ''))} <span class="reload link-text">${esc(term(128, 'Reload'))}</span>
				</div>
				<div class="wr360_player_outer">
					<div class="wr360_content">
						<div id="wr360PlayerId" class="wr360_player"></div>
					</div>
				</div>
				<div class="trace" style="padding:30px 0 0 30px;color:red;font-weight:bold;display:none;"></div>
			</div>
		`;
	};

	const bind = async ($root, { ctx } = {}) => {
		if (!$root || !$root.length) return;

		dbg('bind:start', { rootCount: $root.length, hasCtx: !!ctx });
		debugCheck('data:ctx.exercise', !!ctx?.exercise, { ctxKeys: Object.keys(ctx || {}) });
		debugCheck('lib:jQuery', !!window.jQuery);
		debugCheck('lib:rotator', !!window.jQuery?.fn?.rotator);
		debugCheck('fn:ProblemInfoSidebar.resolveStateSources', typeof window.ProblemInfoSidebar?.resolveStateSources === 'function' || window.ProblemInfoSidebar?.resolveStateSources === undefined);

		const token = nextInitToken();
		log('bind start', { token });

		// Schedule delayed preload (30 seconds after bind to avoid initial page load contention)
		scheduleDelayedPreload(ctx);

		// handlers
		if ($) {
			$root
				.off('click.iaaReload', '.reload')
				.on('click.iaaReload', '.reload', (e) => {
					e.preventDefault();
					const t = nextInitToken();
					log('reload clicked', { token: t });

					clearInitTimer();
					iaaInitTimer = setTimeout(() => {
						iaaInitTimer = null;
						initWebRotate($root, ctx, resolveSource(ctx), t);
					}, 50);
				});

			$(document)
				.off('click.iaaAction', '.act-action.clickable')
				.on('click.iaaAction', '.act-action.clickable', async function (e) {
					e.preventDefault();
					const $btn = $(this);
					const ciId = $btn.data('ci');
					const actionId = $btn.data('ac');

					const guard = actionGuard(ctx);
					if (!guard.ok) {
						showActionGuardError(guard.reason);
						return;
					}

					if ($btn.data('clicked')) return;
					$btn.data('clicked', true);

					const ok = await problemLogPerformedAction(ciId, actionId, ctx);
					if (!ok) {
						$btn.data('clicked', false);
						return;
					}

					$btn.removeClass('clickable').addClass('act-action-clicked');
					log('action clicked', { ciId, actionId });
				});
		}

		// debounce init
		clearInitTimer();
		iaaInitTimer = setTimeout(() => {
			iaaInitTimer = null;

			// abort if newer bind happened
			if (token !== iaaInitSeq) return warn('init_cancelled_by_newer_bind', { token, current: iaaInitSeq });

			const $player = $root.find('#wr360PlayerId');
			if (!$player.length) return warn('bind abort (no player node)', { token });

			dbg('bind:initWebRotate', { token });
			initWebRotate($root, ctx, resolveSource(ctx), token);
		}, 250);
	};

	window.ProblemInfoSources.register({
		code: 'iaa',
		aliases: ['inspect_and_act', 'act'],
		kind: 'state',
		sourceKey: 'inspect_and_act',
		render,
		bind
	});
})();