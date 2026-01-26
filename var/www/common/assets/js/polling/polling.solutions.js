/* /var/www/common/assets/js/polling/polling.solutions.js
 *
 * Solution registrations:
 * solutionKey -> tbl -> handler(ctx, events)
 *
 * Migration note:
 * Old:
 *	const simulatorPollingSolutionConfig = {
 *		'training-1-outline': {
 *			'log__access_unblock': handleLogAccessUnblock,
 *			'log__broadcast': handleLogBroadcast,
 *			'log__exercise_actions': handleProblemInstrPacedTrainingOutline,
 *			'log__exercise_lock': handleLogExerciseLock
 *		}
 *	}
 *
 * New:
 *	Polling.register('training-instructor-outline', {
 *		'log__access_unblock': PollConsumerShared.onAccessUnblock,
 *		'log__broadcast': PollConsumerShared.onBroadcast,
 *		'log__exercise_actions': PollConsumerShared.onOutlineExerciseActions,
 *		'log__exercise_lock': PollConsumerShared.onExerciseLock
 *	})
 */

(() => {
	'use strict';

	if (!window.Polling || !window.PollingEvents) {
		console.error('[Polling] Missing Polling or PollingEvents. Check script load order.');
		return;
	}

	// Shared handlers across multiple solutions
	Polling.register('_shared', {
		[PollingEvents.BROADCAST]: PollConsumerShared.onBroadcast,
		[PollingEvents.ACCESS_UNBLOCK]: PollConsumerShared.onAccessUnblock
	});

	// Specific outline mapping
	const outlineMapping = {
		[PollingEvents.EXERCISE_UNLOCK]: PollConsumerOutline.onOutlineStatusRefresh,
		[PollingEvents.EXERCISE]: PollConsumerOutline.onOutlineStatusRefresh
	};

	Polling.register('training-problem-instructor-analysis', {
		//[PollingEvents.EXERCISE]: PollConsumerProblem.onLogExercise,
		//[PollingEvents.ACCESS_UNBLOCK]: PollConsumerShared.onAccessUnblock,
		//[PollingEvents.BROADCAST]: PollConsumerShared.onBroadcast
	});

	// New key
	Polling.register('training-instructor-outline', outlineMapping);

	// Placeholders for future solutions
	Polling.register('training-problem-exercise', {
		// [PollingEvents.BROADCAST]: PollConsumerShared.onBroadcast,
		// [PollingEvents.EXERCISE_ACTIONS]: PollConsumerProblem.onExerciseActions,
	});

	Polling.register('training-risk-exercise', {
		// [PollingEvents.BROADCAST]: PollConsumerShared.onBroadcast,
		// [PollingEvents.EXERCISE_ACTIONS]: PollConsumerRisk.onExerciseActions,
	});

	Polling.register('training-rca-exercise', {
		// [PollingEvents.BROADCAST]: PollConsumerShared.onBroadcast,
		// [PollingEvents.EXERCISE_ACTIONS]: PollConsumerRca.onExerciseActions,
	});
})();
