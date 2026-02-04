<?php
declare(strict_types=1);

namespace Modules\Problem\Content\Repositories;

use PDO;

/**
 * Reads key/value exercise parameters from PROBLEM_CONTENT.problem_exercise_parameters.
 */
final class ProblemExerciseParametersRepository
{
    public function __construct(private PDO $dbContent) {}

    /**
     * @return string|null Meta value for the key (raw string) or null when missing.
     */
    public function getValue(string $key): ?string
    {
        if ($key === '') return null;

        $stmt = $this->dbContent->prepare("
            SELECT meta_value
            FROM problem_exercise_parameters
            WHERE meta_key = :k
            LIMIT 1
        ");

        $stmt->execute([':k' => $key]);
        $val = $stmt->fetchColumn();

        return ($val === false) ? null : (string)$val;
    }
}
