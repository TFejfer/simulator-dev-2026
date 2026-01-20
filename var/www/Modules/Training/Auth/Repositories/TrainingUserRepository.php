<?php
declare(strict_types=1);

namespace Modules\Training\Auth\Repositories;

use PDO;

final class TrainingUserRepository
{
    public function __construct(private PDO $db) {}

    /**
     * Returns: ['id'=>int,'username'=>string,'password'=>string] or null.
     */
    public function findByUsername(string $username): ?array
    {
        $stmt = $this->db->prepare("
            SELECT id, username, password
            FROM training_users
            WHERE username = :u
            LIMIT 1
        ");
        $stmt->execute([':u' => $username]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);

        return $row !== false ? $row : null;
    }

    public function updateLastLogin(int $id): void
    {
        $stmt = $this->db->prepare("
            UPDATE training_users
            SET last_login = NOW()
            WHERE id = :id
        ");
        $stmt->execute([':id' => $id]);
    }
}