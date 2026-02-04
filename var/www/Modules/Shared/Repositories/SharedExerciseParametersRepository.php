<?php
declare(strict_types=1);

namespace Modules\Shared\Repositories;

use PDO;

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
        $stmt = $this->dbSharedContent->prepare("SELECT meta_key, meta_value FROM exercise_parameters");
        $stmt->execute();
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

        $out = [];
        foreach ($rows as $r) {
            $k = isset($r['meta_key']) ? (string)$r['meta_key'] : '';
            if ($k === '') continue;
            $out[$k] = (string)($r['meta_value'] ?? '');
        }
        return $out;
    }
}
