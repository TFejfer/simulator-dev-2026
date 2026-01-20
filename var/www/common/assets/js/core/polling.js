/* /var/www/common/assets/js/core/polling.js
 *
 * Polling engine (protocol-driven) with end-to-end debug tracing.
 *
 * Responsibilities:
 * - Single in-flight poll request (no overlap)
 * - Abortable requests (AbortController)
 * - Adaptive delay (idle) + exponential backoff (errors)
 * - Dispatch updates (signal events) to solution mappings (by tbl)
 * - Never let one handler error break the polling loop
 *
 * Dependencies:
 * - window.simulatorAjaxRequest
 * - window.PollingHelpers.groupByTbl
 * - ctx.protocol: { buildRequestBody(lastId), parseResponse(data,fallbackLastId) }
 * - optional: window.PollingDebug
 */

(() => {
	'use strict';

	const nowMs = () => Date.now();

	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

	const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

	const jitter = (ms, pct = 0.15) => {
		const delta = ms * pct;
		const r = (Math.random() * 2 - 1) * delta;
		return Math.max(0, Math.round(ms + r));
	};

	const perfNow = () => {
		try { return performance.now(); } catch { return nowMs(); }
	};

	const DEFAULTS = {
		minDelayMs: 5000,
		maxDelayMs: 15000,

		errorBaseDelayMs: 5000,
		errorMaxDelayMs: 60000,

		requestTimeoutMs: 30000,

		watchdogIntervalMs: 15000,
		watchdogInflightTimeoutMs: 45000
	};

	const dbg = () => window.PollingDebug;

	const Polling = {
		_config: { ...DEFAULTS },
		_registry: Object.create(null),

		_active: false,
		_inflight: false,
		_abortController: null,
		_pollStartedAt: 0,

		_solution: '',
		_resolveUrl: null,
		_protocol: null,

		_delivery: null,
		_exercise: null,
		_simulator: null,
		_debug: false,

		_lastId: 0,
		_idleCount: 0,
		_errorCount: 0,
		_delayMs: DEFAULTS.minDelayMs,

		_listenersAttached: false,
		_watchdogStarted: false,

		_traceSeq: 0,

		configure(overrides = {}) {
			this._config = { ...this._config, ...overrides };
		},

		register(solutionKey, handlers) {
			this._registry[String(solutionKey || '')] = handlers || {};
		},

		start(ctx) {
			if (this._active) return;

			this._solution = String(ctx?.solution || '');
			this._resolveUrl = typeof ctx?.resolveUrl === 'function' ? ctx.resolveUrl : null;
			this._protocol = ctx?.protocol || null;

			if (!this._solution) throw new Error('Polling.start: missing ctx.solution');
			if (!this._resolveUrl) throw new Error('Polling.start: missing ctx.resolveUrl(solution)');
			if (!this._protocol || typeof this._protocol.buildRequestBody !== 'function' || typeof this._protocol.parseResponse !== 'function') {
				throw new Error('Polling.start: missing ctx.protocol with buildRequestBody() and parseResponse()');
			}

			this._delivery = ctx?.delivery || null;
			this._exercise = ctx?.exercise || null;
			this._simulator = ctx?.simulator || null;

			this._debug = Boolean(ctx?.debug);

			this._lastId = Number(ctx?.lastId || 0);
			this._idleCount = 0;
			this._errorCount = 0;
			this._delayMs = this._config.minDelayMs;

			this._active = true;

			dbg()?.log('polling.start', {
				solution: this._solution,
				lastId: this._lastId,
				url: this._resolveUrl(this._solution),
				debug: this._debug
			}, 'info');

			this._attachGlobalListenersOnce();
			this._startWatchdogOnce();

			// Manual forcing hook
			window.simulatorForcePoll = () => this.force();

			this._loop();
		},

		stop() {
			dbg()?.log('polling.stop', { solution: this._solution }, 'info');
			this._active = false;
			this._abortInflight('stop');
		},

		force() {
			if (!this._active) return;
			if (this._inflight) return;
			dbg()?.log('poll.force', { solution: this._solution }, 'trace');
			this._pollOnce();
		},

		async _loop() {
			while (this._active) {
				if (!this._inflight) await this._pollOnce();
				await sleep(this._delayMs);
			}
		},

		_abortInflight(reason) {
			try {
				if (this._abortController) {
					dbg()?.log('poll.abort', { reason }, 'info');
					this._abortController.abort();
				}
			} catch {}
		},

		async _pollOnce() {
			if (!this._active) return;
			if (this._inflight) return;

			this._inflight = true;
			this._abortController = new AbortController();
			this._pollStartedAt = nowMs();

			const traceId = ++this._traceSeq;

			const url = this._resolveUrl(this._solution);
			const body = this._protocol.buildRequestBody(this._lastId);

			const t0 = perfNow();

			dbg()?.log('poll.start', {
				traceId,
				solution: this._solution,
				lastId: this._lastId,
				url,
				body
			}, 'trace');

			try {
				const res = await window.simulatorAjaxRequest(url, 'POST', body, {
					mode: 'dynamic',
					timeoutMs: this._config.requestTimeoutMs,
					signal: this._abortController.signal
				});

				const msHttp = Math.round(perfNow() - t0);

				dbg()?.log('poll.response', {
					traceId,
					ok: res.ok,
					status: res.status,
					error: res.error || null,
					ms: msHttp
				}, 'info');

				if (!res.ok) {
					throw new Error(res.error || `http_${res.status || 0}`);
				}

				const parsedT0 = perfNow();
				const parsed = this._protocol.parseResponse(res.data, this._lastId);
				const msParse = Math.round(perfNow() - parsedT0);

				dbg()?.log('parse.done', {
					traceId,
					ms: msParse,
					events: Array.isArray(parsed.events) ? parsed.events.length : 0,
					lastId: parsed.lastId,
					navigateTo: parsed.navigateTo || '',
					requiresReload: !!parsed.requiresReload
				}, 'trace');

				if (parsed.navigateTo) {
					dbg()?.log('action.navigate', { traceId, to: parsed.navigateTo }, 'info');
					window.location.href = parsed.navigateTo;
					return;
				}
				if (parsed.requiresReload) {
					dbg()?.log('action.reload', { traceId }, 'info');
					window.location.reload();
					return;
				}

				const events = Array.isArray(parsed.events) ? parsed.events : [];

				if (events.length) {
					await this._dispatch(events, traceId);
					this._idleCount = 0;
				} else {
					this._idleCount += 1;
				}

				const newLastId = Number(parsed.lastId || 0);
				if (newLastId > this._lastId) this._lastId = newLastId;

				this._errorCount = 0;
				this._delayMs = this._computeIdleDelay(this._idleCount);

				dbg()?.log('schedule.next', {
					traceId,
					mode: 'idle',
					idleCount: this._idleCount,
					delayMs: this._delayMs,
					lastId: this._lastId
				}, 'info');

			} catch (e) {
				this._errorCount += 1;
				this._delayMs = this._computeErrorDelay(this._errorCount);

				dbg()?.log('poll.error', {
					traceId,
					errorCount: this._errorCount,
					delayMs: this._delayMs,
					error: String(e)
				}, 'info');

			} finally {
				this._inflight = false;
				this._abortController = null;
				this._pollStartedAt = 0;
			}
		},

		async _dispatch(events, traceId) {
			const handlers = this._registry[this._solution] || {};
			const ctx = {
				engine: this,
				solution: this._solution,
				delivery: this._delivery,
				exercise: this._exercise,
				simulator: this._simulator,
				debug: this._debug
			};

			const buckets = window.PollingHelpers.groupByTbl(events);
			const tbls = Array.from(buckets.keys());

			dbg()?.log('dispatch.start', {
				traceId,
				buckets: tbls,
				events: events.length
			}, 'trace');

			const t0 = perfNow();

			for (const [tbl, bucketEvents] of buckets.entries()) {
				const fn = handlers[tbl];
				if (typeof fn !== 'function') {
					// Missing handler is a functional issue. Log at INFO so it is visible by default.
					dbg()?.log('handler.missing', { traceId, tbl, solution: ctx.solution }, 'info');
					continue;
				}

				const h0 = perfNow();
				try {
					await Promise.resolve(fn(ctx, bucketEvents));
					dbg()?.log('handler.ok', {
						traceId,
						tbl,
						n: bucketEvents.length,
						ms: Math.round(perfNow() - h0)
					}, 'trace');
				} catch (e) {
					// Never let one handler break polling.
					dbg()?.log('handler.error', {
						traceId,
						tbl,
						n: bucketEvents.length,
						ms: Math.round(perfNow() - h0),
						error: String(e)
					}, 'info');
				}
			}

			dbg()?.log('dispatch.done', {
				traceId,
				ms: Math.round(perfNow() - t0)
			}, 'trace');
		},

		_computeIdleDelay(idleCount) {
			const min = this._config.minDelayMs;
			const max = this._config.maxDelayMs;

			if (idleCount < 60) return jitter(min);
			if (idleCount < 120) return jitter(clamp(min * 2, min, max));
			return jitter(max);
		},

		_computeErrorDelay(errorCount) {
			const base = this._config.errorBaseDelayMs;
			const max = this._config.errorMaxDelayMs;

			const exp = base * Math.pow(2, clamp(errorCount - 1, 0, 10));
			return jitter(clamp(exp, base, max), 0.25);
		},

		_attachGlobalListenersOnce() {
			if (this._listenersAttached) return;
			this._listenersAttached = true;

			document.addEventListener('visibilitychange', () => {
				if (!this._active) return;
				if (!document.hidden) {
					dbg()?.log('event.visibility', { state: 'visible' }, 'trace');
					this.force();
				}
			});

			window.addEventListener('online', () => {
				if (!this._active) return;
				dbg()?.log('event.online', {}, 'trace');
				this.force();
			});

			window.addEventListener('beforeunload', () => {
				dbg()?.log('event.beforeunload', {}, 'trace');
				this.stop();
			});
		},

		_startWatchdogOnce() {
			if (this._watchdogStarted) return;
			this._watchdogStarted = true;

			setInterval(() => {
				if (!this._active) return;
				if (!this._inflight) return;

				const diff = nowMs() - this._pollStartedAt;
				if (diff <= this._config.watchdogInflightTimeoutMs) return;

				dbg()?.log('watchdog.abort', {
					inflightMs: diff,
					thresholdMs: this._config.watchdogInflightTimeoutMs
				}, 'info');

				this._abortInflight('watchdog_inflight_timeout');

			}, this._config.watchdogIntervalMs);
		}
	};

	window.Polling = Polling;
})();