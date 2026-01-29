<?php
declare(strict_types=1);

namespace Modules\Shared\Repositories;

use PDO;

final class FormRuleRepository
{
	public function __construct(
		private PDO $dbSharedContent
	) {}

	/**
	 * Returns numeric visibility modes for the requested scope.
	 *
	 * Output contract (used by UI):
	 * - 0 = hidden
	 * - 1 = enabled (editable)
	 * - 2 = limited (visible, no buttons)
	 * - 3 = disabled (visible, locked)
	 *
	 * @return array<string,int> e.g. ['symptoms'=>1,'facts'=>2,...]
	 */
	public function findVisibility(int $skillId, int $formatId, int $stepNo): array
	{
		$stmt = $this->dbSharedContent->prepare("
			SELECT form, is_visible, mode
			FROM form_rule
			WHERE skill_id = :skill_id
			  AND format_id = :format_id
			  AND step_no = :step_no
		");
		$stmt->execute([
			':skill_id' => $skillId,
			':format_id' => $formatId,
			':step_no' => $stepNo,
		]);

		$map = [];

		while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
			$form = (string)($row['form'] ?? '');
			if ($form === '') continue;

			$isVisible = (int)($row['is_visible'] ?? 0);
			$mode = (string)($row['mode'] ?? 'disabled');

			if ($isVisible <= 0) {
				$map[$form] = 0;
				continue;
			}

			$map[$form] = match ($mode) {
				'enabled' => 1,
				'limited' => 2,
				'disabled' => 3,
				default => 3,
			};
		}

		return $map;
	}
}