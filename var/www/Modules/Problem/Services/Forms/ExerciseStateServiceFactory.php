<?php
declare(strict_types=1);

namespace Modules\Problem\Services\Forms;

use PDO;
use Engine\Database\DatabaseManager;
use Modules\Shared\Repositories\FormRuleRepository;
use Modules\Problem\Repositories\Forms\FormVersionRepository;
use Modules\Problem\Repositories\Forms\SymptomsRepository;
use Modules\Problem\Repositories\Forms\FactsRepository;
use Modules\Problem\Repositories\Forms\CausesRepository;
use Modules\Problem\Repositories\Forms\ActionsRepository;
use Modules\Problem\Repositories\Forms\IterationRepository;
use Modules\Problem\Repositories\Forms\DescriptionRepository;
use Modules\Problem\Repositories\Forms\ReflectionRepository;
use Modules\Problem\Repositories\Forms\AttachmentsRepository;

final class ExerciseStateServiceFactory
{
	/**
	 * Build ExerciseStateService for initial load / hard refresh of all forms.
	 *
	 * NOTE:
	 * - Runtime data comes from $dbRuntime
	 * - Visibility rules come from SHARED_CONTENT via FormRuleRepository
	 */
	public static function make(PDO $dbRuntime): ExerciseStateService
	{
		$dbm = DatabaseManager::getInstance();
		$dbSharedContent = $dbm->getConnection('shared_content');

		$formRules = new FormRuleRepository($dbSharedContent);

		return new ExerciseStateService(
			$dbRuntime,
			new FormVersionRepository($dbRuntime),
			new SymptomsRepository($dbRuntime),
			new FactsRepository($dbRuntime),
			new CausesRepository($dbRuntime),
			new ActionsRepository($dbRuntime),
			new IterationRepository($dbRuntime),
			new DescriptionRepository($dbRuntime),
			new ReflectionRepository($dbRuntime),
			new AttachmentsRepository($dbRuntime),
			$formRules
		);
	}
}