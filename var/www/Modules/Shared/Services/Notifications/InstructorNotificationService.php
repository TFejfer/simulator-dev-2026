<?php
declare(strict_types=1);

namespace Modules\Shared\Services\Notifications;

use InvalidArgumentException;
use Modules\Shared\Repositories\NotificationRepository;

/**
 * InstructorNotificationService
 *
 * Orchestrates insertion of instructor notification signals.
 * Keeps endpoints thin and prevents duplicated validation rules.
 */
final class InstructorNotificationService
{
	public function __construct(private NotificationRepository $repo) {}

	public function callInstructor(array $deliveryMeta, int $notificationId): void
	{
		$accessId = (int)($deliveryMeta['access_id'] ?? 0);
		$teamNo = (int)($deliveryMeta['team_no'] ?? 0);

		if ($accessId <= 0 || $teamNo <= 0) {
			throw new InvalidArgumentException('Invalid delivery_meta (access_id/team_no).');
		}
		if ($notificationId <= 0) {
			throw new InvalidArgumentException('Invalid notification_id.');
		}

		$this->repo->insertInstructorNotification($accessId, $teamNo, $notificationId);
	}
}