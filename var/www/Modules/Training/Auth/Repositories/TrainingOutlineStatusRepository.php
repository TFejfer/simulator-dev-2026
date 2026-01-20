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
 *   2) Progress per exercise_no (max_step), including max_step=0 for exercises with no log rows
 *
 * Data sources:
 * - Runtime DB:
 *   - log_exercise_unlock(access_id, exercise_no, created_at)
 *   - log_exercise(access_id, team_no, outline_id, step_no, created_at, ...)
 * - Shared content DB:
 *   - outlines(outline_id, delivery_id, item_type, exercise_no, ...)
 *
 * Output:
 * - Locks are keyed by exercise_no (UI-friendly).
 * - Exercises are keyed by exercise_no (UI-friendly).
 *
 * Notes:
 * - We intentionally keep exercise_no out of log_exercise (normalized design).
 * - Mapping outline_id -> exercise_no happens via outlines.
 */
final class TrainingOutlineStatusRepository
{
	public function __construct(
		private PDO $dbRuntime,
		private PDO $dbSharedContent
	) {}

	/**
	 * Returns exercises unlocked within the last $windowSeconds seconds.
	 *
	 * @return array<int, array{exercise_no:int, seconds_left:int}>
	 */
	public function findRecentUnlocks(int $accessId, int $windowSeconds = 60): array
	{
		if ($accessId <= 0) return [];

		try {
			$stmt = $this->dbRuntime->prepare("
				SELECT
					exercise_no,
					:window - TIMESTAMPDIFF(SECOND, created_at, NOW()) AS seconds_left
				FROM
					log_exercise_unlock
				WHERE
					access_id = :access_id
					AND created_at > DATE_SUB(NOW(), INTERVAL :window SECOND)
			");
			$stmt->execute([
				':access_id' => $accessId,
				':window' => $windowSeconds,
			]);

			$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

			return array_values(array_map(static function (array $r): array {
				return [
					'exercise_no' => (int)($r['exercise_no'] ?? 0),
					'seconds_left' => (int)($r['seconds_left'] ?? 0),
				];
			}, $rows));
		} catch (Throwable) {
			// Fail-safe: status must never crash the page
			return [];
		}
	}

	/**
	 * Returns max_step per exercise_no for the given delivery/team/access.
	 * Includes exercises that have no log rows (max_step=0).
	 *
	 * Implementation:
	 * - Use outlines as the authoritative list of exercises (exercise_no > 0).
	 * - LEFT JOIN aggregated runtime log_exercise on outline_id.
	 * - Group at exercise_no level and take MAX across any outline_id rows mapping to same exercise_no.
	 *
	 * @return array<int, array{exercise_no:int, max_step:int}>
	 */
	public function findExerciseProgress(
        int $deliveryId,
        int $accessId,
        int $teamNo
    ): array {
        if ($deliveryId <= 0 || $accessId <= 0 || $teamNo <= 0) return [];

        try {
            $stmt = $this->dbSharedContent->prepare("
                SELECT
                    o.exercise_no AS exercise_no,
                    COALESCE(MAX(x.max_step), 0) AS max_step
                FROM
                    outlines o
                LEFT JOIN (
                    SELECT
                        outline_id,
                        MAX(step_no) AS max_step
                    FROM
                        RUNTIME.log_exercise
                    WHERE
                        access_id = :access_id
                        AND team_no = :team_no
                    GROUP BY
                        outline_id
                ) x
                    ON x.outline_id = o.outline_id
                WHERE
                    o.delivery_id = :delivery_id
                    AND o.item_type = 'exercise'
                    AND o.exercise_no > 0
                GROUP BY
                    o.exercise_no
                ORDER BY
                    o.exercise_no
            ");

            $stmt->execute([
                ':delivery_id' => $deliveryId,
                ':access_id' => $accessId,
                ':team_no' => $teamNo,
            ]);

            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

            return array_values(array_map(static function (array $r): array {
                return [
                    'exercise_no' => (int)($r['exercise_no'] ?? 0),
                    'max_step' => (int)($r['max_step'] ?? 0),
                ];
            }, $rows));
        } catch (Throwable) {
            return [];
        }
    }
}