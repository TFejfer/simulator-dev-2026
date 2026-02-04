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
	 * Returns ordered, template-aware form configuration for a step.
	 *
	 * Output contract (used by UI):
	 * [
	 *   [
	 *     'form_code' => 'symptoms',
	 *     'mode'      => 1, // 1=enabled, 2=limited, 3=disabled
	 *     'component' => 'problem/default/symptoms'
	 *   ],
	 *   ...
	 * ]
	 *
	 * Rules:
	 * - Only forms enabled by template are returned
	 * - Only forms visible in this step are returned (is_visible=1)
	 * - Ordering: template.sort_order → global sort_order → form_code
	 */
	public function findFormsForStep(
		int $skillId,
		int $formatId,
		int $stepNo,
		int $templateId
	): array {
		$stmt = $this->dbSharedContent->prepare("
			SELECT
				fr.form AS form_code,

				CASE fr.mode
					WHEN 'enabled'  THEN 1
					WHEN 'limited'  THEN 2
					WHEN 'disabled' THEN 3
					ELSE 3
				END AS mode,

				ti.component AS component,

				COALESCE(
					NULLIF(ti.sort_order, 0),
					mfc.sort_order,
					1000
				) AS sort_order_effective

			FROM form_rule fr
			JOIN meta_form_template_items ti
			  ON ti.template_id = :template_id
			 AND ti.form_key = fr.form
			 AND ti.enabled = 1

			LEFT JOIN meta_form_code mfc
			  ON mfc.skill_id = fr.skill_id
			 AND mfc.form_code = fr.form
			 AND mfc.is_active = 1

			WHERE fr.skill_id  = :skill_id
			  AND fr.format_id = :format_id
			  AND fr.step_no   = :step_no
			  AND fr.is_visible = 1

			ORDER BY sort_order_effective ASC, fr.form ASC
		");

		$stmt->execute([
			':skill_id'   => $skillId,
			':format_id'  => $formatId,
			':step_no'    => $stepNo,
			':template_id'=> $templateId,
		]);

		return $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
	}
}