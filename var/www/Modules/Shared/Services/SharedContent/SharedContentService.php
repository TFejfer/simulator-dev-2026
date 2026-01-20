<?php
declare(strict_types=1);

namespace Modules\Shared\Services\SharedContent;

use Modules\Shared\Services\PublishedJsonService;
use Modules\Shared\Services\SharedContent\Builders\SharedContentPayloadBuilder;

/**
 * SharedContentService
 *
 * Orchestrates shared content publishing for (access_id + language_code).
 */
final class SharedContentService
{
    public function __construct(
        private PublishedJsonService $published,
        private SharedContentPayloadBuilder $builder
    ) {}

    public function getOrBuild(array $deliveryMeta, int $schemaVersion = 1): array
	{
		$ctx = [
			'language_code' => (string)$deliveryMeta['language_code'],
		];

		return $this->published->getOrBuildSharedContent(
			ctx: $ctx,
			schemaVersion: $schemaVersion,
			builder: $this->builder,
			builtBy: 'SharedContentService'
		);
	}
}