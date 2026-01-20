<?php
declare(strict_types=1);

namespace Modules\Problem\Services\ExercisePayload;

use Modules\Shared\Services\PublishedJsonService;
use Modules\Problem\Repositories\ExerciseStateResolverRepository;
use Modules\Problem\Services\ExercisePayload\Builders\ProblemExerciseStatePayloadBuilder;

/**
 * ProblemExerciseStateService
 *
 * Resolves current state from log_exercise (by access_id + team_no),
 * then builds/publishes exercise_state_content for that state.
 */
final class ProblemExerciseStateService
{
    public function __construct(
        private PublishedJsonService $published,
        private ExerciseStateResolverRepository $stateRepo,
        private ProblemExerciseStatePayloadBuilder $builder
    ) {}

    /**
     * deliveryMeta must contain: access_id (int), team_no (int), language_code (string)
     */
    public function getOrBuild(array $deliveryMeta, array $exerciseMeta, int $schemaVersion = 1): array
    {
        $accessId = (int)$deliveryMeta['access_id'];
        $teamNo   = (int)$deliveryMeta['team_no'];

        $state = $this->stateRepo->resolveCurrentState($accessId, $teamNo);

        $ctx = [
            'theme_id' => (int)$exerciseMeta['theme_id'],
            'scenario_id' => (int)$exerciseMeta['scenario_id'],
            'language_code' => (string)$exerciseMeta['language_code'],
            'state' => $state,
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