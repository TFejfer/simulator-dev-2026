/* helpers.js
 *
 * Shared helpers for Problem forms.
 * Used by both default and KT implementations.
 */

(() => {
	'use strict';

	/**
	 * Safely resolve translated text from SIM_SHARED maps.
	 *
	 * @param {string} bucket - SIM_SHARED bucket name
	 * @param {string|number} id - lookup key
	 * @param {string} fallback - fallback text
	 */
	const tMap = (bucket, id, fallback = '') => {
		const src = window.SIM_SHARED?.[bucket];
		if (!src || typeof src !== 'object') return fallback;

		const key = String(id);
		const val = src[key];

		return (typeof val === 'string' && val.trim() !== '')
			? val
			: fallback;
	};

	/**
	 * Escape HTML for safe rendering.
	 */
	const esc = (s) => {
		return String(s ?? '')
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#039;');
	};

	/**
	 * Normalize text coming from backend.
	 * Fixes double-escaped strings without removing legitimate backslashes.
	 */
	const normalizeDbText = (value) => {
		if (value === null || value === undefined) return '';
		return String(value).replace(/\\\\/g, '\\');
	};

	/**
	 * Standard user feedback on failed write operations.
	 */
	const showWriteError = (res, fallbackText = 'Save failed. Please try again.') => {
		const msg = String(res?.error || res?.message || fallbackText);

		if (typeof window.simulatorShowConfirm === 'function') {
			window.simulatorShowConfirm({
				title: 'Error',
				content: msg,
				backgroundDismiss: true
			});
			return;
		}

		alert(msg);
	};

	/**
	 * Mode helpers (single source of truth).
	 * mode: 1 enabled, 2 limited, 3 disabled, 0 hidden
	 */
	const isVisible = (mode) => Number(mode) > 0;
	const isEditable = (mode) => Number(mode) === 1;

	/**
	 * Re-render the entire form plan from canonical store data.
	 * Use this after successful writes, and also as a rollback strategy on failures.
	 */
	const renderPlan = (store) => {
		const plan = store?.get?.().case?.forms_plan || [];
		if (window.problemFormsRegistry?.renderPlan) {
			window.problemFormsRegistry.renderPlan(store, plan);
		}
	};

	/**
	 * Standard wrapper for write operations.
	 *
	 * Behavior:
	 * - Executes the provided async fn()
	 * - On failure: shows user feedback and rolls UI back to canonical store render
	 * - On success: returns the response
	 */
	const safeWrite = async (store, fn, fallbackText = 'Save failed. Please try again.') => {
		let res = null;

		try {
			res = await fn();
		} catch (e) {
			showWriteError({ error: String(e?.message || e) }, fallbackText);
			renderPlan(store);
			return null;
		}

		if (!res?.ok) {
			showWriteError(res, fallbackText);
			renderPlan(store);
			return null;
		}

		return res;
	};

	window.ProblemFormsHelpers = {
		tMap,
		esc,
		normalizeDbText,
		showWriteError,
		isVisible,
		isEditable,
		renderPlan,
		safeWrite
	};
})();