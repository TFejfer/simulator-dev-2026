<?php
declare(strict_types=1);

namespace Modules\Training\Auth\Services;

use DateTimeImmutable;
use RuntimeException;
use Modules\Training\Auth\DTO\ExerciseMeta;
use Modules\Training\Auth\Repositories\ExerciseRuntimeRepository;
use Modules\Training\Auth\Repositories\ActiveParticipantRepository;
use Modules\Problem\Content\Repositories\ProblemScenarioMetaRepository;
use Modules\Shared\Support\Timer\ProblemTimerCalculator;

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
		private ?ProblemScenarioMetaRepository $scenarioMetaRepo = null,
		private \Modules\Problem\Content\Repositories\ProblemExerciseParametersRepository|\Modules\Shared\Repositories\SharedExerciseParametersRepository|null $exerciseParamsRepo = null
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
			skillId:       isset($row['skill_id']) ? (int)$row['skill_id'] : null,

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

		$metaArr = $meta->toArray();

		// Timer parameters (prefer repo if available)
		$timerParams = [];
		if ($this->exerciseParamsRepo) {
			if (method_exists($this->exerciseParamsRepo, 'readAll')) {
				$timerParams = $this->exerciseParamsRepo->readAll();
			} elseif (method_exists($this->exerciseParamsRepo, 'getValue')) {
				$keys = [
					'problem_introduction_time',
					'problem_discovery_time',
					'problem_discovery_swap_registration',
					'problem_discovery_swap_investigation',
					'problem_max_finalize_time_in_seconds',
					'problem_swap_time'
				];
				foreach ($keys as $k) {
					$timerParams[$k] = $this->exerciseParamsRepo->getValue($k);
				}
			}
		}

		// Anchor exercise_start_unix to first step 20 for this outline (fallback to created_at)
		$outlineId = (int)$meta->outlineId;
		$start20 = $outlineId > 0 ? $this->logExerciseRepo->findFirstStepTimestampForOutline($accessId, $teamNo, $outlineId, 20) : null;
		$exerciseStartUnix = (int)($start20['created_at_ts'] ?? 0);
		if ($exerciseStartUnix <= 0) {
			$exerciseStartUnix = strtotime($meta->createdAtIso ?? '') ?: 0;
		}

		// Compute timer inputs once and cache into session
		$timerCalc = new ProblemTimerCalculator($this->logExerciseRepo);
		$timerInput = $timerCalc->compute(array_merge($metaArr, [
			'access_id' => $accessId,
			'team_no' => $teamNo,
			'outline_id' => $outlineId,
			'exercise_start_unix' => $exerciseStartUnix,
		]), $timerParams);

		$metaArr = array_merge($metaArr, [
			'problem_discovery_time' => $timerParams['problem_discovery_time'] ?? null,
			'exercise_start_unix' => (int)($timerInput['exercise_start_unix'] ?? $exerciseStartUnix),
			'deadline_unix' => (int)($timerInput['deadline_unix'] ?? 0),
			'seconds_left' => (int)($timerInput['seconds_left'] ?? 0),
			'timer_start_unix' => (int)($timerInput['timer_start_unix'] ?? 0),
			'timer_end_unix' => (int)($timerInput['timer_end_unix'] ?? 0),
			'timer_phase' => (string)($timerInput['phase'] ?? ''),
			'timer_source' => (string)($timerInput['source'] ?? ''),
		]);

		$_SESSION[self::SESSION_KEY] = $metaArr;

		return $this->fromArray($metaArr);

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

			// Ensure problem_discovery_time is present when cached meta is reused.
			if (!array_key_exists('problem_discovery_time', $cached) && $this->exerciseParamsRepo && method_exists($this->exerciseParamsRepo, 'getValue')) {
				$discovery = $this->exerciseParamsRepo->getValue('problem_discovery_time');
				if ($discovery !== null) {
					$cached['problem_discovery_time'] = $discovery;
				}
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