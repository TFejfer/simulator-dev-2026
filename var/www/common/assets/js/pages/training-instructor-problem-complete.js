/* /var/www/common/assets/js/pages/training-instructor-problem-complete.js */

/* global $, SimulatorPage */

(() => {
	'use strict';

	const debugEnabled = window.SIM_DEBUG?.enabled?.() || /[?&]debug(=|&|$)/i.test(String(window.location.search || ''));
	const dlog = (...args) => { if (debugEnabled) console.log('[complete]', ...args); };
	const dwarn = (...args) => { if (debugEnabled) console.warn('[complete]', ...args); };

	if (!document.getElementById('page-data')) {
		console.error('[complete] missing #page-data script tag');
		return;
	}
	if (typeof SimulatorPage === 'undefined') {
		console.error('[complete] SimulatorPage is undefined (core js not loaded?)');
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
	const COMPLETE_META = PAGE?.DATA?.COMPLETE_META || {};

	const exercise = {
		outline_id: Number(EXERCISE_META.outline_id || 0),
		exercise_no: Number(EXERCISE_META.exercise_no || 0),
		skill_id: Number(EXERCISE_META.skill_id || 0),
		format_id: Number(EXERCISE_META.format_id || EXERCISE_META.format_no || 0),
		step_no: Number(EXERCISE_META.step_no || 0),
	};

	const state = {
		navigating: false,
	};

	const isDiscoveryFormat = () => {
		return [1, 11].includes(exercise.format_id);
	};

	const setCompleteTexts = (ctx) => {
		const completeText = document.getElementById('completeText');
		if (completeText) {
			completeText.textContent = ctx.term(298, 'Exercise completed');
		}

		const goToResult = document.getElementById('goToResult');
		if (goToResult) {
			const label = isDiscoveryFormat()
				? ctx.term(306, 'Go to results')
				: ctx.term(568, 'Go to results');
			goToResult.textContent = label;
		}
	};

	const ensureLottiePlayerReady = async (player) => {
		if (!player) return false;
		if (typeof player.load === 'function') return true;
		if (!window.customElements?.whenDefined) return false;

		try {
			await window.customElements.whenDefined('lottie-player');
		} catch (e) {
			return false;
		}

		return typeof player.load === 'function';
	};

	const setLottie = async () => {
		const player = document.getElementById('lottie-player');
		if (!player) return;

		const raw = String(COMPLETE_META.lottie_code || '').trim();
		if (raw === '') {
			dwarn('missing lottie_code', COMPLETE_META);
			return;
		}

		let payload = raw;
		if (raw.startsWith('{') || raw.startsWith('[')) {
			try {
				payload = JSON.parse(raw);
			} catch (e) {
				dwarn('lottie json parse failed', e);
				return;
			}
		}

		const ready = await ensureLottiePlayerReady(player);
		if (typeof payload === 'string') {
			player.setAttribute('src', payload);
		} else if (ready) {
			player.load(payload);
		} else {
			dwarn('lottie player not ready');
			return;
		}
		player.setAttribute('background', 'transparent');
		player.setAttribute('speed', '1');
		player.setAttribute('autoplay', '');
	};

	const resolveResultTarget = () => {
		if (exercise.exercise_no > 0 && exercise.skill_id > 0) {
			return 'training-problem-instructor-result';
		}

		return 'training-instructor-outline';
	};

	const navigateToResult = () => {
		if (state.navigating) return;
		state.navigating = true;

		const target = resolveResultTarget();
		window.location.href = target;
	};

	SimulatorPage.run({
		id: 'training-instructor-problem-complete',

		blocking: async (ctx) => {
			$('#display_content').html(`
				<div class="grid-complete complete-box-style">
					<div>
						<lottie-player id="lottie-player" style="width: 300px; height: 300px;"></lottie-player>
					</div>
					<div style="text-align: center;">
						<h4 id="completeText"></h4>
						<br>
						<div id="goToResult" class="std-btn std-btn-enabled goto-result capitalize-all"></div>
					</div>
				</div>
			`);

			setCompleteTexts(ctx);
			await setLottie();
		},

		render: () => {
			if (window.TopBarEngine?.render) window.TopBarEngine.render();
		},

		bind: () => {
			$('#topBar').off('click.completeHome', '#topBarHome');
			$('#topBar').on('click.completeHome', '#topBarHome', function () {
				window.location.href = 'training-instructor-outline';
			});

			$(document).off('click.completeResult', '#goToResult');
			$(document).on('click.completeResult', '#goToResult', function (e) {
				e.preventDefault();
				navigateToResult();
			});
		},

		background: () => {
			dlog('delivery', DELIVERY_META);
			dlog('exercise', EXERCISE_META);
		}
	});

	if (debugEnabled && exercise.step_no > 0 && exercise.step_no < 100) {
		dwarn('exercise step is not complete', exercise.step_no);
	}
})();
