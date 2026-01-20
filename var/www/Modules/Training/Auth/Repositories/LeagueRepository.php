<?php
declare(strict_types=1);

namespace Modules\Training\Auth\Repositories;

use PDO;

/**
 * League uses other tables/meta.
 * Implement the real query when you paste the league tables.
 */
final class LeagueRepository
{
    public function __construct(private PDO $db) {}

    public function isLeagueActive(int $accessId): bool
    {
        // TODO: replace with real league status logic/table.
        // For now: assume active.
        return true;
    }
}