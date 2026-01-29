<?php
declare(strict_types=1);

namespace Modules\Problem\Services\Forms;

final class FormsGuard
{
    /**
     * Minimal validation. Extend as needed.
     */
    public static function assertScope(
        int $accessId,
        int $teamNo,
        int $outlineId,
        int $exerciseNo,
        string $actorToken
    ): void {
        if ($accessId <= 0) throw new \InvalidArgumentException('Invalid access_id');
        if ($teamNo <= 0) throw new \InvalidArgumentException('Invalid team_no');
        if ($outlineId <= 0) throw new \InvalidArgumentException('Invalid outline_id');
        if ($exerciseNo <= 0) throw new \InvalidArgumentException('Invalid exercise_no');
        if ($actorToken === '') throw new \InvalidArgumentException('Missing actor_token');
    }
}