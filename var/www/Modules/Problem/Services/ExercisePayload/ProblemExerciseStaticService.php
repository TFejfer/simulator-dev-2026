<?php
declare(strict_types=1);

namespace Modules\Problem\Services\ExercisePayload;

use Modules\Shared\Services\PublishedJsonService;
use Modules\Problem\Services\ExercisePayload\Builders\ProblemExerciseStaticPayloadBuilder;

/**
 * ProblemExerciseStaticService
 *
 * Builds/publishes exercise_static_content for the current exercise meta.
 */
final class ProblemExerciseStaticService
{
    public function __construct(
        private PublishedJsonService $published,
        private ProblemExerciseStaticPayloadBuilder $builder
    ) {}

    public function getOrBuild(array $exerciseMeta, int $schemaVersion = 1): array
    {
        $ctx = [
            'theme_id' => (int)$exerciseMeta['theme_id'],
            'scenario_id' => (int)$exerciseMeta['scenario_id'],
            'language_code' => (string)$exerciseMeta['language_code'],
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