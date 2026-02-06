<?php
declare(strict_types=1);

namespace Modules\Problem\Services\InfoSources\Builders;

use Modules\Problem\Repositories\ProblemInfoSourceRepository;
use Modules\Problem\Services\InfoSources\InfoSourceKey;

final class MaintenanceInfoSourceBuilder
{
    public function __construct(
        private ProblemInfoSourceRepository $repo
    ) {}

    /**
     * Builds maintenance payload:
     * {
     *   "history": [
     *     {
     *       "sentence": "...",
     *       "days_back": 0,
     *       "time_start": "08:06 am",
     *       "time_end": null,
     *       "item_date": "2026-01-06"
     *     }
     *   ],
     *   "monthly": ["...", "..."]
     * }
     *
     * Contract:
     * - Always arrays (never null)
     * - Missing translation -> fallback handled in repo
     * - Missing term -> empty string
     */
    public function build(InfoSourceKey $k): array
    {
        $rowsHistory = $this->repo->readMaintenanceHistoryRows($k->themeId, $k->scenarioId);
        $rowsMonthly = $this->repo->readMaintenanceMonthlySentenceIds($k->themeId);

        $history = [];
        foreach ($rowsHistory as $r) {
            $sentenceId = (int)($r['sentence_id'] ?? 0);

            $history[] = [
                'sentence'   => $sentenceId > 0 ? $this->repo->readMaintenanceTermText($sentenceId, $k->languageCode) : '',
                'days_back'  => (int)($r['days_back'] ?? 0),
                'time_start' => (string)($r['time_start'] ?? ''),
                'time_end'   => ($r['time_end'] ?? null) !== null ? (string)$r['time_end'] : null,
                // From SQL DATE_SUB(CURDATE(), INTERVAL days_back DAY)
                'item_date'  => (string)($r['item_date'] ?? ''),
                'is_monthly' => $sentenceId === 72 ? true : false,
            ];
        }

        $monthly = [];
        foreach ($rowsMonthly as $r) {
            $sentenceId = (int)($r['sentence_id'] ?? 0);
            $monthly[] = $sentenceId > 0 ? $this->repo->readMaintenanceTermText($sentenceId, $k->languageCode) : '';
        }

        return [
            'history' => $history,
            'monthly' => $monthly,
        ];
    }
}