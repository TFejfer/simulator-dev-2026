<?php
declare(strict_types=1);

namespace Engine\Publish;

use RuntimeException;

/**
 * PublishedPayloadService
 *
 * Implements "read or build" logic with a TTL lock to avoid thundering herd.
 * This service does NOT know what the payload contains, only how to publish it safely.
 */
final class PublishedPayloadService
{
    public function __construct(private PublishedPayloadRepository $repo) {}

    /**
     * @param callable $builder fn(): array|string
     *        - If array: will be json_encode'd
     *        - If string: assumed to be valid JSON (validated)
     * @param callable|null $sourceSignatureBuilder fn(): ?string
     *        Optional: provide a stable signature of source inputs to skip rebuilds.
     * @return array{json:string, etag:string}
     */
    public function getOrBuild(
        string $payloadType,
        string $keyCode,
        int $schemaVersion,
        callable $builder,
        ?string $builtBy = null,
        int $lockTtlSeconds = 15,
        int $maxWaitMs = 1200,
        int $sleepStepMs = 60,
        ?callable $sourceSignatureBuilder = null
    ): array {
        // 1) Fast path: return existing published payload
        $row = $this->repo->read($payloadType, $keyCode, $schemaVersion);
        if ($row && $this->isReal($row)) {
            return ['json' => $row['json_payload'], 'etag' => $row['etag']];
        }

        // 2) Ensure placeholder row exists
        $this->repo->ensureRowExists($payloadType, $keyCode, $schemaVersion);

        // 3) Try acquire lock with bounded wait
        $token = $this->uuidV4();
        $deadline = (int)(microtime(true) * 1000) + $maxWaitMs;

        while (true) {
            $row = $this->repo->read($payloadType, $keyCode, $schemaVersion);
            if ($row && $this->isReal($row)) {
                return ['json' => $row['json_payload'], 'etag' => $row['etag']];
            }

            if ($this->repo->tryAcquireLock($payloadType, $keyCode, $schemaVersion, $token, $lockTtlSeconds)) {
                break;
            }

            if ((int)(microtime(true) * 1000) >= $deadline) {
                $row = $this->repo->read($payloadType, $keyCode, $schemaVersion);
                if ($row && $this->isReal($row)) {
                    return ['json' => $row['json_payload'], 'etag' => $row['etag']];
                }
                throw new RuntimeException("Could not acquire build lock for {$payloadType} {$keyCode} v{$schemaVersion}");
            }

            usleep($sleepStepMs * 1000);
        }

        // 4) Build + upsert, always release lock
        $t0 = microtime(true);
        try {
            $sourceSig = null;

            if ($sourceSignatureBuilder) {
                $sourceSig = $sourceSignatureBuilder();

                // If same signature already published, skip rebuild
                $row = $this->repo->read($payloadType, $keyCode, $schemaVersion);
                if ($row && !empty($row['source_signature']) && $sourceSig && hash_equals($row['source_signature'], $sourceSig)) {
                    return ['json' => $row['json_payload'], 'etag' => $row['etag']];
                }
            }

            $built = $builder();

            $json = is_string($built)
                ? $built
                : json_encode($built, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);

            // Validate JSON if provided as string
            if (is_string($built)) {
                json_decode($json, true, 512, JSON_THROW_ON_ERROR);
            }

            $etag = hash('sha256', $json);
            $buildMs = (int)round((microtime(true) - $t0) * 1000);

            $this->repo->upsert(
                $payloadType,
                $keyCode,
                $schemaVersion,
                $json,
                $etag,
                $sourceSig,
                $builtBy,
                $buildMs
            );

            return ['json' => $json, 'etag' => $etag];
        } finally {
            $this->repo->releaseLock($payloadType, $keyCode, $schemaVersion, $token);
        }
    }

    private function isReal(array $row): bool
    {
        // Placeholder inserted by ensureRowExists is '[]'
        if (empty($row['json_payload']) || empty($row['etag'])) return false;
        return $row['etag'] !== hash('sha256', '[]');
    }

    private function uuidV4(): string
    {
        $data = random_bytes(16);
        $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
        $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
        $hex = bin2hex($data);

        return sprintf('%s-%s-%s-%s-%s',
            substr($hex, 0, 8),
            substr($hex, 8, 4),
            substr($hex, 12, 4),
            substr($hex, 16, 4),
            substr($hex, 20, 12)
        );
    }
}