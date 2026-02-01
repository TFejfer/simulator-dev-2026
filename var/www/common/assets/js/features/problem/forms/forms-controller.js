/* forms-controller.js
 *
 * Central controller for all problem form CRUD operations.
 */

/* global simulatorAjaxRequest */

(() => {
	'use strict';

	const applyResponseToStore = (formKey, res, store) => {
		if (!res?.ok || !res?.data) return;

		// Expected response shapes:
		// A) { ok:true, data:{ form_key, version, data:{symptoms:[...] } } }
		// B) { ok:true, data:{ version, symptoms:[...] } }  (fallback)
		const data = res.data;

		// Version
		if (typeof data.version !== 'undefined') {
			if (typeof store.setVersion === 'function') {
				store.setVersion(formKey, data.version);
			} else {
				store.get().case.versions = store.get().case.versions || {};
				store.get().case.versions[formKey] = parseInt(data.version, 10) || 0;
			}
		}

		// Canonical form data
		// Prefer nested "data" block if present.
		const payload = data.data ?? data;

		if (formKey === 'description' && payload.description && typeof payload.description === 'object') {
			store.get().case.description = payload.description;
		}

		if (formKey === 'symptoms' && Array.isArray(payload.symptoms)) {
			store.get().case.symptoms = payload.symptoms;
		}

		if (formKey === 'facts' && Array.isArray(payload.facts)) {
			store.get().case.facts = payload.facts;
		}

		if (formKey === 'attachments' && payload.attachments && typeof payload.attachments === 'object') {
			store.get().case.attachments = payload.attachments;
		}

		if (formKey === 'causes' && Array.isArray(payload.causes)) {
			store.get().case.causes = payload.causes;
		}

		if (formKey === 'actions' && Array.isArray(payload.actions)) {
			store.get().case.actions = payload.actions;
		}

		if (formKey === 'iterations') {
			if (Array.isArray(payload.iterations)) {
				store.get().case.iterations = payload.iterations;
			} else if (payload.iterations && typeof payload.iterations === 'object') {
				store.get().case.iterations = payload.iterations;
			}
		}

		if (formKey === 'reflections' && payload.reflections && typeof payload.reflections === 'object') {
			store.get().case.reflections = payload.reflections;
		}

		// KT forms

		if (formKey === 'kt-appraisal' && payload.attachments && typeof payload['kt-appraisal'] === 'object') {
			store.get().case.attachments = payload.attachments;
		}

		if (formKey === 'kt-specification' && payload.attachments && typeof payload['kt-specification'] === 'object') {
			store.get().case.attachments = payload.attachments;
		}

		if (formKey === 'kt-causes' && payload.attachments && typeof payload['kt-causes'] === 'object') {
			store.get().case.attachments = payload.attachments;
		}

		if (formKey === 'kt-actions' && payload.attachments && typeof payload['kt-actions'] === 'object') {
			store.get().case.attachments = payload.attachments;
		}

		if (formKey === 'kt-reflections' && payload.attachments && typeof payload['kt-reflections'] === 'object') {
			store.get().case.attachments = payload.attachments;
		}
	};

	const writeForm = async (formKey, crud, payload, store, scope) => {
		const res = await simulatorAjaxRequest(
			`/ajax/problem/forms/${formKey}.php`,
			'POST',
			{
				crud,
				payload,
				expected_version: store.get().case?.versions?.[formKey] ?? 0,
				...scope
			}
		);

		applyResponseToStore(formKey, res, store);
		return res;
	};

	window.ProblemFormsController = { writeForm };
})();