<?php
declare(strict_types=1);

namespace Modules\Training\Auth\Services;

use Modules\Training\Auth\Repositories\UserHeartbeatRepository;
use Modules\Training\Auth\Support\SessionService;

/**
 * Handles logout as a domain action:
 * - Best-effort cleanup of DB session state
 * - Clears PHP session
 *
 * Endpoint decides redirect.
 */
final class ParticipantLogoutService
{
    public function __construct(
        private UserHeartbeatRepository $heartbeatRepo,
        private SessionService $sessionService
    ) {}

    public function logout(int $accessId, string $token): void
    {
        // Best-effort cleanup: logout must never fail because DB is down
        try {
            if ($accessId > 0 && $token !== '') {
                $this->heartbeatRepo->delete($accessId, $token);
            }
        } catch (\Throwable $e) {
            // ignore
        }

        // Clear session
        $this->clearSession();
    }

    private function clearSession(): void
    {
        $_SESSION = [];

        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000,
                $p['path'] ?? '/',
                $p['domain'] ?? '',
                (bool)($p['secure'] ?? true),
                (bool)($p['httponly'] ?? true)
            );
        }

        session_destroy();
        $this->sessionService->close();
    }
}