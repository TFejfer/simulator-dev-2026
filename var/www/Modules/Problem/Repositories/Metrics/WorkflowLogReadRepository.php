<?php
declare(strict_types=1);

namespace Modules\Problem\Repositories\Metrics;

use PDO;

final class WorkflowLogReadRepository
{
    public function __construct(private PDO $dbRuntime) {}

    /**
     * @param int[] $teamNos
     * @return array<int, array<string,mixed>>
     */
    public function findWorkflowData(
        int $accessId,
        array $teamNos,
        int $teamNo,
        int $colTeamNo,
        int $outlineId,
        int $exerciseNo,
        int $themeId,
        int $scenarioId
    ): array {
        if ($accessId <= 0 || $outlineId <= 0 || $exerciseNo <= 0 || $themeId <= 0 || $scenarioId <= 0) {
            return [];
        }

        $teamNos = array_values(array_unique(array_map('intval', $teamNos)));
        $teamNos = array_filter($teamNos, static fn($v) => $v > 0);
        if (!$teamNos) {
            return [];
        }

        $teamPlaceholders = [];
        $params = [
            ':access_id' => $accessId,
            ':outline_id' => $outlineId,
            ':exercise_no' => $exerciseNo,
            ':theme_id' => $themeId,
            ':scenario_id' => $scenarioId,
            ':team_no' => $teamNo,
            ':col_team_no' => $colTeamNo,
        ];
        foreach ($teamNos as $i => $t) {
            $ph = ':team' . $i;
            $teamPlaceholders[] = $ph;
            $params[$ph] = $t;
        }

        $inClause = implode(', ', $teamPlaceholders);

        $stmt = $this->dbRuntime->prepare("
            SELECT
                t1.id,
                UNIX_TIMESTAMP(t1.created_at) AS epochTs,
                CASE
                    WHEN tstart.start_ts IS NULL THEN 0
                    ELSE TIMESTAMPDIFF(SECOND, tstart.start_ts, t1.created_at)
                END AS tix,
                t1.crud,
                t1.ci_id AS ciID,
                t1.action_id AS actionID,
                t1.deviation_id AS deviationID,
                t1.function_id AS functionID,
                t1.info,
                t1.step_no AS y
            FROM log_team_workflow t1
            LEFT JOIN (
                SELECT MIN(created_at) AS start_ts
                FROM log_exercise
                WHERE access_id = :access_id
                  AND team_no = :col_team_no
                  AND outline_id = :outline_id
                  AND exercise_no = :exercise_no
                  AND theme_id = :theme_id
                  AND scenario_id = :scenario_id
            ) tstart ON 1=1
            LEFT JOIN (
                SELECT MAX(created_at) AS end_ts
                FROM log_exercise
                WHERE access_id = :access_id
                  AND team_no = :team_no
                  AND outline_id = :outline_id
                  AND exercise_no = :exercise_no
                  AND theme_id = :theme_id
                  AND scenario_id = :scenario_id
            ) tend ON 1=1
            WHERE t1.access_id = :access_id
              AND t1.team_no IN ($inClause)
              AND t1.outline_id = :outline_id
              AND t1.exercise_no = :exercise_no
              AND t1.theme_id = :theme_id
              AND t1.scenario_id = :scenario_id
              AND (tend.end_ts IS NULL OR t1.created_at < tend.end_ts)
            ORDER BY tix ASC
        ");

        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        return is_array($rows) ? $rows : [];
    }
}
