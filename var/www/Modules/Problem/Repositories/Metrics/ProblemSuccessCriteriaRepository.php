<?php
declare(strict_types=1);

namespace Modules\Problem\Repositories\Metrics;

use PDO;

final class ProblemSuccessCriteriaRepository
{
    public function __construct(private PDO $dbRuntime) {}

    public function hasSuccessCriteria(int $accessId, int $teamNo, int $outlineId): bool
    {
        if ($accessId <= 0 || $teamNo <= 0 || $outlineId <= 0) return false;

        $stmt = $this->dbRuntime->prepare("
            SELECT 1
                        FROM problem_success_criteria
                        WHERE access_id = :access_id
                            AND team_no = :team_no
                            AND outline_id = :outline_id
            LIMIT 1
        ");
        $stmt->execute([
            ':access_id' => $accessId,
            ':team_no' => $teamNo,
                        ':outline_id' => $outlineId,
        ]);

        return (bool)$stmt->fetchColumn();
    }

    /**
     * @param array{proficiency:int, solved:int, risk:int, time_score:int, cost:int, capture:int} $scores
     */
    public function insertIfNotExists(
        int $accessId,
        int $teamNo,
        int $outlineId,
        array $scores
    ): void {
        if ($accessId <= 0 || $teamNo <= 0 || $outlineId <= 0) return;

        $stmt = $this->dbRuntime->prepare("
            INSERT IGNORE INTO problem_success_criteria
                (access_id, team_no, outline_id, proficiency, solved, risk, time_score, cost, capture)
            VALUES
                (:access_id, :team_no, :outline_id, :proficiency, :solved, :risk, :time_score, :cost, :capture)
        ");

        $stmt->execute([
            ':access_id' => $accessId,
            ':team_no' => $teamNo,
            ':outline_id' => $outlineId,
            ':proficiency' => (int)($scores['proficiency'] ?? 0),
            ':solved' => (int)($scores['solved'] ?? 0),
            ':risk' => (int)($scores['risk'] ?? 0),
            ':time_score' => (int)($scores['time_score'] ?? 0),
            ':cost' => (int)($scores['cost'] ?? 0),
            ':capture' => (int)($scores['capture'] ?? 0),
        ]);
    }

    /**
     * Read persisted success criteria for a completed exercise (by outline).
     *
     * @return array{proficiency:int, solved:int, risk:int, time_score:int, cost:int, capture:int}
     */
    public function readByOutline(int $accessId, int $teamNo, int $outlineId): array
    {
        if ($accessId <= 0 || $teamNo <= 0 || $outlineId <= 0) {
            return [
                'proficiency' => 0,
                'solved' => 0,
                'risk' => 0,
                'time_score' => 0,
                'cost' => 0,
                'capture' => 0,
            ];
        }

        $stmt = $this->dbRuntime->prepare("
            SELECT proficiency, solved, risk, time_score, cost, capture
            FROM problem_success_criteria
            WHERE access_id = :access_id
              AND team_no = :team_no
              AND outline_id = :outline_id
            LIMIT 1
        ");
        $stmt->execute([
            ':access_id' => $accessId,
            ':team_no' => $teamNo,
            ':outline_id' => $outlineId,
        ]);

        $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];

        return [
            'proficiency' => (int)($row['proficiency'] ?? 0),
            'solved' => (int)($row['solved'] ?? 0),
            'risk' => (int)($row['risk'] ?? 0),
            'time_score' => (int)($row['time_score'] ?? 0),
            'cost' => (int)($row['cost'] ?? 0),
            'capture' => (int)($row['capture'] ?? 0),
        ];
    }
}
