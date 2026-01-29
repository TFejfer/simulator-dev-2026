<?php
declare(strict_types=1);

namespace Modules\Problem\Repositories\Forms;

use PDO;

final class CausesRepository
{
    public function __construct(private PDO $db) {}

    /**
     * @return array<int, array<string,mixed>>
     */
    public function read(int $accessId, int $teamNo, int $outlineId, int $exerciseNo): array
    {
        $stmt = $this->db->prepare("
            SELECT id, ci_id, deviation_text, likelihood_text, evidence_text,
                   proven, disproven, list_no
            FROM problem_form_causes
            WHERE access_id = :access_id
              AND team_no = :team_no
              AND outline_id = :outline_id
              AND exercise_no = :exercise_no
            ORDER BY list_no ASC, id ASC
        ");
        $stmt->execute([
            ':access_id' => $accessId,
            ':team_no' => $teamNo,
            ':outline_id' => $outlineId,
            ':exercise_no' => $exerciseNo,
        ]);
        return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }

    public function nextListNo(int $accessId, int $teamNo, int $outlineId, int $exerciseNo): int
    {
        $stmt = $this->db->prepare("
            SELECT COALESCE(MAX(list_no), 0) AS max_no
            FROM problem_form_causes
            WHERE access_id = :access_id
              AND team_no = :team_no
              AND outline_id = :outline_id
              AND exercise_no = :exercise_no
        ");
        $stmt->execute([
            ':access_id' => $accessId,
            ':team_no' => $teamNo,
            ':outline_id' => $outlineId,
            ':exercise_no' => $exerciseNo,
        ]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return ((int)($row['max_no'] ?? 0)) + 1;
    }

    public function create(
        int $accessId, int $teamNo, int $outlineId, int $exerciseNo,
        ?int $themeId, ?int $scenarioId,
        string $ciId, string $deviationText, int $listNo,
        string $actorToken
    ): int {
        $stmt = $this->db->prepare("
            INSERT INTO problem_form_causes
              (access_id, team_no, outline_id, exercise_no, theme_id, scenario_id,
               ci_id, deviation_text, likelihood_text, evidence_text, proven, disproven, list_no, actor_token)
            VALUES
              (:access_id, :team_no, :outline_id, :exercise_no, :theme_id, :scenario_id,
               :ci_id, :deviation_text, '▲▼', '', 0, 0, :list_no, :actor_token)
        ");
        $stmt->execute([
            ':access_id' => $accessId,
            ':team_no' => $teamNo,
            ':outline_id' => $outlineId,
            ':exercise_no' => $exerciseNo,
            ':theme_id' => $themeId,
            ':scenario_id' => $scenarioId,
            ':ci_id' => $ciId,
            ':deviation_text' => $deviationText,
            ':list_no' => $listNo,
            ':actor_token' => $actorToken,
        ]);
        return (int)$this->db->lastInsertId();
    }

    public function update(
        int $accessId, int $teamNo, int $outlineId, int $exerciseNo,
        int $id, string $likelihood, string $evidence, int $proven, int $disproven,
        string $actorToken
    ): void {
        $stmt = $this->db->prepare("
            UPDATE problem_form_causes
            SET likelihood_text = :likelihood,
                evidence_text = :evidence,
                proven = :proven,
                disproven = :disproven,
                actor_token = :actor_token
            WHERE access_id = :access_id
              AND team_no = :team_no
              AND outline_id = :outline_id
              AND exercise_no = :exercise_no
              AND id = :id
        ");
        $stmt->execute([
            ':likelihood' => $likelihood,
            ':evidence' => $evidence,
            ':proven' => $proven,
            ':disproven' => $disproven,
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
            DELETE FROM problem_form_causes
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

    /**
     * Arrange causes according to ordered IDs.
     * @param int[] $idsInOrder
     */
    public function arrange(
        int $accessId, int $teamNo, int $outlineId, int $exerciseNo,
        array $idsInOrder,
        string $actorToken
    ): void {
        $stmt = $this->db->prepare("
            UPDATE problem_form_causes
            SET list_no = :list_no,
                actor_token = :actor_token
            WHERE access_id = :access_id
              AND team_no = :team_no
              AND outline_id = :outline_id
              AND exercise_no = :exercise_no
              AND id = :id
        ");

        $listNo = 1;
        foreach ($idsInOrder as $id) {
            $stmt->execute([
                ':list_no' => $listNo,
                ':actor_token' => $actorToken,
                ':access_id' => $accessId,
                ':team_no' => $teamNo,
                ':outline_id' => $outlineId,
                ':exercise_no' => $exerciseNo,
                ':id' => $id,
            ]);
            $listNo++;
        }
    }
}