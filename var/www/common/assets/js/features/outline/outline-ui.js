/* /var/www/common/assets/js/features/outline/outline-ui.js
 *
 * Outline UI module (shared).
 *
 * Provides:
 * - renderOutlineHtml(ctx, outlineRows)
 * - initStatusUI()
 * - applyStatusUpdate(ctx, payload)
 *
 * Requirements:
 * - Outline rows are the raw SHARED_CONTENT.outlines rows
 * - shared_content.formats is an object map: { "<format_id>": "<text>", ... }
 */

/* global window, document */

(() => {
	'use strict';

	// -----------------------------
	// Internal helpers
	// -----------------------------

	const groupByBlock = (rows) => {
		const out = new Map();
		(rows || []).forEach((r) => {
			const b = Number(r.block_no || 0);
			if (!out.has(b)) out.set(b, []);
			out.get(b).push(r);
		});
		return out;
	};

	const getFormatsMap = (ctx) => {
		// Formats come from shared_content payload (stored globally by simulator-page.js)
		// Expected: object map { "<format_id>": "<text>" }
		return window.SIM_SHARED?.formats || null;
	};

	const formatText = (ctx, format_id) => {
		const id = String(format_id || '').trim();
		if (!id || id === '0') return '';

		const formats = getFormatsMap(ctx);
		if (!formats || typeof formats !== 'object') return '';

		return String(formats[id] || formats[String(Number(id))] || '');
	};

	// -----------------------------
	// Public: render HTML
	// -----------------------------

	const renderOutlineHtml = (ctx, rows) => {
		if (!Array.isArray(rows) || rows.length === 0) {
			return '<div style="padding:16px">No outline data available.</div>';
		}

		const byBlock = groupByBlock(rows);
		const blocks = Array.from(byBlock.keys()).sort((a, b) => a - b);

		const blockTitle = (blockNo) => {
			if (!blocks.includes(2) && blockNo === 1) return ctx.term(309);

			if (blockNo === 1) return ctx.term(307);
			if (blockNo === 2) return ctx.term(308);
			if (blockNo === 3) return ctx.term(310);
			return `# ${blockNo}`;
		};

		const itemText = (itemType) => {
			if (itemType === 'introduction') return ctx.term(302);
			if (itemType === 'debriefing') return ctx.term(304);
			if (itemType === 'closure') return ctx.term(305);
			if (itemType === 'exercise') return ctx.term(237);
			if (itemType === 'terminology') return ctx.term(562);
			return `Item ${itemType}`;
		};

		let html = `<div class="grid-outline">`;

		blocks.forEach((b) => {
			html += `
				<div class="grid-outline-box">
					<div class="capitalize-all">${blockTitle(b)}</div>
					<div>
			`;

			(byBlock.get(b) || []).forEach((row) => {
				const itemType = String(row.item_type || '');
				const outlineId = Number(row.outline_id || 0);
				const exerciseNo = Number(row.exercise_no || 0);
				const fmt = formatText(ctx, row.format_id);

				const isClickable = (itemType === 'exercise' || itemType === 'terminology');
				const clickableClass = isClickable ? ' outline-item clickable grow' : '';

				const title = (itemType === 'exercise' && exerciseNo > 0)
					? `${itemText('exercise')} ${exerciseNo}`
					: itemText(itemType);

				// Default status/lock placeholders for exercise rows (used by status engine)
				const statusHtml = (itemType === 'exercise' && exerciseNo > 0)
					? `<mark id="mark${exerciseNo}" class="markOutline pending">${ctx.term(311)}</mark>`
					: '';

				const lockHtml = (itemType === 'exercise' && exerciseNo > 0)
					? `<i id="lock${exerciseNo}" class="fa-solid fa-lock"></i>`
					: '';

				html += `
					<div class="grid-outline-item${clickableClass}" data-item="${itemType}" data-exercise="${exerciseNo}" data-outline-id="${outlineId}">
						<div class="outline-item-exercise">${title}</div>
						<div class="outline-item-status">${statusHtml}</div>
						<div class="outline-item-lock">${lockHtml}</div>
						<div class="outline-item-format"><span>${fmt}</span></div>
					</div>
				`;
			});

			html += `
					</div>
				</div>
			`;
		});

		html += `</div>`;
		return html;
	};

	// -----------------------------
	// Status UI engine (shared)
	// -----------------------------

	const dom = new Map();			// exercise_no -> { markEl, lockEl, itemEl, lockCellEl }
	const lastMaxStep = new Map();	// exercise_no -> max_step
	const unlockUntil = new Map();	// exercise_no -> tsMs
	let uiTickHandle = null;

	const getDom = (exerciseNo) => {
		const inDom = (el) => {
			if (!el) return false;
			try { return document.body.contains(el); } catch { return false; }
		};

		const existing = dom.get(exerciseNo);
		let didRefresh = false;

		// If we have a cached record but the nodes were not present yet (or got replaced), re-query.
		if (existing) {
			if (existing.markEl && !inDom(existing.markEl)) existing.markEl = null;
			if (existing.lockEl && !inDom(existing.lockEl)) existing.lockEl = null;
			if (existing.itemEl && !inDom(existing.itemEl)) existing.itemEl = null;
			if (existing.lockCellEl && !inDom(existing.lockCellEl)) existing.lockCellEl = null;

			const hadMissing = (!existing.markEl || !existing.lockEl || !existing.itemEl);
			if (!hadMissing) return existing;
		}

		const markEl = (existing && existing.markEl) ? existing.markEl : document.getElementById(`mark${exerciseNo}`);
		const lockEl = (existing && existing.lockEl) ? existing.lockEl : document.getElementById(`lock${exerciseNo}`);
		const itemEl = (existing && existing.itemEl)
			? existing.itemEl
			: document.querySelector(`.grid-outline-item[data-item="exercise"][data-exercise="${exerciseNo}"]`);
		const lockCellEl = (existing && existing.lockCellEl)
			? existing.lockCellEl
			: (itemEl ? itemEl.querySelector('.outline-item-lock') : null);

		let rec = existing;
		if (!rec) {
			rec = { markEl, lockEl, itemEl, lockCellEl };
			dom.set(exerciseNo, rec);
			return rec;
		}

		// Update cached record in-place.
		if (!rec.markEl && markEl) { rec.markEl = markEl; didRefresh = true; }
		if (!rec.lockEl && lockEl) { rec.lockEl = lockEl; didRefresh = true; }
		if (!rec.itemEl && itemEl) { rec.itemEl = itemEl; didRefresh = true; }
		if (!rec.lockCellEl && lockCellEl) { rec.lockCellEl = lockCellEl; didRefresh = true; }

		// If DOM references were missing and are now available, force next apply even if max_step didn't change.
		if (didRefresh) {
			lastMaxStep.delete(exerciseNo);
		}

		return rec;
	};

	const stopTick = () => {
		if (!uiTickHandle) return;
		clearTimeout(uiTickHandle);
		uiTickHandle = null;
	};

	const tick = () => {
		const now = Date.now();

		for (const [exNo, until] of unlockUntil.entries()) {
			const rec = getDom(exNo);

			if (!rec.lockEl || !document.body.contains(rec.lockEl)) {
				unlockUntil.delete(exNo);
				continue;
			}

			if (now < until) {
				if (rec.lockEl.classList.contains('fa-lock')) {
					rec.lockEl.classList.remove('fa-lock');
					rec.lockEl.classList.add('fa-lock-open');
				}
			} else {
				if (rec.lockEl.classList.contains('fa-lock-open')) {
					rec.lockEl.classList.remove('fa-lock-open');
					rec.lockEl.classList.add('fa-lock');
				}
				unlockUntil.delete(exNo);
			}
		}

		if (unlockUntil.size > 0) {
			uiTickHandle = window.setTimeout(tick, 250);
		} else {
			stopTick();
		}
	};

	const startTick = () => {
		if (uiTickHandle) return;
		uiTickHandle = window.setTimeout(tick, 250);
	};

	const initStatusUI = () => {
		// Lazy caching is sufficient; this hook exists for future use.
	};

	const applyStatusUpdate = (ctx, payload) => {
		if (!payload || typeof payload !== 'object') return;

		const exercises = Array.isArray(payload.exercises) ? payload.exercises : [];
		const locks = Array.isArray(payload.locks) ? payload.locks : [];

		exercises.forEach((row) => {
			const exNo = Number(row.exercise_no || 0);
			const maxStep = Number(row.max_step || 0);
			if (!Number.isFinite(exNo) || exNo <= 0) return;

			const rec = getDom(exNo);
			if (!rec.markEl) return;

			const prev = lastMaxStep.get(exNo);
			if (prev === maxStep) return;

			lastMaxStep.set(exNo, maxStep);

			if (maxStep === 100) {
				rec.markEl.classList.remove('pending', 'in-progress');
				rec.markEl.classList.add('completed');
				rec.markEl.textContent = ctx.term(395);

				if (rec.lockCellEl) rec.lockCellEl.innerHTML = '';
				return;
			}

			if (maxStep >= 10) {
				rec.markEl.classList.remove('pending', 'completed');
				rec.markEl.classList.add('in-progress');
				rec.markEl.textContent = ctx.term(312);

				if (rec.lockEl) {
					rec.lockEl.classList.remove('fa-lock');
					rec.lockEl.classList.add('fa-chevron-right');
				}
				return;
			}
		});

		locks.forEach((row) => {
			const exNo = Number(row.exercise_no || 0);
			const secondsLeft = Number(row.seconds_left || 0);
			if (!Number.isFinite(exNo) || exNo <= 0) return;
			if (!Number.isFinite(secondsLeft) || secondsLeft <= 0) return;

			const until = Date.now() + Math.floor(secondsLeft * 1000);
			const prev = unlockUntil.get(exNo) || 0;
			if (until > prev) unlockUntil.set(exNo, until);

			startTick();
		});
	};

	window.OutlineUI = Object.freeze({
		renderOutlineHtml,
		initStatusUI,
		applyStatusUpdate
	});
})();
