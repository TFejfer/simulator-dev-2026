<?php
declare(strict_types=1);

namespace Modules\Training\Auth\Repositories;

use PDO;
use Throwable;

final class ExerciseStepsRepository
{
	public function __construct(
		private PDO $dbSharedContent
	) {}

	/**
	 * Returns all steps after the given step_no (ordered ASC by step_no).
	 *
	 * @return array<int, array{step_no:int, step_key:string, page_key:string, current_state:mixed, next_state:mixed}>
	 */
	public function findFutureSteps(int $skillId, int $formatId, int $afterStepNo): array
	{
		if ($skillId <= 0 || $formatId < 0 || $afterStepNo < 0) return [];

		try {
			$stmt = $this->dbSharedContent->prepare("
			SELECT step_no, step_key, page_key, current_state, next_state
			FROM exercise_steps
			WHERE skill_id = :skill_id
			  AND format_id = :format_id
			  AND step_no > :after_step_no
			ORDER BY step_no ASC
			");
			$stmt->execute([
				':skill_id' => $skillId,
				':format_id' => $formatId,
				':after_step_no' => $afterStepNo,
			]);

			$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
			if (!is_array($rows)) return [];

			$out = [];
			foreach ($rows as $r) {
				if (!is_array($r)) continue;
				$out[] = [
					'step_no' => (int)($r['step_no'] ?? 0),
					'step_key' => (string)($r['step_key'] ?? ''),
					'page_key' => (string)($r['page_key'] ?? ''),
					'current_state' => $r['current_state'] ?? null,
					'next_state' => $r['next_state'] ?? null,
				];
			}

			return $out;
		} catch (Throwable) {
			return [];
		}
	}

	/**
	 * @return array{step_no:int, step_key:string, page_key:string, current_state:mixed, next_state:mixed}|null
	 */
	public function findStepRow(int $skillId, int $formatId, int $stepNo): ?array
	{
		if ($skillId <= 0 || $formatId < 0 || $stepNo < 0) return null;

		try {
			$stmt = $this->dbSharedContent->prepare("
				SELECT step_no, step_key, page_key, current_state, next_state
				FROM exercise_steps
				WHERE skill_id = :skill_id
				AND format_id = :format_id
				AND step_no = :step_no
				LIMIT 1
			");
			$stmt->execute([
				':skill_id' => $skillId,
				':format_id' => $formatId,
				':step_no' => $stepNo,
			]);

			$r = $stmt->fetch(PDO::FETCH_ASSOC);
			if (!is_array($r)) return null;

			return [
				'step_no' => (int)($r['step_no'] ?? 0),
				'step_key' => (string)($r['step_key'] ?? ''),
				'page_key' => (string)($r['page_key'] ?? ''),
				'current_state' => $r['current_state'] ?? null,
				'next_state' => $r['next_state'] ?? null,
			];
		} catch (Throwable) {
			return null;
		}
	}

	/**
	 * @return array{is_action_allowed:int, allowed_ci_type_ids:?string}|null
	 */
	public function findActionPolicy(int $skillId, int $formatId, int $stepNo): ?array
	{
		if ($skillId <= 0 || $formatId < 0 || $stepNo < 0) return null;

		try {
			$stmt = $this->dbSharedContent->prepare("
				SELECT is_action_allowed, allowed_ci_type_ids
				FROM exercise_steps
				WHERE skill_id = :skill_id
				  AND format_id = :format_id
				  AND step_no = :step_no
				LIMIT 1
			");
			$stmt->execute([
				':skill_id' => $skillId,
				':format_id' => $formatId,
				':step_no' => $stepNo,
			]);

			$row = $stmt->fetch(PDO::FETCH_ASSOC);
			if (!is_array($row)) return null;

			return [
				'is_action_allowed' => (int)($row['is_action_allowed'] ?? 0),
				'allowed_ci_type_ids' => array_key_exists('allowed_ci_type_ids', $row)
					? (is_null($row['allowed_ci_type_ids']) ? null : (string)$row['allowed_ci_type_ids'])
					: null,
			];
		} catch (Throwable) {
			return null;
		}
	}

	public function findPageKey(int $skillId, int $formatId, int $stepNo): string
	{
		if ($skillId <= 0 || $formatId < 0 || $stepNo < 0) return '';

		try {
			$stmt = $this->dbSharedContent->prepare("
				SELECT page_key
				FROM exercise_steps
				WHERE skill_id = :skill_id
				  AND format_id = :format_id
				  AND step_no = :step_no
				LIMIT 1
			");
			$stmt->execute([
				':skill_id' => $skillId,
				':format_id' => $formatId,
				':step_no' => $stepNo,
			]);

			$pageKey = $stmt->fetchColumn();
			return is_string($pageKey) ? $pageKey : '';
		} catch (Throwable) {
            return '';
        }
	}
}