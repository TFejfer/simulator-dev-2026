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
        public ?int $skillId,

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
        public ?bool $hasMultipleCauses = null,
        public ?bool $hasCausality = null,

        // Timer fields (optional)
        public ?int $exerciseStartUnix = null,
        public ?int $deadlineUnix = null,
        public ?int $secondsLeft = null,
        public ?int $timerStartUnix = null,
        public ?int $timerEndUnix = null,
        public ?string $timerPhase = null,
        public ?string $timerSource = null,
    ) {}

    /** @return array<string,mixed> */
    public function toArray(): array
    {
        return [
            'access_id'        => $this->accessId,
            'team_no'          => $this->teamNo,
            'outline_id'       => $this->outlineId,
            'skill_id'         => $this->skillId,

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
            'has_multiple_causes' => $this->hasMultipleCauses,
            'has_causality'       => $this->hasCausality,

            // timers
            'exercise_start_unix' => $this->exerciseStartUnix,
            'deadline_unix'       => $this->deadlineUnix,
            'seconds_left'        => $this->secondsLeft,
            'timer_start_unix'    => $this->timerStartUnix,
            'timer_end_unix'      => $this->timerEndUnix,
            'timer_phase'         => $this->timerPhase,
            'timer_source'        => $this->timerSource,
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
            skillId:         array_key_exists('skill_id', $a) ? (is_null($a['skill_id']) ? null : (int)$a['skill_id']) : null,

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

            hasMultipleCauses: self::readHasMultipleCauses($a),
            hasCausality:      array_key_exists('has_causality', $a) ? (is_null($a['has_causality']) ? null : (bool)$a['has_causality']) : null,

            exerciseStartUnix: array_key_exists('exercise_start_unix', $a) ? (is_null($a['exercise_start_unix']) ? null : (int)$a['exercise_start_unix']) : null,
            deadlineUnix:      array_key_exists('deadline_unix', $a) ? (is_null($a['deadline_unix']) ? null : (int)$a['deadline_unix']) : null,
            secondsLeft:       array_key_exists('seconds_left', $a) ? (is_null($a['seconds_left']) ? null : (int)$a['seconds_left']) : null,
            timerStartUnix:    array_key_exists('timer_start_unix', $a) ? (is_null($a['timer_start_unix']) ? null : (int)$a['timer_start_unix']) : null,
            timerEndUnix:      array_key_exists('timer_end_unix', $a) ? (is_null($a['timer_end_unix']) ? null : (int)$a['timer_end_unix']) : null,
            timerPhase:        array_key_exists('timer_phase', $a) ? (is_null($a['timer_phase']) ? null : (string)$a['timer_phase']) : null,
            timerSource:       array_key_exists('timer_source', $a) ? (is_null($a['timer_source']) ? null : (string)$a['timer_source']) : null,
        );
    }

    /**
     * Non-fatal consistency check. Returns a warning string if inconsistent, else null.
     * Use this for logging, not for blocking requests.
     */
    public function consistencyWarning(): ?string
    {
        if ($this->hasCausality === true && $this->hasMultipleCauses !== true) {
            return sprintf(
                'Inconsistent causality meta: theme_id=%s scenario_id=%s has_causality=1 but has_multiple_causes=%s',
                (string)($this->themeId ?? 'null'),
                (string)($this->scenarioId ?? 'null'),
                (string)($this->hasMultipleCauses ?? 'null')
            );
        }
        return null;
    }

    /** @param array<string,mixed> $a */
    private static function readHasMultipleCauses(array $a): ?bool
    {
        if (array_key_exists('has_multiple_causes', $a)) {
            return is_null($a['has_multiple_causes']) ? null : (bool)$a['has_multiple_causes'];
        }

        return null;
    }
}