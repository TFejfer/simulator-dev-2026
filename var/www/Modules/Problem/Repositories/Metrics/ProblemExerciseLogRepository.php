<?php
declare(strict_types=1);

namespace Modules\Problem\Repositories\Metrics;

use PDO;

final class ProblemExerciseLogRepository
{
    public function __construct(private PDO $dbRuntime) {}

    /**
     * @param int[] $teamNos
     * @return array<int, array<string,mixed>>
     */
    public function findTeamExerciseLog(
        int $accessId,
        array $teamNos,
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
        ];
        foreach ($teamNos as $i => $teamNo) {
            $ph = ':team' . $i;
            $teamPlaceholders[] = $ph;
            $params[$ph] = $teamNo;
        }

        $inClause = implode(', ', $teamPlaceholders);

        $stmt = $this->dbRuntime->prepare("
            SELECT
                t1.id,
                t1.created_at AS ts,
                UNIX_TIMESTAMP(t1.created_at) AS epochTs,
                CASE
                    WHEN tstart.start_ts IS NULL THEN 0
                    ELSE TIMESTAMPDIFF(SECOND, tstart.start_ts, t1.created_at)
                END AS tix,
                t1.team_no AS team,
                t1.exercise_no AS exercise,
                t1.skill_id AS skill,
                t1.theme_id AS theme,
                t1.scenario_id AS scenario,
                t1.format_id AS format,
                t1.step_no AS step,
                t1.current_state AS currentState,
                t1.next_state AS nextState,
                t1.ci_id AS ciID,
                t1.action_id AS actionID,
                t1.time_min AS time,
                t1.cost AS cost,
                t1.risk AS risk,
                t1.outcome_id AS outcomeID,
                t1.action_type_id AS actionTypeID,
                COALESCE(t1.actor_name, t1.actor_token) AS name
            FROM log_exercise t1
            LEFT JOIN (
                SELECT MIN(created_at) AS start_ts
                FROM log_exercise
                WHERE access_id = :access_id
                  AND team_no IN ($inClause)
                  AND outline_id = :outline_id
                  AND exercise_no = :exercise_no
                  AND theme_id = :theme_id
                  AND scenario_id = :scenario_id
            ) tstart ON 1=1
            WHERE t1.access_id = :access_id
              AND t1.team_no IN ($inClause)
              AND t1.outline_id = :outline_id
              AND t1.exercise_no = :exercise_no
              AND t1.theme_id = :theme_id
              AND t1.scenario_id = :scenario_id
            ORDER BY t1.id ASC
        ");

        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        return is_array($rows) ? $rows : [];
    }
}
