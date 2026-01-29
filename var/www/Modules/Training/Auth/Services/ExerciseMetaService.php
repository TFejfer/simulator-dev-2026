<?php
declare(strict_types=1);

namespace Modules\Training\Auth\Services;

use DateTimeImmutable;
use RuntimeException;
use Modules\Training\Auth\DTO\ExerciseMeta;
use Modules\Training\Auth\Repositories\ExerciseRuntimeRepository;
use Modules\Training\Auth\Repositories\ActiveParticipantRepository;
use Modules\Problem\Content\Repositories\ProblemScenarioMetaRepository;

/**
 * ExerciseMetaService
 *
 * Responsibility:
 * - Load latest runtime exercise state (log_exercise) into session cache
 * - Patch token-specific role/position from active participants
 * - Enrich with scenario meta from PROBLEM_CONTENT:
 *     - number_of_causes
 *     - has_causality
 *
 * Notes:
 * - This service treats has_causality and number_of_causes as independent derivations.
 * - It logs inconsistencies but does not fail the request.
 */
final class ExerciseMetaService
{
	private const SESSION_KEY = 'exercise_meta';

	public function __construct(
		private ExerciseRuntimeRepository $logExerciseRepo,
		private ActiveParticipantRepository $participantRepo,
		private ?ProblemScenarioMetaRepository $scenarioMetaRepo = null
	) {}

	/**
	 * Loads latest meta into session (always hits DB for log_exercise).
	 */
	public function loadIntoSession(int $accessId, int $teamNo, string $token): ExerciseMeta
	{
		$row = $this->logExerciseRepo->findLatestRow($accessId, $teamNo);
		if (!$row) {
			throw new RuntimeException("log_exercise not found for access_id={$accessId}, team_no={$teamNo}.");
		}

		// Token-specific runtime meta (can change without log_exercise changing)
		$rp = $this->participantRepo->findRoleAndPosition($accessId, $token);

		// Fail-safe defaults (avoid breaking UI if heartbeat row is briefly missing)
		$roleId = (int)($rp['role_id'] ?? 1);
		$positionCount = (int)($rp['position_count'] ?? 1);

		// Scenario meta (PROBLEM_CONTENT)
		$themeId = isset($row['theme_id']) ? (int)$row['theme_id'] : 0;
		$scenarioId = isset($row['scenario_id']) ? (int)$row['scenario_id'] : 0;

		$scenarioMeta = [];
		if ($this->scenarioMetaRepo) {
			// Repo should return an array; keep it defensive anyway.
			$scenarioMeta = $this->scenarioMetaRepo->getMeta($themeId, $scenarioId) ?? [];
		}

		$numberOfCauses = isset($scenarioMeta['number_of_causes'])
			? (int)$scenarioMeta['number_of_causes']
			: null;

		// IMPORTANT:
		// Casting (bool)'0' is TRUE in PHP. Always cast to int first.
		$hasCausality = isset($scenarioMeta['has_causality'])
			? ((int)$scenarioMeta['has_causality'] === 1)
			: null;

		$meta = new ExerciseMeta(
			accessId:      (int)$row['access_id'],
			teamNo:        (int)$row['team_no'],
			outlineId:     (int)$row['outline_id'],

			exerciseNo:    isset($row['exercise_no']) ? (int)$row['exercise_no'] : null,
			themeId:       isset($row['theme_id']) ? (int)$row['theme_id'] : null,
			scenarioId:    isset($row['scenario_id']) ? (int)$row['scenario_id'] : null,
			formatId:      isset($row['format_id']) ? (int)$row['format_id'] : null,
			stepNo:        isset($row['step_no']) ? (int)$row['step_no'] : null,
			currentState:  isset($row['current_state']) ? (int)$row['current_state'] : null,

			logExerciseId: (int)$row['id'],
			createdAtIso:  (new DateTimeImmutable((string)$row['created_at']))->format(DATE_ATOM),

			roleId:        $roleId,
			positionCount: $positionCount,

			// Causes and causality (scenario meta)
			numberOfCauses: $numberOfCauses,
			hasCausality:   $hasCausality
		);

		// Non-fatal consistency check (log only)
		$warning = $meta->consistencyWarning();
		if ($warning !== null) {
			error_log('[exercise-meta] ' . $warning);
		}

		$_SESSION[self::SESSION_KEY] = $meta->toArray();

		return $meta;
	}

	public function getCached(): ?array
	{
		$cached = $_SESSION[self::SESSION_KEY] ?? null;
		return is_array($cached) ? $cached : null;
	}

	/**
	 * If client supplies last known log_exercise_id, refresh only when stale.
	 * Ideal for Ajax.
	 */
	public function ensureFresh(int $accessId, int $teamNo, string $token, ?int $clientLogExerciseId): ExerciseMeta
	{
		$cached = $this->getCached();

		// If cache matches scope and version, reuse and patch token-specific fields (cheap).
		if (is_array($cached)
			&& (int)($cached['access_id'] ?? 0) === $accessId
			&& (int)($cached['team_no'] ?? 0) === $teamNo
			&& $clientLogExerciseId !== null
			&& (int)($cached['log_exercise_id'] ?? 0) === $clientLogExerciseId
		) {
			// Patch role/position each time (token-specific; can change independently)
			$rp = $this->participantRepo->findRoleAndPosition($accessId, $token);
			if (is_array($rp) && $rp) {
				$cached['role_id'] = (int)($rp['role_id'] ?? $cached['role_id'] ?? 1);
				$cached['position_count'] = (int)($rp['position_count'] ?? $cached['position_count'] ?? 1);
			}

			// Patch scenario meta if missing/null (older session cache / partial deploys)
			if (!array_key_exists('number_of_causes', $cached) || !array_key_exists('has_causality', $cached)
				|| $cached['number_of_causes'] === null || $cached['has_causality'] === null
			) {
				$themeId = (int)($cached['theme_id'] ?? 0);
				$scenarioId = (int)($cached['scenario_id'] ?? 0);

				$scenarioMeta = [];
				if ($this->scenarioMetaRepo) {
					$scenarioMeta = $this->scenarioMetaRepo->getMeta($themeId, $scenarioId) ?? [];
				}

				$cached['number_of_causes'] = isset($scenarioMeta['number_of_causes'])
					? (int)$scenarioMeta['number_of_causes']
					: 1;

				$cached['has_causality'] = isset($scenarioMeta['has_causality'])
					? ((int)$scenarioMeta['has_causality'] === 1)
					: false;
			}

			$_SESSION[self::SESSION_KEY] = $cached;

			$meta = $this->fromArray($_SESSION[self::SESSION_KEY]);

			// Non-fatal consistency check (log only)
			$warning = $meta->consistencyWarning();
			if ($warning !== null) {
				error_log('[exercise-meta] ' . $warning);
			}

			return $meta;
		}

		// Otherwise reload from DB and overwrite session cache
		return $this->loadIntoSession($accessId, $teamNo, $token);
	}

	private function fromArray(array $a): ExerciseMeta
	{
		return ExerciseMeta::fromArray($a);
	}
}