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
 * - number_of_causes:
 *     2 if ANY row exists in problem_ci_action_next_state with current_state > 20, else 1.
 * - has_causality:
 *     true if ANY row exists in problem_scenario_causality for the pair, else false.
 *
 * Notes:
 * - has_causality is computed independently from number_of_causes to tolerate data inconsistencies.
 * - Repository uses in-request memoization (static cache) to avoid repeated DB hits.
 * - Optional APCu caching can be enabled if you want cross-request caching.
 */
final class ProblemScenarioMetaRepository
{
    /** @var array<string, array{number_of_causes:int, has_causality:bool}> */
    private static array $memo = [];

    public function __construct(
        private PDO $dbContent,
        private bool $useApcu = false,
        private int $apcuTtlSeconds = 300
    ) {}

    /**
     * @return array{number_of_causes:int, has_causality:bool}
     */
    public function getMeta(int $themeId, int $scenarioId): array
    {
        if ($themeId <= 0 || $scenarioId <= 0) {
            // Fail-safe defaults
            return [
                'number_of_causes' => 1,
                'has_causality'    => false,
            ];
        }

        $key = $themeId . ':' . $scenarioId;

        // In-request cache
        if (isset(self::$memo[$key])) {
            return self::$memo[$key];
        }

        // Optional APCu cache (cross-request)
        if ($this->useApcu && function_exists('apcu_fetch')) {
            $apcuKey = 'scenario_meta:' . $key;
            $cached = apcu_fetch($apcuKey, $ok);
            if ($ok && is_array($cached)
                && isset($cached['number_of_causes'], $cached['has_causality'])
            ) {
                self::$memo[$key] = [
                    'number_of_causes' => (int)$cached['number_of_causes'],
                    'has_causality'    => (bool)$cached['has_causality'],
                ];
                return self::$memo[$key];
            }
        }

        // Single query to compute both fields
        $stmt = $this->dbContent->prepare("
            SELECT
                -- 2 causes if any current_state > 20 exists, else 1
                CASE
                    WHEN COALESCE(MAX(CASE WHEN ns.current_state > 20 THEN 1 ELSE 0 END), 0) = 1 THEN 2
                    ELSE 1
                END AS number_of_causes,

                -- has_causality if a row exists in causality table
                CASE
                    WHEN COALESCE(MAX(CASE WHEN c.theme_id IS NOT NULL THEN 1 ELSE 0 END), 0) = 1 THEN 1
                    ELSE 0
                END AS has_causality

            FROM problem_ci_action_next_state ns
            LEFT JOIN problem_scenario_causality c
                ON c.theme_id = ns.theme_id
               AND c.scenario_id = ns.scenario_id
            WHERE ns.theme_id = :theme_id
              AND ns.scenario_id = :scenario_id
        ");

        $stmt->execute([
            ':theme_id'    => $themeId,
            ':scenario_id' => $scenarioId,
        ]);

        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        // If the scenario has no rows in ns, we still want has_causality from causality table.
        // Handle that with a cheap fallback exists-query.
        if (!$row) {
            $exists = $this->existsCausalityRow($themeId, $scenarioId);
            $result = [
                'number_of_causes' => 1,
                'has_causality'    => $exists,
            ];
            self::$memo[$key] = $result;
            $this->storeApcu($key, $result);
            return $result;
        }

        $result = [
            'number_of_causes' => (int)($row['number_of_causes'] ?? 1),
            'has_causality'    => ((int)($row['has_causality'] ?? 0) === 1),
        ];

        self::$memo[$key] = $result;
        $this->storeApcu($key, $result);

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

    /** @param array{number_of_causes:int, has_causality:bool} $result */
    private function storeApcu(string $key, array $result): void
    {
        if (!$this->useApcu || !function_exists('apcu_store')) return;
        apcu_store('scenario_meta:' . $key, $result, $this->apcuTtlSeconds);
    }
}