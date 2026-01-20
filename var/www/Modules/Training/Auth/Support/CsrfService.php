<?php
declare(strict_types=1);

namespace Modules\Training\Auth\Support;

/**
 * CSRF tokens protect form submissions.
 * CSRF is NOT used as an auth/session token.
 */
final class CsrfService
{
    private const KEY = 'csrf_token';

    public function getOrCreate(): string
    {
        if (empty($_SESSION[self::KEY])) {
            $_SESSION[self::KEY] = bin2hex(random_bytes(32));
        }
        return (string)$_SESSION[self::KEY];
    }

    public function validate(string $token): bool
    {
        return isset($_SESSION[self::KEY]) && hash_equals((string)$_SESSION[self::KEY], $token);
    }

    public function rotate(): void
    {
        unset($_SESSION[self::KEY]);
    }
}