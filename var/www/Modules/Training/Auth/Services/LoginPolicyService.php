<?php
declare(strict_types=1);

namespace Modules\Training\Auth\Services;

/**
 * Business rules for login eligibility.
 */
final class LoginPolicyService
{
    /**
     * "Blocked unless unblocked"
     */
    public function validateUnblocked(bool $isUnblocked): ?string
    {
        return $isUnblocked ? null : 'The training is blocked.';
    }

    /**
     * Active window based on first_login + activation_hours (default 336 = 14 days).
     */
    public function validateActiveWindow(?string $firstLogin, int $activationHours): ?string
    {
        if ($firstLogin === null) {
            // Not started yet - OK (if unblocked).
            return null;
        }

        $first = strtotime($firstLogin);
        if ($first === false) {
            return 'Invalid delivery timing data.';
        }

        $expires = $first + ($activationHours * 3600);
        return time() <= $expires ? null : 'Login has expired.';
    }

    /**
     * Optional rule: instructor cannot unlock after X days from planned_date.
     * If you want it enforced at login-time too, enable it.
     */
    public function validateUnlockDeadline(?string $plannedDate, int $days = 14): ?string
    {
        if ($plannedDate === null || $plannedDate === '') {
            return null; // no planned date => do not enforce here
        }

        $ts = strtotime($plannedDate . ' 00:00:00');
        if ($ts === false) {
            return 'Invalid planned date.';
        }

        $deadline = $ts + ($days * 86400);

        return time() <= $deadline
            ? null
            : 'Delivery can no longer be opened (deadline passed).';
    }
}