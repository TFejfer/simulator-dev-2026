<?php
declare(strict_types=1);

namespace Modules\Shared\Support\Timer;

use Modules\Shared\Repositories\SharedExerciseParametersRepository;
use Modules\Training\Auth\Repositories\ExerciseRuntimeRepository;

/**
 * Generic time-left calculator using a log_exercise anchor step and exercise_parameters key.
 */
final class TimeLeftService
{
    public function __construct(
        private ExerciseRuntimeRepository $runtimeRepo,
        private SharedExerciseParametersRepository $sharedParamsRepo
    ) {}

    /**
     * @return array{seconds_left:int,start_unix:int,limit_seconds:int}|array{error:string}
     */
    public function getSecondsLeftFromFirstStep(
        int $accessId,
        int $teamNo,
        int $outlineId,
        int $anchorStepNo,
        string $paramKey
    ): array {
        $startUnix = $this->resolveStartUnix($accessId, $teamNo, $outlineId, $anchorStepNo);
        if ($startUnix <= 0) {
            return ['error' => 'missing_start'];
        }

        $limitSeconds = $this->getTimeLimit($paramKey);
        if ($limitSeconds <= 0) {
            return ['error' => 'missing_param'];
        }

        $elapsed = time() - $startUnix;
        $secondsLeft = max(0, $limitSeconds - $elapsed);

        return [
            'seconds_left' => $secondsLeft,
            'start_unix' => $startUnix,
            'limit_seconds' => $limitSeconds,
        ];
    }

    private function resolveStartUnix(int $accessId, int $teamNo, int $outlineId, int $anchorStepNo): int
    {
        if ($anchorStepNo > 0) {
            $row = $this->runtimeRepo->findFirstStepTimestampForOutline($accessId, $teamNo, $outlineId, $anchorStepNo);
            $ts = (int)($row['created_at_ts'] ?? 0);
            if ($ts > 0) {
                return $ts;
            }
        }

        $fallback = $this->runtimeRepo->findExerciseStartTime($accessId, $outlineId, $teamNo);
        return (int)($fallback ?? 0);
    }

    private function getTimeLimit(string $paramKey): int
    {
        $raw = $this->sharedParamsRepo->readOne($paramKey);
        $seconds = is_numeric($raw) ? (int)$raw : 0;
        return $seconds > 0 ? $seconds : 0;
    }
}