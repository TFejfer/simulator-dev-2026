<?php
declare(strict_types=1);

namespace Modules\Problem\Services\InfoSources;

use Modules\Problem\Services\InfoSources\Builders\InboxInfoSourceBuilder;
// Later: use Modules\Problem\Services\InfoSources\Builders\ProcessInfoSourceBuilder;
// Later: use Modules\Problem\Services\InfoSources\Builders\MaintenanceInfoSourceBuilder;
// Later: use Modules\Problem\Services\InfoSources\Builders\PerformanceInfoSourceBuilder;
// Later: use Modules\Problem\Services\InfoSources\Builders\SystemLogInfoSourceBuilder;
// Later: use Modules\Problem\Services\InfoSources\Builders\InspectAndActInfoSourceBuilder;

/**
 * ProblemInfoSourcesPayloadBuilder
 *
 * Purpose:
 * - Builds the complete json_payload structure for a given InfoSourceKey + schemaVersion.
 * - This is intentionally separate from the Service and Repository:
 *   - Repository = DB I/O (content reads + runtime published writes)
 *   - Service = caching/locking flow (read published or build)
 *   - PayloadBuilder = builds the payload content (composition of sources)
 *
 * Shared responsibilities for ALL info sources:
 * - Always return a stable structure:
 *   - meta: always present
 *   - sources: always present
 *   - each source returns a stable sub-structure (empty arrays/strings instead of null)
 * - Keep schemaVersion in meta and use it for payload structure changes
 *
 * Where to add next sources:
 * - Add new builder dependency to constructor
 * - Add a line under 'sources' to include the built output
 */
final class ProblemInfoSourcesPayloadBuilder
{
    public function __construct(
        private InboxInfoSourceBuilder $inboxBuilder

        // Later add builders here (DI-friendly):
        // private ProcessInfoSourceBuilder $processBuilder,
        // private MaintenanceInfoSourceBuilder $maintenanceBuilder,
        // private PerformanceInfoSourceBuilder $performanceBuilder,
        // private SystemLogInfoSourceBuilder $systemLogBuilder,
        // private InspectAndActInfoSourceBuilder $inspectAndActBuilder,
    ) {}

    /**
     * Build full payload (meta + sources).
     *
     * Shared rules:
     * - meta.built_at: we put a timestamp string here for the returned payload.
     *   (Optionally: overwrite it with the DB 'built_at' after upsertPublished, if you want DB as truth.)
     * - All sources must be arrays (no null).
     */
    public function build(InfoSourceKey $k, int $schemaVersion): array
    {
        // ---- Build each source (one at a time) ----
        // Inbox is content-based and state-agnostic, but returned in the same payload bundle.
        $inbox = $this->inboxBuilder->build($k);

        // Later (examples):
        // $process = $this->processBuilder->build($k);
        // $maintenance = $this->maintenanceBuilder->build($k);
        // $performance = $this->performanceBuilder->build($k); // likely state-dependent in some exercises
        // $systemLog = $this->systemLogBuilder->build($k);     // likely state-dependent in some exercises
        // $inspectAndAct = $this->inspectAndActBuilder->build($k);

        return [
            'meta' => $this->buildMeta($k, $schemaVersion),
            'sources' => [
                'inbox' => $inbox,

                // Insert next sources here:
                // 'process' => $process,
                // 'maintenance' => $maintenance,
                // 'performance' => $performance,
                // 'system_log' => $systemLog,
                // 'inspect_and_act' => $inspectAndAct,
            ],
        ];
    }

    /**
     * Shared function:
     * - Builds the meta block (same for all payloads).
     *
     * Notes:
     * - built_at: kept as an ISO-8601 string in UTC (client-friendly).
     * - schema_version: set explicitly for client-side compatibility checks.
     */
    private function buildMeta(InfoSourceKey $k, int $schemaVersion): array
    {
        return [
            'theme_id'       => $k->themeId,
            'scenario_id'    => $k->scenarioId,
            'state'          => $k->state,
            'language_code'  => $k->languageCode,
            'schema_version' => $schemaVersion,
            'built_at'       => gmdate('c'),
        ];
    }

    /**
     * Shared function (optional pattern for later):
     * - If you need a consistent empty structure per source (to guarantee stable JSON contracts),
     *   you can define "empty source templates" here.
     *
     * Example usage:
     * - return array_merge($this->emptyInbox(), $realInboxData);
     */
    private function emptyInbox(): array
    {
        return ['subject' => '', 'message' => ''];
    }

    // Later add empty templates here (optional):
    // private function emptyProcess(): array { return ['pro_video_id' => 0, 'pro_diagram_link' => '']; }
    // private function emptyMaintenance(): array { return ['history' => [], 'monthly' => []]; }
    // private function emptyPerformance(): array { return ['pes_video_id' => 0, 'pea_video_id_actual' => 0]; }
    // private function emptySystemLog(): array { return ['sls' => [], 'sla' => []]; }
    // private function emptyInspectAndAct(): array { return ['xml_link' => '', 'cabling_map' => []]; }
}