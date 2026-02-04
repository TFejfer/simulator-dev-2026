<?php
declare(strict_types=1);

namespace Modules\Problem\Repositories\Forms;

use PDO;

final class ReflectionsRepository
{
	public function __construct(
		private PDO $db
	) {}

	/**
	 * Read reflection for scope.
	 * Always returns a normalized structure.
	 *
	 * @return array{keep_text:string,improve_text:string}
	 */
	public function read(
		int $accessId,
		int $teamNo,
		int $outlineId,
		int $exerciseNo
	): array {
		$stmt = $this->db->prepare("
			SELECT
				keep_text,
				improve_text
			FROM problem_form_reflections
			WHERE access_id = :access_id
			  AND team_no = :team_no
			  AND outline_id = :outline_id
			  AND exercise_no = :exercise_no
			LIMIT 1
		");
		$stmt->execute([
			':access_id' => $accessId,
			':team_no' => $teamNo,
			':outline_id' => $outlineId,
			':exercise_no' => $exerciseNo,
		]);

		$row = $stmt->fetch(PDO::FETCH_ASSOC);

		return [
			'keep_text' => (string)($row['keep_text'] ?? ''),
			'improve_text' => (string)($row['improve_text'] ?? ''),
		];
	}

	/**
	 * Upsert reflection row.
	 */
	public function upsert(
		int $accessId,
		int $teamNo,
		int $outlineId,
		int $exerciseNo,
		string $keepText,
		string $improveText,
		string $actorToken
	): void {
		$stmt = $this->db->prepare("
			INSERT INTO problem_form_reflections (
				access_id,
				team_no,
				outline_id,
				exercise_no,
				keep_text,
				improve_text,
				actor_token
			) VALUES (
				:access_id,
				:team_no,
				:outline_id,
				:exercise_no,
				:keep_text,
				:improve_text,
				:actor_token
			)
			ON DUPLICATE KEY UPDATE
				keep_text   = VALUES(keep_text),
				improve_text = VALUES(improve_text),
				actor_token = VALUES(actor_token),
				updated_at  = CURRENT_TIMESTAMP
		");
		$stmt->execute([
			':access_id' => $accessId,
			':team_no' => $teamNo,
			':outline_id' => $outlineId,
			':exercise_no' => $exerciseNo,
			':keep_text' => $keepText,
			':improve_text' => $improveText,
			':actor_token' => $actorToken,
		]);
	}
}