/* /common/assets/js/features/sidebar/sources/performance.js
 * Performance (PES/PEA video panels).
 *
 * INPUTS (data + format):
 * - window.ProblemExerciseStateContent
 *   - .sources.performance (object)
 *   - .pes_video_id
 *   - .pea_video_id / .pea_video_id_actual
 * - window.SIM_SHARED (object) may include: menu_buttons
 * - window.SimVideo.buildVideoHtml (optional) for video rendering
 * - window.simulatorTerm(id, scope, fallback) (optional) for localization
 * - ctx: { delivery, exercise } resolved from #page-data
 *
 * REQUIRED LIBRARIES:
 * - jQuery (window.jQuery)
 *
 * REQUIRED EXTERNAL FUNCTIONS:
 * - window.ProblemInfoSources.register
 * - window.ProblemInfoSourceUtils.getMenuButtonLabel
 * - window.SIM_DEBUG (optional shared helper; /common/assets/js/core/sim-debug.js)
 *
 * DEBUG MODE:
 * - Enable by adding ?debug to the URL (or &debug).
 * - Logs validation of inputs, libraries, functions, and pipeline steps.
 * - All debug entries are prefixed with [performance.js].
 */

(() => {
	'use strict';

	if (!window.ProblemInfoSources?.register || !window.ProblemInfoSourceUtils) return;

	const { getMenuButtonLabel } = window.ProblemInfoSourceUtils;

	const esc = (s) => String(s ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');

	const term = (id, fallback = '') => (
		typeof window.simulatorTerm === 'function' ? window.simulatorTerm(id, 'common', fallback) : fallback
	);

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

	const dbg = (event, data = {}) => SIM_DEBUG.log('[performance.js]', event, data);
	const debugCheck = (label, ok, details = {}) => SIM_DEBUG.check('[performance.js]', label, ok, details);

	// Debug: verify libraries and external functions are available
	debugCheck('lib:jQuery', !!window.jQuery);
	debugCheck('fn:ProblemInfoSources.register', !!window.ProblemInfoSources?.register);
	debugCheck('fn:ProblemInfoSourceUtils.getMenuButtonLabel', !!window.ProblemInfoSourceUtils?.getMenuButtonLabel);
	debugCheck('fn:SimVideo.buildVideoHtml(optional)', typeof window.SimVideo?.buildVideoHtml === 'function' || window.SimVideo === undefined);
	debugCheck('fn:simulatorTerm(optional)', typeof window.simulatorTerm === 'function' || window.simulatorTerm === undefined);

	const renderEmpty = (title) => `
		<div class="simulator-info-source" data-code="per">
			<div class="sidebar-title">${esc(title)}</div>
			<p style="opacity:0.7">Performance content is not available yet.</p>
		</div>
	`;

	const buildVideo = (code, videoId, lang) => {
		if (!videoId) return '';
		if (window.SimVideo?.buildVideoHtml) {
			return window.SimVideo.buildVideoHtml(code, videoId, lang, false);
		}
		return `<p>Video: ${esc(videoId)}</p>`;
	};

	const render = (ctx, source) => {
		const title = getMenuButtonLabel(window.SIM_SHARED?.menu_buttons || [], 'per', 'Performance');
		const hasContent = source && typeof source === 'object' && Object.keys(source).length;
		dbg('render:start', { hasContent, hasPes: !!source?.pes_video_id, hasPea: !!(source?.pea_video_id_actual || source?.pea_video_id) });
		if (!hasContent) return renderEmpty(title);

		const lang = ctx?.delivery?.language_code || ctx?.delivery?.languageCode || 'en';
		const step = Number(ctx?.exercise?.step || ctx?.exercise?.current_step || 0);

		const pesId = source.pes_video_id || '';
		let peaId = source.pea_video_id_actual || source.pea_video_id || '';
		if (step === 80 && pesId) {
			peaId = pesId;
		}

		const pesVisible = !!pesId;
		const peaVisible = !!peaId;

		const pesHtml = pesVisible ? buildVideo('pes', pesId, lang) : `<p>${esc(term(25, 'Not available'))}</p>`;
		const peaHtml = peaVisible ? buildVideo('pea', peaId, lang) : `<p>${esc(term(25, 'Not available'))}</p>`;

		return `
			<div class="simulator-info-source" data-code="per">
				<div class="reload-text">
					${esc(term(129, ''))} <span class="reload link-text">${esc(term(128, ''))}</span>
				</div>
				<div class="grid-performance">
					<div class="pes-header sidebar-title">${esc(term(18, 'Should'))}</div>
					<div class="pea-header sidebar-title">${esc(term(19, 'Actual'))}</div>
					<div class="pes-content ${pesVisible ? '' : 'not-available'}" data-identifier="pes">
						${pesHtml}
					</div>
					<div class="pea-content ${peaVisible ? '' : 'not-available'}" data-identifier="pea">
						${peaHtml}
					</div>
				</div>
				<br>
				<div class="playback-container">
					<div>${esc(term(64, 'Speed'))}: 0.5</div>
					<div>${esc(term(64, 'Speed'))}: 1 (${esc(term(65, 'Normal'))})</div>
					<div>${esc(term(64, 'Speed'))}: 2</div>
					<div>
						<button type="button" class="performanceStartBtn std-btn std-btn-enabled" value="0.5">
							<span aria-label="${esc(term(57, 'Play'))} / ${esc(term(58, 'Pause'))}" data-balloon-pos="up" data-balloon-length="medium">
								<i class="fa-solid fa-play"></i>
							</span>
						</button>
					</div>
					<div>
						<button type="button" class="performanceStartBtn std-btn std-btn-enabled" value="1">
							<span aria-label="${esc(term(57, 'Play'))} / ${esc(term(58, 'Pause'))}" data-balloon-pos="up" data-balloon-length="medium">
								<i class="fa-solid fa-play"></i>
							</span>
						</button>
					</div>
					<div>
						<button type="button" class="performanceStartBtn std-btn std-btn-enabled" value="2">
							<span aria-label="${esc(term(57, 'Play'))} / ${esc(term(58, 'Pause'))}" data-balloon-pos="up" data-balloon-length="medium">
								<i class="fa-solid fa-play"></i>
							</span>
						</button>
					</div>
				</div>
			</div>
		`;
	};

	const bind = ($root) => {
		const $ = window.jQuery;
		dbg('bind:start', { hasJquery: !!$ });
		if (!$) return;

		// Reload link
		$root.off('click.perfReload', '.reload').on('click.perfReload', '.reload', (e) => {
			e.preventDefault();
			window.location.reload();
		});

		const getVideoEl = (id) => $root.find(`#${id}Video`).get(0);
		const toggleButtons = (clicked, toPause) => {
			$root.find('.performancePauseBtn').each((_, btn) => {
				$(btn).removeClass('performancePauseBtn').addClass('performanceStartBtn');
				$(btn).find('i').removeClass('fa-pause').addClass('fa-play');
			});
			if (clicked) {
				const $btn = $(clicked);
				$btn.toggleClass('performanceStartBtn', !toPause).toggleClass('performancePauseBtn', toPause);
				$btn.find('i').toggleClass('fa-play', !toPause).toggleClass('fa-pause', toPause);
			}
		};

		$root.off('click.perfStart', '.performanceStartBtn').on('click.perfStart', '.performanceStartBtn', function (e) {
			e.preventDefault();
			const speed = Number($(this).attr('value')) || 1;
			['pes', 'pea'].forEach((code) => {
				const el = getVideoEl(code);
				if (el) {
					el.playbackRate = speed;
					if (typeof el.play === 'function') el.play();
				}
			});
			toggleButtons(this, true);
		});

		$root.off('click.perfPause', '.performancePauseBtn').on('click.perfPause', '.performancePauseBtn', function (e) {
			e.preventDefault();
			['pes', 'pea'].forEach((code) => {
				const el = getVideoEl(code);
				if (el && typeof el.pause === 'function') el.pause();
			});
			toggleButtons(this, false);
		});
	};

	window.ProblemInfoSources.register({
		code: 'per',
		aliases: ['performance'],
		kind: 'state',
		sourceKey: 'performance',
		render,
		bind
	});
})();
