<?php
declare(strict_types=1);

namespace Modules\Problem\Services;

use RuntimeException;
use Modules\Problem\Repositories\ProblemInfoSourceRepository;
use Modules\Problem\Services\InfoSources\InfoSourceKey;
use Modules\Problem\Services\InfoSources\Builders\InboxInfoSourceBuilder;
use Modules\Problem\Services\InfoSources\Builders\ProcessInfoSourceBuilder;
use Modules\Problem\Services\InfoSources\Builders\MaintenanceInfoSourceBuilder;
use Modules\Problem\Services\InfoSources\Builders\PerformanceInfoSourceBuilder;
use Modules\Problem\Services\InfoSources\Builders\SystemLogInfoSourceBuilder;
use Modules\Problem\Services\InfoSources\Builders\InspectAndActInfoSourceBuilder;

final class ProblemInfoSourceService
{
    public function __construct(
        private ProblemInfoSourceRepository $repo,
        private InboxInfoSourceBuilder $inboxBuilder,
		private ProcessInfoSourceBuilder $processBuilder,
		private MaintenanceInfoSourceBuilder $maintenanceBuilder,
		private PerformanceInfoSourceBuilder $performanceBuilder,
		private SystemLogInfoSourceBuilder $systemLogBuilder,
		private InspectAndActInfoSourceBuilder $inspectAndActBuilder
    ) {}

    /**
     * Read published JSON payload (runtime DB) or build it (content DB), then publish (runtime DB).
     *
     * Common behaviors:
     * - Stable contract: always returns a payload with meta + sources keys.
     * - Caching: stored in problem_info_sources_published.
     * - Concurrency-safe: uses GET_LOCK to avoid double-building.
     */
    public function getPublishedOrBuild(InfoSourceKey $k, int $schemaVersion = 1): array
    {
        $row = $this->repo->readPublished($k);

        if ($row && (int)$row['schema_version'] === $schemaVersion) {
            return json_decode($row['json_payload'], true, flags: JSON_THROW_ON_ERROR);
        }

        if (!$this->repo->acquireLock($k, $schemaVersion, 10)) {
            // Another process is building. Re-read published row.
            $row = $this->repo->readPublished($k);
            if ($row) {
                return json_decode($row['json_payload'], true, flags: JSON_THROW_ON_ERROR);
            }
            throw new RuntimeException('Could not acquire build lock and no published row exists.');
        }

        try {
            // Double-check under lock
            $row = $this->repo->readPublished($k);
            if ($row && (int)$row['schema_version'] === $schemaVersion) {
                return json_decode($row['json_payload'], true, flags: JSON_THROW_ON_ERROR);
            }

            // Build payload from content DB
            $payload = $this->buildPayload($k, $schemaVersion);

            // Publish payload to runtime DB (cache)
            $this->repo->upsertPublished($k, $schemaVersion, $payload, 'server');

            return $payload;
        } finally {
            $this->repo->releaseLock($k, $schemaVersion);
        }
    }

    /**
     * Build payload. Keep this stable even if some sources are missing:
     * - Missing translation -> fallback to source text (done in repo query).
     * - Missing rows -> return empty structure, NOT null.
     */
    private function buildPayload(InfoSourceKey $k, int $schemaVersion): array
    {
        // Build each info source (one-by-one)
        $inbox = $this->inboxBuilder->build($k);
		$process = $this->processBuilder->build($k);
		$maintenance = $this->maintenanceBuilder->build($k);
		$performance = $this->performanceBuilder->build($k);
		$systemLog = $this->systemLogBuilder->build($k);
		$inspectAndAct = $this->inspectAndActBuilder->build($k);

        return [
            'meta' => $this->buildMeta($k, $schemaVersion),
            'sources' => [
                'inbox' => $inbox,
				'process' => $process,
				'maintenance' => $maintenance,
				'performance' => $performance,
				'system_log' => $systemLog,
				'inspect_and_act' => $inspectAndAct,
            ],
        ];
    }

    /**
     * Shared function:
     * - Builds the meta block (same for all payloads).
     */
    private function buildMeta(InfoSourceKey $k, int $schemaVersion): array
    {
        return [
            'theme_id' => $k->themeId,
            'scenario_id' => $k->scenarioId,
            'state' => $k->state,
            'language_code' => $k->languageCode,
            'schema_version' => $schemaVersion,
            'built_at' => gmdate('c'),
        ];
    }
}
