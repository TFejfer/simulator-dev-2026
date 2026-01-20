<?php
declare(strict_types=1);

namespace Modules\Training\Auth\Services\Pace;

use Modules\Training\Auth\DTO\LoginRequest;

interface PaceStrategyInterface
{
    /**
     * Return null if OK, otherwise an error message.
     */
    public function validate(LoginRequest $req, array $accessRow, bool $isUnblocked): ?string;

    /**
     * Post-login actions.
     */
    public function afterSuccessfulLogin(int $accessId, string $sessionToken): void;

    /**
     * Where to send the user after login.
     */
    public function getRedirectUrl(array $accessRow): string;
}