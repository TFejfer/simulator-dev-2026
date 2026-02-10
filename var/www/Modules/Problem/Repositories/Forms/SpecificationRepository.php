<?php
declare(strict_types=1);

namespace Modules\Problem\Repositories\Forms;

use PDO;

final class SpecificationRepository
{
	private const ALLOWED_FIELDS = [
		'problem_statement',
		'what_is','what_isnot','what_distinctions','what_changes',
		'where_is','where_isnot','where_distinctions','where_changes',
		'when_is','when_isnot','when_distinctions','when_changes',
		'extent_is','extent_isnot','extent_distinctions','extent_changes',
	];

	public function __construct(private PDO $db) {}

	/**
	 * @return array<string,string> field => text
	 */
	public function readAll(
		int $accessId,
		int $teamNo,
		int $outlineId,
		int $exerciseNo,
		int $themeId,
		int $scenarioId
	): array {
		$st = $this->db->prepare("
			SELECT field, text
			FROM problem_form_kt_specification
			WHERE access_id = :access_id
			  AND team_no = :team_no
			  AND outline_id = :outline_id
			  AND exercise_no = :exercise_no
			  AND theme_id = :theme_id
			  AND scenario_id = :scenario_id
			ORDER BY field ASC
		");
		$st->execute([
			':access_id' => $accessId,
			':team_no' => $teamNo,
			':outline_id' => $outlineId,
			':exercise_no' => $exerciseNo,
			':theme_id' => $themeId,
			':scenario_id' => $scenarioId,
		]);

		$out = [];
		foreach (($st->fetchAll(PDO::FETCH_ASSOC) ?: []) as $r) {
			$f = (string)($r['field'] ?? '');
			if ($f === '') continue;
			$out[$f] = (string)($r['text'] ?? '');
		}
		return $out;
	}

	public function upsertOne(
		int $accessId,
		int $teamNo,
		int $outlineId,
		int $exerciseNo,
		int $themeId,
		int $scenarioId,
		string $field,
		string $text,
		string $actorToken
	): void {
		$field = strtolower(trim($field));
		if (!in_array($field, self::ALLOWED_FIELDS, true)) {
			return;
		}

		$st = $this->db->prepare("
			INSERT INTO problem_form_kt_specification (
				access_id, team_no, outline_id, exercise_no, theme_id, scenario_id,
				field, text, actor_token
			) VALUES (
				:access_id, :team_no, :outline_id, :exercise_no, :theme_id, :scenario_id,
				:field, :text, :actor_token
			)
			ON DUPLICATE KEY UPDATE
				text = VALUES(text),
				actor_token = VALUES(actor_token),
				updated_at = CURRENT_TIMESTAMP
		");
		$st->execute([
			':access_id' => $accessId,
			':team_no' => $teamNo,
			':outline_id' => $outlineId,
			':exercise_no' => $exerciseNo,
			':theme_id' => $themeId,
			':scenario_id' => $scenarioId,
			':field' => $field,
			':text' => $text,
			':actor_token' => $actorToken,
		]);
	}

	public function hasAllKeyMetas(int $accessId, int $teamNo, int $outlineId, int $exerciseNo, array $requiredKeyMetas): bool
	{
		if ($accessId <= 0 || $teamNo <= 0 || $outlineId <= 0 || $exerciseNo <= 0) return false;
		$requiredKeyMetas = array_values(array_unique(array_filter(array_map('strval', $requiredKeyMetas), static fn($v) => $v !== '')));
		if (!$requiredKeyMetas) return false;

		$stmt = $this->db->prepare("
			SELECT DISTINCT field
			FROM problem_form_kt_specification
			WHERE access_id = :access_id
			AND team_no = :team_no
			AND outline_id = :outline_id
			AND exercise_no = :exercise_no
		");
		$stmt->execute([
			':access_id' => $accessId,
			':team_no' => $teamNo,
			':outline_id' => $outlineId,
			':exercise_no' => $exerciseNo,
		]);
		$found = $stmt->fetchAll(PDO::FETCH_COLUMN) ?: [];

		// Check that all requiredKeyMetas are present in $found
		return empty(array_diff($requiredKeyMetas, $found));
	}
}