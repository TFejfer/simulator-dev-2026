<?php
declare(strict_types=1);

namespace Modules\Training\Auth\Services;

use Modules\Training\Auth\Repositories\OutlineRepository;
use Modules\Shared\Repositories\FormTemplateRepository;

/**
 * delivery_id is an encoded course identifier:
 * - 1st digit: purpose_id
 * - 2nd digit: skill_id
 * - 3rd digit: skill_level_id
 * - 4th digit: pace_id
 * - last 2 digits: sequence_no (01-99)
 *
 * Example: P S L P xx  => total length typically 6 (e.g. 211103)
 */
final class DeliveryMetaBuilder
{
	public function __construct(
		private OutlineRepository $outlineRepo,
		private FormTemplateRepository $templates
	) {}

	/**
	 * @return array{
	 *   purpose_id:int,
	 *   skill_id:int,
	 *   skill_level_id:int,
	 *   pace_id:int,
	 *   sequence_no:int
	 * }
	 */
	public function parseDeliveryId(string $deliveryId): array
	{
		$deliveryId = trim($deliveryId);

		// Minimum length for: 4 digits + 2 digits = 6
		if (strlen($deliveryId) < 6 || !ctype_digit($deliveryId)) {
			// Fail-safe defaults to avoid fatal errors.
			return [
				'purpose_id' => 0,
				'skill_id' => 0,
				'skill_level_id' => 0,
				'pace_id' => 1,
				'sequence_no' => 0,
			];
		}

		$purposeId     = (int)substr($deliveryId, 0, 1);
		$skillId       = (int)substr($deliveryId, 1, 1);
		$skillLevelId  = (int)substr($deliveryId, 2, 1);
		$paceId        = (int)substr($deliveryId, 3, 1);
		$sequenceNo    = (int)substr($deliveryId, -2);

		// Domain sanity
		if ($paceId <= 0) {
			$paceId = 1;
		}
		if ($sequenceNo < 1 || $sequenceNo > 99) {
			// keep 0 if invalid, so you can detect it upstream
			$sequenceNo = 0;
		}

		return [
			'purpose_id' => $purposeId,
			'skill_id' => $skillId,
			'skill_level_id' => $skillLevelId,
			'pace_id' => $paceId,
			'sequence_no' => $sequenceNo,
		];
	}

	public function resolvePaceIdFromDeliveryId(string $deliveryId): int
	{
		return $this->parseDeliveryId($deliveryId)['pace_id'];
	}

	/**
	 * Build stable session delivery_meta.
	 *
	 * Template handling:
	 * - accessRow provides template_id (from RUNTIME: access/company default)
	 * - template_code is resolved from SHARED_CONTENT via FormTemplateRepository
	 * - if template_id is missing/invalid, default template is used
	 */
	public function build(array $accessRow, int $paceId, string $sessionToken): array
	{
		$deliveryId = (string)($accessRow['delivery_id'] ?? '');
		$parsed = $this->parseDeliveryId($deliveryId);

		// paceId argument wins (runtime decision), but fallback to parsed if needed
		$paceId = $paceId > 0 ? $paceId : $parsed['pace_id'];

		// Resolve template safely (do NOT rely on cross-DB joins)
		$templateId = (int)($accessRow['template_id'] ?? 0);
		if ($templateId <= 0) {
			$templateId = $this->templates->defaultTemplateId();
		}
		$templateCode = $this->templates->templateCodeById($templateId);

		$meta = [
			'access_id'        => (int)($accessRow['access_id'] ?? 0),
			'company_id'       => (int)($accessRow['company_id'] ?? 0),
			'delivery_id'      => $deliveryId,

			'template_id'      => $templateId,
			'template_code'    => $templateCode,
			'is_frontline'	   => (int)($accessRow['is_frontline'] ?? 0),

			'purpose_id'       => $parsed['purpose_id'],
			'skill_id'         => $parsed['skill_id'],
			'skill_level_id'   => $parsed['skill_level_id'],
			'pace_id'          => $paceId,
			'sequence_no'      => $parsed['sequence_no'],

			'team_count'       => (int)($accessRow['team_count'] ?? 0),
			'planned_date'     => $accessRow['planned_date'] ?? null,
			'team_no'          => 0, // to be set later

			'session_token'    => $sessionToken,
			'last_login_unix'  => time(),
		];

		// Instructor-paced only (pace_id = 1): attach outline-based skills
		$meta['skills'] = ($paceId === 1 && $deliveryId !== '')
			? $this->outlineRepo->listSkillIdsByDeliveryId($deliveryId)
			: [];

		return $meta;
	}
}