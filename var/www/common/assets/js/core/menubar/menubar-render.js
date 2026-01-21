/* /var/www/common/assets/js/core/menubar/menubar-render.js
 *
 * MenuBarRender
 * - Converts menu button item objects into HTML.
 * - Applies visibility/badge status map: { code: 0|1|2 } (0 hide, 1 show, 2 show+badge).
 *
 * Expected item shape (from SIM_SHARED.menu_buttons):
 * - item_type: "separator"|"button"
 * - context: "course"|"exercise"|"documentation"
 * - sequence_no: number
 * - skill_id: number
 * - code: string|null
 * - icon_class: string|null
 * - text_value: string
 */

(() => {
	'use strict';

	const safe = (x) => (x === undefined || x === null) ? '' : String(x);

	const getBtnStatus = (code, statusMap) => {
		if (!code) return 1;
		if (!statusMap || typeof statusMap !== 'object') return 1;
		if (Object.prototype.hasOwnProperty.call(statusMap, code)) return Number(statusMap[code] || 0);
		return 1;
	};

	const render = (items, statusMap) => {
		if (!Array.isArray(items) || items.length === 0) return '';

		let out = '';

		for (let i = 0; i < items.length; i++) {
			const it = items[i] || {};
			const type = String(it.item_type || '');
			const code = it.code === null ? '' : String(it.code || '');
			const text = safe(it.text_value || '');
			const iconClass = safe(it.icon_class || '');

			if (type === 'separator') {
				out += `<div class="menu-separator">${text}</div>`;
				continue;
			}

			if (type !== 'button') continue;

			const st = getBtnStatus(code, statusMap);
			if (st === 0) continue;

			const badgeClass = (st === 2) ? 'button-badge' : '';

			// We keep the DOM structure close to legacy so CSS continues to work.
			out += `
				<div class="menu-btn" data-code="${code}">
					<div class="grid-menu-button">
						<div class="menu-icons">
							<div class="button-icon-container">
								<div class="icon-center"><i class="${iconClass}"></i></div>
								<span id="badge_${code}" class="${badgeClass}"></span>
							</div>
						</div>
						<div class="menu-text">${text}</div>
					</div>
				</div>
			`;
		}

		return out;
	};

	window.MenuBarRender = Object.freeze({ render });
})();