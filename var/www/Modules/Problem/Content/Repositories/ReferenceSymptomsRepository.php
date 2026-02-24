<?php
declare(strict_types=1);

namespace Modules\Problem\Content\Repositories;

use PDO;

final class ReferenceSymptomsRepository
{
    public function __construct(private PDO $dbProblemContent) {}

    /**
     * @param int[] $states
     * @return array<int, array{deviationID:int, functionID:int, priority:int, clarify:string}>
     */
    public function read(int $themeId, int $scenarioId, array $states): array
    {
        if ($themeId <= 0 || $scenarioId <= 0) return [];

        $states = array_values(array_unique(array_map('intval', $states)));
        $states = array_filter($states, static fn($v) => $v > 0);
        if (!$states) return [];

        $ph = [];
        $params = [
            ':theme_id' => $themeId,
            ':scenario_id' => $scenarioId,
        ];
        foreach ($states as $i => $state) {
            $key = ':state' . $i;
            $ph[] = $key;
            $params[$key] = $state;
        }

        $stmt = $this->dbProblemContent->prepare("
            SELECT
                deviation_id AS deviationID,
                function_id AS functionID,
                COALESCE(is_priority, 0) AS priority,
                key_code AS clarify
            FROM i18n_reference_symptoms_master
            WHERE theme_id = :theme_id
              AND scenario_id = :scenario_id
              AND state IN (" . implode(', ', $ph) . ")
            ORDER BY sequence_no ASC, id ASC
        ");
        $stmt->execute($params);

        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        return is_array($rows) ? $rows : [];
    }
}
