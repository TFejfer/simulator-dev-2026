<?php
declare(strict_types=1);

namespace Modules\Training\Auth\Services\Pace;

final class PaceStrategyFactory
{
    public function __construct(
        private InstructorPacedStrategy $instructorPaced,
        private LeagueStrategy $league
    ) {}

    public function forPaceId(int $paceId): PaceStrategyInterface
    {
        return ($paceId === 2) ? $this->league : $this->instructorPaced;
    }
}