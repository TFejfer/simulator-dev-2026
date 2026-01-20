<?php
declare(strict_types=1);

namespace Modules\Shared\Services;

use Engine\Publish\PublishKey;
use Engine\Publish\PublishedPayloadService;
use Modules\Shared\Contracts\PayloadBuilderInterface;

/**
 * PublishedJsonService
 *
 * Thin facade that:
 * - generates correct keys for each scope
 * - calls Engine publish service
 * - keeps payload_type strings centralized
 */
final class PublishedJsonService
{
    public function __construct(private PublishedPayloadService $publish) {}

    public function getOrBuildSharedContent(
		array $ctx,
		int $schemaVersion,
		PayloadBuilderInterface $builder,
		?string $builtBy = null
	): array {
		$key = PublishKey::sharedContent((string)$ctx['language_code'], $schemaVersion);

		return $this->publish->getOrBuild(
			payloadType: 'shared_content',
			keyCode: $key,
			schemaVersion: $schemaVersion,
			builder: fn() => $builder->build($ctx + ['schema_version' => $schemaVersion]),
			builtBy: $builtBy
		);
	}

    public function getOrBuildExerciseStaticContent(
        string $module,
        array $ctx,
        int $schemaVersion,
        PayloadBuilderInterface $builder,
        ?string $builtBy = null
    ): array {
        $key = PublishKey::exerciseStaticContent(
            $module,
            (int)$ctx['theme_id'],
            (int)$ctx['scenario_id'],
            (string)$ctx['language_code'],
            $schemaVersion
        );

        return $this->publish->getOrBuild(
            payloadType: 'exercise_static_content',
            keyCode: $key,
            schemaVersion: $schemaVersion,
            builder: fn() => $builder->build($ctx + ['schema_version' => $schemaVersion]),
            builtBy: $builtBy
        );
    }

    public function getOrBuildExerciseStateContent(
        string $module,
        array $ctx,
        int $schemaVersion,
        PayloadBuilderInterface $builder,
        ?string $builtBy = null
    ): array {
        $key = PublishKey::exerciseStateContent(
            $module,
            (int)$ctx['theme_id'],
            (int)$ctx['scenario_id'],
            (int)$ctx['state'],
            (string)$ctx['language_code'],
            $schemaVersion
        );

        return $this->publish->getOrBuild(
            payloadType: 'exercise_state_content',
            keyCode: $key,
            schemaVersion: $schemaVersion,
            builder: fn() => $builder->build($ctx + ['schema_version' => $schemaVersion]),
            builtBy: $builtBy
        );
    }
}