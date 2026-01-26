<?php
declare(strict_types=1);

namespace Modules\Problem\Services\ExercisePayload;

use InvalidArgumentException;
use Modules\Shared\Services\PublishedJsonService;
use Modules\Problem\Services\ExercisePayload\Builders\ProblemExerciseStaticPayloadBuilder;

/**
 * ProblemExerciseStaticService
 *
 * Builds/publishes exercise_static_content for the current exercise context.
 *
 * Design notes:
 * - This service must be tolerant to missing keys in $exerciseMeta because
 *   endpoints may call it from different contexts and the bootstrap converts
 *   warnings/notices into exceptions.
 * - We still validate critical identifiers (theme/scenario) to avoid publishing
 *   under an invalid context.
 */
final class ProblemExerciseStaticService
{
	public function __construct(
		private PublishedJsonService $published,
		private ProblemExerciseStaticPayloadBuilder $builder
	) {}

	/**
	 * @param array<string,mixed> $exerciseMeta
	 * @return array{etag:string,json:string} (as returned by PublishedJsonService)
	 */
	public function getOrBuild(array $exerciseMeta, int $schemaVersion = 1): array
	{
		$themeId = (int)($exerciseMeta['theme_id'] ?? 0);
		$scenarioId = (int)($exerciseMeta['scenario_id'] ?? 0);

		// language_code is required for stable cache keys; default to 'en'
		$languageCode = (string)($exerciseMeta['language_code'] ?? 'en');

		// Validate critical context (avoid publishing under invalid ctx)
		if ($themeId <= 0 || $scenarioId <= 0) {
			throw new InvalidArgumentException('Missing or invalid theme_id/scenario_id for problem static content.');
		}

		$ctx = [
			'theme_id'		=> $themeId,
			'scenario_id'	=> $scenarioId,
			'language_code'	=> $languageCode,
		];

		return $this->published->getOrBuildExerciseStaticContent(
			module: 'problem',
			ctx: $ctx,
			schemaVersion: $schemaVersion,
			builder: $this->builder,
			builtBy: 'ProblemExerciseStaticService'
		);
	}
}