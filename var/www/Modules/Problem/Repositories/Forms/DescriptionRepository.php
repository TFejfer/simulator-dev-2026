<?php
declare(strict_types=1);

namespace Modules\Problem\Repositories\Forms;

use PDO;

final class DescriptionRepository
{
	public function __construct(private PDO $db) {}

	/** @return array{short_description:string,long_description:string,work_notes:string} */
	public function read(
		int $accessId,
		int $teamNo,
		int $outlineId,
		int $exerciseNo,
		int $themeId,
		int $scenarioId
	): array {
		$stmt = $this->db->prepare("
			SELECT short_description, long_description, work_notes
			FROM problem_form_description
			WHERE access_id = :access_id AND team_no = :team_no
			  AND outline_id = :outline_id AND exercise_no = :exercise_no
			  AND theme_id = :theme_id AND scenario_id = :scenario_id
			LIMIT 1
		");
		$stmt->execute([
			':access_id' => $accessId,
			':team_no' => $teamNo,
			':outline_id' => $outlineId,
			':exercise_no' => $exerciseNo,
			':theme_id' => $themeId,
			':scenario_id' => $scenarioId,
		]);

		$row = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];

		return [
			'short_description' => (string)($row['short_description'] ?? ''),
			'long_description'  => (string)($row['long_description'] ?? ''),
			'work_notes'        => (string)($row['work_notes'] ?? ''),
		];
	}

	public function upsert(
		int $accessId,
		int $teamNo,
		int $outlineId,
		int $exerciseNo,
		int $themeId,
		int $scenarioId,
		string $short,
		string $long,
		string $notes,
		?string $actorToken
	): void {
		$stmt = $this->db->prepare("
			INSERT INTO problem_form_description
			  (access_id, team_no, outline_id, exercise_no, theme_id, scenario_id,
			   short_description, long_description, work_notes, actor_token)
			VALUES
			  (:access_id, :team_no, :outline_id, :exercise_no, :theme_id, :scenario_id,
			   :short, :long, :notes, :actor_token)
			ON DUPLICATE KEY UPDATE
			  short_description = VALUES(short_description),
			  long_description  = VALUES(long_description),
			  work_notes        = VALUES(work_notes),
			  actor_token       = VALUES(actor_token),
			  updated_at        = CURRENT_TIMESTAMP
		");
		$stmt->execute([
			':access_id' => $accessId,
			':team_no' => $teamNo,
			':outline_id' => $outlineId,
			':exercise_no' => $exerciseNo,
			':theme_id' => $themeId,
			':scenario_id' => $scenarioId,
			':short' => $short,
			':long' => $long,
			':notes' => $notes,
			':actor_token' => $actorToken,
		]);
	}
}