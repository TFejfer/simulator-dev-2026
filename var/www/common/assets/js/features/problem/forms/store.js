/* /common/assets/js/features/problem/forms/store.js
 *
 * Minimal forms store for Problem pages.
 * Provides createStore() with:
 * - get(): returns exercise data
 * - setVersion/getVersion(): per-form versions
 */

(() => {
	'use strict';

	const createStore = (exerciseData) => {
		if (!exerciseData.case) exerciseData.case = {};
		if (!exerciseData.case.versions) exerciseData.case.versions = {};

		const get = () => exerciseData;

		const getVersion = (formKey) => {
			const v = exerciseData.case.versions?.[formKey];
			return Number.isFinite(v) ? v : 0;
		};

		const setVersion = (formKey, version) => {
			exerciseData.case.versions[formKey] = parseInt(version, 10) || 0;
		};

		return { get, getVersion, setVersion };
	};

	window.simulatorFormsStore = { createStore };
})();