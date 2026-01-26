<?php
declare(strict_types=1);

namespace Modules\Training\Auth\DTO;

final class ExerciseMeta
{
    public function __construct(
        // Scope
        public int $accessId,
        public int $teamNo,
        public int $outlineId,

        // Latest exercise row fields
        public ?int $exerciseNo,
        public ?int $themeId,
        public ?int $scenarioId,
        public ?int $formatId,
        public ?int $stepNo,
        public ?int $currentState,

        // Versioning from append-only log
        public int $logExerciseId,
        public string $createdAtIso,

        // Participant-specific
        public int $roleId,
        public int $positionCount
    ) {}

    /** @return array<string,mixed> */
    public function toArray(): array
    {
        return [
            'access_id'      => $this->accessId,
            'team_no'        => $this->teamNo,
            'outline_id'     => $this->outlineId,

            'exercise_no'    => $this->exerciseNo,
            'theme_id'       => $this->themeId,
            'scenario_id'    => $this->scenarioId,
            'format_id'      => $this->formatId,
            'step_no'        => $this->stepNo,
            'current_state'  => $this->currentState,

            // versioning
            'log_exercise_id'=> $this->logExerciseId,
            'created_at'     => $this->createdAtIso,

            // participant
            'role_id'        => $this->roleId,
            'position_count' => $this->positionCount,
        ];
    }
}