/* /var/www/common/assets/js/core/menubar/menubar-bind.js
 *
 * MenuBarBind
 * - Delegated click binding for menu buttons.
 * - This does NOT decide what "code" means; it just emits an event hook.
 *
 * Integrations:
 * - If you have a sidebar system: handle it in window.MenuBarActions.open(code, ctx)
 * - Else: listen to the CustomEvent "menubar:click"
 */

(() => {
	'use strict';

	let bound = false;

	const bindOnce = () => {
		if (bound) return;
		bound = true;

		document.addEventListener('click', (e) => {
			const el = e.target?.closest?.('.menu-btn[data-code]');
			if (!el) return;

			const code = String(el.getAttribute('data-code') || '');

			// Preferred integration hook
			if (window.MenuBarActions && typeof window.MenuBarActions.open === 'function') {
				window.MenuBarActions.open(code);
				return;
			}

			// Fallback: emit event and let page scripts handle it
			window.dispatchEvent(new CustomEvent('menubar:click', { detail: { code } }));
		});
	};

	window.MenuBarBind = Object.freeze({ bindOnce });
})();