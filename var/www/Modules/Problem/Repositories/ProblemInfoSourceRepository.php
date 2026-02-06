<?php
declare(strict_types=1);

namespace Modules\Problem\Repositories;

use InvalidArgumentException;
use PDO;
use PDOStatement;
use Modules\Problem\Services\InfoSources\InfoSourceKey;

/**
 * ProblemInfoSourceRepository
 *
 * Read/write split:
 * - $dbRuntime: RUNTIME (runtime)  -> published payloads + locks
 * - $dbProblemContent: PROBLEM_CONTENT (content)  -> info source content (i18n, logs, maps, videos, etc.)
 *
 * Design goals:
 * - Stable contracts (always return arrays, safe fallbacks)
 * - Strict validation for dynamic table names
 * - Centralized EN fallback behavior where it matters
 */
final class ProblemInfoSourceRepository
{
    public function __construct(
        private PDO $dbProblemContent,
        private PDO $dbRuntime
    ) {}

    /* ============================================================
       PUBLISHED PAYLOADS (runtime DB)
       ============================================================ */

    public function readPublished(InfoSourceKey $k): ?array
    {
        $stmt = $this->dbRuntime->prepare("
            SELECT
              theme_id, scenario_id, state, language_code,
              schema_version,
              json_payload,
              built_at
            FROM problem_info_sources_published
            WHERE theme_id      = :theme_id
              AND scenario_id   = :scenario_id
              AND state         = :state
              AND language_code = :language_code
            LIMIT 1
        ");

        $stmt->execute([
            ':theme_id'      => $k->themeId,
            ':scenario_id'   => $k->scenarioId,
            ':state'         => $k->state,
            ':language_code' => $k->languageCode,
        ]);

        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }

    public function upsertPublished(
        InfoSourceKey $k,
        int $schemaVersion,
        array $payload,
        string $builtBy = 'server'
    ): void {
        $json = json_encode(
            $payload,
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
        );

        $stmt = $this->dbRuntime->prepare("
            INSERT INTO problem_info_sources_published (
              theme_id, scenario_id, state, language_code,
              schema_version, json_payload, built_at, built_by
            )
            VALUES (
              :theme_id, :scenario_id, :state, :language_code,
              :schema_version, CAST(:json_payload AS JSON), NOW(), :built_by
            )
            ON DUPLICATE KEY UPDATE
              schema_version = VALUES(schema_version),
              json_payload   = VALUES(json_payload),
              built_at       = VALUES(built_at),
              built_by       = VALUES(built_by),
              updated_at     = CURRENT_TIMESTAMP
        ");

        $stmt->execute([
            ':theme_id'       => $k->themeId,
            ':scenario_id'    => $k->scenarioId,
            ':state'          => $k->state,
            ':language_code'  => $k->languageCode,
            ':schema_version' => $schemaVersion,
            ':json_payload'   => $json,
            ':built_by'       => $builtBy,
        ]);
    }

    public function deletePublished(InfoSourceKey $k): void
    {
        $stmt = $this->dbRuntime->prepare("
            DELETE FROM problem_info_sources_published
            WHERE theme_id      = :theme_id
              AND scenario_id   = :scenario_id
              AND state         = :state
              AND language_code = :language_code
        ");

        $stmt->execute([
            ':theme_id'      => $k->themeId,
            ':scenario_id'   => $k->scenarioId,
            ':state'         => $k->state,
            ':language_code' => $k->languageCode,
        ]);
    }

    /* ============================================================
       BUILD LOCKS (runtime DB)
       - Prevents concurrent rebuild of same payload.
       ============================================================ */

    public function acquireLock(InfoSourceKey $k, int $schemaVersion, int $timeoutSeconds = 10): bool
    {
        $stmt = $this->dbRuntime->prepare("SELECT GET_LOCK(:k, :t) AS got");
        $stmt->execute([
            ':k' => $this->lockKey($k, $schemaVersion),
            ':t' => $timeoutSeconds,
        ]);

        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return isset($row['got']) && (int)$row['got'] === 1;
    }

    public function releaseLock(InfoSourceKey $k, int $schemaVersion): void
    {
        $stmt = $this->dbRuntime->prepare("SELECT RELEASE_LOCK(:k) AS rel");
        $stmt->execute([':k' => $this->lockKey($k, $schemaVersion)]);
    }

    private function lockKey(InfoSourceKey $k, int $schemaVersion): string
    {
        return sprintf(
            'pub_info_sources:%d:%d:%d:%s:v%d',
            $k->themeId,
            $k->scenarioId,
            $k->state,
            $k->languageCode,
            $schemaVersion
        );
    }

    /* ============================================================
       INBOX (content DB)
       - Missing/empty translation => fallback to source_text (EN)
       ============================================================ */

    public function readInboxTexts(int $themeId, int $scenarioId, string $languageCode): array
    {
        $stmt = $this->dbProblemContent->prepare("
            SELECT
              m.category,
              COALESCE(NULLIF(TRIM(t.translated_text), ''), m.source_text) AS text_value
            FROM i18n_inbox_master m
            LEFT JOIN i18n_inbox_translations t
              ON t.master_id = m.id
             AND t.language_code = :language_code
            WHERE m.theme_id    = :theme_id
              AND m.scenario_id = :scenario_id
        ");

        $stmt->execute([
            ':theme_id'      => $themeId,
            ':scenario_id'   => $scenarioId,
            ':language_code' => $languageCode,
        ]);

        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    /* ============================================================
       PROCESS (content DB)
       - Prefer requested language; fallback to EN.
       ============================================================ */

    public function readProcessVideoId(int $themeId, string $languageCode): int
    {
        $val = $this->fetchOneInt("
            SELECT video_id
            FROM process_videos
            WHERE theme_id = :theme_id
              AND language_code = :language_code
            LIMIT 1
        ", [
            ':theme_id'      => $themeId,
            ':language_code' => $languageCode,
        ]);

        if ($val !== null) {
            return $val;
        }

        if ($languageCode === 'en') {
            return 0;
        }

        $val = $this->fetchOneInt("
            SELECT video_id
            FROM process_videos
            WHERE theme_id = :theme_id
              AND language_code = 'en'
            LIMIT 1
        ", [
            ':theme_id' => $themeId,
        ]);

        return $val ?? 0;
    }

    /* ============================================================
       MAINTENANCE (content DB)
       ============================================================ */

    /**
     * Maintenance history rows.
     * - item_date matches legacy behavior (CURDATE() - days_back)
     */
    public function readMaintenanceHistoryRows(int $themeId, int $scenarioId): array
    {
        $stmt = $this->dbProblemContent->prepare("
            SELECT
              sentence_id,
              days_back,
              time_start,
              time_end,
              DATE_SUB(CURDATE(), INTERVAL days_back DAY) AS item_date
            FROM maintenance_history
            WHERE theme_id = :theme_id
              AND scenario_id = :scenario_id
            ORDER BY
              days_back ASC,
              time_start DESC
        ");

        $stmt->execute([
            ':theme_id'    => $themeId,
            ':scenario_id' => $scenarioId,
        ]);

        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    /**
     * Maintenance monthly sentence ids (legacy behavior: scenario_id = 0).
     */
    public function readMaintenanceMonthlySentenceIds(int $themeId): array
    {
        $stmt = $this->dbProblemContent->prepare("
            SELECT sentence_id
            FROM maintenance_monthly
            WHERE theme_id = :theme_id
              AND scenario_id = 0
            ORDER BY id ASC
        ");

        $stmt->execute([':theme_id' => $themeId]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    /**
     * Translate a maintenance term by key_code (= legacy sentence id).
     * - Missing/empty translation => fallback to source_text (EN)
     * - Not found => empty string
     */
    public function readMaintenanceTermText(int $sentenceId, string $languageCode): string
    {
        $val = $this->fetchOneString("
            SELECT COALESCE(NULLIF(TRIM(t.translated_text), ''), m.source_text) AS text_value
            FROM i18n_maintenance_terms_master m
            LEFT JOIN i18n_maintenance_terms_translations t
              ON t.master_id = m.id
             AND t.language_code = :language_code
            WHERE m.key_code = :key_code
            LIMIT 1
        ", [
            ':language_code' => $languageCode,
            ':key_code'      => (string)$sentenceId,
        ]);

        if ($val !== null) {
            return $val;
        }

        // Practical fallback: EN source_text
        if ($languageCode === 'en') {
            return '';
        }

        $val = $this->fetchOneString("
            SELECT m.source_text
            FROM i18n_maintenance_terms_master m
            WHERE m.key_code = :key_code
            LIMIT 1
        ", [
            ':key_code' => (string)$sentenceId,
        ]);

        return $val ?? '';
    }

    /* ============================================================
       PERFORMANCE (content DB)
       ============================================================ */

    public function readPerformanceShouldVideoId(int $themeId): int
    {
        $val = $this->fetchOneInt("
            SELECT video_id
            FROM performance_should
            WHERE theme_id = :theme_id
            LIMIT 1
        ", [
            ':theme_id' => $themeId,
        ]);

        return $val ?? 0;
    }

    public function readPerformanceActualVideoId(int $themeId, int $scenarioId, int $state): int
    {
        $val = $this->fetchOneInt("
            SELECT video_id
            FROM performance_actual
            WHERE theme_id = :theme_id
              AND scenario_id = :scenario_id
              AND state = :state
            LIMIT 1
        ", [
            ':theme_id'    => $themeId,
            ':scenario_id' => $scenarioId,
            ':state'       => $state,
        ]);

        return $val ?? 0;
    }

    /* ============================================================
       SYSTEM LOG (content DB)
       ============================================================ */

    /**
     * Check if a table exists in the content database (SYSTEMLOGV6).
     */
    public function contentTableExists(string $tableName): bool
    {
        $stmt = $this->dbProblemContent->prepare("
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = DATABASE()
              AND table_name = :t
            LIMIT 1
        ");
        $stmt->execute([':t' => $tableName]);

        return (bool)$stmt->fetchColumn();
    }

    /**
     * SLA exception mapping for "actual" logs.
     * Returns null if no mapping exists.
     */
    public function readSlaException(array $params): ?array
    {
        $stmt = $this->dbProblemContent->prepare("
            SELECT same_as_scenario_id, same_as_state
            FROM system_log_exceptions_sla
            WHERE theme_id = :theme_id
              AND scenario_id = :scenario_id
              AND state = :state
            LIMIT 1
        ");

        $stmt->execute($params);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    /**
     * Read parsed rows from a systemlog__* table.
     *
     * NOTE:
     * - Table name cannot be bound, so we strictly validate it before use.
     * - Only these patterns are allowed:
     *   - systemlog__slsNN
     *   - systemlog__slaNNNNNN  (theme+scenario+state, each 2 digits)
     */
    public function readSystemLogParsedRows(string $tableName): array
    {
        if (!$this->isAllowedSystemLogTable($tableName)) {
            throw new InvalidArgumentException('Invalid system log table name.');
        }

        $sql = "
            SELECT
              log_number,
              log_time,
              log_source,
              log_destination,
              msg_type,
              msg_key,
              args_json,
              msg_body
            FROM {$tableName}
            ORDER BY log_number ASC
        ";

        $stmt = $this->dbProblemContent->prepare($sql);
        $stmt->execute();

        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    /**
     * Fetch message templates by msg_key.
     * Fallback: missing/empty translation => source_text (EN).
     *
     * Returns: [key_code => template_text]
     */
    public function readSystemLogMessageTemplates(array $msgKeys, string $languageCode): array
    {
        $msgKeys = array_values(array_unique(array_filter(array_map('strval', $msgKeys))));
        if (!$msgKeys) return [];

        $in = implode(',', array_fill(0, count($msgKeys), '?'));

        $stmt = $this->dbProblemContent->prepare("
            SELECT
              m.key_code,
              COALESCE(NULLIF(TRIM(t.translated_text), ''), m.source_text) AS template_text
            FROM i18n_system_log_message_master m
            LEFT JOIN i18n_system_log_message_translations t
              ON t.key_code = m.key_code
             AND t.language_code = ?
            WHERE m.key_code IN ($in)
        ");

        $stmt->execute(array_merge([$languageCode], $msgKeys));

        $out = [];
        foreach (($stmt->fetchAll(PDO::FETCH_ASSOC) ?: []) as $r) {
            $out[(string)$r['key_code']] = (string)$r['template_text'];
        }
        return $out;
    }

    /**
     * Fetch constant translations by key_code (e.g. COLOR.RED).
     * Fallback: missing/empty translation => source_text (EN).
     *
     * Returns: [key_code => translated_text]
     */
    public function readSystemLogConstantsByKeyCodes(array $keyCodes, string $languageCode): array
    {
        $keyCodes = array_values(array_unique(array_filter(array_map('strval', $keyCodes))));
        if (!$keyCodes) return [];

        $in = implode(',', array_fill(0, count($keyCodes), '?'));

        $stmt = $this->dbProblemContent->prepare("
            SELECT
              m.key_code,
              COALESCE(NULLIF(TRIM(t.translated_text), ''), m.source_text) AS constant_text
            FROM i18n_system_log_constant_master m
            LEFT JOIN i18n_system_log_constant_translations t
              ON t.constant_id = m.id
             AND t.language_code = ?
            WHERE m.key_code IN ($in)
        ");

        $stmt->execute(array_merge([$languageCode], $keyCodes));

        $out = [];
        foreach (($stmt->fetchAll(PDO::FETCH_ASSOC) ?: []) as $r) {
            $out[(string)$r['key_code']] = (string)$r['constant_text'];
        }
        return $out;
    }

    /**
     * Fetch CI type labels from SYSTEMLOGV6 i18n CI tables.
     *
     * Input:
     * - numeric typeIds (e.g. 54 from "54A")
     *
     * Lookup:
     * - master.key_code stores the 2-digit string (e.g. "54")
     *
     * Returns:
     * - [typeId(int) => label(string)]
     */
    public function readCiTypeLabels(array $typeIds, string $languageCode): array
    {
        $typeIds = array_values(array_unique(array_map('intval', $typeIds)));
        $typeIds = array_values(array_filter($typeIds, static fn(int $x) => $x > 0));
        if (!$typeIds) return [];

        $keyCodes = array_map(static fn(int $id) => sprintf('%02d', $id), $typeIds);
        $in       = implode(',', array_fill(0, count($keyCodes), '?'));

        $stmt = $this->dbProblemContent->prepare("
            SELECT
              m.key_code,
              COALESCE(NULLIF(TRIM(t.translated_text), ''), m.source_text) AS label
            FROM i18n_configuration_item_types_master m
            LEFT JOIN i18n_configuration_item_types_translations t
              ON t.master_id = m.id
             AND t.language_code = ?
            WHERE m.key_code IN ($in)
        ");

        $stmt->execute(array_merge([$languageCode], $keyCodes));

        $labelsByKeyCode = [];
        foreach (($stmt->fetchAll(PDO::FETCH_ASSOC) ?: []) as $r) {
            $labelsByKeyCode[(string)$r['key_code']] = (string)$r['label'];
        }

        // Convert back to [int => label] using original ids
        $out = [];
        foreach ($typeIds as $id) {
            $kc = sprintf('%02d', $id);
            if (isset($labelsByKeyCode[$kc])) {
                $out[$id] = $labelsByKeyCode[$kc];
            }
        }

        return $out;
    }

    private function isAllowedSystemLogTable(string $tableName): bool
    {
        return (bool)preg_match(
            '/^systemlog__sls[0-9]{2}$|^systemlog__sla[0-9]{6}$/',
            $tableName
        );
    }

    /* ============================================================
       INSPECT & ACT (content DB)
       ============================================================ */

    /**
     * Read action list override ("same as") mapping.
     * - If no row exists => caller uses original scenario/state.
     */
    public function readActionListOverride(array $params): ?array
    {
        $stmt = $this->dbProblemContent->prepare("
            SELECT
              theme_id,
              scenario_id,
              state,
              new_scenario_id,
              new_state
            FROM action_lists
            WHERE theme_id = :theme_id
              AND scenario_id = :scenario_id
              AND state = :state
            LIMIT 1
        ");

        $stmt->execute($params);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    /**
     * Read cabling map rows (theme-specific).
     */
    public function readCablingMapRows(array $params): array
    {
        $stmt = $this->dbProblemContent->prepare("
            SELECT
              theme_id,
              cu_ci_id,
              port_code,
              connected_ci_id
            FROM cabling_map
            WHERE theme_id = :theme_id
            ORDER BY cu_ci_id, port_code
        ");

        $stmt->execute($params);
        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    public function readCiDescriptionTexts(int $themeId, string $languageCode): array
    {
        $stmt = $this->dbProblemContent->prepare("
            SELECT
				m.type_id AS ci_type_id,
                COALESCE(NULLIF(TRIM(t.translated_text), ''), m.source_text) AS ci_text,
                m.sequence_no
            FROM cis_in_themes cit
            JOIN i18n_ci_description_master m
                ON m.type_id = cit.ci_type_id
            LEFT JOIN i18n_ci_description_translations t
                ON t.master_id = m.id
            AND t.language_code = :language_code
            WHERE cit.theme_id = :theme_id;
        ");

        $stmt->execute([
            ':theme_id'      => $themeId,
            ':language_code' => $languageCode,
        ]);

        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    public function readCiActionBenefitTexts(int $themeId, string $languageCode): array
    {
        $stmt = $this->dbProblemContent->prepare("
            SELECT
				m.type_id AS ci_type_id, m.action_id,
                COALESCE(NULLIF(TRIM(t.translated_text), ''), m.source_text) AS text,
                m.sequence_no
            FROM cis_in_themes cit
            JOIN i18n_ci_action_benefit_master m
                ON m.type_id = cit.ci_type_id
            LEFT JOIN i18n_ci_action_benefit_translations t
                ON t.master_id = m.id
            AND t.language_code = :language_code
            WHERE cit.theme_id = :theme_id;
        ");

        $stmt->execute([
            ':theme_id'      => $themeId,
            ':language_code' => $languageCode,
        ]);

        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }


    public function readCiActionCostAndTime(int $themeId): array
    {
        $stmt = $this->dbProblemContent->prepare("
            SELECT
                tac.ci_type_id, tac.action_id, tac.cost, tac.time_min
            FROM cis_in_themes cit
            JOIN problem_ci_action_time_and_cost tac
                ON tac.ci_type_id = cit.ci_type_id
            WHERE cit.theme_id = :theme_id;
        ");

        $stmt->execute([
            ':theme_id'      => $themeId,
        ]);

        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    /* ============================================================
       SMALL HELPERS
       ============================================================ */

    private function fetchOneInt(string $sql, array $params): ?int
    {
        $stmt = $this->dbProblemContent->prepare($sql);
        $stmt->execute($params);

        $val = $stmt->fetchColumn();
        if ($val === false || $val === null) {
            return null;
        }

        return (int)$val;
    }

    private function fetchOneString(string $sql, array $params): ?string
    {
        $stmt = $this->dbProblemContent->prepare($sql);
        $stmt->execute($params);

        $val = $stmt->fetchColumn();
        if ($val === false || $val === null) {
            return null;
        }

        return (string)$val;
    }
}
