<?php
declare(strict_types=1);

namespace Modules\Training\Auth\Repositories;

use PDO;
use PDOException;

final class BroadcastRepository
{
	public function __construct(
		private PDO $dbRuntime
	) {}

	/**
	 * Read the latest broadcast message for an access_id
	 * within a lookback window.
	 *
	 * @return array{id:int, message:string, created_at:string}|null
	 */
	public function readLatest(int $accessId, int $lookbackSeconds = 60): ?array
	{
		if ($accessId <= 0) return null;

		if ($lookbackSeconds < 5) $lookbackSeconds = 5;
		if ($lookbackSeconds > 600) $lookbackSeconds = 600;

		$sql = "
			SELECT
				id,
				message,
				created_at
			FROM
				log_broadcast
			WHERE
				access_id = :access_id
				AND created_at >= NOW() - INTERVAL :lookback SECOND
			ORDER BY
				id DESC
			LIMIT 1
		";

		try {
			$stmt = $this->dbRuntime->prepare($sql);
			$stmt->bindValue(':access_id', $accessId, PDO::PARAM_INT);
			$stmt->bindValue(':lookback', $lookbackSeconds, PDO::PARAM_INT);
			$stmt->execute();

			$row = $stmt->fetch(PDO::FETCH_ASSOC);
			if (!is_array($row) || $row === []) return null;

			return [
				'id' => (int)$row['id'],
				'message' => (string)$row['message'],
				'created_at' => (string)$row['created_at'],
			];

		} catch (PDOException) {
			return null;
		}
	}

	/**
	 * Create a new broadcast message.
	 *
	 * IMPORTANT:
	 * - This method ONLY writes to log_broadcast.
	 * - The caller (endpoint/service) is responsible for
	 *   emitting the corresponding log_poll signal.
	 *
	 * @return int Inserted broadcast id (0 on failure)
	 */
	public function create(int $accessId, string $message): int
	{
		if ($accessId <= 0) return 0;

		$message = trim($message);
		if ($message === '') return 0;

		$sql = "
			INSERT INTO log_broadcast
				(access_id, message)
			VALUES
				(:access_id, :message)
		";

		try {
			$stmt = $this->dbRuntime->prepare($sql);
			$stmt->bindValue(':access_id', $accessId, PDO::PARAM_INT);
			$stmt->bindValue(':message', $message, PDO::PARAM_STR);
			$stmt->execute();

			return (int)$this->dbRuntime->lastInsertId();

		} catch (PDOException) {
			return 0;
		}
	}
}