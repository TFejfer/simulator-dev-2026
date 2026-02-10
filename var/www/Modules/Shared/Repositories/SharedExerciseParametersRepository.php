<?php
declare(strict_types=1);

namespace Modules\Shared\Repositories;

use PDO;
use Throwable;

/**
 * Reads static exercise parameters from SHARED_CONTENT.exercise_parameters.
 * Table structure: meta_key, meta_value (varchar).
 */
final class SharedExerciseParametersRepository
{
    public function __construct(private PDO $dbSharedContent) {}

    /**
     * @return array<string,string> map meta_key => meta_value
     */
    public function readAll(): array
    {
        try {
            $stmt = $this->dbSharedContent->prepare("
                SELECT
                    meta_key, meta_value
                FROM
                    exercise_parameters
            ");
            $stmt->execute();
            $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

            $out = [];
            foreach ($rows as $r) {
                $k = isset($r['meta_key']) ? (string)$r['meta_key'] : '';
                if ($k === '') continue;
                $out[$k] = (string)($r['meta_value'] ?? '');
            }
            return $out;
        } catch (Throwable $e) {
            return [];
        }   
    }

    /**
     * @return string|null
     */
    public function readOne(string $metaKey): ?string
    {
        try {
            $stmt = $this->dbSharedContent->prepare("
                SELECT
                    meta_value
                FROM
                    exercise_parameters
                WHERE
                    meta_key = :meta_key
                LIMIT 1
            ");
            $stmt->execute([':meta_key' => $metaKey]);
            $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
            return is_array($row) ? $row['meta_value'] : null;
        } catch (Throwable $e) {
            return null;
        }
    }
}