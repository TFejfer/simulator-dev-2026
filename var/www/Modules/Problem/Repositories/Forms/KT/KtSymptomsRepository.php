<?php
declare(strict_types=1);

namespace Modules\Problem\Repositories\Forms;

use PDO;

final class SymptomsRepository
{
    public function __construct(private PDO $db) {}

    /**
     * @return array<int, array<string,mixed>>
     */
    public function read(int $accessId, int $teamNo, int $outlineId, int $exerciseNo): array
    {
        $stmt = $this->db->prepare("
            SELECT id, deviation_id, function_id, clarify_text, is_priority
            FROM problem_form_symptoms
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
        int $deviationId, int $functionId, string $clarifyText,
        string $actorToken
    ): int {
        $stmt = $this->db->prepare("
            INSERT INTO problem_form_symptoms
              (access_id, team_no, outline_id, exercise_no, theme_id, scenario_id,
               deviation_id, function_id, clarify_text, is_priority, actor_token)
            VALUES
              (:access_id, :team_no, :outline_id, :exercise_no, :theme_id, :scenario_id,
               :deviation_id, :function_id, :clarify_text, 0, :actor_token)
        ");
        $stmt->execute([
            ':access_id' => $accessId,
            ':team_no' => $teamNo,
            ':outline_id' => $outlineId,
            ':exercise_no' => $exerciseNo,
            ':theme_id' => $themeId,
            ':scenario_id' => $scenarioId,
            ':deviation_id' => $deviationId,
            ':function_id' => $functionId,
            ':clarify_text' => $clarifyText,
            ':actor_token' => $actorToken,
        ]);
        return (int)$this->db->lastInsertId();
    }

    public function updateText(
        int $accessId, int $teamNo, int $outlineId, int $exerciseNo,
        int $id, string $clarifyText, string $actorToken
    ): void {
        $stmt = $this->db->prepare("
            UPDATE problem_form_symptoms
            SET clarify_text = :clarify_text,
                actor_token = :actor_token
            WHERE access_id = :access_id
              AND team_no = :team_no
              AND outline_id = :outline_id
              AND exercise_no = :exercise_no
              AND id = :id
        ");
        $stmt->execute([
            ':clarify_text' => $clarifyText,
            ':actor_token' => $actorToken,
            ':access_id' => $accessId,
            ':team_no' => $teamNo,
            ':outline_id' => $outlineId,
            ':exercise_no' => $exerciseNo,
            ':id' => $id,
        ]);
    }

    public function delete(
        int $accessId, int $teamNo, int $outlineId, int $exerciseNo,
        int $id
    ): void {
        $stmt = $this->db->prepare("
            DELETE FROM problem_form_symptoms
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

    public function setPriority(
        int $accessId, int $teamNo, int $outlineId, int $exerciseNo,
        int $id, string $actorToken
    ): void {
        // Reset
        $rst = $this->db->prepare("
            UPDATE problem_form_symptoms
            SET is_priority = 0
            WHERE access_id = :access_id
              AND team_no = :team_no
              AND outline_id = :outline_id
              AND exercise_no = :exercise_no
              AND is_priority > 0
        ");
        $rst->execute([
            ':access_id' => $accessId,
            ':team_no' => $teamNo,
            ':outline_id' => $outlineId,
            ':exercise_no' => $exerciseNo,
        ]);

        // Set
        $set = $this->db->prepare("
            UPDATE problem_form_symptoms
            SET is_priority = 1,
                actor_token = :actor_token
            WHERE access_id = :access_id
              AND team_no = :team_no
              AND outline_id = :outline_id
              AND exercise_no = :exercise_no
              AND id = :id
        ");
        $set->execute([
            ':actor_token' => $actorToken,
            ':access_id' => $accessId,
            ':team_no' => $teamNo,
            ':outline_id' => $outlineId,
            ':exercise_no' => $exerciseNo,
            ':id' => $id,
        ]);
    }

    // Function used for team workflow
    public function findById(
        int $accessId, int $teamNo, int $outlineId, int $exerciseNo,
        int $id
    ): ?array {
        $stmt = $this->db->prepare("
            SELECT id, deviation_id, function_id, is_priority
            FROM problem_form_symptoms
            WHERE access_id = :access_id
            AND team_no = :team_no
            AND outline_id = :outline_id
            AND exercise_no = :exercise_no
            AND id = :id
            LIMIT 1
        ");
        $stmt->execute([
            ':access_id' => $accessId,
            ':team_no' => $teamNo,
            ':outline_id' => $outlineId,
            ':exercise_no' => $exerciseNo,
            ':id' => $id,
        ]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }

}