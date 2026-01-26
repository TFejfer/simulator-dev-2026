<?php
declare(strict_types=1);

namespace Modules\Training\Auth\Repositories;

use PDO;

final class ActiveParticipantRepository
{
    public function __construct(private PDO $dbRuntime) {}

    /**
	 * Ensures that the active participant row exists for (access_id, token)
	 * and resets team_no to 0 at login time.
	 *
	 * Design:
	 * - Team selection is a setup responsibility.
	 * - Login always starts with team_no=0 (not assigned yet).
	 *
	 * This method should be called immediately after generating the session token.
	 */
	public function resetTeamOnLogin(int $accessId, string $token): void
	{
		if ($accessId <= 0 || $token === '') return;

		// Assumes PRIMARY KEY (access_id, token) exists on log_active_participants
		$sql = "
			INSERT INTO log_active_participants
				(access_id, token, team_no, updated_ts)
			VALUES
				(:access_id, :token, 0, NOW())
			ON DUPLICATE KEY UPDATE
				team_no = 0,
				updated_ts = NOW()
		";

		try {
			$stmt = $this->dbRuntime->prepare($sql);
			$stmt->execute([
				':access_id' => $accessId,
				':token' => $token,
			]);
		} catch (\PDOException) {
			// Fail-safe: login must not crash if this row cannot be written.
			// (You can add logging in the service layer if desired.)
		}
	}

    /**
     * PK is now access_id (you said it's done).
     */
    public function upsert(int $accessId, string $token): void
    {
        $stmt = $this->dbRuntime->prepare("
            INSERT INTO log_active_participants (access_id, token, updated_ts)
            VALUES (:id, :t, NOW())
            ON DUPLICATE KEY UPDATE
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
        $stmt = $this->dbRuntime->prepare("
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
        $stmt = $this->dbRuntime->prepare("
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

    /**
     * @return array{role_id:int, position_count:int}|null
     */
    public function findRoleAndPosition(int $accessId, string $token): ?array
    {
        if ($accessId <= 0 || $token === '') return null;

        $stmt = $this->dbRuntime->prepare("
            SELECT role_id, position_count
            FROM log_active_participants
            WHERE access_id = :access_id
              AND token     = :token
            LIMIT 1
        ");

        $stmt->execute([
            ':access_id' => $accessId,
            ':token'     => $token,
        ]);

        /** @var array<string,mixed>|false $row */
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) return null;

        return [
            'role_id' => (int)$row['role_id'],
            'position_count' => (int)$row['position_count'],
        ];
    }

    /**
     * Update positions and role.
     */
    public function updateRolePosition(int $accessId, string $token, int $positionCount, int $roleId): void
    {
        if ($accessId <= 0 || $token === '' || $positionCount <= 0 || $roleId <= 0) return;

        try {
            $stmt = $this->dbRuntime->prepare("
                UPDATE log_active_participants
                SET position_count = :pos, role_id = :role, updated_ts = NOW()
                WHERE access_id = :aid AND token = :tok
                LIMIT 1
            ");
            $stmt->execute([
                ':pos' => $positionCount,
                ':role' => $roleId,
                ':aid' => $accessId,
                ':tok' => $token,
            ]);
        } catch (\PDOException) {
            // Fail-safe
        }
    }
}