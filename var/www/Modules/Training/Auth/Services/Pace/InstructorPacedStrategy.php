<?php
declare(strict_types=1);

namespace Modules\Training\Auth\Services\Pace;

use Modules\Training\Auth\DTO\LoginRequest;
use Modules\Training\Auth\Repositories\ActiveParticipantRepository;

/**
 * Instructor-paced training.
 * Uses log_active_participants for "online" state.
 */
final class InstructorPacedStrategy implements PaceStrategyInterface
{
    public function __construct(private ActiveParticipantRepository $activeRepo) {}

    public function validate(LoginRequest $req, array $accessRow, bool $isUnblocked): ?string
    {
        // Instructor-paced is already gated by "unblocked" in ParticipantLoginService.
        // Keep this here for future strategy-specific rules.
        return null;
    }

    public function afterSuccessfulLogin(int $accessId, string $sessionToken): void
    {
        $this->activeRepo->upsert($accessId, $sessionToken);
    }

    public function getRedirectUrl(array $accessRow): string
    {
        // Adjust if your landing page differs
        return '/';
    }
}