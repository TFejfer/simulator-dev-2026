<?php
declare(strict_types=1);

namespace Modules\Problem\Services\Forms;

use PDO;
use Engine\Database\DatabaseManager;
use Modules\Shared\Repositories\FormRuleRepository;

use Modules\Problem\Repositories\Forms\FormVersionRepository;

// Default repos
use Modules\Problem\Repositories\Forms\SymptomsRepository as DefaultSymptomsRepository;
use Modules\Problem\Repositories\Forms\FactsRepository as DefaultFactsRepository;
use Modules\Problem\Repositories\Forms\CausesRepository as DefaultCausesRepository;
use Modules\Problem\Repositories\Forms\ActionsRepository as DefaultActionsRepository;
use Modules\Problem\Repositories\Forms\IterationsRepository as DefaultIterationsRepository;
use Modules\Problem\Repositories\Forms\DescriptionRepository as DefaultDescriptionRepository;
use Modules\Problem\Repositories\Forms\ReflectionsRepository as DefaultReflectionsRepository;
use Modules\Problem\Repositories\Forms\AttachmentsRepository as DefaultAttachmentsRepository;

// KT repos (only those that differ)
use Modules\Problem\Repositories\Forms\KT\SymptomsRepository as KtSymptomsRepository;
use Modules\Problem\Repositories\Forms\KT\FactsRepository as KtFactsRepository;
use Modules\Problem\Repositories\Forms\KT\CausesRepository as KtCausesRepository;
use Modules\Problem\Repositories\Forms\KT\ActionsRepository as KtActionsRepository;
use Modules\Problem\Repositories\Forms\KT\ReflectionsRepository as KtReflectionsRepository;

final class ExerciseStateServiceFactory
{
	public static function make(PDO $dbRuntime, string $templateCode = 'default'): ExerciseStateService
	{
		$templateCode = strtolower(trim($templateCode));
		if ($templateCode === '') $templateCode = 'default';

		$dbm = DatabaseManager::getInstance();
		$dbSharedContent = $dbm->getConnection('shared_content');

		$formRules = new FormRuleRepository($dbSharedContent);
		$versionsRepo = new FormVersionRepository($dbRuntime);

		if ($templateCode === 'kt') {
			// KT-specific (different tables/structures)
			$symptoms    = new KtSymptomsRepository($dbRuntime);
			$facts       = new KtFactsRepository($dbRuntime);
			$causes      = new KtCausesRepository($dbRuntime);
			$actions     = new KtActionsRepository($dbRuntime);
			$reflections = new KtReflectionsRepository($dbRuntime);

			// Shared/common (use default implementations)
			$iterations  = new DefaultIterationsRepository($dbRuntime);
			$description = new DefaultDescriptionRepository($dbRuntime);
			$attachments = new DefaultAttachmentsRepository($dbRuntime);
		} else {
			// Default
			$symptoms    = new DefaultSymptomsRepository($dbRuntime);
			$facts       = new DefaultFactsRepository($dbRuntime);
			$causes      = new DefaultCausesRepository($dbRuntime);
			$actions     = new DefaultActionsRepository($dbRuntime);
			$iterations  = new DefaultIterationsRepository($dbRuntime);
			$description = new DefaultDescriptionRepository($dbRuntime);
			$reflections = new DefaultReflectionsRepository($dbRuntime);
			$attachments = new DefaultAttachmentsRepository($dbRuntime);
		}

		return new ExerciseStateService(
			$dbRuntime,
			$versionsRepo,
			$symptoms,
			$facts,
			$causes,
			$actions,
			$iterations,
			$description,
			$reflections,
			$attachments,
			$formRules
		);
	}
}