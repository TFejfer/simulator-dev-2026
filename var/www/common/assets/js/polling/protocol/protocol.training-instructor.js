/* /var/www/common/assets/js/polling/protocol/protocol.training-instructor.js
 *
 * Protocol adapter for:
 * /ajax/training_instructor_paced_poll.php
 *
 * Request:
 *	{ last_poll_id: number }
 *
 * Response data:
 *	{
 *		updates: [ { id, tbl, info_1, info_2 }, ... ],
 *		server_latest_poll_id: number,
 *		effective_last_poll_id: number,
 *		navigate_to?: string
 *	}
 */

(() => {
	'use strict';

	const isObject = (x) => x !== null && typeof x === 'object';

	window.PollingProtocolTrainingInstructor = {
		buildRequestBody(lastId) {
			return { last_poll_id: Number(lastId || 0) };
		},

		parseResponse(data, fallbackLastId) {
			const out = {
				events: [],
				lastId: Number(fallbackLastId || 0),
				requiresReload: false,
				navigateTo: ''
			};

			if (!isObject(data)) return out;

			const updates = Array.isArray(data.updates) ? data.updates : [];
			const serverLatest = Number(data.server_latest_poll_id || 0);
			const nav = String(data.navigate_to || '');

			if (serverLatest > 0) out.lastId = serverLatest;
			if (nav) out.navigateTo = nav;

			out.events = updates.map((u) => ({
				id: Number(u?.id || 0),
				tbl: String(u?.tbl || ''),
				info_1: (u && u.info_1 !== null && u.info_1 !== undefined) ? String(u.info_1) : null,
				info_2: (u && u.info_2 !== null && u.info_2 !== undefined) ? String(u.info_2) : null
			})).filter(e => e.id > 0 && e.tbl !== '');

			window.PollingDebug?.log('protocol.parse', {
				server_latest_poll_id: serverLatest,
				updates: out.events.length,
				navigate_to: out.navigateTo || ''
			}, 'trace');

			return out;
		}
	};
})();