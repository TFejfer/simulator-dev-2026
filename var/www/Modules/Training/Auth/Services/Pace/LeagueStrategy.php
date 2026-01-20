<?php
declare(strict_types=1);

namespace Modules\Training\Auth\Services\Pace;

use Modules\Training\Auth\DTO\LoginRequest;
use Modules\Training\Auth\Repositories\LeagueRepository;

final class LeagueStrategy implements PaceStrategyInterface
{
    public function __construct(private LeagueRepository $leagueRepo) {}

    public function validate(LoginRequest $req, array $accessRow, bool $isUnblocked): ?string
    {
        $accessId = (int)($accessRow['access_id'] ?? 0);

        if (!$this->leagueRepo->isLeagueActive($accessId)) {
            return 'The league is inactive.';
        }

        return null;
    }

    public function afterSuccessfulLogin(int $accessId, string $sessionToken): void
    {
        // League might track active users differently. Implement later if needed.
    }

    public function getRedirectUrl(array $accessRow): string
    {
        // Adjust if your league landing route differs
        return '/league';
    }
}