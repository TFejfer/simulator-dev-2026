<?php
declare(strict_types=1);

namespace Modules\Problem\Repositories;

use PDO;

final class ThemeConfigurationItems
{
	public function __construct(
		private PDO $dbProblemContent
	) {}

	/**
	 * Returns configuration items for the requested theme and language.
	 */
	public function themeConfigurationItems(int $themeId, string $languageCode): array
	{
		$stmt = $this->dbProblemContent->prepare("
			SELECT
				cit.ci_type_id,
                CONCAT(cit.ci_type_id, COALESCE(cit.ci_suffix, '')) AS ci_id,
                COALESCE(NULLIF(TRIM(t.translated_text), ''), m.source_text) AS ci_text,
                m.is_possible_cause
            FROM cis_in_themes cit
            JOIN i18n_configuration_item_types_master m
                ON m.key_code = cit.ci_type_id
            LEFT JOIN i18n_configuration_item_types_translations t
                ON t.master_id = m.id
            AND t.language_code = :language_code
            WHERE cit.theme_id = :theme_id;
		");
		$stmt->execute([
			':language_code' => $languageCode,
			':theme_id' => $themeId,
		]);

		return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
	}

	/**
	 * Returns available actions for configuration items in the requested theme.
	 */
	public function themeConfigurationItemActions(int $themeId): array
	{
		$stmt = $this->dbProblemContent->prepare("
			SELECT
				x.ci_type_id,
				m.action_id
			FROM (
				SELECT DISTINCT ci_type_id
				FROM cis_in_themes
				WHERE theme_id = :theme_id
			) x
			JOIN problem_ci_action_time_and_cost m
				ON m.ci_type_id = x.ci_type_id
			ORDER BY x.ci_type_id ASC, m.action_id ASC;
		");
		$stmt->execute([
			':theme_id' => $themeId,
		]);

		return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
	}
}