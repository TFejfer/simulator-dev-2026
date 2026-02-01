<?php
declare(strict_types=1);

namespace Modules\Problem\Repositories\Forms;

use PDO;

final class IterationsRepository
{
    public function __construct(private PDO $db) {}

    /** @return array<string,mixed> */
    public function read(int $accessId, int $teamNo, int $outlineId, int $exerciseNo, int $themeId, int $scenarioId): array
    {
        $stmt = $this->db->prepare("
            SELECT text
            FROM problem_form_iterations
            WHERE access_id = :access_id AND team_no = :team_no
              AND outline_id = :outline_id AND exercise_no = :exercise_no
              AND theme_id = :theme_id AND scenario_id = :scenario_id
            LIMIT 1
        ");
        $stmt->execute([
            ':access_id' => $accessId,
            ':team_no' => $teamNo,
            ':outline_id' => $outlineId,
            ':exercise_no' => $exerciseNo,
            ':theme_id' => $themeId,
            ':scenario_id' => $scenarioId,
        ]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: ['text' => ''];
    }

    public function upsert(
        int $accessId, int $teamNo, int $outlineId, int $exerciseNo,
        int $themeId, int $scenarioId,
        string $text, string $actorToken
    ): void {
        $stmt = $this->db->prepare("
            INSERT INTO problem_form_iterations
              (access_id, team_no, outline_id, exercise_no, theme_id, scenario_id, text, actor_token, updated_at)
            VALUES
              (:access_id, :team_no, :outline_id, :exercise_no, :theme_id, :scenario_id, :text, :actor_token, CURRENT_TIMESTAMP)
            ON DUPLICATE KEY UPDATE
              text = VALUES(text),
              actor_token = VALUES(actor_token),
              updated_at = CURRENT_TIMESTAMP
        ");
        $stmt->execute([
            ':access_id' => $accessId,
            ':team_no' => $teamNo,
            ':outline_id' => $outlineId,
            ':exercise_no' => $exerciseNo,
            ':theme_id' => $themeId,
            ':scenario_id' => $scenarioId,
            ':text' => $text,
            ':actor_token' => $actorToken,
        ]);
    }
}