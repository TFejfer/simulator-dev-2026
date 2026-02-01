<?php
declare(strict_types=1);

namespace Modules\Problem\Services\Forms;

use PDO;
use Modules\Problem\Repositories\Forms\FormVersionRepository;
use Modules\Problem\Repositories\Forms\SymptomsRepository;
use Modules\Problem\Repositories\Forms\FactsRepository;
use Modules\Problem\Repositories\Forms\CausesRepository;
use Modules\Problem\Repositories\Forms\ActionsRepository;
use Modules\Problem\Repositories\Forms\IterationsRepository;
use Modules\Problem\Repositories\Forms\DescriptionRepository;
use Modules\Problem\Repositories\Forms\ReflectionsRepository;

final class FormsServiceFactory
{
	/**
	 * Build FormsService with all repositories wired.
	 * Keeping construction here keeps endpoints thin and consistent.
	 */
	public static function make(PDO $dbRuntime): FormsService
	{
		$versions = new FormVersionRepository($dbRuntime);

		$symptoms = new SymptomsRepository($dbRuntime);
		$facts = new FactsRepository($dbRuntime);
		$causes = new CausesRepository($dbRuntime);
		$actions = new ActionsRepository($dbRuntime);

		$iterations = new IterationsRepository($dbRuntime);
		$description = new DescriptionRepository($dbRuntime);
		$reflections = new ReflectionsRepository($dbRuntime);

		$workflow = new \Modules\Problem\Repositories\WorkflowLogRepository($dbRuntime);

		$payloadBuilder = new FormsPayloadBuilder(
			$symptoms,
			$facts,
			$causes,
			$actions,
			$iterations,
			$description,
			$reflections
		);

		return new FormsService(
			$dbRuntime,
			$versions,
			$symptoms,
			$facts,
			$causes,
			$actions,
			$iterations,
			$description,
			$reflections,
			$payloadBuilder,
			$workflow
		);
	}
}