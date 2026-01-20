<?php
declare(strict_types=1);

namespace Modules\Training\Auth\Repositories;

use PDO;
use Throwable;

final class OutlineRepository
{
    public function __construct(
        private PDO $dbSharedContent
    ) {}

    /**
     * Returns all outline rows for a given delivery_id.
     *
     * Each row is returned as an associative array with all columns.
     *
     * @return array<int, array<string, mixed>>
     */
    public function findAllByDeliveryId(string $deliveryId): array
    {
        $deliveryId = trim($deliveryId);
        if ($deliveryId === '') {
            return [];
        }

        try {
            $stmt = $this->dbSharedContent->prepare("
                SELECT *
                FROM outlines
                WHERE delivery_id = :delivery_id
                ORDER BY block_no, sequence_no
            ");
            $stmt->execute([':delivery_id' => $deliveryId]);

            return $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (Throwable) {
            // Fail-safe: outline data must never block login
            return [];
        }
    }

    /**
     * Returns distinct skill ids configured for a delivery in outlines.
     *
     * @return int[]
     */
    public function listSkillIdsByDeliveryId(string $deliveryId): array
    {
        $deliveryId = trim($deliveryId);
        if ($deliveryId === '') {
            return [];
        }

        try {
            $stmt = $this->dbSharedContent->prepare("
                SELECT DISTINCT skill_id
                FROM outlines
                WHERE delivery_id = :delivery_id
                ORDER BY skill_id
            ");
            $stmt->execute([':delivery_id' => $deliveryId]);

            $skills = $stmt->fetchAll(PDO::FETCH_COLUMN, 0);
            return array_values(array_map('intval', $skills));
        } catch (Throwable) {
            return [];
        }
    }
}