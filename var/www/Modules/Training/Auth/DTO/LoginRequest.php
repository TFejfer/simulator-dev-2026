<?php
declare(strict_types=1);

namespace Modules\Training\Auth\DTO;

final class LoginRequest
{
    public function __construct(
        public readonly string $username,
        public readonly string $password,
        public readonly string $csrfToken,
        public readonly string $ipAddress,
        public readonly string $userAgent
    ) {}
}