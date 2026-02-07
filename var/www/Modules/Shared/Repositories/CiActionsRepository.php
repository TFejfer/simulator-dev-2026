<?php
declare(strict_types=1);

namespace Modules\Shared\Repositories;

use PDO;
use Throwable;

final class CiActionsRepository
{
	public function __construct(private PDO $dbSharedContent) {}

	public function hasRisk(int $actionId): ?bool
	{
		if ($actionId <= 0) return null;

		try {
			$stmt = $this->dbSharedContent->prepare("
				SELECT has_risk
				FROM i18n_ci_actions_master
				WHERE key_code = :action_id
				LIMIT 1
			");
			$stmt->execute([
				':action_id' => $actionId,
			]);

			$row = $stmt->fetch(PDO::FETCH_ASSOC);
			return $row !== false ? (bool)$row['has_risk'] : null;
		} catch (Throwable) {
			return null;
		}
	}
}
