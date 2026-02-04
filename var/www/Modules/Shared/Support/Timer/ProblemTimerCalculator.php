<?php
declare(strict_types=1);

namespace Modules\Shared\Support\Timer;

use Modules\Training\Auth\Repositories\ExerciseRuntimeRepository;

/**
 * ProblemTimerCalculator
 *
 * Server-side mirror of legacy timer logic for the Problem skill.
 * Produces absolute UNIX timestamps so the TopBar countdown is stable and not client-derived.
 */
final class ProblemTimerCalculator
{
    public function __construct(
        private ExerciseRuntimeRepository $runtimeRepo
    ) {}

    /**
     * @param array<string,mixed> $exerciseMeta  Exercise meta (access_id, team_no, format_id, step_no, created_at...)
     * @param array<string,mixed> $params        Map of exercise_parameters (problem_* keys)
     *
     * @return array{exercise_start_unix:int, deadline_unix:int, seconds_left:int, timer_start_unix:int, timer_end_unix:int, phase:string, source:string}
     */
    public function compute(array $exerciseMeta, array $params = []): array
    {
        $now = time();

        $accessId = (int)($exerciseMeta['access_id'] ?? 0);
        $teamNo   = (int)($exerciseMeta['team_no'] ?? 0);
        $format   = (int)($exerciseMeta['format_id'] ?? 0);
        $stepNo   = (int)($exerciseMeta['step_no'] ?? 0);

        $startUnix = $this->startUnix($exerciseMeta);
        $outlineId = isset($exerciseMeta['outline_id']) ? (int)$exerciseMeta['outline_id'] : null;
        //$isSwapFormat = ($format === 4);
        $isIntroductionFormat = ($format === 10);

        $phase = 'unknown';
        $deadline = 0;

        // Finalize window (step >= 80)
        if ($stepNo >= 80) {
            $phase = 'finalize';
            $anchor = $this->firstStepTs($accessId, $teamNo, 80, $outlineId) ?: $startUnix;
            $deadline = $anchor + $this->param($params, 'problem_max_finalize_time_in_seconds');
        }
        // Discovery swap investigation (handover) — swap formats only
        // elseif ($isSwapFormat && $stepNo === 38) {
            // $phase = 'discovery_swap_investigation';
            // $handoverTs = $this->firstStepTs($accessId, $teamNo, 38, $outlineId) ?: $startUnix;
            // $deadline = $handoverTs + $this->param($params, 'problem_discovery_swap_investigation');
        // }
        // Swap clarify — swap formats only
        elseif ($stepNo === 36) {
            $phase = 'swap_clarify';
            $anchor = $this->firstStepTs($accessId, $teamNo, 36, $outlineId) ?: $startUnix;
            $deadline = $anchor + $this->param($params, 'problem_swap_time', 300);
        }
        // Discovery swap registration — swap formats only (shorter window)
        // elseif ($isSwapFormat && $stepNo === 20) {
            // $phase = 'discovery_swap_registration';
            // $deadline = $startUnix + $this->param($params, 'problem_discovery_swap_registration');
        // }
        // Introduction vs discovery: use a simple step-based split; discovery uses the main problem_discovery_time
        elseif ($isIntroductionFormat && $this->isIntroductionStep($stepNo)) {
            $phase = 'introduction';
            $deadline = $startUnix + $this->param($params, 'problem_introduction_time');
        } else {
            $phase = 'discovery';
            $deadline = $startUnix + $this->discoverySeconds($format, $params);
        }

        $deadline = max(0, $deadline);
        $secondsLeft = $deadline > 0 ? max(0, $deadline - $now) : 0;

        return [
            'exercise_start_unix' => $startUnix,
            'deadline_unix'       => $deadline,
            'seconds_left'        => $secondsLeft,
            'timer_start_unix'    => $startUnix,
            'timer_end_unix'      => $deadline,
            'phase'               => $phase,
            'source'              => 'problem-timer/v1'
        ];
    }

    private function startUnix(array $exerciseMeta): int
    {
        $explicit = (int)($exerciseMeta['exercise_start_unix'] ?? 0);
        if ($explicit > 0) return $explicit;

        $createdAt = (string)($exerciseMeta['created_at'] ?? $exerciseMeta['created_at_iso'] ?? '');
        $ts = $createdAt ? strtotime($createdAt) : 0;
        return $ts ?: 0;
    }

    private function param(array $params, string $key, int $fallback = 0): int
    {
        $v = $params[$key] ?? null;
        $n = is_numeric($v) ? (int)$v : 0;
        return $n > 0 ? $n : $fallback;
    }

    private function discoverySeconds(int $format, array $params): int
    {
        // Formats 1/10/11 are the classic discovery countdowns
        return $this->param($params, 'problem_discovery_time');
    }

    private function isIntroductionStep(int $stepNo): bool
    {
        // Conservative split: early steps (<10) treated as introduction
        return $stepNo > 0 && $stepNo < 10;
    }

    private function firstStepTs(int $accessId, int $teamNo, int $stepNo, ?int $outlineId = null): int
    {
        if ($accessId <= 0 || $teamNo <= 0 || $stepNo <= 0) return 0;
        if ($outlineId !== null && $outlineId > 0 && method_exists($this->runtimeRepo, 'findFirstStepTimestampForOutline')) {
            $row = $this->runtimeRepo->findFirstStepTimestampForOutline($accessId, $teamNo, $outlineId, $stepNo);
        } else {
            $row = $this->runtimeRepo->findFirstStepTimestamp($accessId, $teamNo, $stepNo);
        }
        return (int)($row['created_at_ts'] ?? 0);
    }
}