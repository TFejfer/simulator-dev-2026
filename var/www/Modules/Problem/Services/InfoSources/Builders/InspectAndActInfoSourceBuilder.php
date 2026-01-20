<?php
declare(strict_types=1);

namespace Modules\Problem\Services\InfoSources\Builders;

use Modules\Problem\Repositories\ProblemInfoSourceRepository;
use Modules\Problem\Services\InfoSources\InfoSourceKey;

final class InspectAndActInfoSourceBuilder
{
    public function __construct(
        private ProblemInfoSourceRepository $repo
    ) {}

    public function build(InfoSourceKey $k): array
    {
        // 1) Find override row for this exact (theme, scenario, state)
        $row = $this->repo->readActionListOverride([
            ':theme_id'    => $k->themeId,
            ':scenario_id' => $k->scenarioId,
            ':state'       => $k->state,
        ]);

        // 2) Default: NO visual faults => scenario/state = 00/00
        $effScenario = 0;
        $effState    = 0;

        if ($row) {
            // If there is a match, use scenario/state unless "same-as" overrides are set
            $effScenario = ($row['new_scenario_id'] !== null)
                ? (int)$row['new_scenario_id']
                : (int)$k->scenarioId;

            $effState = ($row['new_state'] !== null)
                ? (int)$row['new_state']
                : (int)$k->state;
        }

        // 3) Folder name (actionTTSSAA) - 2-digit padded
        $webrotateXmlFolder = sprintf(
            'action%02d%02d%02d',
            (int)$k->themeId,
            $effScenario,
            $effState
        );

        // 4) File name = folder + language code (NO underscore)
        $webrotateXmlFileName = $webrotateXmlFolder . (string)$k->languageCode;

        // 5) Cabling map (theme-specific)
        $rows = $this->repo->readCablingMapRows([
            ':theme_id' => $k->themeId,
        ]);

        return [
            'webrotateXmlFolder'   => $webrotateXmlFolder,
            'webrotateXmlFileName' => $webrotateXmlFileName,
            'cabling_map' => array_map(static fn(array $r) => [
                'cu_ci_id'        => (string)$r['cu_ci_id'],
                'port_code'       => (string)$r['port_code'],
                'connected_ci_id' => (string)$r['connected_ci_id'],
            ], $rows),
        ];
    }
}