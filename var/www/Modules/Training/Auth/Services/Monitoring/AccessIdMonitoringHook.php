<?php
declare(strict_types=1);

namespace Modules\Training\Auth\Services\Monitoring;

use PDO;

/**
 * Monitoring hook based on configured access IDs.
 * Replace later with an account_type flag in DB.
 */
final class AccessIdMonitoringHook implements MonitoringHookInterface
{
    /**
     * @param int[] $monitorAccessIds
     */
    public function __construct(
        private PDO $db,
        private array $monitorAccessIds
    ) {}

    public function shouldRun(int $accessId): bool
    {
        return in_array($accessId, $this->monitorAccessIds, true);
    }

    public function run(int $accessId): void
    {
        // Keep idempotent.
        // TODO: Move your existing monitoring side-effects in here
        // (purge, approve, unlock, etc.) once you paste the legacy functions.
    }
}
