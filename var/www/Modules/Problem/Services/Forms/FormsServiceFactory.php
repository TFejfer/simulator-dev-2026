<?php
declare(strict_types=1);

namespace Modules\Problem\Services\Forms;

use PDO;
use Modules\Problem\Repositories\Forms\FormVersionRepository;
use Modules\Problem\Repositories\Forms\SymptomsRepository;
use Modules\Problem\Repositories\Forms\FactsRepository;
use Modules\Problem\Repositories\Forms\CausesRepository;
use Modules\Problem\Repositories\Forms\ActionsRepository;
use Modules\Problem\Repositories\Forms\IterationRepository;
use Modules\Problem\Repositories\Forms\DescriptionRepository;
use Modules\Problem\Repositories\Forms\ReflectionRepository;

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

		$iteration = new IterationRepository($dbRuntime);
		$description = new DescriptionRepository($dbRuntime);
		$reflection = new ReflectionRepository($dbRuntime);

		$payloadBuilder = new FormsPayloadBuilder(
			$symptoms,
			$facts,
			$causes,
			$actions,
			$iteration,
			$description,
			$reflection
		);

		return new FormsService(
			$dbRuntime,
			$versions,
			$symptoms,
			$facts,
			$causes,
			$actions,
			$iteration,
			$description,
			$reflection,
			$payloadBuilder
		);
	}
}