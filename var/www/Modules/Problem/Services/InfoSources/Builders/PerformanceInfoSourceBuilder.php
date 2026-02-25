<?php
declare(strict_types=1);

namespace Modules\Problem\Services\InfoSources\Builders;

use Modules\Problem\Repositories\ProblemInfoSourceRepository;
use Modules\Problem\Services\InfoSources\InfoSourceKey;

final class PerformanceInfoSourceBuilder
{
    public function __construct(
        private ProblemInfoSourceRepository $repo
    ) {}

    /**
     * Builds performance payload:
     * {
     *   "pes_video_id": <should>,
     *   "pea_video_id": <actual>
     * }
     *
     * Contract:
     * - Always returns ints
     * - Missing row => 0
     */
    public function build(InfoSourceKey $k): array
    {
        $vis = $this->repo->readScenarioVisibilityMap($k->themeId, $k->scenarioId, ['pes', 'pea']);
        $pesVisible = (int)($vis['pes'] ?? 0) >= 1;
        $peaVisible = (int)($vis['pea'] ?? 0) >= 1;

        $should = $pesVisible ? $this->repo->readPerformanceShouldVideoId($k->themeId) : 0;
        $actual = $peaVisible ? $this->repo->readPerformanceActualVideoId($k->themeId, $k->scenarioId, $k->state) : 0;

        return [
            'pes_video_id' => $should,
            'pea_video_id' => $actual,
        ];
    }
}