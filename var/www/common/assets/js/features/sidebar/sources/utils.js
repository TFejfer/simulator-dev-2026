/* /common/assets/js/features/sidebar/sources/utils.js
 * Shared helpers for problem info sidebar sources.
 */

(() => {
	'use strict';

	const $ = window.jQuery;

	const asArray = (v) => {
		if (Array.isArray(v)) return v;
		if (v && typeof v === 'object') return Object.values(v);
		return [];
	};

	const getText = (item) => {
		if (!item || typeof item !== 'object') return '';
		return String(item.text_value ?? item.text ?? '').trim();
	};

	const getMenuButtonLabel = (menuButtons, code, fallback) => {
		const arr = asArray(menuButtons);

		for (const row of arr) {
			const rowCode = String(row.code ?? row.name ?? row.key ?? '').trim();
			if (rowCode === code) return getText(row) || fallback;
		}

		if (menuButtons && typeof menuButtons === 'object' && menuButtons[code] != null) {
			const v = menuButtons[code];
			if (typeof v === 'string') return v.trim() || fallback;
			return getText(v) || fallback;
		}

		return fallback;
	};

	const normalizeMs = (v) => {
		const n = Number(v);
		if (!Number.isFinite(n) || n <= 0) return null;
		return n > 2e12 ? n : n * 1000;
	};

	const formatDate = (ms) => {
		const ts = Number.isFinite(ms) ? ms : Date.now();
		const d = new Date(ts);
		const month = String(d.getMonth() + 1).padStart(2, '0');
		const day = String(d.getDate()).padStart(2, '0');
		return `${d.getFullYear()}-${month}-${day}`;
	};

	const ensureSidebarBody = () => {
		let $body = $('#sideBar .sidebar-content');
		if ($body.length) return $body;
		$('#sideBar').append('<div class="sidebar-content" id="sideBarBody"></div>');
		return $('#sideBarBody');
	};

	const openSidebarShell = () => {
		if (typeof window.simulatorToggleSidebar === 'function') {
			window.simulatorToggleSidebar(true);
		} else {
			$('#sideBar').addClass('open');
		}
		$('body').css('overflow-y', 'hidden');
	};

	const closeSidebarShell = () => {
		if (typeof window.simulatorToggleSidebar === 'function') {
			window.simulatorToggleSidebar(false);
		} else {
			$('#sideBar').removeClass('open');
		}
		$('body').css('overflow-y', 'auto');
	};

	window.ProblemInfoSourceUtils = Object.freeze({
		asArray,
		getText,
		getMenuButtonLabel,
		normalizeMs,
		formatDate,
		ensureSidebarBody,
		openSidebarShell,
		closeSidebarShell
	});
})();
