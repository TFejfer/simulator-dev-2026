<?php
declare(strict_types=1);

namespace Modules\Training\Auth\Services;

use RuntimeException;
use Modules\Training\Auth\DTO\ExerciseMeta;
use Modules\Training\Auth\Repositories\ExerciseRuntimeRepository;
use Modules\Training\Auth\Repositories\ActiveParticipantRepository;

final class ExerciseMetaService
{
    private const SESSION_KEY = 'exercise_meta';

    public function __construct(
        private ExerciseRuntimeRepository $logExerciseRepo,
        private ActiveParticipantRepository $participantRepo
    ) {}

    public function loadIntoSession(int $accessId, int $teamNo, string $token): ExerciseMeta
    {
        $row = $this->logExerciseRepo->findLatestRow($accessId, $teamNo);
        if (!$row) {
            throw new RuntimeException("log_exercise not found for access_id={$accessId}, team_no={$teamNo}, outline_id={$outlineId}.");
        }

        $rp = $this->participantRepo->findRoleAndPosition($accessId, $token);

        // Fail-safe defaults (så du ikke brækker siden, hvis heartbeat/active row mangler et kort øjeblik)
        $roleId = $rp['role_id'] ?? 1;
        $positionCount = $rp['position_count'] ?? 1;

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
            createdAtIso:  (new \DateTimeImmutable((string)$row['created_at']))->format(DATE_ATOM),

            roleId:        (int)$roleId,
            positionCount: (int)$positionCount
        );

        $_SESSION[self::SESSION_KEY] = $meta->toArray();

        return $meta;
    }

    public function getCached(): ?array
    {
        $cached = $_SESSION[self::SESSION_KEY] ?? null;
        return is_array($cached) ? $cached : null;
    }

    /**
     * If client supplies last known log_exercise_id, you can refresh only when stale.
     * This is ideal for Ajax.
     */
    public function ensureFresh(int $accessId, int $teamNo, string $token, ?int $clientLogExerciseId): ExerciseMeta
    {
        $cached = $this->getCached();

        // If cache matches scope and version, reuse and only patch role/position (cheap).
        if (is_array($cached)
            && (int)($cached['access_id'] ?? 0) === $accessId
            && (int)($cached['team_no'] ?? 0) === $teamNo
            && (int)($cached['outline_id'] ?? 0) === $outlineId
            && $clientLogExerciseId !== null
            && (int)($cached['log_exercise_id'] ?? 0) === $clientLogExerciseId
        ) {
            // Patch role/position each time (token-specific, can change without exercise log changing)
            $rp = $this->participantRepo->findRoleAndPosition($accessId, $token);
            if ($rp) {
                $cached['role_id'] = (int)$rp['role_id'];
                $cached['position_count'] = (int)$rp['position_count'];
                $_SESSION[self::SESSION_KEY] = $cached;
            }

            return $this->fromArray($_SESSION[self::SESSION_KEY]);
        }

        // Otherwise reload from DB and overwrite session cache
        return $this->loadIntoSession($accessId, $teamNo, $outlineId, $token);
    }

    private function fromArray(array $a): ExerciseMeta
    {
        return new ExerciseMeta(
            accessId:      (int)$a['access_id'],
            teamNo:        (int)$a['team_no'],
            outlineId:     (int)$a['outline_id'],

            exerciseNo:    isset($a['exercise_no']) ? (int)$a['exercise_no'] : null,
            themeId:       isset($a['theme_id']) ? (int)$a['theme_id'] : null,
            scenarioId:    isset($a['scenario_id']) ? (int)$a['scenario_id'] : null,
            formatId:      isset($a['format_id']) ? (int)$a['format_id'] : null,
            stepNo:        isset($a['step_no']) ? (int)$a['step_no'] : null,
            currentState:  isset($a['current_state']) ? (int)$a['current_state'] : null,

            logExerciseId: (int)$a['log_exercise_id'],
            createdAtIso:  (string)$a['created_at'],

            roleId:        (int)$a['role_id'],
            positionCount: (int)$a['position_count']
        );
    }
}
