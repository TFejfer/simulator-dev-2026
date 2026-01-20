/* /var/www/common/assets/js/polling/polling-start.js
 *
 * Auto-start Polling using CTX_KEY from #page-data.
 * Debug can be enabled via URL parameter:
 * - ?poll_debug=1      => trace + overlay
 * - ?poll_debug=info   => info (no overlay)
 * - ?poll_debug=trace  => trace (no overlay)
 * - ?poll_debug=wire   => wire (no overlay)
 */

(() => {
	'use strict';

	const readPageData = () => {
		const el = document.getElementById('page-data');
		if (!el) return null;

		const raw = el.textContent || el.innerText || '';
		if (!raw) return null;

		try {
			const obj = JSON.parse(raw);
			return obj && typeof obj === 'object' ? obj : null;
		} catch {
			return null;
		}
	};

	const getQueryParam = (name) => {
		try {
			const u = new URL(window.location.href);
			return u.searchParams.get(name);
		} catch {
			return null;
		}
	};

	const pageData = readPageData();
	const solution = String(pageData?.CTX_KEY || '');

	if (!solution) return;

	// Debug settings
	const pdDebug = Boolean(pageData?.DEBUG);
	const q = getQueryParam('poll_debug');

	let debugEnabled = false;
	let debugLevel = 'trace';
	let debugOverlay = false;

	if (q !== null) {
		// Any poll_debug param enables debug
		debugEnabled = true;

		if (q === '1' || q === 'true' || q === '') {
			debugLevel = 'trace';
			debugOverlay = true;
		} else {
			debugLevel = String(q).toLowerCase();
			debugOverlay = false;
		}
	} else if (pdDebug) {
		debugEnabled = true;
		debugLevel = 'trace';
		debugOverlay = false;
	}

	if (debugEnabled && window.PollingDebug) {
		window.PollingDebug.enable({ level: debugLevel, overlay: debugOverlay, max: 300 });
	}

	const protocolFor = (s) => {
		// Outline (and legacy alias)
		if (s === 'training-instructor-outline' || s === 'training-1-outline') {
			return window.PollingProtocolTrainingInstructor;
		}

		// TEMP: if other training pages use the same protocol, keep this.
		// If they use different endpoints/response shapes, add protocols here.
		return window.PollingProtocolTrainingInstructor;
	};

	const protocol = protocolFor(solution);

	if (!window.Polling || !window.PollingRoutes || !protocol) {
		window.PollingDebug?.log('start.missing_deps', {
			hasPolling: !!window.Polling,
			hasRoutes: !!window.PollingRoutes,
			hasProtocol: !!protocol,
			solution
		}, 'info');

		console.error('[Polling] Missing engine/routes/protocol.', { solution });
		return;
	}

	window.Polling.start({
		solution,
		resolveUrl: window.PollingRoutes.resolveUrl,
		protocol,
		delivery: window.delivery || null,
		exercise: window.exercise || null,
		simulator: window.simulator || null,
		lastId: 0,
		debug: debugEnabled
	});
})();