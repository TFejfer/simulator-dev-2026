<?php
declare(strict_types=1);

namespace Modules\Problem\Content\Repositories;

use PDO;

final class ReferenceFactsRepository
{
    public function __construct(private PDO $dbProblemContent) {}

    /**
     * @param int[] $states
     * @return array<int, array{keyMeta:string, keyValue:mixed, text:string}>
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
                key_meta AS keyMeta,
                key_value AS keyValue,
                key_code AS text
            FROM i18n_reference_facts_master
            WHERE theme_id = :theme_id
              AND scenario_id = :scenario_id
              AND state IN (" . implode(', ', $ph) . ")
            ORDER BY id ASC
        ");
        $stmt->execute($params);

        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        return is_array($rows) ? $rows : [];
    }
}
