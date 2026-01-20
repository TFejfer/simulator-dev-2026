<?php
declare(strict_types=1);

namespace Modules\Training\Auth\Repositories;

use PDO;

final class LoginAttemptRepository
{
    public function __construct(private PDO $db) {}

    public function countRecentByIp(string $ip, int $minutes): int
    {
        // Use COUNT(*) instead of rowCount() for portability.
        $stmt = $this->db->prepare("
            SELECT COUNT(*)
            FROM training_login_attempts
            WHERE ip_address = :ip
              AND timestamp > (NOW() - INTERVAL :m MINUTE)
        ");
        $stmt->bindValue(':ip', $ip, PDO::PARAM_STR);
        $stmt->bindValue(':m', $minutes, PDO::PARAM_INT);
        $stmt->execute();

        return (int)$stmt->fetchColumn();
    }

    public function insert(string $ip): void
    {
        $stmt = $this->db->prepare("
            INSERT INTO training_login_attempts (ip_address, timestamp)
            VALUES (:ip, NOW())
        ");
        $stmt->execute([':ip' => $ip]);
    }
}