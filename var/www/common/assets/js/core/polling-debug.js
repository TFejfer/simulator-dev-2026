/* /var/www/common/assets/js/core/polling-debug.js
 *
 * PollingDebug
 * - End-to-end tracing buffer for polling troubleshooting.
 * - Optional on-page overlay (no DevTools required).
 *
 * Levels:
 * - off:   no logging
 * - info:  poll lifecycle + errors
 * - trace: info + handler timings + dispatch details
 * - wire:  trace + payload excerpts
 *
 * Usage:
 *		PollingDebug.enable({ level: 'trace', overlay: true })
 *		PollingDebug.log('poll.start', {...}, 'info')
 *		PollingDebug.dump(200)
 */

(() => {
	'use strict';

	const LEVELS = { off: 0, info: 1, trace: 2, wire: 3 };

	const nowIso = () => new Date().toISOString();

	const safeJson = (x, maxLen = 1200) => {
		try {
			const s = JSON.stringify(x);
			return s.length > maxLen ? s.slice(0, maxLen) + '…' : s;
		} catch {
			return '[unserializable]';
		}
	};

	const PollingDebug = {
		_enabled: false,
		_level: LEVELS.off,
		_overlay: false,
		_max: 300,
		_buf: [],
		_seq: 0,
		_filters: [],

		enable(opts = {}) {
			const levelName = String(opts.level || 'trace').toLowerCase();
			this._level = LEVELS[levelName] ?? LEVELS.trace;
			this._enabled = this._level > LEVELS.off;

			this._overlay = Boolean(opts.overlay);
			this._max = Number(opts.max || 300);

			if (this._overlay) this._ensureOverlay();

			this.log('debug.enable', { level: levelName, overlay: this._overlay, max: this._max }, 'info');
		},

		disable() {
			this.log('debug.disable', {}, 'info');
			this._enabled = false;
			this._level = LEVELS.off;
			this._overlay = false;
			this._removeOverlay();
		},

		setFilters(filters = []) {
			this._filters = Array.isArray(filters) ? filters.map(String) : [];
		},

		shouldLog(event) {
			if (!this._enabled) return false;
			if (!this._filters.length) return true;
			return this._filters.some(f => String(event).includes(f));
		},

		log(event, data = {}, levelName = 'info') {
			const level = LEVELS[String(levelName).toLowerCase()] ?? LEVELS.info;
			if (!this._enabled) return;
			if (level > this._level) return;
			if (!this.shouldLog(event)) return;

			const entry = {
				i: ++this._seq,
				ts: nowIso(),
				event: String(event),
				data
			};

			this._buf.push(entry);
			if (this._buf.length > this._max) this._buf.shift();

			if (this._overlay) this._renderLine(entry);
		},

		dump(n = 80) {
			const slice = this._buf.slice(-Math.max(1, Number(n || 80)));
			return slice.map(e => `${e.i} ${e.ts} ${e.event} ${safeJson(e.data)}`).join('\n');
		},

		export() {
			return this._buf.slice();
		},

		/* ---------- Overlay (optional) ---------- */

		_ensureOverlay() {
			if (document.getElementById('polling-debug-overlay')) return;

			const box = document.createElement('div');
			box.id = 'polling-debug-overlay';
			box.style.position = 'fixed';
			box.style.left = '0';
			box.style.right = '0';
			box.style.bottom = '0';
			box.style.maxHeight = '35vh';
			box.style.overflow = 'auto';
			box.style.zIndex = '99999';
			box.style.background = 'rgba(0,0,0,0.85)';
			box.style.color = '#fff';
			box.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
			box.style.fontSize = '12px';
			box.style.padding = '8px';
			box.style.borderTop = '1px solid rgba(255,255,255,0.2)';

			const header = document.createElement('div');
			header.style.display = 'flex';
			header.style.justifyContent = 'space-between';
			header.style.alignItems = 'center';
			header.style.marginBottom = '6px';

			const title = document.createElement('div');
			title.textContent = 'Polling Debug (toggle: Ctrl+Alt+P)';
			header.appendChild(title);

			const actions = document.createElement('div');

			const btnCopy = document.createElement('button');
			btnCopy.textContent = 'Copy';
			btnCopy.style.marginLeft = '8px';
			btnCopy.onclick = async () => {
				try {
					await navigator.clipboard.writeText(this.dump(300));
				} catch {}
			};

			const btnClear = document.createElement('button');
			btnClear.textContent = 'Clear';
			btnClear.style.marginLeft = '8px';
			btnClear.onclick = () => {
				this._buf = [];
				const pre = document.getElementById('polling-debug-pre');
				if (pre) pre.textContent = '';
			};

			actions.appendChild(btnCopy);
			actions.appendChild(btnClear);
			header.appendChild(actions);

			const pre = document.createElement('pre');
			pre.id = 'polling-debug-pre';
			pre.style.whiteSpace = 'pre-wrap';
			pre.style.margin = '0';

			box.appendChild(header);
			box.appendChild(pre);
			document.body.appendChild(box);

			document.addEventListener('keydown', (e) => {
				if (e.ctrlKey && e.altKey && (e.key === 'p' || e.key === 'P')) {
					const el = document.getElementById('polling-debug-overlay');
					if (!el) return;
					el.style.display = (el.style.display === 'none') ? 'block' : 'none';
				}
			});
		},

		_removeOverlay() {
			const el = document.getElementById('polling-debug-overlay');
			if (el && el.parentNode) el.parentNode.removeChild(el);
		},

		_renderLine(entry) {
			const pre = document.getElementById('polling-debug-pre');
			if (!pre) return;

			const line = `${entry.i} ${entry.ts} ${entry.event} ${safeJson(entry.data)}\n`;
			pre.textContent += line;

			pre.parentElement.scrollTop = pre.parentElement.scrollHeight;
		}
	};

	window.PollingDebug = PollingDebug;
})();