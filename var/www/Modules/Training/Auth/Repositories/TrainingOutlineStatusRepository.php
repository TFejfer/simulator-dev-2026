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
	 * Implementation (NO cross-db joins):
	 * 1) Read outlines list (outline_id -> exercise_no) from SHARED_CONTENT.
	 * 2) Read max_step per outline_id from RUNTIME.
	 * 3) Merge in PHP:
	 *    - For each exercise_no: take MAX(max_step) across all outline_id rows mapping to it.
	 *
	 * @return array<int, array{exercise_no:int, max_step:int}>
	 */
	public function findExerciseProgress(int $deliveryId, int $accessId, int $teamNo): array
	{
		if ($deliveryId <= 0 || $accessId <= 0 || $teamNo <= 0) return [];

		try {
			// -------------------------------------------------
			// 1) Outline index (shared): outline_id -> exercise_no
			// -------------------------------------------------
			$stmtA = $this->dbSharedContent->prepare("
				SELECT
					outline_id,
					exercise_no
				FROM
					outlines
				WHERE
					delivery_id = :delivery_id
					AND item_type = 'exercise'
					AND exercise_no > 0
			");
			$stmtA->execute([':delivery_id' => $deliveryId]);
			$outlineRows = $stmtA->fetchAll(PDO::FETCH_ASSOC);

			if (!is_array($outlineRows) || $outlineRows === []) {
				return [];
			}

			// Build mapping and a stable list of exercise_nos
			$outlineIdToExerciseNo = [];
			$exerciseNos = [];

			foreach ($outlineRows as $r) {
				$oid = (int)($r['outline_id'] ?? 0);
				$ex = (int)($r['exercise_no'] ?? 0);
				if ($oid <= 0 || $ex <= 0) continue;

				$outlineIdToExerciseNo[$oid] = $ex;
				$exerciseNos[$ex] = true;
			}

			if ($outlineIdToExerciseNo === []) {
				return [];
			}

			// -------------------------------------------------
			// 2) Runtime aggregate: outline_id -> max_step
			// -------------------------------------------------
			$stmtB = $this->dbRuntime->prepare("
				SELECT
					outline_id,
					MAX(step_no) AS max_step
				FROM
					log_exercise
				WHERE
					access_id = :access_id
					AND team_no = :team_no
				GROUP BY
					outline_id
			");
			$stmtB->execute([
				':access_id' => $accessId,
				':team_no' => $teamNo,
			]);

			$logRows = $stmtB->fetchAll(PDO::FETCH_ASSOC);

			$outlineIdToMaxStep = [];
			if (is_array($logRows)) {
				foreach ($logRows as $r) {
					$oid = (int)($r['outline_id'] ?? 0);
					$ms = (int)($r['max_step'] ?? 0);
					if ($oid <= 0) continue;
					$outlineIdToMaxStep[$oid] = $ms;
				}
			}

			// -------------------------------------------------
			// 3) Merge: exercise_no -> max_step (max across outline_id)
			// -------------------------------------------------
			$exerciseNoToMaxStep = [];

			// Initialize all exercises to 0 (ensures "no logs" returns max_step=0)
			foreach (array_keys($exerciseNos) as $exNo) {
				$exerciseNoToMaxStep[(int)$exNo] = 0;
			}

			// Apply max steps found in runtime
			foreach ($outlineIdToExerciseNo as $oid => $exNo) {
				$ms = $outlineIdToMaxStep[$oid] ?? 0;
				if ($ms > ($exerciseNoToMaxStep[$exNo] ?? 0)) {
					$exerciseNoToMaxStep[$exNo] = (int)$ms;
				}
			}

			// Output sorted by exercise_no
			ksort($exerciseNoToMaxStep);

			$out = [];
			foreach ($exerciseNoToMaxStep as $exNo => $ms) {
				$out[] = [
					'exercise_no' => (int)$exNo,
					'max_step' => (int)$ms,
				];
			}

			return $out;

		} catch (Throwable) {
			return [];
		}
	}
}