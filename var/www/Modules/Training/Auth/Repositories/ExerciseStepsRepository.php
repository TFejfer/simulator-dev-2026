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