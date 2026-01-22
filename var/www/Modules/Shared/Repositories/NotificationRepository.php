<?php
declare(strict_types=1);

namespace Modules\Shared\Repositories;

use PDO;
use PDOException;

final class NotificationRepository
{
    public function __construct(private PDO $dbRuntime)
    {
        // Force exceptions on DB errors (safe + consistent)
        $this->dbRuntime->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $this->dbRuntime->setAttribute(PDO::ATTR_EMULATE_PREPARES, false);
    }

    public function insertInstructorNotification(int $accessId, int $teamNo, int $notificationId): void
    {
        try {
            $stmt = $this->dbRuntime->prepare("
                INSERT INTO log_notifications (access_id, team_no, notification_id)
                VALUES (:access_id, :team_no, :notification_id)
            ");

            $stmt->execute([
                ':access_id' => $accessId,
                ':team_no' => $teamNo,
                ':notification_id' => $notificationId,
            ]);
        } catch (PDOException $e) {
            // Log the real DB error server-side (do NOT expose to client)
            error_log(sprintf(
                'NotificationRepository::insertInstructorNotification failed. access_id=%d team_no=%d notification_id=%d. Error=%s',
                $accessId,
                $teamNo,
                $notificationId,
                $e->getMessage()
            ));

            // Bubble up so the endpoint returns 500
            throw $e;
        }
    }
}