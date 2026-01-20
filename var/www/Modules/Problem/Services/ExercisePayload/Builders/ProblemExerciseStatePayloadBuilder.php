<?php
declare(strict_types=1);

namespace Modules\Problem\Services\ExercisePayload\Builders;

use Modules\Shared\Contracts\PayloadBuilderInterface;
use Modules\Problem\Services\InfoSources\InfoSourceKey;
use Modules\Problem\Services\InfoSources\Builders\InspectAndActInfoSourceBuilder;
use Modules\Problem\Services\InfoSources\Builders\PerformanceInfoSourceBuilder;
use Modules\Problem\Services\InfoSources\Builders\SystemLogInfoSourceBuilder;

final class ProblemExerciseStatePayloadBuilder implements PayloadBuilderInterface
{
    public function __construct(
        private InspectAndActInfoSourceBuilder $inspectAndAct,
        private PerformanceInfoSourceBuilder $performance,
        private SystemLogInfoSourceBuilder $systemLog
    ) {}

    public function build(array $ctx): array
    {
        $k = new InfoSourceKey(
			themeId: (int)$ctx['theme_id'],
			scenarioId: (int)$ctx['scenario_id'],
			state: (int)$ctx['state'],
			languageCode: (string)$ctx['language_code'],
			schemaVersion: (int)($ctx['schema_version'] ?? 1)
		);

        return [
            'schema_version' => $k->schemaVersion,
            'bucket' => 'exercise_state_content',
            'module' => 'problem',
            'theme_id' => $k->themeId,
            'scenario_id' => $k->scenarioId,
            'state' => $k->state,
            'language_code' => $k->languageCode,
            'sources' => [
                'inspect_and_act' => $this->inspectAndAct->build($k),
				'performance' => $this->performance->build($k),
				'system_log' => $this->systemLog->build($k),
            ],
        ];
    }
}
