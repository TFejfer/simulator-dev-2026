<?php
declare(strict_types=1);

namespace Modules\Problem\Services\ExercisePayload\Builders;

use Modules\Problem\Services\InfoSources\InfoSourceKey;
use Modules\Shared\Contracts\PayloadBuilderInterface;
use Modules\Problem\Services\InfoSources\Builders\InboxInfoSourceBuilder;
use Modules\Problem\Services\InfoSources\Builders\MaintenanceInfoSourceBuilder;
use Modules\Problem\Services\InfoSources\Builders\ProcessInfoSourceBuilder;

/**
 * ProblemExerciseStaticPayloadBuilder
 *
 * Aggregates static info sources for the "problem" module:
 * - Inbox
 * - Maintenance
 * - Process
 */
final class ProblemExerciseStaticPayloadBuilder implements PayloadBuilderInterface
{
    public function __construct(
        private InboxInfoSourceBuilder $inbox,
        private MaintenanceInfoSourceBuilder $maintenance,
        private ProcessInfoSourceBuilder $process
    ) {}

    public function build(array $ctx): array
	{
		$k = new InfoSourceKey(
			themeId: (int)$ctx['theme_id'],
			scenarioId: (int)$ctx['scenario_id'],
			state: 0,
			languageCode: (string)$ctx['language_code'],
			schemaVersion: (int)($ctx['schema_version'] ?? 1)
		);

		return [
			'schema_version' => (int)$ctx['schema_version'],
			'bucket' => 'exercise_static_content',
			'module' => 'problem',
			'theme_id' => $k->themeId,
			'scenario_id' => $k->scenarioId,
			'language_code' => $k->languageCode,
			'sources' => [
				'inbox' => $this->inbox->build($k),
				'maintenance' => $this->maintenance->build($k),
				'process' => $this->process->build($k),
			],
		];
	}
}