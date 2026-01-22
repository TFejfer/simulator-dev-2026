/* global window, document */

/**
 * simulator-confirm.js
 *
 * Minimal confirm/alert dialog to replace jquery-confirm.
 *
 * Exposes:
 * - window.simulatorShowConfirm(options)	=> void
 * - window.simulatorConfirm(options)		=> Promise<string> (resolves with button key)
 *
 * Options:
 * - title: string
 * - content: string (text) OR HTML if allowHtml=true
 * - allowHtml: boolean (default false)
 * - backgroundDismiss: boolean
 * - columnClass: 'small'|'medium'|'large'
 * - closeIcon: boolean
 * - type: ''|'success'|'error'|'warning'|'info'
 * - closeOnEsc: boolean
 * - buttons: {
 *		ok: { text:'OK', btnClass:'btn-blue', action:()=>{} },
 *		cancel: { ... }
 * }
 */
(() => {
	'use strict';

	const DEFAULTS = {
		title: 'Confirm',
		content: 'Are you sure?',
		allowHtml: false,
		backgroundDismiss: false,
		columnClass: 'medium',	// small | medium | large
		closeIcon: true,
		type: '',				// success | error | warning | info
		closeOnEsc: true,
		buttons: {
			ok: {
				text: 'OK',
				btnClass: 'btn-blue',
				action: null
			},
			cancel: {
				text: 'Cancel',
				btnClass: 'btn-default',
				action: null
			}
		}
	};

	const createElement = (tag, className = '') => {
		const el = document.createElement(tag);
		if (className) el.className = className;
		return el;
	};

	const setContent = (el, content, allowHtml) => {
		if (allowHtml) {
			el.innerHTML = String(content ?? '');
		} else {
			el.textContent = String(content ?? '');
		}
	};

	const focusFirstFocusable = (root) => {
		const selector = [
			'button:not([disabled])',
			'[href]',
			'input:not([disabled])',
			'select:not([disabled])',
			'textarea:not([disabled])',
			'[tabindex]:not([tabindex="-1"])'
		].join(',');

		const focusables = root.querySelectorAll(selector);
		if (focusables.length > 0) {
			focusables[0].focus();
		} else {
			root.focus();
		}
	};

	const trapTabKey = (e, root) => {
		if (e.key !== 'Tab') return;

		const selector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
		const focusables = Array.from(root.querySelectorAll(selector));
		if (focusables.length === 0) {
			e.preventDefault();
			return;
		}

		const first = focusables[0];
		const last = focusables[focusables.length - 1];
		const active = document.activeElement;

		if (e.shiftKey) {
			if (active === first || active === root) {
				last.focus();
				e.preventDefault();
			}
		} else {
			if (active === last) {
				first.focus();
				e.preventDefault();
			}
		}
	};

	const showConfirmInternal = (options, resolvePromise) => {
		const settings = { ...DEFAULTS, ...options };
		if (!settings.buttons || typeof settings.buttons !== 'object') {
			settings.buttons = { ...DEFAULTS.buttons };
		}

		// Overlay
		const overlay = createElement('div', 'simulator-confirm-overlay');
		overlay.setAttribute('role', 'presentation');

		// Dialog
		const dialog = createElement('div', `simulator-confirm-box ${settings.columnClass}`);
		dialog.setAttribute('role', 'dialog');
		dialog.setAttribute('aria-modal', 'true');
		dialog.setAttribute('tabindex', '-1');

		if (settings.type) {
			dialog.setAttribute('data-type', settings.type);
		}

		// Title
		const titleEl = createElement('div', 'simulator-confirm-title');
		setContent(titleEl, settings.title, false);
		dialog.appendChild(titleEl);

		// Content
		const contentEl = createElement('div', 'simulator-confirm-content');
		setContent(contentEl, settings.content, !!settings.allowHtml);
		dialog.appendChild(contentEl);

		// Close icon
		const closeDialog = () => {
			if (overlay && overlay.parentNode) {
				overlay.parentNode.removeChild(overlay);
			}
			document.removeEventListener('keydown', onKeyDown, true);
		};

		if (settings.closeIcon) {
			const closeIcon = createElement('button', 'simulator-confirm-close-icon');
			closeIcon.setAttribute('type', 'button');
			closeIcon.setAttribute('aria-label', 'Close');
			closeIcon.textContent = '×';
			closeIcon.addEventListener('click', () => {
				if (typeof resolvePromise === 'function') resolvePromise('__close__');
				closeDialog();
			});
			dialog.appendChild(closeIcon);
		}

		// Buttons
		const btnWrap = createElement('div', 'confirm-buttons');

		Object.keys(settings.buttons).forEach((key) => {
			const def = settings.buttons[key] || {};
			const btn = createElement('button', `confirm-btn ${def.btnClass || 'btn-default'}`);
			btn.setAttribute('type', 'button');
			setContent(btn, def.text || key, false);

			btn.addEventListener('click', () => {
				try {
					if (typeof def.action === 'function') {
						def.action();
					}
				} finally {
					if (typeof resolvePromise === 'function') resolvePromise(String(key));
					closeDialog();
				}
			});

			btnWrap.appendChild(btn);
		});

		dialog.appendChild(btnWrap);

		// Background dismiss
		if (settings.backgroundDismiss) {
			overlay.addEventListener('click', (e) => {
				if (e.target === overlay) {
					if (typeof resolvePromise === 'function') resolvePromise('__dismiss__');
					closeDialog();
				}
			});
		}

		// Keyboard handling
		const onKeyDown = (e) => {
			if (settings.closeOnEsc && e.key === 'Escape') {
				e.preventDefault();
				if (typeof resolvePromise === 'function') resolvePromise('__esc__');
				closeDialog();
				return;
			}
			trapTabKey(e, dialog);
		};

		document.addEventListener('keydown', onKeyDown, true);

		overlay.appendChild(dialog);
		document.body.appendChild(overlay);

		// Focus management
		focusFirstFocusable(dialog);
	};

	/**
	 * Fire-and-forget confirm (compatible with legacy style).
	 */
	window.simulatorShowConfirm = (options) => {
		showConfirmInternal(options, null);
	};

	/**
	 * Promise-based confirm: resolves with button key (e.g. "ok", "cancel").
	 * Also resolves with "__esc__", "__dismiss__", "__close__" when closed without a button.
	 */
	window.simulatorConfirm = (options) => {
		return new Promise((resolve) => {
			showConfirmInternal(options, resolve);
		});
	};
})();