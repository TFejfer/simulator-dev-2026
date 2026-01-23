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

    /**
     * Returns outline row by outline ID and delivery ID.
     */
    public function findOutlineRowById(int $outlineId, int $deliveryId): ?array
    {
        if ($outlineId <= 0 || $deliveryId <= 0) return null;

        try {
            $stmt = $this->dbSharedContent->prepare("
                SELECT
                    outline_id, delivery_id, item_type, exercise_no,
                    skill_id, swap_id, theme_id, scenario_id, format_id
                FROM outlines
                WHERE outline_id = :outline_id
                AND delivery_id = :delivery_id
                LIMIT 1
            ");
            $stmt->execute([
                ':outline_id' => $outlineId,
                ':delivery_id' => $deliveryId,
            ]);

            $row = $stmt->fetch(\PDO::FETCH_ASSOC);
            return is_array($row) ? $row : null;

        } catch (Throwable) {
            return null;
        }
    }
}