<?php
declare(strict_types=1);

namespace Modules\Shared\Repositories;

use PDO;
use Throwable;

final class LottieRepository
{
	public function __construct(private PDO $dbSharedContent) {}

	public function findCodeById(int $lottieId): ?string
	{
		if ($lottieId <= 0) return null;

		try {
			$stmt = $this->dbSharedContent->prepare("
				SELECT code
				FROM lottie
				WHERE lottie_id = :lottie_id
				LIMIT 1
			");
			$stmt->execute([':lottie_id' => $lottieId]);
			$code = $stmt->fetchColumn();
			$code = is_string($code) ? trim($code) : '';
			return $code !== '' ? $code : null;
		} catch (Throwable) {
			return null;
		}
	}
}