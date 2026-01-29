<?php
declare(strict_types=1);

namespace Modules\Problem\Repositories\Forms;

use PDO;

final class ActionsRepository
{
    public function __construct(private PDO $db) {}

    /**
     * @return array<int, array<string,mixed>>
     */
    public function read(int $accessId, int $teamNo, int $outlineId, int $exerciseNo): array
    {
        $stmt = $this->db->prepare("
            SELECT id, ci_id, action_id, effect_text
            FROM problem_form_actions
            WHERE access_id = :access_id
              AND team_no = :team_no
              AND outline_id = :outline_id
              AND exercise_no = :exercise_no
            ORDER BY id ASC
        ");
        $stmt->execute([
            ':access_id' => $accessId,
            ':team_no' => $teamNo,
            ':outline_id' => $outlineId,
            ':exercise_no' => $exerciseNo,
        ]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    public function create(
        int $accessId, int $teamNo, int $outlineId, int $exerciseNo,
        ?int $themeId, ?int $scenarioId,
        string $ciId, int $actionId, string $effectText,
        string $actorToken
    ): int {
        $stmt = $this->db->prepare("
            INSERT INTO problem_form_actions
              (access_id, team_no, outline_id, exercise_no, theme_id, scenario_id,
               ci_id, action_id, effect_text, actor_token)
            VALUES
              (:access_id, :team_no, :outline_id, :exercise_no, :theme_id, :scenario_id,
               :ci_id, :action_id, :effect_text, :actor_token)
        ");
        $stmt->execute([
            ':access_id' => $accessId,
            ':team_no' => $teamNo,
            ':outline_id' => $outlineId,
            ':exercise_no' => $exerciseNo,
            ':theme_id' => $themeId,
            ':scenario_id' => $scenarioId,
            ':ci_id' => $ciId,
            ':action_id' => $actionId,
            ':effect_text' => $effectText,
            ':actor_token' => $actorToken,
        ]);
        return (int)$this->db->lastInsertId();
    }

    public function update(
        int $accessId, int $teamNo, int $outlineId, int $exerciseNo,
        int $id, string $effectText,
        string $actorToken
    ): void {
        $stmt = $this->db->prepare("
            UPDATE problem_form_actions
            SET effect_text = :effect_text,
                actor_token = :actor_token
            WHERE access_id = :access_id
              AND team_no = :team_no
              AND outline_id = :outline_id
              AND exercise_no = :exercise_no
              AND id = :id
        ");
        $stmt->execute([
            ':effect_text' => $effectText,
            ':actor_token' => $actorToken,
            ':access_id' => $accessId,
            ':team_no' => $teamNo,
            ':outline_id' => $outlineId,
            ':exercise_no' => $exerciseNo,
            ':id' => $id,
        ]);
    }

    public function delete(int $accessId, int $teamNo, int $outlineId, int $exerciseNo, int $id): void
    {
        $stmt = $this->db->prepare("
            DELETE FROM problem_form_actions
            WHERE access_id = :access_id
              AND team_no = :team_no
              AND outline_id = :outline_id
              AND exercise_no = :exercise_no
              AND id = :id
        ");
        $stmt->execute([
            ':access_id' => $accessId,
            ':team_no' => $teamNo,
            ':outline_id' => $outlineId,
            ':exercise_no' => $exerciseNo,
            ':id' => $id,
        ]);
    }
}