<?php
declare(strict_types=1);

namespace Modules\Problem\Repositories\Metrics;

use PDO;

final class ProblemMetricsRepository
{
    public function __construct(private PDO $dbRuntime) {}

    public function acquireLock(string $key, int $timeoutSeconds = 2): bool
    {
        $timeoutSeconds = max(0, min(10, $timeoutSeconds));
        $stmt = $this->dbRuntime->prepare('SELECT GET_LOCK(:key, :timeout)');
        $stmt->execute([
            ':key' => $key,
            ':timeout' => $timeoutSeconds,
        ]);
        return (int)$stmt->fetchColumn() === 1;
    }

    public function releaseLock(string $key): void
    {
        $stmt = $this->dbRuntime->prepare('SELECT RELEASE_LOCK(:key)');
        $stmt->execute([':key' => $key]);
    }

    public function hasMetrics(int $accessId, int $teamNo, int $outlineId): bool
    {
        if ($accessId <= 0 || $teamNo <= 0 || $outlineId <= 0) return false;

        $stmt = $this->dbRuntime->prepare("
            SELECT 1
            FROM problem_metrics
            WHERE access_id = :access_id
              AND team_no = :team_no
              AND outline_id = :outline_id
            LIMIT 1
        ");
        $stmt->execute([
            ':access_id' => $accessId,
            ':team_no' => $teamNo,
            ':outline_id' => $outlineId,
        ]);

        return (bool)$stmt->fetchColumn();
    }

    /**
     * @param array<int, array{id:int, value:int, data:mixed}> $metrics
     */
    public function insertMany(int $accessId, int $teamNo, int $outlineId, array $metrics): void
    {
        if ($accessId <= 0 || $teamNo <= 0 || $outlineId <= 0) return;
        if (!$metrics) return;

        $stmt = $this->dbRuntime->prepare("
            INSERT INTO problem_metrics
                (access_id, team_no, outline_id, metric_id, value_int, data)
            VALUES
                (:access_id, :team_no, :outline_id, :metric_id, :value_int, :data)
        ");

        foreach ($metrics as $m) {
            $data = $m['data'] ?? null;
            $payload = null;
            if ($data !== null) {
                $payload = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            }

            $stmt->execute([
                ':access_id' => $accessId,
                ':team_no' => $teamNo,
                ':outline_id' => $outlineId,
                ':metric_id' => (int)($m['id'] ?? 0),
                ':value_int' => (int)($m['value'] ?? 0),
                ':data' => $payload,
            ]);
        }
    }

    /**
     * Read persisted metrics for a completed exercise (by outline).
     *
     * @return array<int, array{id:int, value:int, data:mixed, note:string}>
     */
    public function readByOutline(int $accessId, int $teamNo, int $outlineId): array
    {
        if ($accessId <= 0 || $teamNo <= 0 || $outlineId <= 0) return [];

        $stmt = $this->dbRuntime->prepare("
            SELECT metric_id, value_int, data
            FROM problem_metrics
            WHERE access_id = :access_id
              AND team_no = :team_no
              AND outline_id = :outline_id
            ORDER BY metric_id ASC
        ");
        $stmt->execute([
            ':access_id' => $accessId,
            ':team_no' => $teamNo,
            ':outline_id' => $outlineId,
        ]);

        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $out = [];

        foreach ($rows as $row) {
            $data = null;
            $raw = $row['data'] ?? null;
            if (is_string($raw) && $raw !== '') {
                $decoded = json_decode($raw, true);
                $data = is_array($decoded) ? $decoded : null;
            }

            $out[] = [
                'id' => (int)($row['metric_id'] ?? 0),
                'value' => (int)($row['value_int'] ?? 0),
                'data' => $data,
                'note' => '',
            ];
        }

        return $out;
    }
}
