<?php
declare(strict_types=1);

namespace Modules\Problem\Services\Forms;

use PDO;
use Modules\Problem\Repositories\Forms\AttachmentsRepository;
use Modules\Problem\Repositories\Forms\FormVersionRepository;

final class AttachmentsServiceFactory
{
	/**
	 * Build AttachmentsService.
	 */
	public static function make(PDO $dbRuntime): AttachmentsService
	{
		$repo = new AttachmentsRepository($dbRuntime);
		$versions = new FormVersionRepository($dbRuntime);

		return new AttachmentsService($dbRuntime, $repo, $versions);
	}
}