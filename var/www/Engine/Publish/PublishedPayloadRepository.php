<?php
declare(strict_types=1);

namespace Engine\Publish;

use PDO;

/**
 * PublishedPayloadRepository
 *
 * Pure DB access layer for table `published_payloads`.
 * No business logic here.
 */
final class PublishedPayloadRepository
{
    public function __construct(private PDO $db) {}

    public function read(string $payloadType, string $keyCode, int $schemaVersion): ?array
    {
        $sql = "
            SELECT
              json_payload,
              etag,
              source_signature,
              built_at,
              build_lock_token,
              build_lock_until
            FROM published_payloads
            WHERE payload_type = :payload_type
              AND key_code = :key_code
              AND schema_version = :schema_version
            LIMIT 1
        ";
        $st = $this->db->prepare($sql);
        $st->execute([
            ':payload_type' => $payloadType,
            ':key_code' => $keyCode,
            ':schema_version' => $schemaVersion,
        ]);

        $row = $st->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }

    /**
     * Ensure a placeholder row exists so we can lock/update deterministically.
     * Placeholder payload is '[]' with its sha256 etag.
     */
    public function ensureRowExists(string $payloadType, string $keyCode, int $schemaVersion): void
    {
        $placeholder = '[]';
        $etag = hash('sha256', $placeholder);

        $sql = "
            INSERT INTO published_payloads
              (payload_type, key_code, schema_version, json_payload, etag, built_at)
            VALUES
              (:payload_type, :key_code, :schema_version, :json_payload, :etag, NOW())
            ON DUPLICATE KEY UPDATE
              id = id
        ";

        $st = $this->db->prepare($sql);
        $st->execute([
            ':payload_type' => $payloadType,
            ':key_code' => $keyCode,
            ':schema_version' => $schemaVersion,
            ':json_payload' => $placeholder,
            ':etag' => $etag,
        ]);
    }

    /**
     * TTL lock to prevent multiple processes building the same payload simultaneously.
     * Returns true if lock acquired.
     */
    public function tryAcquireLock(
        string $payloadType,
        string $keyCode,
        int $schemaVersion,
        string $token,
        int $ttlSeconds
    ): bool {
        $sql = "
            UPDATE published_payloads
            SET build_lock_token = :token,
                build_lock_until = DATE_ADD(NOW(), INTERVAL :ttl SECOND)
            WHERE payload_type = :payload_type
              AND key_code = :key_code
              AND schema_version = :schema_version
              AND (build_lock_until IS NULL OR build_lock_until < NOW())
        ";

        $st = $this->db->prepare($sql);
        $st->execute([
            ':token' => $token,
            ':ttl' => $ttlSeconds,
            ':payload_type' => $payloadType,
            ':key_code' => $keyCode,
            ':schema_version' => $schemaVersion,
        ]);

        return $st->rowCount() === 1;
    }

    /**
     * Release lock only if token matches (ownership).
     */
    public function releaseLock(string $payloadType, string $keyCode, int $schemaVersion, string $token): void
    {
        $sql = "
            UPDATE published_payloads
            SET build_lock_token = NULL,
                build_lock_until = NULL
            WHERE payload_type = :payload_type
              AND key_code = :key_code
              AND schema_version = :schema_version
              AND build_lock_token = :token
        ";

        $st = $this->db->prepare($sql);
        $st->execute([
            ':payload_type' => $payloadType,
            ':key_code' => $keyCode,
            ':schema_version' => $schemaVersion,
            ':token' => $token,
        ]);
    }

    /**
     * Insert or update a published payload row.
     */
    public function upsert(
        string $payloadType,
        string $keyCode,
        int $schemaVersion,
        string $jsonPayload,
        string $etag,
        ?string $sourceSignature,
        ?string $builtBy,
        ?int $buildMs
    ): void {
        $sql = "
            INSERT INTO published_payloads
              (payload_type, key_code, schema_version, json_payload, etag, source_signature, built_by, build_ms, built_at)
            VALUES
              (:payload_type, :key_code, :schema_version, :json_payload, :etag, :source_signature, :built_by, :build_ms, NOW())
            ON DUPLICATE KEY UPDATE
              json_payload      = VALUES(json_payload),
              etag             = VALUES(etag),
              source_signature = VALUES(source_signature),
              built_by         = VALUES(built_by),
              build_ms         = VALUES(build_ms),
              built_at         = NOW()
        ";

        $st = $this->db->prepare($sql);
        $st->execute([
            ':payload_type' => $payloadType,
            ':key_code' => $keyCode,
            ':schema_version' => $schemaVersion,
            ':json_payload' => $jsonPayload,
            ':etag' => $etag,
            ':source_signature' => $sourceSignature,
            ':built_by' => $builtBy,
            ':build_ms' => $buildMs,
        ]);
    }
}