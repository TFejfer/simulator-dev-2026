<?php
declare(strict_types=1);

namespace Modules\Problem\Content\Repositories;

use PDO;
use Throwable;

final class OutcomeRepository
{
	public function __construct(private PDO $dbProblemContent) {}

	public function findOutcomeText(int $outcomeId, string $languageCode): ?string
	{
		if ($outcomeId <= 0) return null;

		$languageCode = strtolower(trim($languageCode));
		if ($languageCode === '') $languageCode = 'en';

		try {
			$stmt = $this->dbProblemContent->prepare(" 
				SELECT COALESCE(NULLIF(TRIM(t.translated_text), ''), m.source_text) AS text_value
				FROM i18n_outcome_master m
				LEFT JOIN i18n_outcome_translations t
					ON t.master_id = m.id
				   AND t.language_code = :language_code
				WHERE m.key_code = :outcome_id
				LIMIT 1
			");
			$stmt->execute([
				':language_code' => $languageCode,
				':outcome_id' => $outcomeId,
			]);

			$row = $stmt->fetch(PDO::FETCH_ASSOC);
			if ($row === false) return null;

			return isset($row['text_value']) ? (string)$row['text_value'] : null;
		} catch (Throwable) {
			return null;
		}
	}
}
