<?php
declare(strict_types=1);

namespace Modules\Shared\Support;

/**
 * Databases
 *
 * Central list of logical database names used in /etc/simulator/secrets.php.
 * Using constants avoids typos and makes refactoring safe.
 */
final class Databases
{
    public const RUNTIME = 'runtime';
    public const SHARED_CONTENT = 'shared_content';
    public const PROBLEM_CONTENT = 'problem_content';
    public const RISK_CONTENT = 'risk_content';
    public const RCA_CONTENT = 'rca_content';

    private function __construct() {}
}
