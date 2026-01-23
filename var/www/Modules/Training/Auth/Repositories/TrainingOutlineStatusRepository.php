<?php
declare(strict_types=1);

namespace Modules\Training\Auth\Repositories;

use PDO;
use Throwable;

/**
 * TrainingOutlineStatusRepository
 *
 * Purpose:
 * - Provide dynamic outline UI data:
 *   1) Recent unlocks (exercise_no + seconds_left)
 *   2) Progress per exercise_no (max_step)
 *
 * Data sources:
 * - Runtime DB:
 *   - log_exercise_unlock(access_id, exercise_no, created_at)
 *   - log_exercise(access_id, team_no, exercise_no, step_no, created_at, ...)
 *
 * Output:
 * - Locks are keyed by exercise_no (UI-friendly).
 * - Exercises are keyed by exercise_no (UI-friendly).
 *
 */
final class TrainingOutlineStatusRepository
{
    public function __construct(private PDO $dbRuntime) {}

    /**
     * Returns exercises unlocked within the last 60 seconds.
     * If multiple unlocks exist for the same exercise_no in the window,
     * the newest one wins.
     *
     * @return array<int, array{exercise_no:int, seconds_left:int}>
     */
    public function findRecentUnlocks(int $accessId, int $windowSeconds = 60): array
    {
        if ($accessId <= 0) return [];

        // Hard safety clamp
        $windowSeconds = max(1, min(3600, $windowSeconds));

        try {
            // Use TIMESTAMPDIFF only (no INTERVAL placeholders).
            // Deduplicate per exercise_no by keeping the newest created_at in the window.
            $stmt = $this->dbRuntime->prepare("
                SELECT
                    u.exercise_no,
                    GREATEST(0, :window - TIMESTAMPDIFF(SECOND, u.created_at, NOW())) AS seconds_left
                FROM log_exercise_unlock u
                INNER JOIN (
                    SELECT exercise_no, MAX(created_at) AS max_created_at
                    FROM log_exercise_unlock
                    WHERE access_id = :access_id
                      AND TIMESTAMPDIFF(SECOND, created_at, NOW()) < :window
                    GROUP BY exercise_no
                ) x
                  ON x.exercise_no = u.exercise_no
                 AND x.max_created_at = u.created_at
                WHERE u.access_id = :access_id
                ORDER BY u.exercise_no ASC
            ");

            $stmt->execute([
                ':access_id' => $accessId,
                ':window'    => $windowSeconds,
            ]);

            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $out = [];
            foreach ($rows as $r) {
                $out[] = [
                    'exercise_no'  => (int)($r['exercise_no'] ?? 0),
                    'seconds_left' => (int)($r['seconds_left'] ?? 0),
                ];
            }
            return $out;

        } catch (Throwable $e) {
            error_log(sprintf(
                'TrainingOutlineStatusRepository::findRecentUnlocks failed. access_id=%d window=%d error=%s',
                $accessId,
                $windowSeconds,
                $e->getMessage()
            ));
            return [];
        }
    }

    /**
     * Returns max_step per exercise_no for the given access/team.
     *
     * @return array<int, array{exercise_no:int, max_step:int}>
     */
    public function findExerciseProgress(int $accessId, int $teamNo): array
    {
        if ($accessId <= 0 || $teamNo <= 0) return [];

        try {
            $stmt = $this->dbRuntime->prepare("
                SELECT
                    exercise_no,
                    COALESCE(MAX(step_no), 0) AS max_step
                FROM log_exercise
                WHERE access_id = :access_id
                  AND team_no   = :team_no
				  AND exercise_no > 0
                GROUP BY exercise_no
                ORDER BY exercise_no ASC
            ");

            $stmt->execute([
                ':access_id' => $accessId,
                ':team_no'   => $teamNo,
            ]);

            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            $out = [];
            foreach ($rows as $r) {
                $out[] = [
                    'exercise_no' => (int)($r['exercise_no'] ?? 0),
                    'max_step'    => (int)($r['max_step'] ?? 0),
                ];
            }
            return $out;

        } catch (Throwable $e) {
            error_log(sprintf(
                'TrainingOutlineStatusRepository::findExerciseProgress failed. access_id=%d team_no=%d error=%s',
                $accessId,
                $teamNo,
                $e->getMessage()
            ));
            return [];
        }
    }
}