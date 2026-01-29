<?php
declare(strict_types=1);

namespace Modules\Problem\Repositories\Forms;

use PDO;

final class AttachmentsRepository
{
	public function __construct(private PDO $db) {}

	/**
	 * Read full attachment row (including blob).
	 *
	 * @return array<string,mixed>
	 */
	public function read(
		int $accessId,
		int $teamNo,
		int $outlineId,
		int $exerciseNo,
		int $themeId,
		int $scenarioId
	): array {
		$stmt = $this->db->prepare("
			SELECT id, file_name, file
			FROM problem_form_attachments
			WHERE access_id = :access_id
			  AND team_no = :team_no
			  AND outline_id = :outline_id
			  AND exercise_no = :exercise_no
			  AND theme_id = :theme_id
			  AND scenario_id = :scenario_id
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

		$row = $stmt->fetch(PDO::FETCH_ASSOC);
		if (!$row) {
			return ['id' => 0, 'file_name' => null, 'file' => null];
		}
		return $row;
	}

	/**
	 * Read attachment meta only (no blob), for exercise-state payload.
	 *
	 * @return array<string,mixed>
	 */
	public function readMeta(
		int $accessId,
		int $teamNo,
		int $outlineId,
		int $exerciseNo,
		int $themeId,
		int $scenarioId
	): array {
		$stmt = $this->db->prepare("
			SELECT id, file_name
			FROM problem_form_attachments
			WHERE access_id = :access_id
			  AND team_no = :team_no
			  AND outline_id = :outline_id
			  AND exercise_no = :exercise_no
			  AND theme_id = :theme_id
			  AND scenario_id = :scenario_id
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

		$row = $stmt->fetch(PDO::FETCH_ASSOC);
		if (!$row) {
			return ['id' => 0, 'file_name' => null];
		}
		return $row;
	}

	/**
	 * Upsert attachment (one per scope).
	 * This requires a UNIQUE or PRIMARY KEY constraint that matches scope,
	 * OR you handle delete+insert in service.
	 *
	 * Recommended DB constraint:
	 * UNIQUE (access_id, team_no, outline_id, exercise_no, theme_id, scenario_id)
	 */
	public function upsert(
		int $accessId,
		int $teamNo,
		int $outlineId,
		int $exerciseNo,
		int $themeId,
		int $scenarioId,
		string $fileName,
		string $blob,
		string $actorToken
	): void {
		// If you don't have a UNIQUE constraint on scope, this will insert duplicates.
		// Add:
		// UNIQUE KEY uq_scope (access_id, team_no, outline_id, exercise_no, theme_id, scenario_id)
		$stmt = $this->db->prepare("
			INSERT INTO problem_form_attachments
			  (access_id, team_no, outline_id, exercise_no, theme_id, scenario_id, file_name, file, actor_token, updated_at)
			VALUES
			  (:access_id, :team_no, :outline_id, :exercise_no, :theme_id, :scenario_id, :file_name, :file, :actor_token, CURRENT_TIMESTAMP)
			ON DUPLICATE KEY UPDATE
			  file_name = VALUES(file_name),
			  file = VALUES(file),
			  actor_token = VALUES(actor_token),
			  updated_at = CURRENT_TIMESTAMP
		");
		$stmt->bindValue(':access_id', $accessId, PDO::PARAM_INT);
		$stmt->bindValue(':team_no', $teamNo, PDO::PARAM_INT);
		$stmt->bindValue(':outline_id', $outlineId, PDO::PARAM_INT);
		$stmt->bindValue(':exercise_no', $exerciseNo, PDO::PARAM_INT);
		$stmt->bindValue(':theme_id', $themeId, PDO::PARAM_INT);
		$stmt->bindValue(':scenario_id', $scenarioId, PDO::PARAM_INT);
		$stmt->bindValue(':file_name', $fileName, PDO::PARAM_STR);
		$stmt->bindValue(':file', $blob, PDO::PARAM_LOB);
		$stmt->bindValue(':actor_token', $actorToken, PDO::PARAM_STR);
		$stmt->execute();
	}

	/**
	 * Delete attachment for scope.
	 */
	public function delete(
		int $accessId,
		int $teamNo,
		int $outlineId,
		int $exerciseNo,
		int $themeId,
		int $scenarioId
	): void {
		$stmt = $this->db->prepare("
			DELETE FROM problem_form_attachments
			WHERE access_id = :access_id
			  AND team_no = :team_no
			  AND outline_id = :outline_id
			  AND exercise_no = :exercise_no
			  AND theme_id = :theme_id
			  AND scenario_id = :scenario_id
		");
		$stmt->execute([
			':access_id' => $accessId,
			':team_no' => $teamNo,
			':outline_id' => $outlineId,
			':exercise_no' => $exerciseNo,
			':theme_id' => $themeId,
			':scenario_id' => $scenarioId,
		]);
	}
}