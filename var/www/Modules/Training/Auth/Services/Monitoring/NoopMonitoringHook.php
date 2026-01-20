<?php
declare(strict_types=1);

namespace Modules\Training\Auth\Services\Monitoring;

final class NoopMonitoringHook implements MonitoringHookInterface
{
    public function shouldRun(int $accessId): bool
    {
        return false;
    }

    public function run(int $accessId): void
    {
        // intentionally empty
    }
}