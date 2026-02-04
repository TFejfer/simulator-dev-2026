<?php
declare(strict_types=1);

namespace Modules\Training\Auth\Repositories;

use PDO;
use PDOException;

final class InstructorPollingRepository
{
	public function __construct(
		private PDO $dbRuntime
	) {}

	/**
	 * Polls for updates and returns:
	 * - updates: grouped by tbl (latest id + latest info_1/info_2 per tbl)
	 * - server_latest_poll_id: the latest id for this access/team scope (including team_no=0 rows)
	 * - effective_last_poll_id: the id floor used by the query (after safe anchoring)
	 *
	 * Design goals:
	 * - Avoid full-table scans if the client sends last_poll_id=0
	 * - Cap output with LIMIT
	 * - Single SQL roundtrip per poll request (CTE + UNION)
	 *
	 * IMPORTANT:
	 * - Cursor (id) is the source of truth. Do NOT time-window filter rows,
	 *   otherwise clients can miss updates after tab sleep/network gaps.
	 * - "Latest per tbl" must return a consistent row. Using MAX() on multiple
	 *   columns can mix values from different rows. We use ROW_NUMBER() to pick
	 *   the latest row per tbl deterministically (MySQL 8+).
	 *
	 * NOTE:
	 * - This is a "signal table" (log_poll). Clients should fetch real data from real endpoints.
	 *
	 * @return array{
	 *   updates: array<int, array{id:int, tbl:string, info_1:?string, info_2:?string}>,
	 *   server_latest_poll_id: int,
	 *   effective_last_poll_id: int
	 * }
	 */
	public function pollForUpdates(
		int $accessId,
		int $teamNo,
		string $actorToken,
		int $lastPollId,
		int $maxRows = 20,
		int $fallbackLookbackRows = 200
	): array {
		// Hard clamps for safety; prevents nonsense inputs from hurting the DB
		if ($lastPollId < 0) $lastPollId = 0;
		if ($maxRows < 1) $maxRows = 1;
		if ($maxRows > 200) $maxRows = 200;
		if ($fallbackLookbackRows < 10) $fallbackLookbackRows = 10;
		if ($fallbackLookbackRows > 5000) $fallbackLookbackRows = 5000;

		/**
		 * CTE pipeline:
		 * - scope_latest: latest id in this access/team scope (team_no OR 0)
		 * - effective: if client lastPollId=0, anchor near the tail (latest - fallbackLookbackRows)
		 * - updates_raw: rows since effective_last_poll_id (excluding actor_token)
		 * - updates_ranked: rank rows per tbl by id desc
		 * - updates_limited: pick rn=1 (latest per tbl), then LIMIT
		 *
		 * UNION ALL adds a "meta" row so we ALWAYS return server_latest_poll_id
		 * even if there are zero updates.
		 */
		$sql = "
			WITH
			scope_latest AS (
				SELECT COALESCE(MAX(id), 0) AS latest_id
				FROM log_poll
				WHERE access_id = :access_id
				  AND (team_no = :team_no OR team_no = 0)
			),
			effective AS (
				SELECT
					CASE
						WHEN :last_poll_id > 0 THEN :last_poll_id
						ELSE GREATEST(0, (SELECT latest_id FROM scope_latest) - :fallback_lookback_rows)
					END AS effective_last_poll_id,
					(SELECT latest_id FROM scope_latest) AS server_latest_poll_id
			),
			updates_raw AS (
				SELECT
					lp.id,
					lp.tbl,
					lp.info_1,
					lp.info_2
				FROM log_poll lp
				JOIN effective e ON 1=1
				WHERE
					lp.access_id = :access_id
					AND (lp.team_no = :team_no OR lp.team_no = 0)
					AND lp.actor_token <> :actor_token
					AND lp.id > e.effective_last_poll_id
			),
			updates_ranked AS (
				SELECT
					id,
					tbl,
					info_1,
					info_2,
					ROW_NUMBER() OVER (PARTITION BY tbl ORDER BY id DESC) AS rn
				FROM updates_raw
			),
			updates_limited AS (
				SELECT id, tbl, info_1, info_2
				FROM updates_ranked
				WHERE rn = 1
				ORDER BY id DESC
				LIMIT :max_rows
			)
			SELECT
				'meta' AS row_type,
				e.server_latest_poll_id AS server_latest_poll_id,
				e.effective_last_poll_id AS effective_last_poll_id,
				NULL AS id,
				NULL AS tbl,
				NULL AS info_1,
				NULL AS info_2
			FROM effective e

			UNION ALL

			SELECT
				'update' AS row_type,
				e.server_latest_poll_id AS server_latest_poll_id,
				e.effective_last_poll_id AS effective_last_poll_id,
				u.id AS id,
				u.tbl AS tbl,
				u.info_1 AS info_1,
				u.info_2 AS info_2
			FROM updates_limited u
			JOIN effective e ON 1=1
			ORDER BY row_type ASC, id DESC
		";

		try {
			$stmt = $this->dbRuntime->prepare($sql);

			$stmt->bindValue(':access_id', $accessId, PDO::PARAM_INT);
			$stmt->bindValue(':team_no', $teamNo, PDO::PARAM_INT);
			$stmt->bindValue(':actor_token', $actorToken, PDO::PARAM_STR);
			$stmt->bindValue(':last_poll_id', $lastPollId, PDO::PARAM_INT);

			$stmt->bindValue(':max_rows', $maxRows, PDO::PARAM_INT);
			$stmt->bindValue(':fallback_lookback_rows', $fallbackLookbackRows, PDO::PARAM_INT);

			$stmt->execute();
			$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

			if (!is_array($rows) || $rows === []) {
				// In practice we should always get at least the 'meta' row
				return [
					'updates' => [],
					'server_latest_poll_id' => $lastPollId,
					'effective_last_poll_id' => $lastPollId,
				];
			}

			$serverLatest = $lastPollId;
			$effectiveLast = $lastPollId;
			$updates = [];

			foreach ($rows as $r) {
				if (($r['row_type'] ?? '') === 'meta') {
					$serverLatest = (int)($r['server_latest_poll_id'] ?? $serverLatest);
					$effectiveLast = (int)($r['effective_last_poll_id'] ?? $effectiveLast);
					continue;
				}

				$id = (int)($r['id'] ?? 0);
				if ($id <= 0) continue;

				$updates[] = [
					'id' => $id,
					'tbl' => (string)($r['tbl'] ?? ''),
					'info_1' => array_key_exists('info_1', $r) && $r['info_1'] !== null ? (string)$r['info_1'] : null,
					'info_2' => array_key_exists('info_2', $r) && $r['info_2'] !== null ? (string)$r['info_2'] : null,
				];
			}

			return [
				'updates' => $updates,
				'server_latest_poll_id' => $serverLatest,
				'effective_last_poll_id' => $effectiveLast,
			];

		} catch (PDOException) {
			// Repo deliberately does not log; endpoint/service layer decides logging strategy.
			return [
				'updates' => [],
				'server_latest_poll_id' => $lastPollId,
				'effective_last_poll_id' => $lastPollId,
			];
		}
	}

	/**
	 * Emits a log_poll signal (used by server-side transitions such as timer expiry).
	 */
	public function emitSignal(int $accessId, int $teamNo, string $actorToken, string $tbl, ?string $info1 = null, ?string $info2 = null): bool
	{
		if ($accessId <= 0 || $tbl === '') return false;

		$sql = "
			INSERT INTO log_poll
				(access_id, team_no, tbl, info_1, info_2, actor_token)
			VALUES
				(:access_id, :team_no, :tbl, :info_1, :info_2, :actor_token)
		";

		try {
			$stmt = $this->dbRuntime->prepare($sql);
			$stmt->bindValue(':access_id', $accessId, PDO::PARAM_INT);
			$stmt->bindValue(':team_no', $teamNo, PDO::PARAM_INT);
			$stmt->bindValue(':tbl', $tbl, PDO::PARAM_STR);
			$stmt->bindValue(':info_1', $info1, $info1 === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
			$stmt->bindValue(':info_2', $info2, $info2 === null ? PDO::PARAM_NULL : PDO::PARAM_STR);
			$stmt->bindValue(':actor_token', $actorToken, PDO::PARAM_STR);
			return $stmt->execute();
		} catch (PDOException) {
			return false;
		}
	}
}