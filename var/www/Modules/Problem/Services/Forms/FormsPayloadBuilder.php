<?php
declare(strict_types=1);

namespace Modules\Problem\Services\Forms;

use Modules\Problem\Repositories\Forms\ActionsRepository;
use Modules\Problem\Repositories\Forms\CausesRepository;
use Modules\Problem\Repositories\Forms\FactsRepository;
use Modules\Problem\Repositories\Forms\SymptomsRepository;
use Modules\Problem\Repositories\Forms\IterationsRepository;
use Modules\Problem\Repositories\Forms\DescriptionRepository;
use Modules\Problem\Repositories\Forms\ReflectionsRepository;
use Modules\Problem\Repositories\Forms\SpecificationRepository;

final class FormsPayloadBuilder
{
    public function __construct(
        private SymptomsRepository $symptoms,
        private FactsRepository $facts,
        private CausesRepository $causes,
        private ActionsRepository $actions,
        private IterationsRepository $iterations,
        private DescriptionRepository $description,
        private ReflectionsRepository $reflections,
        private SpecificationRepository $specification
    ) {}

    /** @return array<string,mixed> */
    public function buildFormData(
        string $formKey,
        int $accessId,
        int $teamNo,
        int $outlineId,
        int $exerciseNo,
        int $themeId = 0,
        int $scenarioId = 0
    ): array {
        return match ($formKey) {
            'symptoms' => ['symptoms' => $this->symptoms->read($accessId, $teamNo, $outlineId, $exerciseNo)],
            'facts'    => ['facts' => $this->facts->read($accessId, $teamNo, $outlineId, $exerciseNo)],
            'causes'   => ['causes' => $this->causes->read($accessId, $teamNo, $outlineId, $exerciseNo)],
            'actions'  => ['actions' => $this->actions->read($accessId, $teamNo, $outlineId, $exerciseNo)],
            'iterations'=> ['iterations' => $this->iterations->read($accessId, $teamNo, $outlineId, $exerciseNo, $themeId, $scenarioId)],
            'description'=> ['description' => $this->description->read($accessId, $teamNo, $outlineId, $exerciseNo, $themeId, $scenarioId)],
            'reflections'=> ['reflections' => $this->reflections->read($accessId, $teamNo, $outlineId, $exerciseNo)],
            'specification'=> ['specification' => $this->specification->readAll($accessId, $teamNo, $outlineId, $exerciseNo, $themeId, $scenarioId)],
            default => throw new \InvalidArgumentException('Unknown form_key'),
        };
    }
}