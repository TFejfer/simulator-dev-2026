/* /common/assets/js/features/sidebar/sources/process.js
 * Process (diagram + optional video).
 *
 * INPUTS (data + format):
 * - window.ProblemExerciseStaticContent / window.ProblemExerciseStateContent
 *   - .sources.process (object)
 *   - .sources.process.pro_diagram_link / diagram_link (string, optional)
 *   - .sources.process.pro_video_id / video_id (string, optional)
 * - window.SIM_SHARED (object) may mirror the same structures
 * - ctx: { delivery, exercise } resolved from #page-data
 *
 * REQUIRED EXTERNAL FUNCTIONS:
 * - window.ProblemInfoSources.register
 * - window.ProblemInfoSourceUtils.getMenuButtonLabel
 * - window.SimVideo.buildVideoHtml (optional)
 * - window.SIM_DEBUG (optional shared helper; /common/assets/js/core/sim-debug.js)
 *
 * DEBUG MODE:
 * - Enable by adding ?debug to the URL (or &debug).
 * - Logs validation of inputs, libraries, functions, and pipeline steps.
 * - All debug entries are prefixed with [process.js].
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

	const dbg = (event, data = {}) => SIM_DEBUG.log('[process.js]', event, data);
	const debugCheck = (label, ok, details = {}) => SIM_DEBUG.check('[process.js]', label, ok, details);

	// Debug: verify libraries and external functions are available
	debugCheck('fn:ProblemInfoSources.register', !!window.ProblemInfoSources?.register);
	debugCheck('fn:ProblemInfoSourceUtils.getMenuButtonLabel', !!window.ProblemInfoSourceUtils?.getMenuButtonLabel);
	debugCheck('fn:SimVideo.buildVideoHtml(optional)', !!window.SimVideo?.buildVideoHtml || window.SimVideo === undefined);

	const renderEmpty = (title) => `
		<div class="simulator-info-source" data-code="pro">
			<div class="sidebar-title">${title}</div>
			<p style="opacity:0.7">Process content is not available yet.</p>
		</div>
	`;

	const render = (ctx, source) => {
		const title = getMenuButtonLabel(window.SIM_SHARED?.menu_buttons || [], 'pro', 'Process');
		const hasContent = source && Object.keys(source).length;
		debugCheck('data:source.process', !!source && typeof source === 'object');
		if (!hasContent) return renderEmpty(title);

		const diagram = source?.pro_diagram_link || source?.diagram_link || '';
		const videoId = source?.pro_video_id || source?.video_id || '';
		const lang = ctx.delivery?.language_code || ctx.delivery?.languageCode || 'en';
		dbg('render:inputs', { hasContent, hasDiagram: !!diagram, hasVideo: !!videoId, lang });

		let body = '';
		if (videoId) {
			const videoHtml = (window.SimVideo?.buildVideoHtml && window.SimVideo.buildVideoHtml('pro', videoId, lang, true))
				|| `<p>Video: ${videoId}</p>`;
			debugCheck('render:videoHtml', !!videoHtml, { videoId });
			if (videoHtml) body += `
				<div class="process-video-outer">
					<div class="process-video">
						${videoHtml}
					</div>
				</div>`;
		}
		if (diagram) body += `
			<div class="process-diagram">
				<img src="${diagram}" alt="Process diagram" alt="" class="size-full process-diagram-img" />
			</div>
		`;
		if (!body) body = '<p style="opacity:0.7">No process assets found.</p>';

		return `
			<div class="simulator-info-source" data-code="pro">
				<div class="sidebar-title">${title}</div>
				<div class="reload-text">
					${esc(term(129, ''))} <span class="reload link-text">${esc(term(128, ''))}</span>
				</div>
				${body}
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
	};

	window.ProblemInfoSources.register({
		code: 'pro',
		aliases: ['process'],
		kind: 'static',
		sourceKey: 'process',
		render,
		bind
	});
})();