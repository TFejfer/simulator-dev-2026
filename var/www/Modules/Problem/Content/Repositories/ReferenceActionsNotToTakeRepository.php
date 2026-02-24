<?php
declare(strict_types=1);

namespace Modules\Problem\Content\Repositories;

use PDO;

final class ReferenceActionsNotToTakeRepository
{
    public function __construct(private PDO $dbProblemContent) {}

    /**
     * @return array<int, array{ciID:string, fact:string}>
     */
    public function read(int $themeId, int $scenarioId): array
    {
        if ($themeId <= 0 || $scenarioId <= 0) return [];

        $stmt = $this->dbProblemContent->prepare("
            SELECT
                ci_id AS ciID,
                fact_code AS fact
            FROM reference_actions_not_to_take
            WHERE theme_id = :theme_id
              AND scenario_id = :scenario_id
        ");
        $stmt->execute([
            ':theme_id' => $themeId,
            ':scenario_id' => $scenarioId,
        ]);

        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        return is_array($rows) ? $rows : [];
    }
}
