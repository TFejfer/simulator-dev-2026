/* /common/assets/js/features/sidebar/sources/inspect-and-act.js
 * Inspect & Act (Rotator360 + action modal).
 *
 * Dependencies:
 * - jQuery (window.jQuery)
 * - window.Sim360Bus (modules/sim360-bus.js)
 * - window.Rotator360 (modules/rotator360.js)
 *
 * Data inputs:
 * - window.ProblemExerciseStaticContent / window.ProblemExerciseStateContent / window.SIM_SHARED (same as legacy)
 * - ctx: { delivery, exercise } resolved from #page-data
 *
 * Note on hotspot/leftnav visibility policy:
 * The legacy viewer removed certain hotspots by jQuery selectors (e.g. .11O_rollover).
 * Here we implement the same rules by filtering the DOM elements rendered by Rotator360.
 */

(() => {
	'use strict';

	if (!window.ProblemInfoSources?.register || !window.ProblemInfoSourceUtils) return;

	const $ = window.jQuery;
	const { getMenuButtonLabel } = window.ProblemInfoSourceUtils;

	/* =========================
	 * Utilities
	 * ========================= */

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

	// CI id parser: splits into 2-digit type + suffix letter.
	// Examples:
	// - "21A" -> { type2:"21", typeId:21, suffix:"A" }
	// - "11O" -> { type2:"11", typeId:11, suffix:"O" }
	// - "SWA" -> { type2:"23", typeId:23, suffix:"A" } (SW family mapped to typeId 23)
	const parseCiIdParts = (ciId) => {
		const raw = String(ciId ?? '').trim();
		const upper = raw.toUpperCase();

		// Special family: SWA/SWB/... is treated as switch type 23 + suffix
		if (/^SW/.test(upper)) {
			const suffix = upper.length >= 3 ? upper.substring(2, 3) : '';
			return { raw, kind: 'SW', type2: '23', typeId: 23, suffix };
		}

		// Normal numeric ids: 2 digits + optional suffix
		const m = upper.match(/^(\d{2})([A-Z])?$/);
		if (m) {
			const type2 = m[1] || '';
			const typeId = parseInt(type2, 10) || 0;
			const suffix = m[2] || '';
			return { raw, kind: 'NUM', type2, typeId, suffix };
		}

		// Fallback (should be rare): try to extract first two digits + last letter
		const m2 = upper.match(/^(\d{2})/);
		const type2 = m2 ? m2[1] : '';
		const typeId = type2 ? (parseInt(type2, 10) || 0) : 0;
		const suffix = (upper.match(/([A-Z])$/)?.[1]) || '';
		return { raw, kind: 'OTHER', type2, typeId, suffix };
	};

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

	debugCheck('lib:jQuery', !!window.jQuery);
	debugCheck('lib:Sim360Bus', !!window.Sim360Bus);
	debugCheck('lib:Rotator360', !!window.Rotator360);
	debugCheck('fn:ProblemInfoSources.register', !!window.ProblemInfoSources?.register);

	/* =========================
	 * Data access (unchanged)
	 * ========================= */

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

	// Raw CI name for DOM labels (used for i18n/labels)
	const ciNameRaw = (ciId) => {
		const ci = findCi(ciId);
		if (!ci) return String(ciId || '');
		return String(ci.ci_text ?? ci.ciName ?? ci.name ?? ci.text ?? ci.text_value ?? ciId);
	};

	const ciName = (ciId) => esc(ciNameRaw(ciId));

	/* =========================
	 * Exercise meta + legacy rules (unchanged logic)
	 * ========================= */

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

	/* =========================
	 * Legacy hotspot visibility policy (ported)
	 * =========================
	 *
	 * Legacy code removed DOM nodes:
	 * - showHotSpots=false or stepNo==80 => remove all
	 * - formatId/stepNo combinations => allow only some IDs
	 * - paceId==2 => remove 11O
	 *
	 * Here we return a policy:
	 * - mode: 'all' | 'none' | 'only'
	 * - allowedIds: Set when mode==='only'
	 */
	const computeHotspotPolicy = (ctx) => {
		const ex = ctx?.exercise || {};
		const meta = resolveExerciseMeta(ctx);
		const paceId = Number(ctx?.delivery?.paceID ?? ctx?.delivery?.paceId ?? ctx?.delivery?.pace_id ?? 0) || 0;

		// Hard off
		if (meta.stepNo === 80) {
			return { mode: 'none', allowedIds: null };
		}

		// Default: show all
		let mode = 'all';
		let allowed = null;

		// Ported rule-set
		if (meta.formatId === 2 && meta.stepNo === 20) {
			mode = 'only'; allowed = new Set(['11O']);
		}
		if (meta.formatId === 2 && meta.stepNo > 20 && meta.stepNo < 50) {
			mode = 'only'; allowed = new Set(['11O', '12O']);
		}
		if (meta.formatId === 4 && meta.stepNo === 20) {
			mode = 'only'; allowed = new Set(['11O', '12O']);
		}
		if ((meta.formatId === 4 || meta.formatId === 11) && meta.stepNo > 30 && meta.stepNo < 80) {
			// remove 12O
			if (mode === 'only') {
				allowed.delete('12O');
			} else {
				// "all except 12O" is easiest implemented as DOM hide:
				// we keep mode='all' and return a "deny" set.
				return { mode: 'all', denyIds: new Set(['12O']) };
			}
		}

		// paceId==2 => remove 11O
		if (paceId === 2) {
			if (mode === 'only') {
				allowed.delete('11O');
			} else {
				return { mode: 'all', denyIds: new Set(['11O']) };
			}
		}

		return { mode, allowedIds: allowed, denyIds: null };
	};

	/**
	 * Apply hotspot/leftnav filtering to the Rotator DOM.
	 * This must run after Rotator360 renders, and again whenever it re-renders.
	 */
	const applyHotspotPolicyToDom = (rootEl, ctx) => {
		if (!rootEl) return;
		const policy = computeHotspotPolicy(ctx);
		const toggleBtn = rootEl.querySelector('[data-iaa-role="toggle"]');

		// If policy is "none", turn off via bus (this also hides leftnav + overlay).
		if (policy.mode === 'none') {
			if (window.Sim360Bus && typeof window.Sim360Bus.getHotspotsVisible === 'function') {
				if (window.Sim360Bus.getHotspotsVisible()) window.Sim360Bus.setHotspotsVisible(false);
			}
			if (toggleBtn) {
				toggleBtn.disabled = true;
				toggleBtn.setAttribute('aria-disabled', 'true');
					toggleBtn.removeAttribute('title');
			}
			return;
		}

		// Otherwise: do NOT force global toggle state.
		// The user-controlled button should decide Sim360Bus.getHotspotsVisible().
		if (toggleBtn) {
			toggleBtn.disabled = false;
			toggleBtn.removeAttribute('aria-disabled');
				toggleBtn.removeAttribute('title');
		}

		const allowed = policy.allowedIds;
		const deny = policy.denyIds;

		// LeftNav items (rendered as .rotator-leftnav .item, text content contains the CI id)
		const leftItems = rootEl.querySelectorAll('.rotator-leftnav .item');
		leftItems.forEach((node) => {
			const id = String(node.textContent || '').trim();
			let show = true;

			if (policy.mode === 'only') show = allowed?.has(id);
			if (deny && deny.has(id)) show = false;

			node.style.display = show ? '' : 'none';

			// Make sure we have attributes for i18n
			if (!node.getAttribute('data-ci')) node.setAttribute('data-ci', id);
			node.removeAttribute('title');
		});

		// Hotspot buttons (rendered as .rotator-hotspot with data-ciid)
		const hotspots = rootEl.querySelectorAll('.rotator-hotspot');
		hotspots.forEach((btn) => {
			const id = String(btn.getAttribute('data-ciid') || btn.dataset.ciid || '').trim();
			let show = true;

			if (policy.mode === 'only') show = allowed?.has(id);
			if (deny && deny.has(id)) show = false;

			btn.style.display = show ? '' : 'none';
		});
	};

	/* =========================
	 * Hotspot label i18n (adapted)
	 * ========================= */

	let iaaI18nObserver = null;
	let iaaI18nRaf = 0;

	const stopHotspotI18n = () => {
		if (iaaI18nObserver) {
			iaaI18nObserver.disconnect();
			iaaI18nObserver = null;
		}
		if (iaaI18nRaf) {
			cancelAnimationFrame(iaaI18nRaf);
			iaaI18nRaf = 0;
		}
	};

	const applyHotspotI18n = (container) => {
		if (!container) return;

		const nodes = container.querySelectorAll('[data-ci],[data-ciid]');
		if (!nodes.length) return;

		nodes.forEach((node) => {
			const ciId = String(
				node.getAttribute('data-ci') || node.getAttribute('data-ciid') || ''
			).trim();
			if (!ciId) return;

			const parts = parseCiIdParts(ciId);
			let label = '';
			if (parts.kind === 'SW') {
				// SWA/SWB/... -> "Software A" (must match modal title)
				label = `${term(47, 'Software')} ${parts.suffix}`.trim();
			} else {
				// Non-SW: if ciId has a letter suffix (except O), append it with a space.
				// IMPORTANT: do NOT split normal names by inserting space in the name itself.
				const base = String(ciNameRaw(ciId) ?? '').trim();
				if (parts.suffix && parts.suffix !== 'O') {
					const baseUpper = base.toUpperCase();
					const sufUpper = parts.suffix.toUpperCase();
					const already = baseUpper.endsWith(` ${sufUpper}`) || baseUpper.endsWith(sufUpper);
					label = already ? base : `${base} ${parts.suffix}`;
				} else {
					label = base;
				}
			}

			// Keep labels in sync (leftnav uses textContent; hotspots use button text)
			if (node.textContent !== label) node.textContent = label;
			node.removeAttribute('title');
		});
	};

	const startHotspotI18n = (container) => {
		stopHotspotI18n();
		if (!container) return;

		applyHotspotI18n(container);

		iaaI18nObserver = new MutationObserver(() => {
			if (iaaI18nRaf) return;
			iaaI18nRaf = requestAnimationFrame(() => {
				iaaI18nRaf = 0;
				applyHotspotI18n(container);
			});
		});
		iaaI18nObserver.observe(container, { childList: true, subtree: true });
	};


	/* =========================
	 * Lazy-load Rotator360 dependencies (adapted)
	 * ========================= */

	const ensureRotatorDeps = (() => {
		let promise = null;
		const cspNonce = (() => {
			// Pages use CSP with nonce; dynamic script injection must carry a nonce too.
			const el = document.querySelector('script[nonce]');
			const n = el?.getAttribute?.('nonce') || el?.nonce || '';
			return (typeof n === 'string') ? n : '';
		})();

		const loadScript = (src) => new Promise((resolve, reject) => {
			const s = document.createElement('script');
			s.src = src;
			s.async = true;
			if (cspNonce) s.setAttribute('nonce', cspNonce);
			s.onload = () => resolve(true);
			s.onerror = () => reject(new Error(`Failed to load: ${src}`));
			document.head.appendChild(s);
		});

		return () => {
			if (window.Sim360Bus && window.Rotator360) return Promise.resolve(true);
			if (promise) return promise;

			// Prefer browser caching. Only add a version query when the environment provides one.
			const vRaw = (window.__ASSET_VER__ ?? window.SIM_BUILD_VERSION);
			const v = (typeof vRaw === 'string' || typeof vRaw === 'number') ? String(vRaw) : '';
			const qs = v ? `?v=${encodeURIComponent(v)}` : '';
			const busSrc = `/common/assets/js/modules/sim360-bus.js${qs}`;
			const rotSrc = `/common/assets/js/modules/rotator360.js${qs}`;

			promise = loadScript(busSrc)
				.then(() => loadScript(rotSrc))
				.then(() => true)
				.catch((e) => {
					console.error('[inspect-and-act] Failed loading rotator deps', e);
					promise = null;
					return false;
				});

			return promise;
		};
	})();



	/* =========================
	 * Action modal + perform-action click (ported from legacy)
	 * ========================= */

	const log = (event, data = {}) => dbg(event, data);
	const warn = (event, data = {}) => {
		if (!SIM_DEBUG.enabled()) return;
		console.warn('[inspect-and-act.js]', event, data);
	};

	const preloadedImages = new Set();
	const preloadedHotspotJson = new Set();

	const isSw = (ciId) => parseCiIdParts(ciId).kind === 'SW';

	const ciSuffix = (ciId) => parseCiIdParts(ciId).suffix;

	const SW_ACTIONS = [
		{ ci_type_id: 23, action_id: 13 },
		{ ci_type_id: 24, action_id: 21 }
	];

	const actionTitleTextRaw = (ciId) => {
		if (isSw(ciId)) return `${term(47, 'Software')} ${ciSuffix(ciId)}`.trim();
		const base = String(ciNameRaw(ciId) ?? '').trim();
		const parts = parseCiIdParts(ciId);
		if (parts.suffix && parts.suffix !== 'O') {
			const baseUpper = base.toUpperCase();
			const sufUpper = parts.suffix.toUpperCase();
			const already = baseUpper.endsWith(` ${sufUpper}`) || baseUpper.endsWith(sufUpper);
			return already ? base : `${base} ${parts.suffix}`;
		}
		return base;
	};

	const actionTitleText = (ciId) => esc(actionTitleTextRaw(ciId));

	const withSuffixSpace = (text) => {
		const s = String(text ?? '').trim();
		if (s.length < 2) return s;
		const last = s.slice(-1);
		if (!/^[A-Za-z]$/.test(last)) return s;
		if (last.toUpperCase() === 'O') return s;
		const prev = s.slice(-2, -1);
		if (/\s/.test(prev)) return s;
		return `${s.slice(0, -1)} ${last}`;
	};

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
		const meta = resolveExerciseMeta(ctx);
		if (meta.stepNo > 60) return true;
		if (meta.stepNo > 0 && meta.stepNo < 20) return true;
		if (meta.formatId === 1 && isTimeExpired(meta)) return true;
		return false;
	};

	const ciTypeFromId = (ciId) => {
		const ci = findCi(ciId);
		if (ci?.ci_type_id) return parseInt(ci.ci_type_id, 10) || 0;
		return parseCiIdParts(ciId).typeId;
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

		const collect = [];
		const pushId = (actionId) => {
			const aid = parseInt(actionId, 10);
			if (!Number.isFinite(aid) || aid <= 0) return;
			collect.push(aid);
		};

		if (Array.isArray(map)) {
			map.forEach((r) => {
				const typeId = parseInt(r?.ci_type_id ?? r?.ciTypeID ?? 0, 10);
				if (typeId === ciType || (isSwitchType(ciType) && isSwitchType(typeId))) {
					pushId(r?.action_id ?? r?.actionID ?? 0);
				}
			});
		} else if (typeof map === 'object') {
			const typeKeys = isSwitchType(ciType) ? ['23', '24'] : [String(ciType)];
			typeKeys.forEach((key) => {
				const val = map[key] ?? map[parseInt(key, 10)];
				if (Array.isArray(val)) val.forEach((x) => pushId(x));
			});
		}

		return collect;
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
			if (seen.has(text)) return;
			seen.add(text);
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
			.sort((a, b) => (parseInt(a.sequence_no ?? a.sequence ?? a.seq ?? 0, 10) || 0) - (parseInt(b.sequence_no ?? b.sequence ?? b.seq ?? 0, 10) || 0));
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
		const baseType = (typeHint !== null && typeHint !== undefined)
			? parseInt(typeHint, 10)
			: ciTypeFromId(ciId);
		return timeCostForTypeAction(baseType, actionId, source);
	};

	const buildCablingList = (ciId, ctx, source) => {
		const type = ciTypeFromId(ciId);
		if (!(String(ciId || '').startsWith('21') || type === 21)) return '';

		const rows = cablingMapRows(source);
		if (!rows.length) return '';

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
		const suffixFromId = (id) => ciSuffix(id);
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
				if (Object.prototype.hasOwnProperty.call(portMap, code)) {
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
	};

	const pickActionRows = (ciId, source) => {
		if (isSw(ciId)) return SW_ACTIONS.map((r) => ({ action_id: r.action_id, ci_type_id: r.ci_type_id }));
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
		if (!rows.length) return '<p style="opacity:0.7">Actions are not available for this configuration item yet.</p>';

		const suf = ciSuffix(ciId);

		return rows.map((row) => {
			const actionId = parseInt(row.action_id ?? row.actionID ?? row.actionId ?? 0, 10) || 0;
			const effType = isSw(ciId)
				? (parseInt(row.ci_type_id ?? row.ciTypeID ?? 0, 10) || 0)
				: ciTypeFromId(ciId);
			const baseLabel = actionText(actionId, source);
			const swLabel = (isSw(ciId) && effType)
				? `${baseLabel} | ${ciName(`${effType}${suf}`)}`
				: baseLabel;
			const tc = (isSw(ciId) && effType)
				? timeCostForTypeAction(effType, actionId, source)
				: timeCostForAction(ciId, actionId, source);
			const cost = formatCost(row.cost ?? row.cost_value ?? tc?.cost);
			const time = formatTime(row.time ?? row.time_minutes ?? row.minutes ?? tc?.time_min);
			const benefits = Array.isArray(row.benefits)
				? uniqueTextList(row.benefits).map((b) => `<li><i class="fa-solid fa-circle-check"></i>${esc(b)}</li>`).join('')
				: benefitsListHtml(ciId, actionId, source, (isSw(ciId) ? effType : null));
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
		if (isSw(ciId)) return '/common/assets/images/configimages/config_SW00.png';
		const type = ciTypeFromId(ciId);
		if (!type) return '/common/assets/images/configimages/config_placeholder.png';
		const theme = Number(ctx?.exercise?.theme_id ?? ctx?.exercise?.theme ?? 0);
		const ci = findCi(ciId);
		const hasMultiple = ci?.has_multiple_images === true || ci?.has_multiple_images === 1 || ci?.has_multiple_images === '1';
		const themeSuffix = hasMultiple ? String(Number.isFinite(theme) ? theme : 0).padStart(2, '0') : '00';
		const typePrefix = String(type || '00').padStart(2, '0');
		return `/common/assets/images/configimages/config_${typePrefix}${themeSuffix}.png`;
	};

	const preloadImageImmediately = (ciId, ctx) => {
		if (!ciId) return;
		const url = ciImageSrc(ciId, ctx);
		if (preloadedImages.has(url)) return;
		const img = new Image();
		img.onload = () => preloadedImages.add(url);
		img.onerror = () => warn('preload_immediate_failed', { ciId, url });
		img.src = url;
	};

	const preloadActionModalImagesForTheme = (hotspotsJsonUrl, ctx) => {
		if (!hotspotsJsonUrl) return;
		if (preloadedHotspotJson.has(hotspotsJsonUrl)) return;
		preloadedHotspotJson.add(hotspotsJsonUrl);

		const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 50));

		(async () => {
			try {
				const res = await fetch(hotspotsJsonUrl, { cache: 'force-cache' });
				if (!res.ok) return;
				const data = await res.json();
				const ids = new Set();
				if (Array.isArray(data?.leftnav)) {
					data.leftnav.forEach((id) => ids.add(String(id)));
				}
				if (Array.isArray(data?.hotspots)) {
					data.hotspots.forEach((frame) => {
						if (!Array.isArray(frame)) return;
						frame.forEach((h) => {
							const id = String(h?.id ?? '').trim();
							if (id) ids.add(id);
						});
					});
				}

				const list = Array.from(ids).slice(0, 200);
				// Preload a small set immediately (helps when user clicks fast)
				list.slice(0, 20).forEach((ciId) => preloadImageImmediately(ciId, ctx));
				// Preload the rest in idle time
				idle(() => list.slice(20).forEach((ciId) => preloadImageImmediately(ciId, ctx)));
			} catch (e) {
				warn('preload_hotspots_json_failed', { hotspotsJsonUrl, error: String(e?.message || e) });
			}
		})();
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
		if (document.getElementById('simulator_modal_act')) return;
		const shell = document.createElement('div');
		shell.innerHTML = `
			<div id="simulator_modal_act" class="simulator-modal" role="dialog" aria-modal="true" aria-hidden="true" inert tabindex="-1" style="display:none;">
				<div class="simulator-modal-dialog">
					<div class="simulator-modal-content">
						<div class="simulator-modal-header">
							<button type="button" class="simulator-modal-close" data-dismiss="simulator-modal" aria-label="Close">×</button>
						</div>
						<div id="simulator_modal_act_body" class="simulator-modal-body"></div>
					</div>
				</div>
			</div>
		`;
		document.body.appendChild(shell.firstElementChild);
	};

	const modalRestoreFocusById = new Map();

	const navigateToProblemActionPage = () => {
		try {
			const cur = new URL(window.location.href);
			const target = new URL('/training-problem-instructor-action', window.location.origin);
			if (cur.searchParams.has('debug')) target.searchParams.set('debug', cur.searchParams.get('debug') || '1');
			window.location.href = `${target.pathname}${target.search}`;
		} catch {
			window.location.href = '/training-problem-instructor-action';
		}
	};

	const showHideModal = (id, show = true) => {
		const $m = $ && $(`#${id}`);
		if (!$m || !$m.length) return;
		const modalEl = $m.get(0);
		if (!modalEl) return;

		if (show) {
			modalRestoreFocusById.set(id, document.activeElement);
			$m.addClass('simulator-show').css('display', 'block');
			$m.attr('aria-hidden', 'false');
			try { modalEl.removeAttribute('inert'); } catch {}
			$('body').addClass('modal-open');

			requestAnimationFrame(() => {
				const closeBtn = modalEl.querySelector('.simulator-modal-close');
				if (closeBtn && typeof closeBtn.focus === 'function') {
					closeBtn.focus({ preventScroll: true });
				} else if (typeof modalEl.focus === 'function') {
					modalEl.focus({ preventScroll: true });
				}
			});
			return;
		}

		// Hiding: move focus out BEFORE aria-hidden=true to avoid a11y violation.
		try {
			const active = document.activeElement;
			if (active && modalEl.contains(active)) {
				if (typeof active.blur === 'function') active.blur();
				const restore = modalRestoreFocusById.get(id);
				if (restore && document.contains(restore) && typeof restore.focus === 'function') {
					restore.focus({ preventScroll: true });
				} else if (typeof document.body?.focus === 'function') {
					document.body.focus({ preventScroll: true });
				}
			}
		} catch {}

		$m.removeClass('simulator-show').css('display', 'none');
		$m.attr('aria-hidden', 'true');
		try { modalEl.setAttribute('inert', ''); } catch {}
		$('body').removeClass('modal-open');
	};

	const problemLogPerformedAction = async (ciId, actionId, ctx) => {
		if (typeof window.simulatorAjaxRequest !== 'function') return false;
		const ex = ctx?.exercise || {};
		const globalEx = window.ProblemExerciseStateContent || {};
		const outlineId = Number(ex.outline_id ?? ex.outlineId ?? globalEx.outline_id ?? globalEx.outlineId ?? 0) || 0;
		const stepNo = Number(ex.step_no ?? ex.stepNo ?? ex.step ?? globalEx.step_no ?? globalEx.stepNo ?? globalEx.step ?? 0) || 0;
		const currentState = Number(
			ex.current_state
			?? ex.currentState
			?? ex.state
			?? globalEx.current_state
			?? globalEx.currentState
			?? globalEx.state
			?? 0
		) || 0;
		const payload = {
			outline_id: outlineId,
			step_no: stepNo,
			current_state: currentState,
			ci_id: String(ciId ?? ''),
			action_id: Number(actionId || 0)
		};

		const res = await window.simulatorAjaxRequest('/ajax/log_problem_action.php', 'POST', payload, { mode: 'dynamic' });
		if (res?.ok) return true;
		const errMsg = String(res?.error || 'Action could not be registered.');
		showActionGuardError(errMsg);
		return false;
	};

	const openActionModal = (ciId, ctx, source) => {
		if (!$) return;
		ensureModalShell();
		preloadImageImmediately(ciId, ctx);
		const html = buildActionContent(ciId, ctx, source);
		const $body = $('#simulator_modal_act_body');
		$body.html(html);
		$('#simulator_modal_act .simulator-modal-dialog').css({ width: 'auto', 'max-height': '90vh', 'max-width': '90vw' });
		$body.css({ overflow: 'auto', 'max-height': '80vh' });
		if (actionsDisabled(ctx)) {
			$body.find('.perform-action-action-row').children('div')
				.removeClass('act-action clickable')
				.addClass('act-action-clicked');
		}
		showHideModal('simulator_modal_act', true);
		$('#simulator_modal_act')
			.off('click.iaaClose', '.simulator-modal-close, [data-dismiss="simulator-modal"]')
			.on('click.iaaClose', '.simulator-modal-close, [data-dismiss="simulator-modal"]', (e) => {
				e.preventDefault();
				showHideModal('simulator_modal_act', false);
			});
	};

	let latestCtxForActionClicks = null;

	/* =========================
	 * Viewer rendering (NEW)
	 * ========================= */

	// Unique ID suffix to avoid collisions if sidebar re-renders/mounts multiple times
	const makeIdSuffix = () => Math.random().toString(36).slice(2, 8);

	const renderViewer = (ids) => {
		// IDs are injected so multiple instances won’t clash
		return `
			<div class="iaa-rotator">
				<div class="rotator-stage" id="${ids.stageId}" data-iaa-role="stage">
					<img id="${ids.imgId}" alt="Model" data-iaa-role="img" />
					<div id="${ids.leftNavId}" class="rotator-leftnav" data-iaa-role="leftnav"></div>
					<div class="rotator-hotspots"></div>

					<div class="rotator-controls" data-iaa-role="controls">
						<button id="${ids.btnLeftId}" class="rotator-ctrl-btn" type="button" data-iaa-role="left" aria-label="Rotate left">
							<i class="fa-solid fa-arrow-rotate-right" aria-hidden="true"></i>
						</button>
						<button id="${ids.btnRightId}" class="rotator-ctrl-btn" type="button" data-iaa-role="right" aria-label="Rotate right">
							<i class="fa-solid fa-arrow-rotate-left" aria-hidden="true"></i>
						</button>
						<button id="${ids.btnZoomId}" class="rotator-ctrl-btn" type="button" data-iaa-role="zoom" aria-label="Zoom">
							<i class="fa-solid fa-plus" aria-hidden="true"></i>
						</button>
						<button id="${ids.btnToggleHotspotsId}" class="rotator-ctrl-btn" type="button" aria-pressed="true" data-iaa-role="toggle" aria-label="Hide hotspots">
							<i class="fa-solid fa-location-dot" aria-hidden="true"></i>
						</button>

						<div class="rotator-frame" aria-hidden="true">
							Frame: <span id="${ids.frameNoId}" data-iaa-role="frameNo">0</span> / <span id="${ids.frameMaxId}" data-iaa-role="frameMax">59</span>
						</div>
					</div>
				</div>
			</div>
		`;
	};

	const resolveThemeId = (ctx) => {
		const fromCtx = Number(ctx?.exercise?.theme_id ?? ctx?.exercise?.theme ?? 0);
		if (fromCtx) return fromCtx;

		const fromState = Number(
			window.ProblemExerciseStateContent?.exercise?.theme_id
			?? window.ProblemExerciseStateContent?.theme_id
			?? 0
		);
		if (fromState) return fromState;

		return 3;
	};

	const rotatorCleanupByRoot = new WeakMap();

	const initRotator = (rootEl, ctx, ids) => {
		const prevCleanup = rotatorCleanupByRoot.get(rootEl);
		if (typeof prevCleanup === 'function') {
			try { prevCleanup(); } catch {}
			rotatorCleanupByRoot.delete(rootEl);
		}

		//if (!window.Rotator360 || !window.Sim360Bus) {
			//console.error('[inspect-and-act] Rotator360/Sim360Bus missing.');
			//return;
		//}

		const themeId = resolveThemeId(ctx);
		const theme2 = String(themeId).padStart(2, '0');
		const hotspotsJsonUrl = `/common/assets/imagerotator/hotspots/theme_${theme2}.json`;

		// Preload action-modal images early (based on hotspot ids for this theme)
		preloadActionModalImagesForTheme(hotspotsJsonUrl, ctx);

		const byId = (id) => (id ? rootEl.querySelector(`#${CSS.escape(String(id))}`) : null);
		const byRole = (role) => rootEl.querySelector(`[data-iaa-role="${role}"]`);

		window.Rotator360.init({
			stageEl: byId(ids?.stageId) || byRole('stage') || rootEl.querySelector('.rotator-stage'),
			imgEl: byId(ids?.imgId) || byRole('img') || rootEl.querySelector('.rotator-stage img'),
			leftNavEl: byId(ids?.leftNavId) || byRole('leftnav') || rootEl.querySelector('.rotator-leftnav'),
			btnLeftEl: byId(ids?.btnLeftId) || byRole('left'),
			btnRightEl: byId(ids?.btnRightId) || byRole('right'),
			btnZoomEl: byId(ids?.btnZoomId) || byRole('zoom'),
			btnToggleHotspotsEl: byId(ids?.btnToggleHotspotsId) || byRole('toggle'),
			frameNoEl: byId(ids?.frameNoId) || byRole('frameNo'),
			frameMaxEl: byId(ids?.frameMaxId) || byRole('frameMax'),

			// IMPORTANT: Update these paths to your real action/theme base folder.
			// If you have multiple themes pointing to different image sets, map it here.
			basePathLow: '/common/assets/imagerotator/img/action030000/',
			basePathHi: '/common/assets/imagerotator/img/action030000/highres/',
			frameCount: 60,

			hotspotsJsonUrl
		});

		// Apply policy immediately + keep it applied on renders/changes
		const apply = () => applyHotspotPolicyToDom(rootEl, ctx);

		apply();

		// Re-apply on frame changes
		const unsubFrame = window.Sim360Bus.onFrame(() => apply());

		// Re-apply if overlay visibility toggled
		const unsubHotspotsVisible = window.Sim360Bus.on('hotspots:visible', () => apply());

		// Re-apply on DOM changes (Rotator redraws hotspots/leftnav)
		let obsRaf = 0;
		const obs = new MutationObserver(() => {
			if (obsRaf) return;
			obsRaf = requestAnimationFrame(() => {
				obsRaf = 0;
				apply();
			});
		});
		obs.observe(rootEl, { childList: true, subtree: true });

		// Start i18n observation (labels)
		startHotspotI18n(rootEl);

		// Handle hotspot click -> open modal
		const unsubHotspotClick = window.Sim360Bus.on('hotspot:click', ({ ci_id }) => {
			if (!ci_id) return;
			openActionModal(ci_id, ctx, resolveSource(ctx));
		});

		rotatorCleanupByRoot.set(rootEl, () => {
			try { unsubFrame?.(); } catch {}
			try { unsubHotspotsVisible?.(); } catch {}
			try { unsubHotspotClick?.(); } catch {}
			try {
				if (obsRaf) cancelAnimationFrame(obsRaf);
				obs.disconnect();
			} catch {}
		});
	};

	/* =========================
	 * Source resolution (unchanged)
	 * ========================= */

	const resolveSource = (ctx) => {
		const fromSidebar = window.ProblemInfoSidebar?.resolveStateSources?.(ctx);
		if (fromSidebar?.inspect_and_act) return fromSidebar.inspect_and_act;
		if (window.ProblemExerciseStateContent?.sources?.inspect_and_act) {
			return window.ProblemExerciseStateContent.sources.inspect_and_act;
		}
		return {};
	};

	/* =========================
	 * Render + bind integration (UPDATED)
	 * ========================= */

	const renderEmpty = (title) => `
		<div class="simulator-info-source" data-code="iaa">
			<div class="sidebar-title">${esc(title)}</div>
			<p style="opacity:0.7">Inspect & Act content is not available yet.</p>
		</div>
	`;

	const render = (ctx, source = {}) => {
		const title = getMenuButtonLabel(window.SIM_SHARED?.menu_buttons || [], 'act', 'Inspect & Act');

		// Determine whether we have enough to show the viewer.
		// New rotator uses static assets + theme JSON, so we just render it.
		// If you want to disable entirely for some exercises, do it here.
		const hasContent = true;

		if (!hasContent) return renderEmpty(title);

		const suf = makeIdSuffix();
		const ids = {
			stageId: `iaa_stage_${suf}`,
			imgId: `iaa_img_${suf}`,
			leftNavId: `iaa_leftnav_${suf}`,
			btnLeftId: `iaa_left_${suf}`,
			btnRightId: `iaa_right_${suf}`,
			btnZoomId: `iaa_zoom_${suf}`,
			btnToggleHotspotsId: `iaa_hot_${suf}`,
			frameNoId: `iaa_fno_${suf}`,
			frameMaxId: `iaa_fmax_${suf}`,
		};

		// Store instance ids on the root for bind() to pick up
		// (no duplicate IDs and no globals).
		const instanceMeta = encodeURIComponent(JSON.stringify(ids));

		return `
			<div class="simulator-info-source" data-code="iaa" data-iaa-ids="${instanceMeta}">
				<div class="sidebar-title">${esc(title)}</div>
				<div class="reload-text">
					${esc(term(130, ''))} <span class="reload link-text">${esc(term(128, 'Reload'))}</span>
				</div>

				${renderViewer(ids)}

				<div class="trace" style="padding:30px 0 0 30px;color:red;font-weight:bold;display:none;"></div>
			</div>
		`;
	};

	const bind = async ($root, { ctx } = {}) => {
		if (!$root || !$root.length) return;

		latestCtxForActionClicks = ctx || latestCtxForActionClicks;

		const ok = await ensureRotatorDeps();
		if (!ok) return;

		debugCheck('lib:jQuery', !!window.jQuery);
		debugCheck('lib:Sim360Bus', !!window.Sim360Bus);
		debugCheck('lib:Rotator360', !!window.Rotator360);

		// Reload handler: simplest is to re-run init + re-apply policies.
		$root
			.off('click.iaaReload', '.reload')
			.on('click.iaaReload', '.reload', (e) => {
				e.preventDefault();
				dbg('reload_clicked');

				// Re-init by re-binding (the sidebar typically re-renders anyway)
				// If you need a hard reset: you can replace the viewer HTML and init again.
				try {
					const el = $root.get(0);
					applyHotspotPolicyToDom(el, ctx);
				} catch {}
			});

		// Perform action click handler (delegated)
		if ($) {
			$(document)
				.off('click.iaaAction', '.act-action.clickable')
				.on('click.iaaAction', '.act-action.clickable', async function (e) {
					e.preventDefault();
					const $btn = $(this);
					const ciId = String($btn.attr('data-ci') || '');
					const actionId = parseInt($btn.attr('data-ac') || '0', 10) || 0;
					const effectiveCtx = latestCtxForActionClicks || ctx || {};

					if (!ciId || !actionId) return;
					if (actionsDisabled(effectiveCtx)) {
						showActionGuardError(term(82, 'Actions are currently disabled.'));
						return;
					}

					const guard = actionGuard(effectiveCtx);
					if (!guard.ok) {
						showActionGuardError(guard.error || term(82, 'Actions are currently disabled.'));
						return;
					}

					// Optimistic UI: disable this button immediately
					$btn.removeClass('act-action clickable').addClass('act-action-clicked');

					const ok = await problemLogPerformedAction(ciId, actionId, effectiveCtx);
					if (ok) {
						showHideModal('simulator_modal_act', false);
						navigateToProblemActionPage();
					} else {
						// Re-enable on failure
						$btn.removeClass('act-action-clicked').addClass('act-action clickable');
					}
				});
		}

		// Init rotator
		const el = $root.get(0);
		const idsJsonEncoded = el?.getAttribute('data-iaa-ids') || '%7B%7D';
		let ids = {};
		try {
			ids = JSON.parse(decodeURIComponent(idsJsonEncoded || '%7B%7D'));
		} catch {
			ids = {};
		}

		// Fallback: if ids parsing failed, reconstruct from DOM
		if (!ids || typeof ids !== 'object') ids = {};
		if (!ids.stageId) ids.stageId = el.querySelector('.rotator-stage')?.id || '';
		if (!ids.imgId) ids.imgId = el.querySelector('.rotator-stage img')?.id || '';
		if (!ids.leftNavId) ids.leftNavId = el.querySelector('.rotator-leftnav')?.id || '';

		initRotator(el, ctx, ids);

		// Apply policy once after init (important when step/state changes but DOM is already present)
		applyHotspotPolicyToDom(el, ctx);
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