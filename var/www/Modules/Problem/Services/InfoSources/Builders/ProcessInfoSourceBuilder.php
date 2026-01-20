<?php
declare(strict_types=1);

namespace Modules\Problem\Services\InfoSources\Builders;

use Modules\Problem\Repositories\ProblemInfoSourceRepository;
use Modules\Problem\Services\InfoSources\InfoSourceKey;

final class ProcessInfoSourceBuilder
{
    public function __construct(
        private ProblemInfoSourceRepository $repo
    ) {}

    /**
     * Builds process payload:
     * {
     *   "pro_video_id": 123,
     *   "pro_diagram_link": "/common/assets/images/process_diagrams/process2_da.png"
     * }
     *
     * Stable contract:
     * - video_id not found => 0
     * - diagram link is deterministic and always returned
     */
    public function build(InfoSourceKey $k): array
    {
        $videoId = $this->repo->readProcessVideoId($k->themeId, $k->languageCode);

        return [
            'pro_video_id' => $videoId,
            'pro_diagram_link' => $this->diagramLink($k->themeId, $k->languageCode),
        ];
    }

    private function diagramLink(int $themeId, string $languageCode): string
    {
        return "/common/assets/images/process_diagrams/process{$themeId}_{$languageCode}.png";
    }
}
