<?php
declare(strict_types=1);

namespace Modules\Problem\Content\Repositories;

use PDO;

/**
 * ProblemScenarioMetaRepository
 *
 * Reads scenario design meta from PROBLEM_CONTENT.
 *
 * Derivations (by theme_id + scenario_id):
 * - has_multiple_causes:
 *     true if ANY row exists in problem_ci_action_next_state with current_state > 20, else false.
 * - has_causality:
 *     true if ANY row exists in problem_scenario_causality for the pair, else false.
 *
 * Notes:
 * - has_causality is computed independently from has_multiple_causes to tolerate data inconsistencies.
 * - Repository uses in-request memoization (static cache) to avoid repeated DB hits.
 * - Optional APCu caching can be enabled if you want cross-request caching.
 */
final class ProblemScenarioMetaRepository
{
    /** @var array<string,bool> */
    private static array $memoHasMultipleCauses = [];

    /** @var array<string,bool> */
    private static array $memoHasCausality = [];

    public function __construct(
        private PDO $dbContent,
        private bool $useApcu = false,
        private int $apcuTtlSeconds = 300
    ) {}

    public function hasMultipleCauses(int $themeId, int $scenarioId): bool
    {
        if ($themeId <= 0 || $scenarioId <= 0) return false;

        $key = $themeId . ':' . $scenarioId;

        if (isset(self::$memoHasMultipleCauses[$key])) {
            return self::$memoHasMultipleCauses[$key];
        }

        if ($this->useApcu && function_exists('apcu_fetch')) {
            $apcuKey = 'scenario_meta:has_multiple_causes:' . $key;
            $cached = apcu_fetch($apcuKey, $ok);
            if ($ok && (is_bool($cached) || is_numeric($cached))) {
                $val = is_bool($cached) ? $cached : ((int)$cached === 1);
                self::$memoHasMultipleCauses[$key] = $val;
                return self::$memoHasMultipleCauses[$key];
            }
        }

        $stmt = $this->dbContent->prepare("
            SELECT
                CASE
                    WHEN COALESCE(MAX(CASE WHEN current_state > 20 THEN 1 ELSE 0 END), 0) = 1 THEN 1
                    ELSE 0
                END AS has_multiple_causes
            FROM problem_ci_action_next_state
            WHERE theme_id = :theme_id
              AND scenario_id = :scenario_id
        ");

        $stmt->execute([
            ':theme_id'    => $themeId,
            ':scenario_id' => $scenarioId,
        ]);

        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $result = ((int)($row['has_multiple_causes'] ?? 0) === 1);

        self::$memoHasMultipleCauses[$key] = $result;
        $this->storeApcuValue('scenario_meta:has_multiple_causes:' . $key, $result ? 1 : 0);

        return $result;
    }

    public function hasCausality(int $themeId, int $scenarioId): bool
    {
        if ($themeId <= 0 || $scenarioId <= 0) return false;

        $key = $themeId . ':' . $scenarioId;

        if (isset(self::$memoHasCausality[$key])) {
            return self::$memoHasCausality[$key];
        }

        if ($this->useApcu && function_exists('apcu_fetch')) {
            $apcuKey = 'scenario_meta:has_causality:' . $key;
            $cached = apcu_fetch($apcuKey, $ok);
            if ($ok && (is_bool($cached) || is_numeric($cached))) {
                $val = is_bool($cached) ? $cached : ((int)$cached === 1);
                self::$memoHasCausality[$key] = $val;
                return self::$memoHasCausality[$key];
            }
        }

        $result = $this->existsCausalityRow($themeId, $scenarioId);

        self::$memoHasCausality[$key] = $result;
        $this->storeApcuValue('scenario_meta:has_causality:' . $key, $result ? 1 : 0);

        return $result;
    }

    private function existsCausalityRow(int $themeId, int $scenarioId): bool
    {
        $stmt = $this->dbContent->prepare("
            SELECT 1
            FROM problem_scenario_causality
            WHERE theme_id = :theme_id
              AND scenario_id = :scenario_id
            LIMIT 1
        ");
        $stmt->execute([
            ':theme_id'    => $themeId,
            ':scenario_id' => $scenarioId,
        ]);
        return (bool)$stmt->fetchColumn();
    }

    private function storeApcuValue(string $key, int $value): void
    {
        if (!$this->useApcu || !function_exists('apcu_store')) return;
        apcu_store($key, $value, $this->apcuTtlSeconds);
    }
}