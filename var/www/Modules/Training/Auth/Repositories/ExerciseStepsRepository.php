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