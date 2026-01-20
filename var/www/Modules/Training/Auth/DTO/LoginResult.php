<?php
declare(strict_types=1);

namespace Modules\Training\Auth\DTO;

/**
 * Result returned to the controller/entrypoint.
 *
 * @param string[] $errors
 */
final class LoginResult
{
    public function __construct(
        public readonly bool $ok,
        public readonly array $errors = [],
        public readonly ?string $redirectUrl = null
    ) {}
}