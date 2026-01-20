<?php
declare(strict_types=1);

namespace Modules\Training\Auth\Support;

/**
 * Session hardening and consistent session keys.
 */
final class SessionService
{
    public function ensureStarted(): void
    {
        if (session_status() !== PHP_SESSION_ACTIVE) {
            session_start();
        }
    }

    public function regenerateId(): void
    {
        session_regenerate_id(true);
    }

    public function setDeliveryMeta(int $userId, array $deliveryMeta, string $sessionToken): void
    {
        $_SESSION['user_id'] = $userId;
        $_SESSION['delivery_meta'] = $deliveryMeta;
        $_SESSION['session_token'] = $sessionToken;
    }

    public function clearExerciseMeta(): void
    {
        unset($_SESSION['exercise_meta']);
    }

    public function close(): void
    {
        session_write_close();
    }
}