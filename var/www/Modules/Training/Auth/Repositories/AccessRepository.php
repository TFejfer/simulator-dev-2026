<?php
declare(strict_types=1);

namespace Modules\Training\Auth\Repositories;

use PDO;

final class AccessRepository
{
    public function __construct(private PDO $db) {}

    /**
     * Returns access context row or null.
     * Note: access_id matches training_users.id (same identity).
     */
    public function getAccessContext(int $accessId): ?array
    {
        $stmt = $this->db->prepare("
            SELECT
				a.access_id,
				a.company_id,
				a.delivery_id,

				-- effective template (access -> company default)
				COALESCE(a.template_id, c.default_template_id, 0) AS template_id,
                a.is_frontline,

				a.first_login,
				a.activation_hours,
				ip.team_count,
				ip.planned_date
			FROM access_all a
			LEFT JOIN access_instructor_paced ip ON ip.access_id = a.access_id
			LEFT JOIN companies c ON c.id = a.company_id
			WHERE a.access_id = :id
			LIMIT 1
        ");
        $stmt->execute([':id' => $accessId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row !== false ? $row : null;
    }

    public function isUnblocked(int $accessId): bool
    {
        $stmt = $this->db->prepare("
            SELECT access_id
            FROM log_access_unblock
            WHERE access_id = :id
            LIMIT 1
        ");
        $stmt->execute([':id' => $accessId]);
        return (bool)$stmt->fetchColumn();
    }

    public function registerFirstLoginIfEmpty(int $accessId): void
    {
        $stmt = $this->db->prepare("
            UPDATE access_all
            SET first_login = COALESCE(first_login, NOW())
            WHERE access_id = :id
        ");
        $stmt->execute([':id' => $accessId]);
    }
}