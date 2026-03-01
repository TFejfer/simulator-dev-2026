/* /var/www/common/assets/js/modules/rotator360.js
 *
 * Lightweight 360 image rotator with:
 *  - low/hi-res frame switching on zoom
 *  - mouse wheel zoom
 *  - drag rotate when not zoomed
 *  - drag pan when zoomed
 *  - hotspots + leftnav overlays (visible only when NOT zoomed)
 *
 * Depends on:
 *  - window.Sim360Bus (sim360-bus.js)
 *  - Existing DOM markup created by the page (stage/img/buttons)
 *
 * Usage:
 *   window.Rotator360.init({
 *     stageEl: document.querySelector('.rotator-stage'),
 *     imgEl: document.getElementById('rotImg'),
 *     leftNavEl: document.getElementById('rotatorLeftNav'),
 *     btnLeftEl: document.getElementById('btnLeft'),
 *     btnRightEl: document.getElementById('btnRight'),
 *     btnZoomEl: document.getElementById('btnZoom'),
 *     btnToggleHotspotsEl: document.getElementById('btnToggleHotspots'),
 *     frameNoEl: document.getElementById('frameNo'),
 *     frameMaxEl: document.getElementById('frameMax'),
 *     basePathLow: '/common/assets/imagerotator/img/action030000/',
 *     basePathHi: '/common/assets/imagerotator/img/action030000/highres/',
 *     frameCount: 60,
 *     hotspotsJsonUrl: '/common/assets/imagerotator/hotspots/theme_03.json',
 *   });
 */

(() => {
	'use strict';

	if (window.Rotator360) return; // prevent double-load
	if (!window.Sim360Bus) {
		console.error('[Rotator360] Sim360Bus is missing. Load sim360-bus.js first.');
		return;
	}

	// ---------------------------------------------------------------------
	// CSS injection (kept here to make the module self-contained)
	// You can move this into a static CSS file later.
	// ---------------------------------------------------------------------
	const injectCssOnce = () => {
		if (document.getElementById('rotator360_css')) return;

		const style = document.createElement('style');
		style.id = 'rotator360_css';
		style.textContent = `
			.rotator-stage{
				width:100%;
				aspect-ratio:16/9;
				background:#111;
				display:grid;
				place-items:center;
				position:relative;
				overflow:hidden; /* required for zoom/pan */
				touch-action:none; /* we handle pointer events */
			}

			.rotator-stage img{
				width:100%;
				height:100%;
				object-fit:contain;
				user-select:none;
				-webkit-user-drag:none;
				display:block;
			}

			.rotator-viewport{
				position:absolute;
				inset:0;
				transform-origin:50% 50%;
				will-change:transform;
				z-index:1;
			}

			.rotator-hotspots{
				position:absolute;
				inset:0;
				pointer-events:none;
				z-index:10;
			}

			.rotator-leftnav{
				position:absolute;
				left:10px;
				top:20px;
				width:120px;
				pointer-events:none;
				z-index:20;
			}
			.rotator-leftnav .list{
				display:flex;
				flex-direction:column;
				gap:6px;
				max-height:55vh;
				overflow:auto;
			}
			.rotator-leftnav .item{
				padding:8px 10px;
				background:#fff;
				border:1px solid #C0C0C0;
				border-radius:5px;
				opacity:.95;
				font-family:verdana,system-ui,sans-serif;
				font-size:12px;
				cursor:pointer;
				pointer-events:auto;
				white-space:nowrap;
				overflow:hidden;
				text-overflow:ellipsis;
			}

			.rotator-controls{
				position:absolute;
				left:50%;
				bottom:12px;
				transform:translateX(-50%);
				display:flex;
				gap:10px;
				z-index:1000;
				pointer-events:auto;
			}

			.rotator-ctrl-btn{
				width:42px;
				height:42px;
				display:grid;
				place-items:center;
				border-radius:999px;
				border:none;
				background:rgba(245,245,245,.95);
				color:rgba(0,0,0,.60);
				cursor:pointer;
				padding:0;
				user-select:none;
			}
			.rotator-ctrl-btn:hover{ opacity:.65; }
			.rotator-ctrl-btn:active{ transform:scale(.98); }
			.rotator-ctrl-btn[aria-pressed="false"]{ opacity:.65; }
			.rotator-ctrl-btn i{ font-size:16px; line-height:1; }

			.rotator-frame{ display:none; }
		`;
		document.head.appendChild(style);
	};

	// ---------------------------------------------------------------------
	// Helper: safe clamp
	// ---------------------------------------------------------------------
	const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

	// ---------------------------------------------------------------------
	// Main init
	// ---------------------------------------------------------------------
	const init = (cfg) => {
		injectCssOnce();

		const {
			stageEl,
			imgEl,
			leftNavEl,
			btnLeftEl,
			btnRightEl,
			btnZoomEl,
			btnToggleHotspotsEl,
			frameNoEl,
			frameMaxEl,
			basePathLow,
			basePathHi,
			frameCount = 60,
			hotspotsJsonUrl
		} = cfg || {};

		if (!stageEl || !imgEl) return;

		// Controls may be provided by the page OR created automatically.
		let btnLeft = btnLeftEl || null;
		let btnRight = btnRightEl || null;
		let btnZoom = btnZoomEl || null;
		let btnToggleHotspots = btnToggleHotspotsEl || null;

		// Hotspot JSON reference coordinate system (updated after JSON load)
		let refW = 960;
		let refH = 540;

		// Current frame index
		let idx = 0;

		// Zoom model:
		//  - zoomLevel: 0->1->2->0 (button)
		//  - wheelScale: continuous factor from mouse wheel
		let zoomLevel = 0;
		const zoomScales = [1, 2, 4];

		let wheelScale = 1;
		const wheelMin = 1;
		const wheelMax = 6;

		// Pan offsets applied when scale>1
		let panX = 0;
		let panY = 0;

		// Input modes
		let rotating = false;
		let lastX = 0;
		let accum = 0;
		const pxPerFrame = 6;

		let panning = false;
		let panStartX = 0;
		let panStartY = 0;
		let panBaseX = 0;
		let panBaseY = 0;

		// Hotspots per frame
		let frameHotspots = Array.from({ length: frameCount }, () => []);

		// Caches (low + hi)
		const cacheLow = new Array(frameCount);
		const cacheHi = new Array(frameCount);

		const pad2 = (n) => String(n).padStart(2, '0');
		const frameUrl = (i, hi) => `${hi ? basePathHi : basePathLow}anim_${pad2(i)}.png`;

		const preload = (i, hi) => {
			const cache = hi ? cacheHi : cacheLow;
			if (cache[i]) return cache[i];
			const im = new Image();
			im.decoding = 'async';
			im.loading = 'eager';
			im.src = frameUrl(i, hi);
			cache[i] = im;
			return im;
		};

		const getFrameSrc = (i, hi) => {
			const cache = hi ? cacheHi : cacheLow;
			return cache[i]?.src || frameUrl(i, hi);
		};

		// -------------------------------------------------------------
		// Viewport: wrap img + hotspots overlay so transform affects both
		// -------------------------------------------------------------
		let overlay = stageEl.querySelector('.rotator-hotspots');
		if (!overlay) {
			overlay = document.createElement('div');
			overlay.className = 'rotator-hotspots';
			stageEl.appendChild(overlay);
		}

		let viewport = stageEl.querySelector('.rotator-viewport');
		if (!viewport) {
			viewport = document.createElement('div');
			viewport.className = 'rotator-viewport';
			stageEl.appendChild(viewport);

			// Move img + overlay into viewport (preserve elements)
			viewport.appendChild(imgEl);
			viewport.appendChild(overlay);
		}

		// -------------------------------------------------------------
		// Controls overlay (bottom-center)
		// If controls are missing, create them inside the stage.
		// Also ensure controls are appended last so they render on top.
		// -------------------------------------------------------------
		const ensureControls = () => {
			let controls = stageEl.querySelector('.rotator-controls');
			const needAny = (!btnLeft || !btnRight || !btnZoom || !btnToggleHotspots);
			if (!controls && needAny) {
				controls = document.createElement('div');
				controls.className = 'rotator-controls';
				controls.innerHTML = `
					<button class="rotator-ctrl-btn" type="button" data-rotator-role="left" aria-label="Rotate left">
						<i class="fa-solid fa-arrow-rotate-right" aria-hidden="true"></i>
					</button>
					<button class="rotator-ctrl-btn" type="button" data-rotator-role="right" aria-label="Rotate right">
						<i class="fa-solid fa-arrow-rotate-left" aria-hidden="true"></i>
					</button>
					<button class="rotator-ctrl-btn" type="button" data-rotator-role="zoom" aria-label="Zoom in">
						<i class="fa-solid fa-plus" aria-hidden="true"></i>
					</button>
					<button class="rotator-ctrl-btn" type="button" data-rotator-role="toggle" aria-pressed="true" aria-label="Hide hotspots">
						<i class="fa-solid fa-location-dot" aria-hidden="true"></i>
					</button>
				`;
				stageEl.appendChild(controls);
			}

			if (!controls) return;

			// Defensive inline styles: avoid being hidden by page CSS.
			controls.style.position = 'absolute';
			controls.style.left = '50%';
			controls.style.bottom = '12px';
			controls.style.transform = 'translateX(-50%)';
			controls.style.display = 'flex';
			controls.style.gap = '10px';
			controls.style.zIndex = '1000';
			controls.style.pointerEvents = 'auto';

			// Bring to front (last child). If some implementation placed controls elsewhere, reattach.
			if (controls.parentElement !== stageEl) stageEl.appendChild(controls);
			else stageEl.appendChild(controls);

			// Prevent dblclick on controls from triggering stage dblclick zoom.
			controls.addEventListener('dblclick', (e) => {
				e.preventDefault();
				e.stopPropagation();
			}, { passive: false });

			const q = (sel) => controls.querySelector(sel);
			btnLeft = btnLeft || q('[data-iaa-role="left"], [data-rotator-role="left"]');
			btnRight = btnRight || q('[data-iaa-role="right"], [data-rotator-role="right"]');
			btnZoom = btnZoom || q('[data-iaa-role="zoom"], [data-rotator-role="zoom"]');
			btnToggleHotspots = btnToggleHotspots || q('[data-iaa-role="toggle"], [data-rotator-role="toggle"]');

			for (const btn of [btnLeft, btnRight, btnZoom, btnToggleHotspots]) {
				if (!btn) continue;
				btn.removeAttribute('title');
				btn.style.width = '42px';
				btn.style.height = '42px';
				btn.style.display = 'grid';
				btn.style.placeItems = 'center';
				btn.style.borderRadius = '999px';
				btn.style.border = 'none';
				btn.style.background = 'rgba(245,245,245,.95)';
				btn.style.color = 'rgba(0,0,0,.60)';
				btn.style.cursor = 'pointer';
				btn.style.padding = '0';
				btn.style.userSelect = 'none';
				btn.style.pointerEvents = 'auto';

				// Prevent button dblclick bubbling to stage (stage dblclick zoom).
				btn.addEventListener('dblclick', (e) => {
					e.preventDefault();
					e.stopPropagation();
				}, { passive: false });
			}

			// Swap rotation icons (visuals) to match desired layout.
			const setIcon = (btn, className) => {
				const icon = btn?.querySelector?.('i');
				if (icon) icon.className = className;
			};
			setIcon(btnLeft, 'fa-solid fa-arrow-rotate-right');
			setIcon(btnRight, 'fa-solid fa-arrow-rotate-left');
		};

		ensureControls();

		// -------------------------------------------------------------
		// Zoom/pan math
		// -------------------------------------------------------------
		const getCurrentScale = () => (zoomScales[zoomLevel] || 1) * wheelScale;

		const clampPan = () => {
			const s = getCurrentScale();
			const r = stageEl.getBoundingClientRect();
			const maxX = Math.max(0, (r.width * (s - 1)) / 2);
			const maxY = Math.max(0, (r.height * (s - 1)) / 2);
			panX = clamp(panX, -maxX, maxX);
			panY = clamp(panY, -maxY, maxY);
		};

		const applyTransform = () => {
			clampPan();
			const s = getCurrentScale();
			viewport.style.transform = `translate(${panX}px, ${panY}px) scale(${s})`;
		};

		// -------------------------------------------------------------
		// Hotspot visibility rules (your requirement)
		// Visible ONLY when not zoomed at all (zoomLevel===0 and wheelScale===1)
		// and Sim360Bus toggle is enabled.
		// -------------------------------------------------------------
		const allowHotspotsNow = () => {
			const enabled = window.Sim360Bus.getHotspotsVisible();
			const notZoomed = (zoomLevel === 0 && wheelScale === 1);
			return enabled && notZoomed;
		};

		const applyEffectiveHotspotsVisibility = () => {
			const show = allowHotspotsNow();
			overlay.style.display = show ? 'block' : 'none';
			if (leftNavEl) leftNavEl.style.display = show ? 'block' : 'none';
		};

		const clearOverlay = () => { overlay.innerHTML = ''; };

		// -------------------------------------------------------------
		// LeftNav rendering (theme-specific from JSON: data.leftnav)
		// -------------------------------------------------------------
		const renderLeftNav = (ids) => {
			if (!leftNavEl) return;
			leftNavEl.innerHTML = '';

			const wrap = document.createElement('div');
			wrap.className = 'list';

			for (const id of ids) {
				const item = document.createElement('div');
				item.className = 'item';
				item.textContent = id;

				// prevent pointerdown from starting rotate/pan
				item.addEventListener('pointerdown', (e) => e.stopPropagation(), { passive: true });

				item.addEventListener('click', (e) => {
					e.preventDefault();
					e.stopPropagation();
					window.Sim360Bus.emit('hotspot:click', { ci_id: id, frame: idx, source: 'leftnav' });
				});

				wrap.appendChild(item);
			}

			leftNavEl.appendChild(wrap);
		};

		// -------------------------------------------------------------
		// Hotspot coordinate mapping (object-fit: contain with letterboxing)
		// -------------------------------------------------------------
		const getImageDrawRect = () => {
			const r = stageEl.getBoundingClientRect();

			// Only used to compute aspect ratio; ref dims are used for mapping.
			const nw = imgEl.naturalWidth || refW;
			const nh = imgEl.naturalHeight || refH;

			const stageRatio = r.width / r.height;
			const imgRatio = nw / nh;

			let drawW, drawH, offX, offY;

			if (imgRatio > stageRatio) {
				drawW = r.width;
				drawH = r.width / imgRatio;
				offX = 0;
				offY = (r.height - drawH) / 2;
			} else {
				drawH = r.height;
				drawW = r.height * imgRatio;
				offY = 0;
				offX = (r.width - drawW) / 2;
			}

			return { offX, offY, drawW, drawH };
		};

		const scalePoint = (x, y) => {
			const d = getImageDrawRect();
			return {
				x: d.offX + (x / refW) * d.drawW,
				y: d.offY + (y / refH) * d.drawH
			};
		};

		// -------------------------------------------------------------
		// Render hotspots for current frame
		// -------------------------------------------------------------
		const renderHotspots = () => {
			clearOverlay();
			if (!allowHotspotsNow()) return;

			const list = frameHotspots[idx] || [];
			if (!list.length) return;

			const r = stageEl.getBoundingClientRect();
			if (r.width < 10 || r.height < 10) return;

			for (const h of list) {
				const p = scalePoint(h.x, h.y);

				const btn = document.createElement('button');
				btn.type = 'button';
				btn.className = 'rotator-hotspot';
				btn.textContent = h.id;
				btn.dataset.ciid = h.id;

				btn.style.cssText = `
					position:absolute;
					left:${p.x}px; top:${p.y}px;
					transform: translate(-50%, -50%);
					pointer-events:auto;
					padding:8px 10px;
					border-radius:5px;
					border:1px solid #C0C0C0;
					background:#fff;
					opacity:.75;
					color:#000;
					font-family:verdana,system-ui,sans-serif;
					font-size:12px;
					line-height:1.1;
					cursor:pointer;
					white-space:nowrap;
				`;

				btn.addEventListener('pointerdown', (e) => e.stopPropagation(), { passive: true });

				btn.addEventListener('click', (e) => {
					e.preventDefault();
					e.stopPropagation();
					window.Sim360Bus.emit('hotspot:click', { ci_id: h.id, frame: idx, source: 'hotspot' });
				});

				overlay.appendChild(btn);
			}
		};

		// -------------------------------------------------------------
		// Frame render + preload strategy
		// -------------------------------------------------------------
		let lastImgSrcAttr = null;

		const preloadHiWindow = () => {
			for (let k = -6; k <= 6; k++) {
				preload((idx + k + frameCount) % frameCount, true);
			}
		};

		const renderFrame = () => {
			const hi = (getCurrentScale() > 1);
			const nextSrc = getFrameSrc(idx, hi);
			if (lastImgSrcAttr !== nextSrc) {
				lastImgSrcAttr = nextSrc;
				imgEl.setAttribute('src', nextSrc);
			}

			if (frameNoEl) frameNoEl.textContent = String(idx);

			applyEffectiveHotspotsVisibility();
			if (allowHotspotsNow()) renderHotspots();
			else clearOverlay();
		};

		const stepFrame = (delta) => {
			idx = (idx + delta + frameCount) % frameCount;

			renderFrame();
			window.Sim360Bus.setFrame(idx);

			const hi = (getCurrentScale() > 1);
			preload((idx + 1) % frameCount, hi);
			preload((idx + 2) % frameCount, hi);
			preload((idx - 1 + frameCount) % frameCount, hi);
		};

		// -------------------------------------------------------------
		// Hotspots JSON loading
		// Expected JSON format:
		// {
		//   "ref": { "w":960, "h":540 },
		//   "leftnav": ["12O","11O","41O","10O","13O"],
		//   "hotspots": [ [ {id,x,y}, ... ], [ ... ], ... ]
		// }
		// -------------------------------------------------------------
		const fetchHotspotsJson = async () => {
			if (!hotspotsJsonUrl) return;

			const res = await fetch(hotspotsJsonUrl, { cache: 'force-cache' });
			if (!res.ok) {
				console.warn('[Rotator360] hotspots JSON fetch failed', res.status, hotspotsJsonUrl);
				return;
			}

			const data = await res.json();
			if (!data) return;

			// Leftnav (theme-specific)
			const nav = Array.isArray(data.leftnav) ? data.leftnav.map(String) : [];
			renderLeftNav(nav);

			// Ref system
			refW = Number(data?.ref?.w || 960);
			refH = Number(data?.ref?.h || 540);

			// Hotspots per frame
			if (!Array.isArray(data.hotspots)) {
				console.warn('[Rotator360] invalid hotspots JSON format', hotspotsJsonUrl);
				return;
			}

			frameHotspots = data.hotspots.slice(0, frameCount).map(a => Array.isArray(a) ? a : []);

			// Force initial draw without requiring rotation
			requestAnimationFrame(() => renderFrame());
		};

		// -------------------------------------------------------------
		// Zoom button (discrete levels)
		// -------------------------------------------------------------
		const cycleZoom = () => {
			zoomLevel = (zoomLevel + 1) % 3;

			if (zoomLevel > 0) preloadHiWindow();

			// Return to default view when zoom resets
			if (zoomLevel === 0) {
				wheelScale = 1;
				panX = 0;
				panY = 0;

				// Requirement: after zooming, returning to standard view must always show hotspots
				// even if the user previously pressed "hide".
				window.Sim360Bus.setHotspotsVisible(true);
			}

			applyTransform();
			renderFrame();
			syncZoomUi();
		};

		// -------------------------------------------------------------
		// Wheel zoom (continuous)
		// -------------------------------------------------------------
		stageEl.addEventListener('wheel', (e) => {
			e.preventDefault();

			const wasStandard = (zoomLevel === 0 && wheelScale === 1);

			const step = (e.deltaY > 0) ? 0.9 : 1.1;
			wheelScale = clamp(wheelScale * step, wheelMin, wheelMax);

			const isStandardNow = (zoomLevel === 0 && wheelScale === 1);
			if (!wasStandard && isStandardNow) {
				window.Sim360Bus.setHotspotsVisible(true);
			}

			if (getCurrentScale() > 1) preloadHiWindow();

			applyTransform();
			renderFrame();
		}, { passive: false });

		// -------------------------------------------------------------
		// Pointer input:
		// - scale == 1 -> rotate (drag left/right changes frames)
		// - scale > 1  -> pan (drag moves the viewport)
		// -------------------------------------------------------------
		const onDown = (e) => {
			// Do not start interactions on hotspot/leftnav
			if (e.target && e.target.closest && (
				e.target.closest('.rotator-hotspot') ||
				e.target.closest('.rotator-leftnav')
			)) return;

			const s = getCurrentScale();

			if (s > 1) {
				// PAN
				panning = true;
				panStartX = e.clientX;
				panStartY = e.clientY;
				panBaseX = panX;
				panBaseY = panY;
				stageEl.setPointerCapture?.(e.pointerId);
				e.preventDefault();
				return;
			}

			// ROTATE
			rotating = true;
			lastX = e.clientX;
			accum = 0;
			stageEl.setPointerCapture?.(e.pointerId);
			e.preventDefault();
		};

		const onMove = (e) => {
			if (panning) {
				panX = panBaseX + (e.clientX - panStartX);
				panY = panBaseY + (e.clientY - panStartY);
				applyTransform();
				e.preventDefault();
				return;
			}

			if (!rotating) return;

			const dx = e.clientX - lastX;
			lastX = e.clientX;
			accum += dx;

			while (accum >= pxPerFrame) { stepFrame(-1); accum -= pxPerFrame; }
			while (accum <= -pxPerFrame) { stepFrame(1); accum += pxPerFrame; }

			e.preventDefault();
		};

		const onUp = (e) => {
			if (panning) {
				panning = false;
				stageEl.releasePointerCapture?.(e.pointerId);
				e.preventDefault();
				return;
			}

			rotating = false;
			stageEl.releasePointerCapture?.(e.pointerId);
			e.preventDefault();
		};

		stageEl.addEventListener('pointerdown', onDown, { passive: false });
		stageEl.addEventListener('pointermove', onMove, { passive: false });
		stageEl.addEventListener('pointerup', onUp, { passive: false });
		stageEl.addEventListener('pointercancel', onUp, { passive: false });

		// Convenience: double click to cycle zoom
		stageEl.addEventListener('dblclick', (e) => {
			e.preventDefault();
			cycleZoom();
		}, { passive: false });

		// Buttons
		for (const btn of [btnLeft, btnRight, btnZoom, btnToggleHotspots]) {
			if (!btn) continue;
			btn.addEventListener('pointerdown', (e) => e.stopPropagation(), { passive: true });
		}
		// Swap left/right behavior (visuals stay the same)
		if (btnLeft) btnLeft.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); stepFrame(1); });
		if (btnRight) btnRight.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); stepFrame(-1); });
		if (btnZoom) btnZoom.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); cycleZoom(); });

		const syncZoomUi = () => {
			if (!btnZoom) return;
			const isMax = (zoomLevel >= 2);
			const iconEl = btnZoom.querySelector?.('i');
			if (iconEl) iconEl.className = isMax ? 'fa-solid fa-minus' : 'fa-solid fa-plus';
			const label = isMax ? 'Zoom out' : 'Zoom in';
			btnZoom.setAttribute('aria-label', label);
			btnZoom.removeAttribute('title');
		};

		// Toggle hotspots (only affects normal view; still updates text)
		const syncToggleUi = () => {
			if (!btnToggleHotspots) return;
			const v = window.Sim360Bus.getHotspotsVisible();
			btnToggleHotspots.setAttribute('aria-pressed', v ? 'true' : 'false');
			const label = v ? 'Hide hotspots' : 'Show hotspots';
			btnToggleHotspots.setAttribute('aria-label', label);
			btnToggleHotspots.removeAttribute('title');
		};

		syncToggleUi();
		syncZoomUi();

		if (btnToggleHotspots) {
			btnToggleHotspots.addEventListener('click', (e) => {
				e.preventDefault();
				window.Sim360Bus.setHotspotsVisible(!window.Sim360Bus.getHotspotsVisible());
			});
		}

		window.Sim360Bus.on('hotspots:visible', () => {
			syncToggleUi();
			renderFrame();
		});

		// Keep hotspot positions correct on resize
		window.addEventListener('resize', () => {
			if (allowHotspotsNow()) renderHotspots();
		});

		// When the image loads, hotspot mapping may change (aspect ratio)
		imgEl.addEventListener('load', () => renderFrame());

		// Init preload
		if (frameMaxEl) frameMaxEl.textContent = String(frameCount - 1);

		const first = preload(0, false);
		first.onload = () => renderFrame();
		first.onerror = () => console.warn('[Rotator360] failed to load', first.src);

		for (let i = 0; i < 12; i++) preload(i, false);

		const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 50));
		idle(() => { for (let i = 0; i < frameCount; i++) preload(i, false); });

		applyTransform();
		fetchHotspotsJson();
	};

	window.Rotator360 = { init };
})();