<?php
declare(strict_types=1);

namespace Modules\Problem\Services\InfoSources;

/**
 * InfoSourceKey
 *
 * Purpose:
 * - A small immutable value object holding the cache/build key.
 * - Shared by ALL info source builders and the published cache layer.
 *
 * Shared across all info sources:
 * - themeId, scenarioId: selects the exercise content
 * - state: can be used for dynamic sources (performance/system_log) but may be ignored for static ones
 * - languageCode: selects translated text
 * - schemaVersion: used for forward compatibility (change payload => bump schemaVersion)
 *
 * Notes:
 * - State can be "state-agnostic" for many sources (inbox/process/maintenance), but it is still part
 *   of the published row primary key, because the payload is returned as a bundle for a specific state.
 */
final class InfoSourceKey
{
    public function __construct(
        public readonly int $themeId,
        public readonly int $scenarioId,
        public readonly int $state,
        public readonly string $languageCode,
        public readonly int $schemaVersion = 1
    ) {}

    /**
     * Shared helper:
     * - Returns an array of PDO params used by *published* queries (runtime DB).
     * - Useful if you want a single canonical place for the published key params.
     *
     * Optional: You can also keep this helper in the Service instead of here if you prefer.
     */
    public function toPublishedParams(): array
    {
        return [
            ':theme_id'      => $this->themeId,
            ':scenario_id'   => $this->scenarioId,
            ':state'         => $this->state,
            ':language_code' => $this->languageCode,
        ];
    }

    /**
     * Shared helper:
     * - Standard lock key used for GET_LOCK / RELEASE_LOCK (runtime DB).
     * - Keeps lock naming consistent across all sources and schema versions.
     *
     * If you change naming, do it here (single source of truth).
     */
    public function toLockKey(int $schemaVersionOverride = null): string
    {
        $v = $schemaVersionOverride ?? $this->schemaVersion;

        return sprintf(
            'pub_info_sources:%d:%d:%d:%s:v%d',
            $this->themeId,
            $this->scenarioId,
            $this->state,
            $this->languageCode,
            $v
        );
    }
}