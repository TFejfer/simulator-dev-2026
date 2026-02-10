<?php
declare(strict_types=1);

namespace Modules\Problem\Repositories\Forms;

use PDO;

final class FactsRepository
{
    public function __construct(private PDO $db) {}

    /**
     * @return array<int, array<string,mixed>>
     */
    public function read(int $accessId, int $teamNo, int $outlineId, int $exerciseNo): array
    {
        $stmt = $this->db->prepare("
            SELECT id, key_meta, key_value, text
            FROM problem_form_facts
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
        string $keyMeta, string $keyValue, string $text,
        string $actorToken
    ): int {
        $stmt = $this->db->prepare("
            INSERT INTO problem_form_facts
              (access_id, team_no, outline_id, exercise_no, theme_id, scenario_id,
               key_meta, key_value, text, actor_token)
            VALUES
              (:access_id, :team_no, :outline_id, :exercise_no, :theme_id, :scenario_id,
               :key_meta, :key_value, :text, :actor_token)
        ");
        $stmt->execute([
            ':access_id' => $accessId,
            ':team_no' => $teamNo,
            ':outline_id' => $outlineId,
            ':exercise_no' => $exerciseNo,
            ':theme_id' => $themeId,
            ':scenario_id' => $scenarioId,
            ':key_meta' => $keyMeta,
            ':key_value' => $keyValue,
            ':text' => $text,
            ':actor_token' => $actorToken,
        ]);
        return (int)$this->db->lastInsertId();
    }

    public function updateText(
        int $accessId, int $teamNo, int $outlineId, int $exerciseNo,
        int $id, string $text, string $actorToken
    ): void {
        $stmt = $this->db->prepare("
            UPDATE problem_form_facts
            SET text = :text,
                actor_token = :actor_token
            WHERE access_id = :access_id
              AND team_no = :team_no
              AND outline_id = :outline_id
              AND exercise_no = :exercise_no
              AND id = :id
        ");
        $stmt->execute([
            ':text' => $text,
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
            DELETE FROM problem_form_facts
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
     * Checks if all required key_metas are present for the given access/team/outline/exercise.
     *
     * @param int $accessId
     * @param int $teamNo
     * @param int $outlineId
     * @param int $exerciseNo
     * @param array<string> $requiredKeyMetas List of required key_meta values to check for
     * @return bool True if all required key_metas are present, false otherwise
     */
    public function hasAllKeyMetas(int $accessId, int $teamNo, int $outlineId, int $exerciseNo, array $requiredKeyMetas): bool
    {
        if ($accessId <= 0 || $teamNo <= 0 || $outlineId <= 0 || $exerciseNo <= 0) return false;
        $requiredKeyMetas = array_values(array_unique(array_filter(array_map('strval', $requiredKeyMetas), static fn($v) => $v !== '')));
        if (!$requiredKeyMetas) return false;

        $stmt = $this->db->prepare("
            SELECT DISTINCT key_meta
            FROM problem_form_facts
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
        $found = $stmt->fetchAll(PDO::FETCH_COLUMN) ?: [];

        // Check that all requiredKeyMetas are present in $found
        return empty(array_diff($requiredKeyMetas, $found));
    }
}