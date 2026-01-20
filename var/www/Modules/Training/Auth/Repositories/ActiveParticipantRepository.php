<?php
declare(strict_types=1);

namespace Modules\Training\Auth\Repositories;

use PDO;

final class ActiveParticipantRepository
{
    public function __construct(private PDO $db) {}

    /**
     * PK is now access_id (you said it's done).
     */
    public function upsert(int $accessId, string $token): void
    {
        $stmt = $this->db->prepare("
            INSERT INTO log_active_participants (access_id, token, updated_ts)
            VALUES (:id, :t, NOW())
            ON DUPLICATE KEY UPDATE
              token = VALUES(token),
              updated_ts = NOW()
        ");
        $stmt->execute([':id' => $accessId, ':t' => $token]);
    }

    /**
     * Returns participant setup status row or null if not found.
     *
     * @return array{
     *   team_no:int,
     *   requested_team_no:int,
     *   language_code:string,
     *   first_name:string
     * }|null
     */
    public function findSetupStatus(int $accessId, string $token): ?array
    {
        $stmt = $this->db->prepare("
            SELECT
                team_no,
                requested_team_no,
                language_code,
                first_name
            FROM log_active_participants
            WHERE access_id = :aid AND token = :tok
            LIMIT 1
        ");
        $stmt->execute([
            ':aid' => $accessId,
            ':tok' => $token,
        ]);

        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            return null;
        }

        return [
            'team_no'           => (int)($row['team_no'] ?? 0),
            'requested_team_no' => (int)($row['requested_team_no'] ?? 0),
            'language_code'     => (string)($row['language_code'] ?? 'en'),
            'first_name'        => (string)($row['first_name'] ?? ''),
        ];
    }

    /**
     * Upsert setup data for (access_id, token).
     */
    public function upsertSetupData(
        int $accessId,
        string $token,
        int $teamNo,
        string $languageCode,
        string $firstName,
        int $requestedTeamNo,
        string $browser,
        string $os,
        string $timezone
    ): void {
        $stmt = $this->db->prepare("
            INSERT INTO log_active_participants
                (access_id, token, updated_ts, team_no, language_code, first_name, requested_team_no, browser, os, timezone)
            VALUES
                (:aid, :tok, NOW(), :team_no, :lang, :first_name, :req_team_no, :browser, :os, :tz)
            ON DUPLICATE KEY UPDATE
                updated_ts = NOW(),
                team_no = VALUES(team_no),
                language_code = VALUES(language_code),
                first_name = VALUES(first_name),
                requested_team_no = VALUES(requested_team_no),
                browser = VALUES(browser),
                os = VALUES(os),
                timezone = VALUES(timezone)
        ");
        $stmt->execute([
            ':aid'        => $accessId,
            ':tok'        => $token,
            ':team_no'    => $teamNo,
            ':lang'       => $languageCode,
            ':first_name' => $firstName,
            ':req_team_no'=> $requestedTeamNo,
            ':browser'    => $browser,
            ':os'         => $os,
            ':tz'         => $timezone,
        ]);
    }
}