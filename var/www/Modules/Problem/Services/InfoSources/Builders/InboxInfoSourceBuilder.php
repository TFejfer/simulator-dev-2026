<?php
declare(strict_types=1);

namespace Modules\Problem\Services\InfoSources\Builders;

use Modules\Problem\Repositories\ProblemInfoSourceRepository;
use Modules\Problem\Services\InfoSources\InfoSourceKey;

final class InboxInfoSourceBuilder
{
    public function __construct(
        private ProblemInfoSourceRepository $repo
    ) {}

    /**
     * Builds inbox payload:
     * {
     *   "subject": "...",
     *   "message": "..."
     * }
     *
     * Stable contract:
     * - If not found -> return empty strings (not null).
     */
    public function build(InfoSourceKey $k): array
    {
        $rows = $this->repo->readInboxTexts($k->themeId, $k->scenarioId, $k->languageCode);

        $out = ['subject' => '', 'message' => ''];

        foreach ($rows as $r) {
            $cat = (string)($r['category'] ?? '');
            $txt = (string)($r['text_value'] ?? '');

            if ($cat === 'subject') $out['subject'] = $txt;
            if ($cat === 'message') $out['message'] = $txt;
        }

        return $out;
    }
}