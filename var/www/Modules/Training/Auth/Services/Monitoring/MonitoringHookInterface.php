<?php
declare(strict_types=1);

namespace Modules\Training\Auth\Services\Monitoring;

interface MonitoringHookInterface
{
    public function shouldRun(int $accessId): bool;

    /**
     * Monitoring side effects (must be idempotent).
     */
    public function run(int $accessId): void;
}