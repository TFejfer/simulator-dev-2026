<?php
declare(strict_types=1);

namespace Modules\Problem\Services\ExercisePayload;

use InvalidArgumentException;
use Modules\Shared\Services\PublishedJsonService;
use Modules\Problem\Repositories\ExerciseStateResolverRepository;
use Modules\Problem\Services\ExercisePayload\Builders\ProblemExerciseStatePayloadBuilder;

/**
 * ProblemExerciseStateService
 *
 * Builds/publishes exercise_state_content for the current exercise state.
 *
 * Design:
 * - Prefer current_state from $exerciseMeta (already resolved from latest log_exercise row).
 * - Fallback to stateRepo->resolveCurrentState(access_id, team_no) only if missing/invalid.
 * - Be tolerant to missing keys: bootstrap converts notices into exceptions.
 */
final class ProblemExerciseStateService
{
	public function __construct(
		private PublishedJsonService $published,
		private ExerciseStateResolverRepository $stateRepo,
		private ProblemExerciseStatePayloadBuilder $builder
	) {}

	/**
	 * @param array<string,mixed> $deliveryMeta Must contain access_id and team_no (ideally also language_code).
	 * @param array<string,mixed> $exerciseMeta Must contain theme_id, scenario_id (and preferably current_state, language_code).
	 * @return array<string,mixed>
	 */
	public function getOrBuild(array $deliveryMeta, array $exerciseMeta, int $schemaVersion = 1): array
	{
		$accessId = (int)($deliveryMeta['access_id'] ?? 0);
		$teamNo   = (int)($deliveryMeta['team_no'] ?? 0);

		if ($accessId <= 0 || $teamNo <= 0) {
			throw new InvalidArgumentException('Missing or invalid access_id/team_no in deliveryMeta.');
		}

		$themeId = (int)($exerciseMeta['theme_id'] ?? 0);
		$scenarioId = (int)($exerciseMeta['scenario_id'] ?? 0);

		if ($themeId <= 0 || $scenarioId <= 0) {
			throw new InvalidArgumentException('Missing or invalid theme_id/scenario_id in exerciseMeta.');
		}

		// language_code is required for stable cache keys; default to 'en'
		$languageCode = (string)($exerciseMeta['language_code'] ?? ($deliveryMeta['language_code'] ?? 'en'));

		// Prefer current_state from exerciseMeta; fallback to resolver only when needed
		$state = (int)($exerciseMeta['current_state'] ?? 0);
		if ($state <= 0) {
			$state = (int)$this->stateRepo->resolveCurrentState($accessId, $teamNo);
		}

		$ctx = [
			'theme_id'		=> $themeId,
			'scenario_id'	=> $scenarioId,
			'language_code'	=> $languageCode,
			'state'			=> $state,
		];

		$out = $this->published->getOrBuildExerciseStateContent(
			module: 'problem',
			ctx: $ctx,
			schemaVersion: $schemaVersion,
			builder: $this->builder,
			builtBy: 'ProblemExerciseStateService'
		);

		// Optional: let the client know which state was used
		$out['state'] = $state;

		return $out;
	}
}