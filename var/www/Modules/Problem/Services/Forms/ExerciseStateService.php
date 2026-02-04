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
	 * Read canonical state for relevant forms + versions + UI form config.
	 *
	 * Core rules:
	 * - UI form plan comes from SHARED_CONTENT (form_rule + template items) via FormRuleRepository.
	 * - Iterations is additionally filtered/overridden by runtime policy:
	 *   - hidden if causality enabled or <2 causes or step < 60
	 *   - locked after completion
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
		int $templateId,
		int $numberOfCauses,
		bool $hasCausality
	): array {
		$versions = $this->readVersions($accessId, $teamNo, $outlineId, $exerciseNo);

		// Ordered list of forms for this step, template-aware (only is_visible=1)
		$uiForms = $this->formRules->findFormsForStep($skillId, $formatId, $stepNo, $templateId);

		// Runtime policy for iterations (may override or remove)
		$iterMode = $this->computeIterationVisibility($stepNo, $numberOfCauses, $hasCausality);

		// Apply iterations policy to UI plan:
		// - if hidden => remove from uiForms
		// - if locked => force mode=3 for iterations row
		if (!empty($uiForms)) {
			$tmp = [];
			foreach ($uiForms as $row) {
				$form = (string)($row['form_code'] ?? '');
				if ($form === '') continue;

				if ($form === 'iterations') {
					if ($iterMode === 0) {
						// hide iterations entirely
						continue;
					}
					if ($iterMode === 3) {
						$row['mode'] = 3;
					}
				}
				$tmp[] = $row;
			}
			$uiForms = $tmp;
		}

		// Build visibility map (backwards compatible: form_code => 0/1/2/3)
		$visibility = [];
		foreach ($uiForms as $row) {
			$form = (string)($row['form_code'] ?? '');
			if ($form === '') continue;
			$visibility[$form] = (int)($row['mode'] ?? 3);
		}
		// Ensure iterations key exists in visibility map (stable client contract)
		if (!isset($visibility['iterations'])) {
			$visibility['iterations'] = 0;
		}

		// Load only the forms in the ui plan (plus policy already applied)
		$formData = [];
		foreach ($uiForms as $row) {
			$form = (string)($row['form_code'] ?? '');
			if ($form === '') continue;

			switch ($form) {
				case 'symptoms':
					$formData['symptoms'] = $this->symptoms->read($accessId, $teamNo, $outlineId, $exerciseNo);
					break;

				case 'facts':
					$formData['facts'] = $this->facts->read($accessId, $teamNo, $outlineId, $exerciseNo);
					break;

				case 'causes':
					$formData['causes'] = $this->causes->read($accessId, $teamNo, $outlineId, $exerciseNo);
					break;

				case 'actions':
					$formData['actions'] = $this->actions->read($accessId, $teamNo, $outlineId, $exerciseNo);
					break;

				case 'iterations':
					// Only load if still present (policy already applied)
					$formData['iterations'] = $this->iterations->read(
						$accessId,
						$teamNo,
						$outlineId,
						$exerciseNo,
						$themeId,
						$scenarioId
					);
					break;

				case 'description':
				case 'worknotes': // worknotes shares the description table/endpoint
					$formData['description'] = $this->description->read(
						$accessId,
						$teamNo,
						$outlineId,
						$exerciseNo,
						$themeId,
						$scenarioId
					);
					break;

				case 'reflections':
					$formData['reflections'] = $this->reflections->read($accessId, $teamNo, $outlineId, $exerciseNo);
					break;

				case 'attachments':
					$formData['attachments'] = $this->attachments->readMeta(
						$accessId,
						$teamNo,
						$outlineId,
						$exerciseNo,
						$themeId,
						$scenarioId
					);
					break;

				// If you add more forms later, handle them here.
				default:
					break;
			}
		}

		// Normalize versions for known forms (stable client contract)
		foreach (['symptoms','facts','causes','actions','iterations','description','reflections','attachments'] as $k) {
			if (!isset($versions[$k])) $versions[$k] = 0;
		}

		return [
			'versions' => $versions,

			// Backwards compatible contract (you previously returned case.visibility)
			'case' => [
				'visibility' => $visibility,
				// New: ordered plan incl. component + mode
				'forms' => $uiForms,
			],

			'forms' => $formData,
		];
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
	 * Runtime policy for iterations.
	 *
	 * Returns numeric visibility modes:
	 * - 0 = hidden
	 * - 1 = enabled (editable)
	 * - 3 = disabled (visible, locked)
	 */
	private function computeIterationVisibility(int $stepNo, int $numberOfCauses, bool $hasCausality): int
	{
		// iterations only relevant from step 60
		if ($stepNo < 60) return 0;

		// only if at least 2 causes exist
		if ($numberOfCauses < 2) return 0;

		// not if causality is enabled
		if ($hasCausality) return 0;

		// Editable until completion
		if ($stepNo < 100) return 1;

		// After completion: visible, locked
		return 3;
	}
}