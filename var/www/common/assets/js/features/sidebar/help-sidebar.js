/**
 * /common/assets/js/features/sidebar/help-sidebar.js
 *
 * Shared Help sidebar renderer + binder.
 *
 * Design goals:
 * - Only uses the NEW shared_content payload keys:
 *   - simulator.menu_buttons
 *   - simulator.faq_questions
 *   - simulator.faq_answers
 * - No legacy C_* support.
 * - Works with array OR object-map payloads.
 * - Page scripts call: HelpSidebar.open({ simulator })
 *
 * Dependencies:
 * - jQuery
 * - simulatorToggleSidebar(openBool) (optional; falls back to CSS class .open)
 * - #sideBar exists (PHP shell)
 */

(function () {
	'use strict';

	/**
	 * Ensure sidebar body container exists.
	 * PHP currently provides only the sidebar shell + close button.
	 *
	 * @returns {jQuery} The sidebar body container
	 */
	const ensureSidebarBody = () => {
		let $body = $('#sideBar .sidebar-content');
		if ($body.length) return $body;

		$('#sideBar').append('<div class="sidebar-content" id="sideBarBody"></div>');
		return $('#sideBarBody');
	};

	/**
	 * Open sidebar with fallback if helper is not present.
	 */
	const openSidebarShell = () => {
		if (typeof simulatorToggleSidebar === 'function') {
			simulatorToggleSidebar(true);
		} else {
			$('#sideBar').addClass('open');
		}
		$('body').css('overflow-y', 'hidden');
	};

	/**
	 * Close sidebar with fallback if helper is not present.
	 */
	const closeSidebarShell = () => {
		if (typeof simulatorToggleSidebar === 'function') {
			simulatorToggleSidebar(false);
		} else {
			$('#sideBar').removeClass('open');
		}
		$('body').css('overflow-y', 'auto');
	};

	/**
	 * Convert array or object-map into array.
	 *
	 * @param {any} v
	 * @returns {Array}
	 */
	const asArray = (v) => {
		if (Array.isArray(v)) return v;
		if (v && typeof v === 'object') return Object.values(v);
		return [];
	};

	/**
	 * Extract a "best effort" text from a row (new payload variants).
	 *
	 * @param {object} item
	 * @returns {string}
	 */
	const getText = (item) => {
		if (!item || typeof item !== 'object') return '';
		return String(item.text_value ?? '').trim();
	};

	/**
	 * Resolve a menu button label by code (new payload).
	 *
	 * @param {object|Array} menuButtons
	 * @param {string} code
	 * @param {string} fallback
	 * @returns {string}
	 */
	const getMenuButtonLabel = (menuButtons, code, fallback) => {
		const arr = asArray(menuButtons);

		for (const row of arr) {
			const rowCode = String(row.code ?? row.name ?? row.key ?? '').trim();
			if (rowCode === code) {
				return getText(row) || fallback;
			}
		}

		// Map form: { hel: {text:"Help"} } or { hel: "Help" }
		if (menuButtons && typeof menuButtons === 'object' && menuButtons[code] != null) {
			const v = menuButtons[code];
			if (typeof v === 'string') return v.trim() || fallback;
			return getText(v) || fallback;
		}

		return fallback;
	};

	/**
	 * Resolve an answer for a given faq id (new payload).
	 *
	 * @param {object|Array} faqAnswers
	 * @param {string} faqId
	 * @returns {string}
	 */
	const getAnswerByFaqId = (faqAnswers, faqId) => {
		const arr = asArray(faqAnswers);

		for (const row of arr) {
			const id = String(row.faq_id ?? row.faqID ?? row.id ?? row.question_id ?? '').trim();
			if (id !== '' && id === String(faqId)) {
				return getText(row);
			}
		}

		// Map form keyed by faqId
		if (faqAnswers && typeof faqAnswers === 'object' && faqAnswers[faqId] != null) {
			const v = faqAnswers[faqId];
			if (typeof v === 'string') return v.trim();
			return getText(v);
		}

		return '';
	};

	/**
	 * Build normalized FAQ list (new payload).
	 *
	 * @param {object|Array} faqQuestions
	 * @param {object|Array} faqAnswers
	 * @returns {Array<{question:string, answer:string}>}
	 */
	const buildFaqList = (faqQuestions, faqAnswers) => {
		const qArr = asArray(faqQuestions);
		const faqs = [];

		for (const q of qArr) {
			const faqId = String(q.faq_id ?? q.faqID ?? q.id ?? q.question_id ?? '').trim();
			const questionText = getText(q);

			if (!questionText) continue;

			faqs.push({
				question: questionText,
				answer: faqId ? getAnswerByFaqId(faqAnswers, faqId) : '',
			});
		}

		// Map form keyed by faqId: { "12": {text:"..."} }
		if (!faqs.length && faqQuestions && typeof faqQuestions === 'object' && !Array.isArray(faqQuestions)) {
			for (const [key, v] of Object.entries(faqQuestions)) {
				const questionText = (typeof v === 'string') ? v.trim() : getText(v);
				if (!questionText) continue;

				faqs.push({
					question: questionText,
					answer: getAnswerByFaqId(faqAnswers, key),
				});
			}
		}

		return faqs;
	};

	/**
	 * Build Help sidebar HTML (new payload only).
	 *
	 * @param {object} simulator window.simulator (new shared_content bundle)
	 * @returns {string}
	 */
	const buildHelpHtml = (simulator) => {
		const menuButtons = simulator?.menu_buttons ?? {};
		const faqQuestions = simulator?.faq_questions ?? {};
		const faqAnswers = simulator?.faq_answers ?? {};

		const title = getMenuButtonLabel(menuButtons, 'hel', 'Help');
		const faqs = buildFaqList(faqQuestions, faqAnswers);

		// Optional: dedicated call-instructor text from new payload if present
		const callInstructorText = faqAnswers[8] || 'error: missing text';

		let html = `
			<div id="info_source_hel" class="simulator-info-source active">
				<div class="sidebar-title">${title}</div>
		`;

		if (faqs.length) {
			for (const row of faqs) {
				html += `
					<button class="accordion">${row.question}</button>
					<div class="panel">
						<p>${row.answer || ''}</p>
					</div>
				`;
			}
		} else {
			html += `
				<p style="opacity:0.7">
					No FAQ content available for this language/payload.
				</p>
			`;
		}

		html += `
				<br>
				<div id="btn_call_instructor" class="std-btn std-btn-enabled" data-code="call_instructor">
					${callInstructorText}
				</div>
			</div>
		`;

		return html;
	};

	/**
	 * Bind FAQ accordion behavior.
	 *
	 * Uses CSS-based accordion logic:
	 * - .accordion.active
	 * - panel max-height transition
	 *
	 * IMPORTANT:
	 * - Must be delegated because content is injected dynamically
	 */
	const bindAccordion = () => {
		const $body = ensureSidebarBody();

		// Prevent duplicate bindings
		$body.off('click.helpAccordion', '.accordion');

		$body.on('click.helpAccordion', '.accordion', function (e) {
			e.preventDefault();

			const btn = this;
			const panel = btn.nextElementSibling;

			if (!panel || !panel.classList.contains('panel')) return;

			const isActive = btn.classList.contains('active');

			if (isActive) {
				btn.classList.remove('active');
				panel.style.maxHeight = null;
			} else {
				btn.classList.add('active');
				panel.style.maxHeight = panel.scrollHeight + 'px';
			}
		});
	};

	/**
	 * Public API: open Help sidebar and render.
	 *
	 * IMPORTANT:
	 * - Shared content is stored globally by simulator-page.js as `window.SIM_SHARED`.
	 * - This sidebar must use the same source as OutlineUI (formats, terms, etc.).
	 * - Therefore we do NOT accept a simulator object from page scripts.
	 */
	const open = () => {
		// Read shared_content from the canonical global container.
		// If it is missing, we still open the sidebar but render a safe fallback.
		const shared = window.SIM_SHARED || {};

		openSidebarShell();

		const $body = ensureSidebarBody();
		$body.html(buildHelpHtml(shared));

		bindAccordion();
	};

	/**
	 * Public API: close sidebar.
	 */
	const close = () => {
		closeSidebarShell();
	};

	/**
	 * Public API: bind sidebar close button once.
	 * Works even if pages re-render (delegated).
	 */
	const bindCloseButton = () => {
		$(document).off('click.helpSidebarClose', '#sideBar .closebtn');
		$(document).on('click.helpSidebarClose', '#sideBar .closebtn', function (e) {
			e.preventDefault();
			close();
		});
	};

	// Export
	window.HelpSidebar = {
		open,
		close,
		bindCloseButton,
	};
})();