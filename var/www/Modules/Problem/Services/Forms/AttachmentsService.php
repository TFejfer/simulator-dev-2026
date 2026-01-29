<?php
declare(strict_types=1);

namespace Modules\Problem\Services\Forms;

use PDO;
use Throwable;
use Modules\Problem\Repositories\Forms\AttachmentsRepository;
use Modules\Problem\Repositories\Forms\FormVersionRepository;

final class AttachmentsService
{
	public function __construct(
		private PDO $db,
		private AttachmentsRepository $repo,
		private FormVersionRepository $versions
	) {}

	/**
	 * Read attachment row for scope.
	 * Returns a safe payload (id + file_name + file_html|null).
	 *
	 * @return array<string,mixed>
	 */
	public function read(
		int $accessId,
		int $teamNo,
		int $outlineId,
		int $exerciseNo,
		int $themeId,
		int $scenarioId
	): array {
		$row = $this->repo->read($accessId, $teamNo, $outlineId, $exerciseNo, $themeId, $scenarioId);

		// Convert blob to HTML (legacy-compatible). You can switch to base64-only anytime.
		if (!empty($row['file'])) {
			$b64 = base64_encode($row['file']);
			$row['file_html'] = '<img style="max-width:100%;" src="data:image/jpg;base64,' . $b64 . '"/>';
			unset($row['file']);
		} else {
			$row['file_html'] = null;
			unset($row['file']);
		}

		return $row;
	}

	/**
	 * Upload with OCC on versions(form_key='attachments').
	 *
	 * @return array{ok:bool,error?:string,data:array<string,mixed>}
	 */
	public function uploadWithOcc(
		int $accessId,
		int $teamNo,
		int $outlineId,
		int $exerciseNo,
		int $themeId,
		int $scenarioId,
		string $actorToken,
		int $expectedVersion,
		string $fileName,
		string $blob
	): array {
		try {
			$this->db->beginTransaction();

			$current = $this->versions->lockCurrentVersion($accessId, $teamNo, $outlineId, $exerciseNo, 'attachments');
			if ($expectedVersion !== $current) {
				$this->db->rollBack();

				// Return canonical view so client can patch immediately.
				$data = $this->read($accessId, $teamNo, $outlineId, $exerciseNo, $themeId, $scenarioId);

				return [
					'ok' => false,
					'error' => 'version_conflict',
					'data' => [
						'form_key' => 'attachments',
						'current_version' => $current,
						'attachment' => $data,
					]
				];
			}

			$this->repo->upsert(
				$accessId,
				$teamNo,
				$outlineId,
				$exerciseNo,
				$themeId,
				$scenarioId,
				$fileName,
				$blob,
				$actorToken
			);

			$newV = $this->versions->bumpVersion($accessId, $teamNo, $outlineId, $exerciseNo, 'attachments', $actorToken);

			$this->db->commit();

			$data = $this->read($accessId, $teamNo, $outlineId, $exerciseNo, $themeId, $scenarioId);

			return [
				'ok' => true,
				'data' => [
					'form_key' => 'attachments',
					'version' => $newV,
					'attachment' => $data,
				]
			];

		} catch (Throwable $e) {
			if ($this->db->inTransaction()) $this->db->rollBack();
			throw $e;
		}
	}

	/**
	 * Delete with OCC on versions(form_key='attachments').
	 *
	 * @return array{ok:bool,error?:string,data:array<string,mixed>}
	 */
	public function deleteWithOcc(
		int $accessId,
		int $teamNo,
		int $outlineId,
		int $exerciseNo,
		int $themeId,
		int $scenarioId,
		string $actorToken,
		int $expectedVersion
	): array {
		try {
			$this->db->beginTransaction();

			$current = $this->versions->lockCurrentVersion($accessId, $teamNo, $outlineId, $exerciseNo, 'attachments');
			if ($expectedVersion !== $current) {
				$this->db->rollBack();

				$data = $this->read($accessId, $teamNo, $outlineId, $exerciseNo, $themeId, $scenarioId);

				return [
					'ok' => false,
					'error' => 'version_conflict',
					'data' => [
						'form_key' => 'attachments',
						'current_version' => $current,
						'attachment' => $data,
					]
				];
			}

			$this->repo->delete($accessId, $teamNo, $outlineId, $exerciseNo, $themeId, $scenarioId);

			$newV = $this->versions->bumpVersion($accessId, $teamNo, $outlineId, $exerciseNo, 'attachments', $actorToken);

			$this->db->commit();

			$data = $this->read($accessId, $teamNo, $outlineId, $exerciseNo, $themeId, $scenarioId);

			return [
				'ok' => true,
				'data' => [
					'form_key' => 'attachments',
					'version' => $newV,
					'attachment' => $data,
				]
			];

		} catch (Throwable $e) {
			if ($this->db->inTransaction()) $this->db->rollBack();
			throw $e;
		}
	}
}