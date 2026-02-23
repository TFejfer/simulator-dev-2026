/* /var/www/common/assets/js/pages/training-instructor-problem-action.js */

/* global $, SimulatorPage, simulatorAjaxRequest */

(() => {
	'use strict';

	const debugEnabled = window.SIM_DEBUG?.enabled?.() || /[?&]debug(=|&|$)/i.test(String(window.location.search || ''));
	const dlog = (...args) => { if (debugEnabled) console.log('[action]', ...args); };
	const dwarn = (...args) => { if (debugEnabled) console.warn('[action]', ...args); };

	if (!document.getElementById('page-data')) {
		console.error('[action] missing #page-data script tag');
		return;
	}
	if (typeof SimulatorPage === 'undefined') {
		console.error('[action] SimulatorPage is undefined (core js not loaded?)');
		return;
	}

	const PAGE = (() => {
		try {
			return JSON.parse(document.getElementById('page-data')?.textContent || '{}');
		} catch {
			return {};
		}
	})();

	const DELIVERY_META = PAGE?.DATA?.DELIVERY_META || {};
	const EXERCISE_META = PAGE?.DATA?.EXERCISE_META || {};
	const ACTION_META = PAGE?.DATA?.ACTION_META || {};

	const action = {
		ci_id: String(ACTION_META.ci_id || ''),
		action_id: Number(ACTION_META.action_id || 0),
		outcome_id: Number(ACTION_META.outcome_id || 0),
		action_name: String(ACTION_META.action_name || ''),
		outcome_text: String(ACTION_META.outcome_text || ''),
		performing_term: String(ACTION_META.performing_term || 'Performing'),
		image_src: String(ACTION_META.image_src || ''),
		lottie_id: Number(ACTION_META.lottie_id || 0),
		lottie_code: String(ACTION_META.lottie_code || ''),
		is_solved: Boolean(ACTION_META.is_solved || false),
	};

	const parseLottiePayload = (code) => {
		const raw = String(code || '').trim();
		if (!raw) return null;
		if (raw.startsWith('{') || raw.startsWith('[')) {
			try {
				return JSON.parse(raw);
			} catch (e) {
				dwarn('lottie json parse failed', e);
				return null;
			}
		}
		return raw;
	};

	const exercise = {
		outline_id: Number(EXERCISE_META.outline_id || 0),
		step_no: Number(EXERCISE_META.step_no || 0),
		current_state: Number(EXERCISE_META.current_state || 0),
	};

	const state = {
		proceeding: false,
	};

	const buildProceedButton = () => {
		return `
			<div id="btn_proceed" class="proceed-button proceed-button-enabled" data-location="">
				<div class="icon-center">
					<i class="fa-light fa-arrow-right"></i>
				</div>
			</div>
		`;
	};

	const showError = (msg) => {
		const el = document.getElementById('problem_action_error');
		if (el) el.textContent = msg || 'Unexpected error.';
	};

	const proceedToNextStep = async () => {
		if (state.proceeding) return;
		state.proceeding = true;

		const btn = document.getElementById('btn_proceed');
		if (btn) {
			btn.classList.remove('proceed-button-enabled');
			btn.classList.add('proceed-button-disabled');
		}

		const payload = {
			outline_id: exercise.outline_id,
			step_no: exercise.step_no,
			current_state: exercise.current_state,
		};

		const res = await simulatorAjaxRequest('/ajax/log_next_step.php', 'POST', payload, { mode: 'dynamic' });
		if (!res || !res.ok) {
			state.proceeding = false;
			if (btn) {
				btn.classList.remove('proceed-button-disabled');
				btn.classList.add('proceed-button-enabled');
			}
			dwarn('log_next_step failed', res);
			showError(res?.error || 'Could not proceed to next step.');
			return;
		}

		const nextKey = String(res?.data?.page_key || '').trim();
		if (!nextKey) {
			showError('Next page was missing from response.');
			return;
		}

		window.location.href = nextKey;
	};

	const revealOutcome = () => {
		const reveal = document.getElementById('problem_action_reveal');
		if (reveal) reveal.classList.add('is-visible');
	};

	const activateLottieIfNeeded = () => {
		if (!action.is_solved) return;
		if (!action.lottie_code) return;

		const player = document.getElementById('lottie-player');
		const img = document.getElementById('problem_action_image');
		if (!player) return;

		const payload = parseLottiePayload(action.lottie_code);
		if (!payload) return;

		if (typeof payload === 'string') {
			player.setAttribute('src', payload);
		} else if (typeof player.load === 'function') {
			player.load(payload);
		}
		player.setAttribute('background', 'transparent');
		player.setAttribute('speed', '0.5');
		player.setAttribute('autoplay', '');
		player.setAttribute('loop', '');

		player.classList.remove('hide-action-visual-element');
		if (img) img.classList.add('hide-action-visual-element');
	};

	SimulatorPage.run({
		id: 'training-instructor-problem-action',

		blocking: async () => {
			$('#display_content').html(`
				<div class="main-content-outer">
					<div class="grid-perform-action action-box-style" id="problem_action_card">
						<div id="action_visual">
							<img class="responsive-action-visual-image" id="problem_action_image" alt="Action visual" />
							<lottie-player id="lottie-player" class="lottie300 hide-action-visual-element"></lottie-player>
						</div>
						<div id="action_text"></div>
						<div class="performing-action-progress-bar">
							<div class="performing-action-progress" id="problem_action_progress"></div>
						</div>
						<div class="hidden-action-visual" id="problem_action_reveal">
							<div class="outcome-text" id="problem_action_outcome"></div>
							<div id="problem_action_cta"></div>
							<div class="problem-action-error" id="problem_action_error"></div>
						</div>
					</div>
				</div>
			`);

			if (!action.action_id || !action.ci_id) {
				showError('No action was available to display.');
				return;
			}

			const title = action.action_name
				? `${action.performing_term}: ${action.action_name}`
				: `${action.performing_term}: #${action.action_id}`;

			const titleEl = document.getElementById('action_text');
			if (titleEl) titleEl.textContent = title;

			const imgEl = document.getElementById('problem_action_image');
			if (imgEl) {
				imgEl.src = action.image_src || '/common/assets/images/configimages/config_placeholder.png';
			}

			const outcomeEl = document.getElementById('problem_action_outcome');
			if (outcomeEl) outcomeEl.textContent = action.outcome_text || '';

			const ctaEl = document.getElementById('problem_action_cta');
			if (ctaEl) ctaEl.innerHTML = buildProceedButton();

			const progress = document.getElementById('problem_action_progress');
			if (progress) progress.classList.add('is-running');

			setTimeout(() => {
				revealOutcome();
				activateLottieIfNeeded();
			}, 6500);

			if (action.is_solved) {
				setTimeout(() => {
					proceedToNextStep();
				}, 15000);
			}
		},

		render: () => {
			if (window.TopBarEngine?.render) window.TopBarEngine.render();
		},

		bind: () => {
			$(document).off('click.actionProceed', '#btn_proceed');
			$(document).on('click.actionProceed', '#btn_proceed', function (e) {
				e.preventDefault();
				proceedToNextStep();
			});
		},

		background: () => {
			dlog('delivery', DELIVERY_META);
			dlog('exercise', EXERCISE_META);
			dlog('action', ACTION_META);
		}
	});
})();
