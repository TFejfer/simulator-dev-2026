<?php
declare(strict_types=1);

namespace Modules\Problem\Repositories;

use PDO;

/**
 * ExerciseStateResolverRepository
 *
 * Resolves current state (<100) by reading the latest row in log_exercise
 * for a given (access_id, team_no).
 */
final class ExerciseStateResolverRepository
{
    public function __construct(private PDO $dbRuntime) {}

    /**
     * Fallback order: current_state -> next_state -> 0
     */
    public function resolveCurrentState(int $accessId, int $teamNo): int
    {
        $sql = "
            SELECT current_state, next_state
            FROM log_exercise
            WHERE access_id = :access_id
              AND team_no = :team_no
            ORDER BY id DESC
            LIMIT 1
        ";

        $st = $this->dbRuntime->prepare($sql);
        $st->execute([
            ':access_id' => $accessId,
            ':team_no' => $teamNo,
        ]);

        $row = $st->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            return 0;
        }

        $state = (int)($row['current_state'] ?? 0);
        if ($state === 0 && isset($row['next_state'])) {
            $state = (int)$row['next_state'];
        }

        if ($state < 0) $state = 0;
        if ($state > 99) $state = 99;

        return $state;
    }
}