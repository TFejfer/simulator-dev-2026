<?php
declare(strict_types=1);

namespace Modules\Training\Auth\Services;

use Modules\Training\Auth\Repositories\ActiveParticipantRepository;
use Modules\Training\Auth\DTO\LoginRequest;
use Modules\Training\Auth\DTO\LoginResult;
use Modules\Training\Auth\Repositories\TrainingUserRepository;
use Modules\Training\Auth\Repositories\AccessRepository;
use Modules\Training\Auth\Repositories\LoginAttemptRepository;
use Modules\Training\Auth\Repositories\UserHeartbeatRepository;
use Modules\Training\Auth\Services\Pace\PaceStrategyFactory;
use Modules\Training\Auth\Services\Monitoring\MonitoringHookInterface;
use Modules\Training\Auth\Support\CsrfService;
use Modules\Training\Auth\Support\SessionService;

/**
 * Orchestrates participant login.
 * All business rules live in services/policies, not in endpoints.
 */
final class ParticipantLoginService
{
    public function __construct(
        private TrainingUserRepository $users,
        private AccessRepository $access,
        private LoginAttemptRepository $attempts,
		private UserHeartbeatRepository $heartbeat,
        private LoginPolicyService $policy,
        private DeliveryMetaBuilder $ctxBuilder,
        private PaceStrategyFactory $paceFactory,
        private MonitoringHookInterface $monitorHook,
        private CsrfService $csrf,
        private SessionService $session,
        private ActiveParticipantRepository $activeParticipants
    ) {}

    public function login(LoginRequest $req): LoginResult
    {
        $this->session->ensureStarted();

        if (!$this->csrf->validate($req->csrfToken)) {
            return new LoginResult(false, ['Invalid CSRF token']);
        }

        // Rate limit early (cheap DB query)
        if ($this->attempts->countRecentByIp($req->ipAddress, 15) >= 50) {
            return new LoginResult(false, ['Too many login attempts. Please try again later.']);
        }

        $user = $this->users->findByUsername($req->username);
        if (!$user) {
            $this->attempts->insert($req->ipAddress);
            return new LoginResult(false, ['Invalid username or password']);
        }

        $accessId = (int)$user['id'];

        $accessRow = $this->access->getAccessContext($accessId);
        if (!$accessRow) {
            $this->attempts->insert($req->ipAddress);
            return new LoginResult(false, ['Login does not exist.']);
        }

        $deliveryId = (string)($accessRow['delivery_id'] ?? '');
        $paceId = $this->ctxBuilder->resolvePaceIdFromDeliveryId($deliveryId);

        $isUnblocked = $this->access->isUnblocked($accessId);

        // Instructor-paced requires unblock (league can override in strategy if desired)
        if ($paceId === 1) {
            if ($err = $this->policy->validateUnblocked($isUnblocked)) {
                return new LoginResult(false, [$err]);
            }
        }

        if ($err = $this->policy->validateActiveWindow(
            $accessRow['first_login'] ?? null,
            (int)($accessRow['activation_hours'] ?? 336)
        )) {
            return new LoginResult(false, [$err]);
        }

        $strategy = $this->paceFactory->forPaceId($paceId);

        if ($err = $strategy->validate($req, $accessRow, $isUnblocked)) {
            return new LoginResult(false, [$err]);
        }

        if (!password_verify($req->password, (string)$user['password'])) {
            $this->attempts->insert($req->ipAddress);
            return new LoginResult(false, ['Invalid username or password']);
        }

        // Success
        $this->session->regenerateId();
        $this->csrf->rotate();

        $sessionToken = bin2hex(random_bytes(32));

        // Reset team selection at login time (forces setup to run)
        $this->activeParticipants->resetTeamOnLogin($accessId, $sessionToken);
		
		// Heartbeat #1 (immediately marks the client as online)
		$this->heartbeat->touch($accessId, $sessionToken);

        // Start activation window (if not started)
        $this->access->registerFirstLoginIfEmpty($accessId);

        // Optional: record user last login in training_users
        $this->users->updateLastLogin($accessId);

        $deliveryMeta = $this->ctxBuilder->build($accessRow, $paceId, $sessionToken);

        $this->session->setDeliveryMeta($accessId, $deliveryMeta, $sessionToken);
        $this->session->clearExerciseMeta();

        $strategy->afterSuccessfulLogin($accessId, $sessionToken);

        if ($this->monitorHook->shouldRun($accessId)) {
            $this->monitorHook->run($accessId);
        }

        $this->session->close();

        return new LoginResult(true, [], $strategy->getRedirectUrl($accessRow));
    }
}