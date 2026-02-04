<?php
declare(strict_types=1);

namespace Modules\Training\Auth\Repositories;

use PDO;
use Throwable;

final class ExerciseRuntimeRepository
{
	public function __construct(
		private PDO $dbRuntime
	) {}

	/**
	 * Latest log_exercise row for a given access_id and team_no.
	 *
	 * @return array<string,mixed>|null
	 */
	public function findLatestRow(int $accessId, int $teamNo): ?array
	{
		if ($accessId <= 0 || $teamNo <= 0) return null;

		$stmt = $this->dbRuntime->prepare("
			SELECT
				id,
				created_at,
				access_id,
				team_no,
				outline_id,
				skill_id,
				exercise_no,
				theme_id,
				scenario_id,
				format_id,
				step_no,
				current_state
			FROM log_exercise
			WHERE access_id = :access_id
			AND team_no   = :team_no
			ORDER BY id DESC
			LIMIT 1
		");

		$stmt->execute([
			':access_id' => $accessId,
			':team_no'   => $teamNo,
		]);

		$row = $stmt->fetch(PDO::FETCH_ASSOC);
		return $row ?: null;
	}

	/**
	 * Latest log_exercise row for a given outline_id in this access/team scope.
	 *
	 * @return array<string,mixed>|null
	 */
	public function findLatestByOutline(int $accessId, int $teamNo, int $outlineId): ?array
	{
		if ($accessId <= 0 || $teamNo <= 0 || $outlineId <= 0) return null;

		try {
			$stmt = $this->dbRuntime->prepare("
				SELECT
					id,
					outline_id,
					skill_id,
					exercise_no,
					theme_id,
					scenario_id,
					format_id,
					step_no,
					current_state,
					next_state
				FROM log_exercise
				WHERE access_id = :access_id
				  AND team_no = :team_no
				  AND outline_id = :outline_id
				ORDER BY id DESC
				LIMIT 1
			");
			$stmt->execute([
				':access_id' => $accessId,
				':team_no' => $teamNo,
				':outline_id' => $outlineId,
			]);

			$row = $stmt->fetch(PDO::FETCH_ASSOC);
			return is_array($row) ? $row : null;

		} catch (Throwable) {
			return null;
		}
	}

	/**
	 * Returns max step_no per outline_id (for a list of outline IDs).
	 *
	 * @return array<int,int> map outline_id => max_step_no
	 */
	public function findMaxStepByOutlineIds(int $accessId, int $teamNo, array $outlineIds): array
	{
		if ($accessId <= 0 || $teamNo <= 0) return [];
		$ids = array_values(array_unique(array_map('intval', $outlineIds)));
		$ids = array_filter($ids, fn($x) => $x > 0);
		if (!$ids) return [];

		// Build placeholders safely
		$ph = [];
		$bind = [
			':access_id' => $accessId,
			':team_no' => $teamNo,
		];
		foreach ($ids as $i => $id) {
			$key = ':oid' . $i;
			$ph[] = $key;
			$bind[$key] = $id;
		}

		try {
			$sql = "
				SELECT outline_id, MAX(step_no) AS max_step
				FROM log_exercise
				WHERE access_id = :access_id
				  AND team_no = :team_no
				  AND outline_id IN (" . implode(',', $ph) . ")
				GROUP BY outline_id
			";
			$stmt = $this->dbRuntime->prepare($sql);
			$stmt->execute($bind);

			$out = [];
			while ($r = $stmt->fetch(PDO::FETCH_ASSOC)) {
				$oid = (int)($r['outline_id'] ?? 0);
				$ms = (int)($r['max_step'] ?? 0);
				if ($oid > 0) $out[$oid] = $ms;
			}
			return $out;

		} catch (Throwable) {
			return [];
		}
	}

	/**
	 * Unlock model:
	 * - unlocked if a log_exercise_unlock row exists within the last $windowSeconds.
	 */
	public function isUnlocked(int $accessId, int $exerciseNo, int $windowSeconds = 60): bool
	{
		if ($accessId <= 0 || $exerciseNo <= 0) return false;
		if ($windowSeconds < 10) $windowSeconds = 10;
		if ($windowSeconds > 600) $windowSeconds = 600;

		try {
			$stmt = $this->dbRuntime->prepare("
				SELECT id
				FROM log_exercise_unlock
				WHERE access_id = :access_id
				  AND exercise_no = :exercise_no
				  AND created_at > DATE_SUB(NOW(), INTERVAL :window SECOND)
				LIMIT 1
			");
			$stmt->bindValue(':access_id', $accessId, PDO::PARAM_INT);
			$stmt->bindValue(':exercise_no', $exerciseNo, PDO::PARAM_INT);
			$stmt->bindValue(':window', $windowSeconds, PDO::PARAM_INT);
			$stmt->execute();

			$row = $stmt->fetch(PDO::FETCH_ASSOC);
			return is_array($row) && !empty($row);

		} catch (Throwable) {
			return false;
		}
	}

	/**
	 * Inserts the first log_exercise row for a new exercise run.
	 * Returns inserted id (0 on failure).
	 */
	public function insertFirstEntry(array $row): int
	{
		try {
			$stmt = $this->dbRuntime->prepare("
				INSERT INTO log_exercise
					(access_id, team_no, outline_id, skill_id, exercise_no, theme_id, scenario_id, format_id, step_no, current_state, next_state, actor_token, actor_name, include_in_poll)
				VALUES
					(:access_id, :team_no, :outline_id, :skill_id, :exercise_no, :theme_id, :scenario_id, :format_id, :step_no, :current_state, :next_state, :actor_token, :actor_name, 1)
			");
			$stmt->execute([
				':access_id' => (int)$row['access_id'],
				':team_no' => (int)$row['team_no'],
				':outline_id' => (int)$row['outline_id'],
				':skill_id' => (int)$row['skill_id'],
				':exercise_no' => (int)$row['exercise_no'],
				':theme_id' => (int)$row['theme_id'],
				':scenario_id' => (int)$row['scenario_id'],
				':format_id' => (int)$row['format_id'],
				':step_no' => (int)$row['step_no'],
				':current_state' => $row['current_state'],
				':next_state' => $row['next_state'],
				':actor_token' => (string)$row['actor_token'],
				':actor_name' => (string)$row['actor_name'],
			]);

			return (int)$this->dbRuntime->lastInsertId();
		} catch (Throwable) {
			return 0;
		}
	}

	/**
	 * Inserts a generic log_exercise row (used for server-side transitions like times-up).
	 * Returns inserted id (0 on failure).
	 */
	public function insertStep(array $row): int
	{
		try {
			$stmt = $this->dbRuntime->prepare("
				INSERT INTO log_exercise
					(access_id, team_no, outline_id, skill_id, exercise_no, theme_id, scenario_id, format_id, step_no, current_state, next_state, actor_token, actor_name, include_in_poll)
				VALUES
					(:access_id, :team_no, :outline_id, :skill_id, :exercise_no, :theme_id, :scenario_id, :format_id, :step_no, :current_state, :next_state, :actor_token, :actor_name, :include_in_poll)
			");

			$stmt->execute([
				':access_id' => (int)$row['access_id'],
				':team_no' => (int)$row['team_no'],
				':outline_id' => (int)$row['outline_id'],
				':skill_id' => (int)$row['skill_id'],
				':exercise_no' => (int)$row['exercise_no'],
				':theme_id' => (int)$row['theme_id'],
				':scenario_id' => (int)$row['scenario_id'],
				':format_id' => (int)$row['format_id'],
				':step_no' => (int)$row['step_no'],
				':current_state' => $row['current_state'],
				':next_state' => $row['next_state'],
				':actor_token' => (string)$row['actor_token'],
				':actor_name' => (string)$row['actor_name'],
				':include_in_poll' => isset($row['include_in_poll']) ? (int)$row['include_in_poll'] : 1,
			]);

			return (int)$this->dbRuntime->lastInsertId();
		} catch (Throwable) {
			return 0;
		}
	}

	/**
	 * Earliest row for a given step_no (used for timer anchors).
	 *
	 * @return array<string,mixed>|null
	 */
	public function findFirstStepTimestamp(int $accessId, int $teamNo, int $stepNo): ?array
	{
		if ($accessId <= 0 || $teamNo <= 0 || $stepNo <= 0) return null;

		try {
			$stmt = $this->dbRuntime->prepare("
				SELECT
					id,
					step_no,
					current_state,
					next_state,
					UNIX_TIMESTAMP(created_at) AS created_at_ts
				FROM log_exercise
				WHERE access_id = :access_id
				  AND team_no   = :team_no
				  AND step_no   = :step_no
				ORDER BY id ASC
				LIMIT 1
			");

			$stmt->execute([
				':access_id' => $accessId,
				':team_no'   => $teamNo,
				':step_no'   => $stepNo,
			]);

			$row = $stmt->fetch(PDO::FETCH_ASSOC);
			return $row ?: null;

		} catch (Throwable) {
			return null;
		}
	}

	/**
	 * Earliest row for a given outline_id + step_no (anchor start of this exercise run).
	 *
	 * @return array<string,mixed>|null
	 */
	public function findFirstStepTimestampForOutline(int $accessId, int $teamNo, int $outlineId, int $stepNo): ?array
	{
		if ($accessId <= 0 || $teamNo <= 0 || $outlineId <= 0 || $stepNo <= 0) return null;

		try {
			$stmt = $this->dbRuntime->prepare("
				SELECT
					id,
					outline_id,
					step_no,
					current_state,
					next_state,
					UNIX_TIMESTAMP(created_at) AS created_at_ts
				FROM log_exercise
				WHERE access_id = :access_id
				  AND team_no   = :team_no
				  AND outline_id = :outline_id
				  AND step_no   = :step_no
				ORDER BY id ASC
				LIMIT 1
			");

			$stmt->execute([
				':access_id' => $accessId,
				':team_no'   => $teamNo,
				':outline_id' => $outlineId,
				':step_no'   => $stepNo,
			]);

			$row = $stmt->fetch(PDO::FETCH_ASSOC);
			return $row ?: null;

		} catch (Throwable) {
			return null;
		}
	}

	/**
	 * Full log_exercise rows for a given outline_id (ordered ASC by id).
	 *
	 * @return array<int,array<string,mixed>>
	 */
	public function findLogByOutline(int $accessId, int $teamNo, int $outlineId): array
	{
		if ($accessId <= 0 || $teamNo <= 0 || $outlineId <= 0) return [];

		try {
			$stmt = $this->dbRuntime->prepare("
				SELECT
					id,
					created_at,
					access_id,
					team_no,
					outline_id,
					skill_id,
					exercise_no,
					theme_id,
					scenario_id,
					format_id,
					step_no,
					current_state,
					next_state
				FROM log_exercise
				WHERE access_id = :access_id
				  AND team_no   = :team_no
				  AND outline_id = :outline_id
				ORDER BY id ASC
			");

			$stmt->execute([
				':access_id' => $accessId,
				':team_no' => $teamNo,
				':outline_id' => $outlineId,
			]);

			$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
			return is_array($rows) ? $rows : [];

		} catch (Throwable) {
			return [];
		}
	}
}