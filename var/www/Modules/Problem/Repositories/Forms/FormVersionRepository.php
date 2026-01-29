<?php
declare(strict_types=1);

namespace Modules\Problem\Repositories\Forms;

use PDO;

final class FormVersionRepository
{
    public function __construct(private PDO $db) {}

    /**
     * Lock and return current version for a form (SELECT ... FOR UPDATE).
     * Returns 0 if no row exists.
     */
    public function lockCurrentVersion(
        int $accessId,
        int $teamNo,
        int $outlineId,
        int $exerciseNo,
        string $formKey
    ): int {
        $stmt = $this->db->prepare("
            SELECT version
            FROM problem_form_versions
            WHERE access_id = :access_id
              AND team_no = :team_no
              AND outline_id = :outline_id
              AND exercise_no = :exercise_no
              AND form_key = :form_key
            FOR UPDATE
        ");
        $stmt->execute([
            ':access_id' => $accessId,
            ':team_no' => $teamNo,
            ':outline_id' => $outlineId,
            ':exercise_no' => $exerciseNo,
            ':form_key' => $formKey,
        ]);

        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ? (int)$row['version'] : 0;
    }

    /**
     * Increment version; if row doesn't exist, create it with version = 1.
     * Returns new version.
     */
    public function bumpVersion(
        int $accessId,
        int $teamNo,
        int $outlineId,
        int $exerciseNo,
        string $formKey,
        string $actorToken
    ): int {
        // Try update first
        $stmt = $this->db->prepare("
            UPDATE problem_form_versions
            SET version = version + 1,
                actor_token = :actor_token
            WHERE access_id = :access_id
              AND team_no = :team_no
              AND outline_id = :outline_id
              AND exercise_no = :exercise_no
              AND form_key = :form_key
        ");
        $stmt->execute([
            ':actor_token' => $actorToken,
            ':access_id' => $accessId,
            ':team_no' => $teamNo,
            ':outline_id' => $outlineId,
            ':exercise_no' => $exerciseNo,
            ':form_key' => $formKey,
        ]);

        if ($stmt->rowCount() === 0) {
            // Insert new row
            $ins = $this->db->prepare("
                INSERT INTO problem_form_versions
                  (access_id, team_no, outline_id, exercise_no, form_key, version, actor_token)
                VALUES
                  (:access_id, :team_no, :outline_id, :exercise_no, :form_key, 1, :actor_token)
            ");
            $ins->execute([
                ':access_id' => $accessId,
                ':team_no' => $teamNo,
                ':outline_id' => $outlineId,
                ':exercise_no' => $exerciseNo,
                ':form_key' => $formKey,
                ':actor_token' => $actorToken,
            ]);
            return 1;
        }

        // Read back current version (still inside tx, row locked already)
        return $this->lockCurrentVersion($accessId, $teamNo, $outlineId, $exerciseNo, $formKey);
    }
}