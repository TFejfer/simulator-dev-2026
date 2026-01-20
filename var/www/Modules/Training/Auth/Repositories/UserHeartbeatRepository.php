<?php
declare(strict_types=1);

namespace Modules\Training\Auth\Repositories;

use PDO;

final class UserHeartbeatRepository
{
    public function __construct(private PDO $db) {}

    /**
     * Heartbeat for a specific access_id + token (session).
     *
     * - If row exists -> updates last_seen_at
     * - If not -> inserts with created_at + last_seen_at
     */
    public function touch(int $accessId, string $token): void
    {
        $stmt = $this->db->prepare("
            INSERT INTO log_user_heartbeat (access_id, token, created_at, last_seen_at)
            VALUES (:aid, :tok, NOW(), NOW())
            ON DUPLICATE KEY UPDATE last_seen_at = NOW()
        ");
        $stmt->execute([
            ':aid' => $accessId,
            ':tok' => $token,
        ]);
    }
	
	public function delete(int $accessId, string $token): void
	{
		$stmt = $this->db->prepare("
			DELETE FROM log_user_heartbeat
			WHERE access_id = :aid AND token = :tok
		");
		$stmt->execute([':aid' => $accessId, ':tok' => $token]);
	}
}