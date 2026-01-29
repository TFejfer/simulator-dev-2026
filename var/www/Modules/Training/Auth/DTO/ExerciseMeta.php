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
        public int $positionCount,

        // Causes and causality (optional defaults for robustness)
        public ?int $numberOfCauses = null,
        public ?bool $hasCausality = null
    ) {}

    /** @return array<string,mixed> */
    public function toArray(): array
    {
        return [
            'access_id'        => $this->accessId,
            'team_no'          => $this->teamNo,
            'outline_id'       => $this->outlineId,

            'exercise_no'      => $this->exerciseNo,
            'theme_id'         => $this->themeId,
            'scenario_id'      => $this->scenarioId,
            'format_id'        => $this->formatId,
            'step_no'          => $this->stepNo,
            'current_state'    => $this->currentState,

            // versioning
            'log_exercise_id'  => $this->logExerciseId,
            'created_at'       => $this->createdAtIso,

            // participant
            'role_id'          => $this->roleId,
            'position_count'   => $this->positionCount,

            // causes and causality
            'number_of_causes' => $this->numberOfCauses,
            'has_causality'    => $this->hasCausality,
        ];
    }

    /**
     * Build from cached array (e.g. session).
     *
     * This keeps the mapping centralized and prevents drift between services.
     *
     * @param array<string,mixed> $a
     */
    public static function fromArray(array $a): self
    {
        return new self(
            accessId:        (int)($a['access_id'] ?? 0),
            teamNo:          (int)($a['team_no'] ?? 0),
            outlineId:       (int)($a['outline_id'] ?? 0),

            exerciseNo:      isset($a['exercise_no']) ? (int)$a['exercise_no'] : null,
            themeId:         isset($a['theme_id']) ? (int)$a['theme_id'] : null,
            scenarioId:      isset($a['scenario_id']) ? (int)$a['scenario_id'] : null,
            formatId:        isset($a['format_id']) ? (int)$a['format_id'] : null,
            stepNo:          isset($a['step_no']) ? (int)$a['step_no'] : null,
            currentState:    isset($a['current_state']) ? (int)$a['current_state'] : null,

            logExerciseId:   (int)($a['log_exercise_id'] ?? 0),
            createdAtIso:    (string)($a['created_at'] ?? ''),

            roleId:          (int)($a['role_id'] ?? 1),
            positionCount:   (int)($a['position_count'] ?? 1),

            numberOfCauses:  array_key_exists('number_of_causes', $a) ? (is_null($a['number_of_causes']) ? null : (int)$a['number_of_causes']) : null,
            hasCausality:    array_key_exists('has_causality', $a) ? (is_null($a['has_causality']) ? null : (bool)$a['has_causality']) : null
        );
    }

    /**
     * Non-fatal consistency check. Returns a warning string if inconsistent, else null.
     * Use this for logging, not for blocking requests.
     */
    public function consistencyWarning(): ?string
    {
        if ($this->hasCausality === true && ($this->numberOfCauses === null || $this->numberOfCauses <= 1)) {
            return sprintf(
                'Inconsistent causality meta: theme_id=%s scenario_id=%s has_causality=1 but number_of_causes=%s',
                (string)($this->themeId ?? 'null'),
                (string)($this->scenarioId ?? 'null'),
                (string)($this->numberOfCauses ?? 'null')
            );
        }
        return null;
    }
}