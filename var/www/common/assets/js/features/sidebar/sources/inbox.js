/* /common/assets/js/features/sidebar/sources/inbox.js
 * Inbox (simple message view).
 *
 * INPUTS (data + format):
 * - window.ProblemExerciseStaticContent / window.ProblemExerciseStateContent
 *   - .sources.inbox (object)
 *   - .subject (string)
 *   - .message (string)
 * - window.SIM_SHARED (object)
 *   - .menu_buttons (array) used by ProblemInfoSourceUtils.getMenuButtonLabel
 * - ctx: { delivery } resolved from #page-data
 *   - delivery.team_no/teamNo
 *   - delivery.server_now_unix/serverTimeNow
 *
 * REQUIRED LIBRARIES:
 * - jQuery (optional, not used directly here)
 *
 * REQUIRED EXTERNAL FUNCTIONS:
 * - window.ProblemInfoSources.register
 * - window.ProblemInfoSourceUtils.getMenuButtonLabel
 * - window.ProblemInfoSourceUtils.formatDate
 * - window.ProblemInfoSourceUtils.normalizeMs
 * - window.simulatorTerm (optional) for localization
 * - window.SIM_DEBUG (optional shared helper; /common/assets/js/core/sim-debug.js)
 *
 * DEBUG MODE:
 * - Enable by adding ?debug to the URL (or &debug).
 * - Logs validation of inputs and external functions.
 * - All debug entries are prefixed with [inbox.js].
 */

(() => {
	'use strict';

	if (!window.ProblemInfoSources?.register || !window.ProblemInfoSourceUtils) return;

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

	const dbg = (event, data = {}) => SIM_DEBUG.log('[inbox.js]', event, data);
	const debugCheck = (label, ok, details = {}) => SIM_DEBUG.check('[inbox.js]', label, ok, details);

	// Debug: verify external functions are available
	debugCheck('fn:ProblemInfoSources.register', !!window.ProblemInfoSources?.register);
	debugCheck('fn:ProblemInfoSourceUtils.getMenuButtonLabel', !!window.ProblemInfoSourceUtils?.getMenuButtonLabel);
	debugCheck('fn:ProblemInfoSourceUtils.formatDate', !!window.ProblemInfoSourceUtils?.formatDate);
	debugCheck('fn:ProblemInfoSourceUtils.normalizeMs', !!window.ProblemInfoSourceUtils?.normalizeMs);
	debugCheck('fn:simulatorTerm(optional)', typeof window.simulatorTerm === 'function' || window.simulatorTerm === undefined);

	const {
		getMenuButtonLabel,
		formatDate,
		normalizeMs
	} = window.ProblemInfoSourceUtils;

	const renderEmpty = (title, msg) => `
		<div class="simulator-info-source" data-code="inb">
			<div class="sidebar-title">${title}</div>
			<p style="opacity:0.7">${msg}</p>
		</div>
	`;

	const render = (ctx, source) => {
		dbg('render:start', {
			hasSource: !!source,
			hasDelivery: !!ctx?.delivery
		});

		const title = getMenuButtonLabel(window.SIM_SHARED?.menu_buttons || [], 'inb', 'Inbox');
		const toLabel = window.simulatorTerm ? window.simulatorTerm(509, 'common', 'To') : 'To';
		const teamLabel = window.simulatorTerm ? window.simulatorTerm(341, 'common', 'Team') : 'Team';
		const teamNo = ctx.delivery?.team_no || ctx.delivery?.teamNo || '';
		const teamText = teamNo ? `${teamLabel} ${teamNo}` : teamLabel;
		const tsMs = normalizeMs(ctx.delivery?.server_now_unix || ctx.delivery?.serverTimeNow) ?? Date.now();
		const subject = String(source?.subject || '').trim();
		const message = String(source?.message || '').trim();

		debugCheck('data:source.subject', typeof subject === 'string', { value: subject });
		debugCheck('data:source.message', typeof message === 'string', { value: message });
		debugCheck('data:delivery.server_time', typeof tsMs === 'number' && !Number.isNaN(tsMs), { value: tsMs });

		if (!subject && !message) {
			dbg('render:empty');
			return renderEmpty(title, 'Inbox content is not available yet.');
		}

		dbg('render:ok', { hasSubject: !!subject, hasMessage: !!message });

		return `
			<div class="simulator-info-source" data-code="inb">
				<div class="sidebar-title">${title}</div>
				<div class="inbox-container">
					<div class="inbox-message">
						<div class="inbox-header-container">
							<div class="inbox-header-to">${toLabel}: ${teamText}</div>
							<div class="inbox-header-date">${formatDate(tsMs)}</div>
						</div>
						<div class="inbox-subject">${subject || '<span style="opacity:0.7">No subject</span>'}</div>
						<div class="inbox-content">${message || '<p style="opacity:0.7">No inbox message available.</p>'}</div>
					</div>
				</div>
			</div>
		`;
	};

	window.ProblemInfoSources.register({
		code: 'inb',
		aliases: ['inbox'],
		kind: 'static',
		sourceKey: 'inbox',
		render
	});
})();
