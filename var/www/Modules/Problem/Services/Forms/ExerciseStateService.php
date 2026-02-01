<?php
declare(strict_types=1);

namespace Modules\Problem\Services\Forms;

use PDO;
use Modules\Shared\Repositories\FormRuleRepository;
use Modules\Problem\Repositories\Forms\FormVersionRepository;
use Modules\Problem\Repositories\Forms\SymptomsRepository;
use Modules\Problem\Repositories\Forms\FactsRepository;
use Modules\Problem\Repositories\Forms\CausesRepository;
use Modules\Problem\Repositories\Forms\ActionsRepository;
use Modules\Problem\Repositories\Forms\IterationsRepository;
use Modules\Problem\Repositories\Forms\DescriptionRepository;
use Modules\Problem\Repositories\Forms\ReflectionsRepository;
use Modules\Problem\Repositories\Forms\AttachmentsRepository;

final class ExerciseStateService
{
	public function __construct(
		private PDO $dbRuntime,
		private FormVersionRepository $versions,
		private SymptomsRepository $symptoms,
		private FactsRepository $facts,
		private CausesRepository $causes,
		private ActionsRepository $actions,
		private IterationsRepository $iterations,
		private DescriptionRepository $description,
		private ReflectionsRepository $reflections,
		private AttachmentsRepository $attachments,
		private FormRuleRepository $formRules
	) {}

	/**
	 * Read canonical state for all forms + versions + visibility in one response.
	 *
	 * IMPORTANT:
	 * Visibility comes from SHARED_CONTENT.form_rule (skill_id + format_id + step_no).
	 *
	 * @return array<string,mixed>
	 */
	public function readAllForms(
		int $accessId,
		int $teamNo,
		int $outlineId,
		int $exerciseNo,
		int $themeId,
		int $scenarioId,
		int $skillId,
		int $formatId,
		int $stepNo,
		int $numberOfCauses,
		bool $hasCausality
	): array {
		$versions = $this->readVersions($accessId, $teamNo, $outlineId, $exerciseNo);

		// Visibility from shared_content.form_rule
		$visibility = $this->formRules->findVisibility($skillId, $formatId, $stepNo);
		$visibility['iterations'] = $this->computeIterationVisibility($stepNo, $numberOfCauses, $hasCausality);


		$out = [
			'versions' => $versions,
			'case' => [
				'visibility' => $visibility,
			],
			'forms' => [
				'symptoms' => $this->symptoms->read($accessId, $teamNo, $outlineId, $exerciseNo),
				'facts' => $this->facts->read($accessId, $teamNo, $outlineId, $exerciseNo),
				'causes' => $this->causes->read($accessId, $teamNo, $outlineId, $exerciseNo),
				'actions' => $this->actions->read($accessId, $teamNo, $outlineId, $exerciseNo),
				'iterations' => $this->iterations->read($accessId, $teamNo, $outlineId, $exerciseNo, $themeId, $scenarioId),
				'description' => $this->description->read($accessId, $teamNo, $outlineId, $exerciseNo, $themeId, $scenarioId),
				'reflections' => $this->reflections->read($accessId, $teamNo, $outlineId, $exerciseNo),
				'attachments' => $this->attachments->readMeta($accessId, $teamNo, $outlineId, $exerciseNo, $themeId, $scenarioId),
			],
		];

		// Normalize versions for known forms (stable client contract)
		foreach (['symptoms','facts','causes','actions','iterations','description','reflections','attachments'] as $k) {
			if (!isset($out['versions'][$k])) $out['versions'][$k] = 0;
		}

		return $out;
	}

	/**
	 * @return array<string,int> form_key => version
	 */
	private function readVersions(int $accessId, int $teamNo, int $outlineId, int $exerciseNo): array
	{
		$stmt = $this->dbRuntime->prepare("
			SELECT form_key, version
			FROM problem_form_versions
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

		$out = [];
		while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
			$k = (string)($row['form_key'] ?? '');
			if ($k === '') continue;
			$out[$k] = (int)($row['version'] ?? 0);
		}
		return $out;
	}

	/**
	 * Compute iteration form visibility based on step no, number of causes, and causality setting.
	 */
	private function computeIterationVisibility(int $stepNo, int $numberOfCauses, bool $hasCausality): int
	{
		// Legacy parity:
		// - iteration only relevant from step 60
		// - only if at least 2 causes exist
		// - not if causality is enabled
		if ($stepNo < 60) return 0;
		if ($numberOfCauses < 2) return 0;
		if ($hasCausality) return 0;

		// Editable until completion
		if ($stepNo < 100) return 1;

		// After completion: visible, locked
		return 3;
	}
}