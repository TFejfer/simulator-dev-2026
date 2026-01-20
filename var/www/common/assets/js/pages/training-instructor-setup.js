/* /var/www/common/assets/js/pages/training-instructor-setup.js
 *
 * Instructor-paced participant setup (new structure).
 *
 * This page uses SimulatorPage runtime:
 * - Common terms are ALWAYS loaded (blocking) before render.
 * - A loading spinner is shown automatically until first render completes.
 *
 * Page-specific responsibilities:
 * - Fetch setup status (DB truth) before first render (blocking)
 * - Render setup form using translated terms
 * - Handle register/cancel and poll for approval (dynamic)
 * - Start heartbeat + auto-logout (background)
 */

/* global $, SimulatorPage, simulatorAjaxRequest,
		  INSTRUCTOR_PACED_AUTO_TIMER_INTERVALS, instructorPacedActiveUserUpdate, simulatorLogout */

(() => {
	'use strict';

	// -----------------------------
	// Page-local state
	// -----------------------------

	const pageData = {
		delivery: {},
		supportedLanguages: [],
		logoutMinutes: 0,
		isPolling: false
	};

	// -----------------------------
	// Helpers (page-specific)
	// -----------------------------

	const getSupportedLanguages = (skills) => {
		const out = [
			{ code: 'en', text: 'English' },
			{ code: 'da', text: 'Dansk' },
			{ code: 'de', text: 'Deutsch' },
			{ code: 'nl', text: 'Dutch' },
			{ code: 'ja', text: '日本語' }
		];

		// KT PA stop
		if (skills.includes(12)) {
			out.sort((a, b) => a.text.localeCompare(b.text));
			return out;
		}

		// RISK stop
		if (skills.includes(2)) {
			out.sort((a, b) => a.text.localeCompare(b.text));
			return out;
		}

		// PROBLEM extra
		out.push({ code: 'cz', text: 'Czech' });
		out.push({ code: 'es', text: 'Español' });

		out.sort((a, b) => a.text.localeCompare(b.text));
		return out;
	};

	const instructorPacedDetectUserBrowser = () => {
		// Prefer modern UA-CH when available
		if (navigator.userAgentData && Array.isArray(navigator.userAgentData.brands)) {
			const brands = navigator.userAgentData.brands.map((b) => b.brand);

			if (brands.includes('Google Chrome')) return 'Google Chrome';
			if (brands.includes('Firefox')) return 'Firefox';
			if (brands.includes('Microsoft Edge')) return 'Microsoft Edge';
			if (brands.includes('Safari')) return 'Safari';
		}

		// Fallback to userAgent sniffing
		const ua = navigator.userAgent || '';
		if (ua.includes('Edg')) return 'Microsoft Edge';
		if (ua.includes('Firefox')) return 'Firefox';
		if (ua.includes('Opera') || ua.includes('OPR')) return 'Opera';
		if (ua.includes('Chrome')) return 'Google Chrome';
		if (ua.includes('Safari')) return 'Safari';

		return 'other';
	};

	const instructorPacedDetectOS = () => {
		const ua = navigator.userAgent || '';
		const platform = navigator.platform || '';

		const macosPlatforms = ['Macintosh', 'MacIntel', 'MacPPC', 'Mac68K'];
		const windowsPlatforms = ['Win32', 'Win64', 'Windows', 'WinCE'];
		const iosPlatforms = ['iPhone', 'iPad', 'iPod'];

		if (macosPlatforms.includes(platform) || iosPlatforms.includes(platform)) return 'Apple';
		if (windowsPlatforms.includes(platform)) return 'Windows';
		if (/Android/i.test(ua)) return 'Android';
		if (/Ubuntu/i.test(platform)) return 'Ubuntu';
		if (/Linux/i.test(platform)) return 'Linux';

		return 'other';
	};

	// -----------------------------
	// HTML render helpers
	// -----------------------------

	const renderSetupHtml = (ctx, team, teamCount, supportedLanguages) => {
		const tt = (id, fallback = '') => ctx.term(id, fallback);

		let output = `
			<div class="grid-setup setup-box-style">
				<div>
					<div class="setup-label"><i class="fa-duotone fa-circle-1"></i> ${tt(268)}</div>
					<select name="setupLanguageCode" class="setup-select">`;

		if (Array.isArray(supportedLanguages) && supportedLanguages.length) {
			supportedLanguages.forEach((row) => {
				output += `<option value="${row.code}">${row.text}</option>`;
			});
		}

		output += `
					</select>
				</div>

				<div>
					<div class="setup-label"><i class="fa-duotone fa-circle-2"></i> ${tt(540)}</div>
					<div id="setupFirstName" class="setup-input" contenteditable></div>
				</div>

				<div>
					<div class="setup-label"><i class="fa-duotone fa-circle-3"></i> ${tt(341)}</div>
					<select name="setupJoinTeam" class="setup-select">
						<option value="0">- ${tt(593)} -</option>`;

		const maxTeams = Number(teamCount) || 0;
		for (let i = 1; i <= maxTeams; i++) {
			output += `<option value="${i}">${tt(341)} ${i}</option>`;
		}

		const cancelBtn = ` <button type="button" class="btn btn-secondary" id="setupButtonCancel">${tt(339)}</button>`;

		output += `
					</select>
				</div>

				<div>
					<button type="button" class="btn btn-primary" id="setupButtonRegister">${tt(537)}</button>
					${Number(team) > 0 ? cancelBtn : ''}
				</div>

				<div id="setupSubmitText"></div>
				<p id="feedback_msg">${tt(543)}</p>
				<p>${tt(541)}</p>
			</div>`;

		return output;
	};

	const updateTopBar = (ctx) => {
		$('#topBarArea3').text(ctx.term(539));
	};

	const renderSetup = (ctx) => {
		$('#display_content').html(
			renderSetupHtml(
				ctx,
				pageData.delivery.team,
				pageData.delivery.team_count,
				pageData.supportedLanguages
			)
		);

		// Pre-fill setup form (DB truth has already been applied in blocking init)
		$("select[name='setupLanguageCode']").val(pageData.delivery.languageCode);
		$('#setupFirstName').text(pageData.delivery.firstName);

		// If there is an outstanding request, preload that; otherwise preload current team
		const joinVal = Number(pageData.delivery.joinTeam || 0) > 0
			? Number(pageData.delivery.joinTeam)
			: Number(pageData.delivery.team || 0);

		$("select[name='setupJoinTeam']").val(joinVal);
	};

	// -----------------------------
	// Setup status (DB truth)
	// -----------------------------

	const loadSetupStatus = async (ctx) => {
		const res = await simulatorAjaxRequest('/ajax/setup_status.php', 'POST', {}, { mode: 'dynamic' });

		if (!res || !res.ok) {
			ctx.handleAuthFailure(res);
			return null;
		}

		return res.data || null;
	};

	const applySetupStatusToPageData = (st) => {
		if (!st || typeof st !== 'object') return;

		if (st.language_code) pageData.delivery.languageCode = st.language_code;
		if (st.first_name) pageData.delivery.firstName = st.first_name;

		if (Number.isFinite(Number(st.team_no))) pageData.delivery.team = Number(st.team_no);

		const req = Number(st.requested_team_no || 0);
		pageData.delivery.joinTeam = req > 0 ? req : 0;

		pageData.delivery.pendingApproval = Boolean(st.pending_approval);
	};

	// -----------------------------
	// Polling + registration
	// -----------------------------

	const pollForApproval = async (ctx) => {
		if (pageData.isPolling) return;
		pageData.isPolling = true;

		try {
			while (true) {
				const res = await simulatorAjaxRequest('/ajax/setup_status.php', 'POST', {}, { mode: 'dynamic' });

				if (!res || !res.ok) {
					ctx.handleAuthFailure(res);
					// Soft failure → retry
				} else {
					const status = res.data || {};
					pageData.delivery.pendingApproval = Boolean(status.pending_approval);
					pageData.delivery.joinTeam = Number(status.requested_team_no || 0);

					if (status.can_proceed) {
						window.location.href = 'training-instructor-outline';
						return;
					}
				}

				await ctx.sleep(5000);
			}
		} finally {
			pageData.isPolling = false;
		}
	};

	const userDataInsert = async (ctx, fData) => {
		const browser = instructorPacedDetectUserBrowser();
		const OS = instructorPacedDetectOS();
		const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';

		const params = {
			setupLanguageCode: fData.setupLanguageCode,
			setupFirstName: fData.setupFirstName,
			setupJoinTeam: fData.setupJoinTeam,
			browser,
			OS,
			timezone
		};

		const res = await simulatorAjaxRequest('/ajax/setup_register_user.php', 'POST', params, { mode: 'dynamic' });

		if (!res || !res.ok) {
			if (ctx.debug) ctx.dlog('setup_register_user failed', res);
			ctx.handleAuthFailure(res);
			throw new Error(res?.error || `http_${res?.status || 0}`);
		}

		return res.data;
	};

	const registerUser = async (ctx, formData) => {
		await userDataInsert(ctx, formData);
		pollForApproval(ctx);
	};

	const handlePageReloadState = (ctx) => {
		// If there is a pending approval, lock the form and start polling
		if (pageData.delivery.pendingApproval) {
			$('#setupButtonRegister').prop('disabled', true).text(ctx.term(588) + '...');
			$("select[name='setupLanguageCode']").prop('disabled', true);
			$('#setupFirstName').prop('contenteditable', false);
			$("select[name='setupJoinTeam']").prop('disabled', true);
			$('#feedback_msg').text(ctx.term(543));
			pollForApproval(ctx);
		}
	};

	// -----------------------------
	// Background tasks
	// -----------------------------

	const startHeartbeat = () => {
		setTimeout(() => {
			try {
				instructorPacedActiveUserUpdate();
			} catch {}
		}, INSTRUCTOR_PACED_AUTO_TIMER_INTERVALS.VERYLONG);
	};

	const startAutoLogoutTimer = () => {
		const tick = () => {
			pageData.logoutMinutes += 1;
			if (pageData.logoutMinutes > 20) {
				window.location.href = 'logout';
				return;
			}
			setTimeout(tick, 60000);
		};
		setTimeout(tick, 60000);
	};

	// -----------------------------
	// Events
	// -----------------------------

	const bindEvents = (ctx) => {
		// Logout (topbar)
		$('#topBar').on('click', '#logoutSim', function () {
			if (typeof simulatorLogout === 'function') {
				try {
					simulatorLogout();
					return;
				} catch (e) {
					if (ctx.debug) ctx.dlog('simulatorLogout failed, falling back to redirect', e);
				}
			}
			window.location.href = 'logout';
		});

		// Register
		$(document).on('click', '#setupButtonRegister', function () {
			const formData = {
				setupLanguageCode: $('select[name="setupLanguageCode"] option:selected').val(),
				setupFirstName: $('#setupFirstName').text(),
				setupJoinTeam: $('select[name="setupJoinTeam"] option:selected').val()
			};

			const dataCheck = {
				languageCode: formData.setupLanguageCode !== '',
				firstName: (formData.setupFirstName || '').trim() !== '',
				joinTeam: Number(formData.setupJoinTeam) >= 1
			};

			if (!dataCheck.firstName) $('#setupSubmitText').text(ctx.term(586));
			if (!dataCheck.joinTeam) $('#setupSubmitText').text(ctx.term(587));

			if (dataCheck.languageCode && dataCheck.firstName && dataCheck.joinTeam) {
				$("select[name='setupLanguageCode']").prop('disabled', true);
				$('#setupFirstName').prop('contenteditable', false);
				$("select[name='setupJoinTeam']").prop('disabled', true);
				$('#setupButtonRegister').prop('disabled', true).text(ctx.term(588) + '...');
				$('#feedback_msg').text(ctx.term(543));

				registerUser(ctx, formData).catch((e) => {
					if (ctx.debug) ctx.dlog('registerUser failed', e);
					$('#setupSubmitText').text('Could not register. Please reload.');
				});
			}
		});

		// Cancel (request "no team change" and go on)
		$(document).on('click', '#setupButtonCancel', function () {
			const formData = {
				setupLanguageCode: pageData.delivery.languageCode,
				setupFirstName: pageData.delivery.firstName,
				setupJoinTeam: 0
			};

			registerUser(ctx, formData).catch(() => {});
			window.location.href = 'delivery-1-outline';
		});

		// Language change (rerender to update translated UI labels)
		$(document).on('change', 'select[name="setupLanguageCode"]', function () {
			const setupLanguageCode = $('select[name="setupLanguageCode"] option:selected').val();
			const setupFirstName = $('#setupFirstName').text();
			const setupJoinTeam = $('select[name="setupJoinTeam"] option:selected').val();

			renderSetup(ctx);

			$("select[name='setupLanguageCode']").val(setupLanguageCode);
			$('#setupFirstName').text(setupFirstName);
			$("select[name='setupJoinTeam']").val(setupJoinTeam);

			updateTopBar(ctx);
		});
	};

	// -----------------------------
	// SimulatorPage wiring
	// -----------------------------

	SimulatorPage.run({
		id: 'training-instructor-setup',
		
		features: {
			requires_team: false
		},

		// Awaited before first render (common terms are already loaded here)
		blocking: async (ctx) => {
			// Delivery from page-data is already normalized by SimulatorPage
			pageData.delivery = ctx.delivery;

			// Hard contract: must come from delivery_meta
			if (!Number.isFinite(Number(pageData.delivery.team_count))) {
				throw new Error('Missing delivery_meta.team_count in page payload');
			}

			// Fetch DB truth before render (prefill)
			const st = await loadSetupStatus(ctx);
			applySetupStatusToPageData(st);

			// Supported languages depend on skills
			pageData.supportedLanguages = getSupportedLanguages(pageData.delivery.skills || []);

			if (ctx.debug) {
				ctx.dlog('PAGE', ctx.page);
				ctx.dlog('DELIVERY', pageData.delivery);
				ctx.dlog('STATUS', st);
			}
		},

		// First render (fast, sync)
		render: (ctx) => {
			updateTopBar(ctx);
			renderSetup(ctx);
			handlePageReloadState(ctx);
		},

		// Non-blocking background tasks
		background: (ctx) => {
			startHeartbeat();
			startAutoLogoutTimer();
		},

		// DOM events
		bind: (ctx) => {
			bindEvents(ctx);
		}
	});
})();