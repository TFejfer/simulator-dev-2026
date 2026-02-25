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
            ':access_id_start' => $accessId,
            ':outline_id_start' => $outlineId,
            ':exercise_no_start' => $exerciseNo,
            ':theme_id_start' => $themeId,
            ':scenario_id_start' => $scenarioId,
            ':col_team_no_start' => $colTeamNo,
            ':access_id_end' => $accessId,
            ':outline_id_end' => $outlineId,
            ':exercise_no_end' => $exerciseNo,
            ':theme_id_end' => $themeId,
            ':scenario_id_end' => $scenarioId,
            ':team_no_end' => $teamNo,
            ':access_id_main' => $accessId,
            ':outline_id_main' => $outlineId,
            ':exercise_no_main' => $exerciseNo,
            ':theme_id_main' => $themeId,
            ':scenario_id_main' => $scenarioId,
        ];
        foreach ($teamNos as $i => $t) {
            $ph = ':team' . $i;
            $teamPlaceholders[] = $ph;
            $params[$ph] = $t;
        }

        $inClause = implode(', ', $teamPlaceholders);

        $sql = "
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
                                WHERE access_id = :access_id_start
                                    AND team_no = :col_team_no_start
                                    AND outline_id = :outline_id_start
                                    AND exercise_no = :exercise_no_start
                                    AND theme_id = :theme_id_start
                                    AND scenario_id = :scenario_id_start
            ) tstart ON 1=1
            LEFT JOIN (
                SELECT MAX(created_at) AS end_ts
                FROM log_exercise
                                WHERE access_id = :access_id_end
                                    AND team_no = :team_no_end
                                    AND outline_id = :outline_id_end
                                    AND exercise_no = :exercise_no_end
                                    AND theme_id = :theme_id_end
                                    AND scenario_id = :scenario_id_end
            ) tend ON 1=1
                        WHERE t1.access_id = :access_id_main
              AND t1.team_no IN ($inClause)
                            AND t1.outline_id = :outline_id_main
                            AND t1.exercise_no = :exercise_no_main
                            AND t1.theme_id = :theme_id_main
                            AND t1.scenario_id = :scenario_id_main
              AND (tend.end_ts IS NULL OR t1.created_at < tend.end_ts)
            ORDER BY tix ASC
                        ";

                        $stmt = $this->dbRuntime->prepare($sql);
                        try {
                            $stmt->execute($params);
                        } catch (\Throwable $e) {
                            error_log('[WorkflowLogReadRepository] execute failed ' . json_encode([
                                'message' => $e->getMessage(),
                                'params' => array_keys($params),
                                'sql' => $sql,
                            ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
                            throw $e;
                        }
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        return is_array($rows) ? $rows : [];
    }
}
