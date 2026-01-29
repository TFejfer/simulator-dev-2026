<?php
declare(strict_types=1);

namespace Modules\Problem\Services\Forms;

use Modules\Problem\Repositories\Forms\ActionsRepository;
use Modules\Problem\Repositories\Forms\CausesRepository;
use Modules\Problem\Repositories\Forms\FactsRepository;
use Modules\Problem\Repositories\Forms\SymptomsRepository;
use Modules\Problem\Repositories\Forms\IterationRepository;
use Modules\Problem\Repositories\Forms\DescriptionRepository;
use Modules\Problem\Repositories\Forms\ReflectionRepository;

final class FormsPayloadBuilder
{
    public function __construct(
        private SymptomsRepository $symptoms,
        private FactsRepository $facts,
        private CausesRepository $causes,
        private ActionsRepository $actions,
        private IterationRepository $iteration,
        private DescriptionRepository $description,
        private ReflectionRepository $reflection,
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
            'iteration'=> ['iteration' => $this->iteration->read($accessId, $teamNo, $outlineId, $exerciseNo, $themeId, $scenarioId)],
            'description'=> ['description' => $this->description->read($accessId, $teamNo, $outlineId, $exerciseNo, $themeId, $scenarioId)],
            'reflection'=> ['reflection' => $this->reflection->read($accessId, $teamNo, $outlineId, $exerciseNo)],
            default => throw new \InvalidArgumentException('Unknown form_key'),
        };
    }
}