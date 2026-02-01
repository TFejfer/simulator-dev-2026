<?php
declare(strict_types=1);

namespace Modules\Problem\Services;

use Modules\Problem\Repositories\ThemeConfigurationItems;
use Modules\Problem\Services\InfoSources\InfoSourceKey;

final class ThemeConfigurationItemsService
{
    public function __construct(private ThemeConfigurationItems $repo) {}

    /**
     * Builds process payload:
     */
    public function build(InfoSourceKey $k): array
    {
        $themeId = (int)$k->themeId;
        $languageCode = strtolower(trim($k->languageCode));

        if ($themeId <= 0) return [];

        // 1) Load CI rows (theme + language)
        $cis = $this->repo->themeConfigurationItems($themeId, $languageCode);
        if (!$cis) return [];

        // 2) Load mapping rows (ci_type_id -> action_id)
        $rows = $this->repo->themeConfigurationItemActions($themeId);

        // 3) Build lookup: [ci_type_id => [action_id => true]] (dedupe safe)
        $byType = [];
        foreach ($rows as $r) {
            if (!isset($r['ci_type_id'], $r['action_id'])) continue;

            $type = (int)$r['ci_type_id'];
            $aid  = (int)$r['action_id'];

            if ($type <= 0 || $aid <= 0) continue;

            $byType[$type][$aid] = true;
        }

        // 4) Fold actions into each CI
        foreach ($cis as &$ci) {
            $type = isset($ci['ci_type_id']) ? (int)$ci['ci_type_id'] : 0;

            if ($type > 0 && isset($byType[$type])) {
                // Unique list, sorted ascending
                $actions = array_map('intval', array_keys($byType[$type]));
                sort($actions, SORT_NUMERIC);
                $ci['actions'] = $actions;
            } else {
                $ci['actions'] = [];
            }

            // Optional: make sure types are consistent
            $ci['ci_type_id'] = $type;
            $ci['ci_id'] = (string)($ci['ci_id'] ?? '');
            $ci['ci_text'] = (string)($ci['ci_text'] ?? '');
        }
        unset($ci);

        return $cis;
    }
}
