<?php
declare(strict_types=1);

namespace Modules\Problem\Services\Metrics;

use Modules\Problem\Content\Repositories\ReferenceActionsNotToTakeRepository;
use Modules\Problem\Content\Repositories\ReferenceCausesRepository;
use Modules\Problem\Content\Repositories\ReferenceFactsRepository;
use Modules\Problem\Content\Repositories\ReferenceSymptomsRepository;
use Modules\Problem\Repositories\Forms\ActionsRepository;
use Modules\Problem\Repositories\Forms\CausesRepository;
use Modules\Problem\Repositories\Forms\FactsRepository;
use Modules\Problem\Repositories\Forms\SymptomsRepository;
use Modules\Problem\Repositories\Metrics\ProblemExerciseLogRepository;
use Modules\Problem\Repositories\Metrics\ProblemMetricsRepository;
use Modules\Problem\Repositories\Metrics\ProblemSuccessCriteriaRepository;
use Modules\Problem\Repositories\Metrics\WorkflowLogReadRepository;
use Modules\Training\Auth\Repositories\ExerciseRuntimeRepository;

final class ProblemMetricsService
{
    private const STATE_VALUES = [11];

    public function __construct(
        private ExerciseRuntimeRepository $exerciseRuntimeRepo,
        private ProblemExerciseLogRepository $exerciseLogRepo,
        private WorkflowLogReadRepository $workflowRepo,
        private SymptomsRepository $symptomsRepo,
        private FactsRepository $factsRepo,
        private CausesRepository $causesRepo,
        private ActionsRepository $actionsRepo,
        private ReferenceActionsNotToTakeRepository $refActionsRepo,
        private ReferenceSymptomsRepository $refSymptomsRepo,
        private ReferenceFactsRepository $refFactsRepo,
        private ReferenceCausesRepository $refCausesRepo,
        private ProblemMetricsRepository $metricsRepo,
        private ProblemSuccessCriteriaRepository $successRepo
    ) {}

    public function computeAndPersist(int $accessId, int $teamNo, string $languageCode = 'en'): void
    {
        if ($accessId <= 0 || $teamNo <= 0) return;

        $latest = $this->exerciseRuntimeRepo->findLatestRow($accessId, $teamNo);
        if (!is_array($latest)) return;

        $stepNo = (int)($latest['step_no'] ?? 0);
        if ($stepNo !== 100) return;

        $outlineId = (int)($latest['outline_id'] ?? 0);
        $exerciseNo = (int)($latest['exercise_no'] ?? 0);
        $themeId = (int)($latest['theme_id'] ?? 0);
        $scenarioId = (int)($latest['scenario_id'] ?? 0);
        $formatId = (int)($latest['format_id'] ?? 0);
        $skillId = (int)($latest['skill_id'] ?? 0);

        if ($outlineId <= 0 || $exerciseNo <= 0 || $themeId <= 0 || $scenarioId <= 0) return;

        $hasMetrics = $this->metricsRepo->hasMetrics($accessId, $teamNo, $outlineId);
        $hasSc = $this->successRepo->hasSuccessCriteria($accessId, $teamNo, $outlineId);
        if ($hasMetrics && $hasSc) return;

        $lockKey = sprintf('problem_metrics:%d:%d:%d', $accessId, $teamNo, $outlineId);
        if (!$this->metricsRepo->acquireLock($lockKey, 2)) {
            return;
        }

        try {
            $hasMetrics = $this->metricsRepo->hasMetrics($accessId, $teamNo, $outlineId);
            $hasSc = $this->successRepo->hasSuccessCriteria($accessId, $teamNo, $outlineId);
            if ($hasMetrics && $hasSc) return;

            $exerciseArr = $this->buildExerciseArray(
                $accessId,
                $teamNo,
                $outlineId,
                $exerciseNo,
                $themeId,
                $scenarioId,
                $formatId,
                $skillId,
                $languageCode
            );

            $metrics = $this->problemMetricsCreate($exerciseArr);
            $sc = $this->problemSuccessCriteriaCreate($exerciseArr, $metrics);

            if (!$hasSc) {
                $this->successRepo->insertIfNotExists($accessId, $teamNo, $outlineId, $sc);
            }
            if (!$hasMetrics) {
                $this->metricsRepo->insertMany($accessId, $teamNo, $outlineId, $metrics);
            }
        } finally {
            $this->metricsRepo->releaseLock($lockKey);
        }
    }

    private function buildExerciseArray(
        int $accessId,
        int $teamNo,
        int $outlineId,
        int $exerciseNo,
        int $themeId,
        int $scenarioId,
        int $formatId,
        int $skillId,
        string $languageCode
    ): array {
        $teamValues = $this->problemTeamsArray($teamNo, $formatId);
        $colTeam = $this->isCollabFormat($formatId) ? $this->problemSwapCollaboratingTeam($teamNo) : $teamNo;

        $log = $this->exerciseLogRepo->findTeamExerciseLog(
            $accessId,
            $teamValues,
            $outlineId,
            $exerciseNo,
            $themeId,
            $scenarioId
        );

        $exerciseStartEpoch = $this->getExerciseStartEpoch($log);

        $workflow = $this->workflowRepo->findWorkflowData(
            $accessId,
            $teamValues,
            $teamNo,
            $colTeam,
            $outlineId,
            $exerciseNo,
            $themeId,
            $scenarioId
        );

        if ($exerciseStartEpoch > 0) {
            array_unshift($workflow, [
                'id' => 0,
                'epochTs' => $exerciseStartEpoch,
                'tix' => 0,
                'crud' => 0,
                'ciID' => null,
                'actionID' => null,
                'deviationID' => null,
                'functionID' => null,
                'info' => 'start',
                'y' => 1,
            ]);
        }

        $teamSymptoms = $this->normalizeSymptoms(
            $this->symptomsRepo->read($accessId, $teamNo, $outlineId, $exerciseNo)
        );
        $teamFacts = $this->normalizeFacts(
            $this->factsRepo->read($accessId, $teamNo, $outlineId, $exerciseNo),
            $exerciseStartEpoch
        );
        $teamActions = $this->normalizeActions(
            $this->actionsRepo->read($accessId, $teamNo, $outlineId, $exerciseNo)
        );
        $teamCauses = $this->buildTeamCauses(
            $workflow,
            $this->causesRepo->read($accessId, $teamNo, $outlineId, $exerciseNo),
            $exerciseStartEpoch
        );

        $refActionsNotToTake = $this->refActionsRepo->read($themeId, $scenarioId);
        $refSymptoms = $this->refSymptomsRepo->read($themeId, $scenarioId, self::STATE_VALUES);
        $refFacts = $this->normalizeFacts(
            $this->refFactsRepo->read($themeId, $scenarioId, self::STATE_VALUES),
            $exerciseStartEpoch
        );
        $refCauses = $this->refCausesRepo->read($themeId, $scenarioId, self::STATE_VALUES);

        return [
            'id' => $exerciseNo,
            'theme' => $themeId,
            'scenario' => $scenarioId,
            'format' => $formatId,
            'step' => 100,
            'currentState' => 11,
            'nextState' => 0,
            'log' => $log,
            'case' => [
                'symptoms' => $teamSymptoms,
                'facts' => $teamFacts,
                'causes' => $teamCauses,
                'actions' => $teamActions,
                'clarify' => null,
                'specification' => null,
            ],
            'reference' => [
                'actionsNotToTake' => $refActionsNotToTake,
                'symptoms' => $refSymptoms,
                'facts' => $refFacts,
                'causes' => $refCauses,
            ],
            'workflow' => $workflow,
            'skill' => $skillId,
            'language' => $languageCode,
        ];
    }

    /**
     * @return array<int, array{id:int, value:int, data:mixed, note:string}>
     */
    private function problemMetricsCreate(array $exercise): array
    {
        $exerciseLog = $exercise['log'] ?? [];
        $workflow = $exercise['workflow'] ?? [];

        $teamSymptoms = $exercise['case']['symptoms'] ?? [];
        $teamFacts = $exercise['case']['facts'] ?? [];
        $teamCauses = $exercise['case']['causes'] ?? [];
        $teamActions = $exercise['case']['actions'] ?? [];

        $refSymptoms = $exercise['reference']['symptoms'] ?? [];
        $refFacts = $exercise['reference']['facts'] ?? [];
        $refCauses = $exercise['reference']['causes'] ?? [];
        $refActionsNotToTake = $exercise['reference']['actionsNotToTake'] ?? [];

        $actionLog = $this->problemActionLog($exerciseLog);
        $firstCauseRelatedAction = $this->problemExerciseLogFirstCauseRelatedAction($actionLog);

        $metrics = [];

        $add = function (int $id, $value, $data, string $note) use (&$metrics) {
            $metrics[] = [
                'id' => $id,
                'value' => (int)$value,
                'data' => $data,
                'note' => $note,
            ];
        };

        $add(1, $this->metricDeviationQuality($teamSymptoms, $refSymptoms), null, 'deviation, true or false');
        $add(2, $this->metricFunctionQuality($teamSymptoms, $refSymptoms), null, 'function, true or false');
        $add(3, $this->metricCompareWhatOkArrays($teamFacts, $refFacts), null, 'what ok, true or false');
        $add(4, $this->metricCompareWhereFactArrays($teamFacts, $refFacts, 'where_not'), null, 'where not, true or false');
        $add(5, $this->metricCompareWhereFactArrays($teamFacts, $refFacts, 'where_ok'), null, 'where ok, true or false');
        $add(6, $this->metricCompareWhenFactArrays($teamFacts, $refFacts, 'when_not'), null, 'when not, true or false');
        $add(7, $this->metricCompareWhenFactArrays($teamFacts, $refFacts, 'when_ok'), null, 'when ok, true or false');

        $m8data = $this->metricCausesOnListBeforeFirstRiskyAction($teamCauses, $workflow, $firstCauseRelatedAction);
        $add(8, count($m8data), $m8data, 'causes on list before first risky action, #');

        $m9data = $this->metricAvoidableActionsIds($actionLog, $refActionsNotToTake);
        $add(9, count($m9data), $m9data, 'avoidable actions, #');

        $m10data = $this->metricActionsNotOnCauseList($actionLog, $teamCauses);
        $add(10, count($m10data), $m10data, 'actions not on list of possible causes, #');

        $m11data = $this->metricInappropriateActionOrder($actionLog);
        $add(11, count($m11data), $m11data, 'inappropriate action order, #');

        $m12data = $this->metricActionsNotLogged($actionLog, $teamActions);
        $add(12, count($m12data), $m12data, 'actions not logged, #');

        $m13 = $this->metricTimeToClarify($workflow);
        $add(13, $m13['timeTo'] - $m13['timeFrom'], $m13, 'time to clarify, sec');

        $m14 = $this->metricTimeToSpecify($workflow);
        $add(14, $m14['timeTo'] - $m14['timeFrom'], $m14, 'time to specify, sec');

        $m15 = $this->metricTimeToListCauses($workflow, $firstCauseRelatedAction);
        $add(15, $m15['timeTo'] - $m15['timeFrom'], $m15, 'time to list causes, sec');

        $m16data = $this->metricObviousLikelyCausesOnListBeforeFirstRiskyAction($teamCauses, $refCauses, $workflow, $firstCauseRelatedAction);
        $add(16, count($m16data), $m16data, 'obvious causes on list before first risky action, #');

        $m17data = $this->metricGetFluctuatingAnalysisData($workflow);
        $add(17, count($m17data), $m17data, 'process fluctuation, #');

        $m18 = $this->metricProblemStatus($actionLog);
        $add(18, $m18, null, 'problem status, 0:not-solved, 1:partly-solved, 2:solved');

        $add(19, $this->metricProblemRiskTimeCost($actionLog, 'risk'), null, 'unsuccessful fix attempts (risk), #');
        $add(20, $this->metricProblemRiskTimeCost($actionLog, 'time'), null, 'overspend time, minutes');
        $add(21, $this->metricProblemRiskTimeCost($actionLog, 'cost'), null, 'overspend cost, $');

        $m22 = $this->metricSolutionLogged($actionLog, $teamActions);
        $add(22, $m22, null, 'solution logged, true or false');

        $m23 = $this->metricCorrectCauseOnListBeforeFirstRiskyAction($actionLog, $teamCauses, $firstCauseRelatedAction);
        $add(23, $m23, null, 'correct cause on list before first risky action, true or false');

        return $metrics;
    }

    /**
     * @return array{proficiency:int, solved:int, risk:int, time_score:int, cost:int, capture:int}
     */
    private function problemSuccessCriteriaCreate(array $exercise, array $metrics): array
    {
        $actionLog = $this->problemActionLog($exercise['log'] ?? []);

        $format = (int)($exercise['format'] ?? 0);
        $skill = (int)($exercise['skill'] ?? 0);

        $getStatusScorePct = function (int $val): int {
            if ($val === 2) return 100;
            if ($val === 1) return 50;
            return 0;
        };

        $getTimeScorePct = function () use ($exercise, $actionLog, $format): int {
            if (!$this->simulatorCheckArr($exercise['log'] ?? [])) return 0;
            if (!$this->simulatorCheckArr($actionLog)) return 0;

            $fixAttempts = [];
            foreach ($actionLog as $item) {
                $type = (int)($item['actionType'] ?? 0);
                if ($type === 0 || $type === 2) {
                    $fixAttempts[] = $item;
                }
            }
            if (count($fixAttempts) === 0) return 0;

            $endTime = $this->problemExerciseLogExerciseEndTime($exercise['log']);
            $realTime = $endTime ? (int)ceil($endTime / 60) : 0;

            $actionTime = 0;
            foreach ($actionLog as $item) {
                $type = (int)($item['actionType'] ?? 0);
                if ($type === 0 || $type === 1) {
                    $actionTime += (int)($item['time'] ?? 0);
                }
            }

            $allowedInvestigationTime = ($format === 1 || $format === 11) ? 45 : 60;
            $overspendTimeMax = $allowedInvestigationTime * 5;
            $overspendTime = max(0, $actionTime + $realTime - $allowedInvestigationTime);

            $penalty = (int)round($overspendTime * 100 / $overspendTimeMax);
            return 100 - min(100, $penalty);
        };

        $getRiskScorePct = function (int $value): int {
            return max(100 - ($value * 10), 0);
        };

        $getTimeScore = function (int $totalMinutes): string {
            $hours = intdiv($totalMinutes, 60);
            $minutes = $totalMinutes % 60;
            return $hours . ' hours ' . $minutes . ' minutes';
        };

        $getCostScorePct = function () use ($actionLog, $metrics): int {
            if (!$this->simulatorCheckArr($actionLog)) return 0;

            $limitOverspend = 100000;

            $unsuccessfulFixCost = 0;
            foreach ($actionLog as $item) {
                if ((int)($item['actionType'] ?? 0) === 0) {
                    $unsuccessfulFixCost += (int)($item['cost'] ?? 0);
                }
            }

            $problemStatus = (int)$this->simulatorSearchArrOfObj($metrics, 'id', 18, 'value');
            $slaPenalty = 0;
            if ($problemStatus > 1) {
                $slaPenalty = 0;
            } elseif ($problemStatus < 1) {
                $slaPenalty = $limitOverspend;
            } else {
                $slaPenalty = (int)($limitOverspend / 2);
            }

            $overspendPct = (int)ceil($unsuccessfulFixCost * 100 / $limitOverspend) + $slaPenalty;
            return 100 - min(100, $overspendPct);
        };

        $getCaptureScore = function () use ($skill, $metrics): int {
            if ($skill === 12) {
                $val22 = (int)$this->simulatorSearchArrOfObj($metrics, 'id', 22, 'value');
                return $val22 * 100;
            }

            $capMetrics = [1, 2, 3, 4, 5, 6, 7, 22];
            $capFactors = [15, 15, 20, 7, 3, 7, 3, 30];
            $sum = 0;

            foreach ($capMetrics as $idx => $metricId) {
                $val = (int)$this->simulatorSearchArrOfObj($metrics, 'id', $metricId, 'value');
                $sum += $val * $capFactors[$idx];
            }
            return $sum;
        };

        $m18 = (int)$this->simulatorSearchArrOfObj($metrics, 'id', 18, 'value');
        $m19 = (int)$this->simulatorSearchArrOfObj($metrics, 'id', 19, 'value');
        $m20 = (int)$this->simulatorSearchArrOfObj($metrics, 'id', 20, 'value');
        $m21 = (int)$this->simulatorSearchArrOfObj($metrics, 'id', 21, 'value');

        $sc1pct = $getStatusScorePct($m18);
        $sc2pct = $getRiskScorePct($m19);
        $sc3pct = $getTimeScorePct();
        $sc4pct = $getCostScorePct();

        $capturePct = 0;
        if (!in_array($skill, [8, 12], true)) {
            $capturePct = $getCaptureScore();
        }

        $proficiencyPct = $this->computeProficiencyPct($skill, $sc1pct, $sc2pct, $sc3pct, $sc4pct, $capturePct);

        return [
            'proficiency' => $proficiencyPct,
            'solved' => $sc1pct,
            'risk' => $sc2pct,
            'time_score' => $sc3pct,
            'cost' => $sc4pct,
            'capture' => $capturePct,
        ];
    }

    private function computeProficiencyPct(
        int $skill,
        int $sc1,
        int $sc2,
        int $sc3,
        int $sc4,
        int $sc5
    ): int {
        if (in_array($skill, [8, 12], true)) {
            $total = $sc1 + $sc2 + $sc3 + $sc4;
            return (int)round($total / 4);
        }

        $total = $sc1 + $sc2 + $sc3 + $sc4 + $sc5;
        return (int)round($total / 5);
    }

    private function normalizeSymptoms(array $rows): array
    {
        $out = [];
        foreach ($rows as $row) {
            $out[] = [
                'deviationID' => (int)($row['deviation_id'] ?? 0),
                'functionID' => (int)($row['function_id'] ?? 0),
                'clarify' => (string)($row['clarify_text'] ?? ''),
                'priority' => (int)($row['is_priority'] ?? 0),
            ];
        }
        return $out;
    }

    private function normalizeFacts(array $rows, int $exerciseStartEpoch): array
    {
        $out = [];
        foreach ($rows as $row) {
            $keyMeta = (string)($row['keyMeta'] ?? $row['key_meta'] ?? '');
            $keyValue = $row['keyValue'] ?? $row['key_value'] ?? null;
            if ($keyMeta === 'when_not' || $keyMeta === 'when_ok') {
                $keyValue = $this->normalizeWhenFactValue($keyValue, $exerciseStartEpoch);
            }

            $out[] = [
                'keyMeta' => $keyMeta,
                'keyValue' => $keyValue,
                'text' => (string)($row['text'] ?? ''),
            ];
        }
        return $out;
    }

    private function normalizeActions(array $rows): array
    {
        $out = [];
        foreach ($rows as $row) {
            $out[] = [
                'ciID' => (string)($row['ci_id'] ?? ''),
                'actionID' => (int)($row['action_id'] ?? 0),
                'effect' => (string)($row['effect_text'] ?? ''),
            ];
        }
        return $out;
    }

    private function buildTeamCauses(array $workflow, array $causeRows, int $exerciseStartEpoch): array
    {
        $out = [];
        $seen = [];

        foreach ($workflow as $item) {
            $y = (int)($item['y'] ?? 0);
            $crud = (int)($item['crud'] ?? 0);
            $ciID = $item['ciID'] ?? null;

            if ($y !== 3 || $crud !== 1 || $ciID === null || $ciID === '') {
                continue;
            }

            $key = (string)$ciID;
            $out[] = [
                'ciID' => $key,
                'tix' => (int)($item['tix'] ?? 0),
                'epochTs' => (int)($item['epochTs'] ?? $exerciseStartEpoch),
            ];
            $seen[$key] = true;
        }

        foreach ($causeRows as $row) {
            $ciID = (string)($row['ci_id'] ?? '');
            if ($ciID === '' || isset($seen[$ciID])) continue;

            $out[] = [
                'ciID' => $ciID,
                'tix' => 0,
                'epochTs' => $exerciseStartEpoch,
            ];
        }

        return $out;
    }

    private function normalizeWhenFactValue($keyValue, int $exerciseStartEpoch)
    {
        if ($keyValue === null || $keyValue === '') return 0;

        if (is_numeric($keyValue)) {
            return (int)$keyValue;
        }

        if (is_string($keyValue)) {
            $decoded = json_decode($keyValue, true);
            if (is_array($decoded)) {
                return $this->computeRelativeTimestamp($decoded, $exerciseStartEpoch);
            }

            $ts = strtotime($keyValue);
            return $ts !== false ? (int)$ts : 0;
        }

        if (is_array($keyValue)) {
            return $this->computeRelativeTimestamp($keyValue, $exerciseStartEpoch);
        }

        return 0;
    }

    private function computeRelativeTimestamp(array $payload, int $exerciseStartEpoch): int
    {
        if ($exerciseStartEpoch <= 0) return 0;

        $days = (int)($payload['days'] ?? 0);
        $hours = (int)($payload['hours'] ?? 0);
        $minutes = (int)($payload['minutes'] ?? 0);

        $dayStart = strtotime(date('Y-m-d 00:00:00', $exerciseStartEpoch));
        if ($dayStart === false) return 0;

        $base = $dayStart - ($days * 86400);
        return $base + ($hours * 3600) + ($minutes * 60);
    }

    private function getExerciseStartEpoch(array $log): int
    {
        if (!$this->simulatorCheckArr($log)) return 0;
        $first = $log[0] ?? null;
        if (!is_array($first)) return 0;
        return (int)($first['epochTs'] ?? 0);
    }

    private function problemTeamsArray(int $team, int $format): array
    {
        $output = [$team];
        if (!$this->isCollabFormat($format)) return $output;

        $colTeam = $team % 2 === 0 ? $team - 1 : $team + 1;
        $output[] = $colTeam;
        return $output;
    }

    private function isCollabFormat(int $format): bool
    {
        return in_array($format, [4, 9, 11], true);
    }

    private function problemSwapCollaboratingTeam(int $teamNumber): int
    {
        return ($teamNumber % 2 === 0) ? $teamNumber - 1 : $teamNumber + 1;
    }

    private function simulatorCheckArr($arr): bool
    {
        return is_array($arr) && count($arr) > 0;
    }

    private function simulatorSearchArrOfObj(array $arr, string $field, int $value, string $returnField): int
    {
        foreach ($arr as $row) {
            if (!is_array($row)) continue;
            if ((int)($row[$field] ?? 0) === $value) {
                return (int)($row[$returnField] ?? 0);
            }
        }
        return 0;
    }

    private function problemActionLog(array $exerciseLog): array
    {
        if (!$this->simulatorCheckArr($exerciseLog)) {
            return [];
        }

        $output = [];

        foreach ($exerciseLog as $row) {
            if (!array_key_exists('ciID', $row) || $row['ciID'] === null) {
                continue;
            }

            $risk = (int)($row['risk'] ?? 0);
            $time = (int)($row['time'] ?? 0);
            $cost = (int)($row['cost'] ?? 0);
            $actionID = (int)($row['actionID'] ?? 0);
            $currentState = (int)($row['currentState'] ?? 0);
            $epochTs = (int)($row['epochTs'] ?? 0);
            $tix = (int)($row['tix'] ?? 0);
            $id = (int)($row['id'] ?? 0);
            $nextState = (int)($row['nextState'] ?? 0);
            $outcomeID = (int)($row['outcomeID'] ?? 0);
            $step = (int)($row['step'] ?? 0);

            $totalCost = ($time * 1000) + $cost;
            $actionType = ($currentState + 5 < $nextState)
                ? 2
                : ($risk === 0 ? 1 : 0);

            $output[] = array_merge($row, [
                'risk' => $risk,
                'time' => $time,
                'cost' => $cost,
                'actionID' => $actionID,
                'currentState' => $currentState,
                'epochTs' => $epochTs,
                'tix' => $tix,
                'id' => $id,
                'nextState' => $nextState,
                'outcomeID' => $outcomeID,
                'step' => $step,
                'totalCost' => $totalCost,
                'actionType' => $actionType,
            ]);
        }

        return $output;
    }

    private function problemExerciseLogExerciseEndTime(array $exerciseLog)
    {
        if (!$this->simulatorCheckArr($exerciseLog)) {
            return false;
        }

        foreach ($exerciseLog as $log) {
            if (isset($log['step']) && (int)$log['step'] >= 90) {
                return isset($log['tix']) ? (int)$log['tix'] : false;
            }
        }

        return false;
    }

    private function problemExerciseLogFirstCauseRelatedAction(array $actionLog)
    {
        if (!$this->simulatorCheckArr($actionLog)) {
            return false;
        }

        $ignored = [12, 16, 19];

        foreach ($actionLog as $row) {
            if (!in_array((int)$row['actionID'], $ignored, true)) {
                return isset($row['tix']) ? (int)$row['tix'] : false;
            }
        }

        return false;
    }

    private function metricDeviationQuality(array $teamSymptoms, array $refSymptoms): int
    {
        if (!$this->simulatorCheckArr($teamSymptoms)) {
            return 0;
        }

        $teamPrio = null;
        foreach ($teamSymptoms as $item) {
            if (!empty($item['priority']) && (int)$item['priority'] > 0) {
                $teamPrio = $item;
                break;
            }
        }
        if ($teamPrio === null) {
            return 0;
        }

        $refPrio = null;
        foreach ($refSymptoms as $item) {
            if (!empty($item['priority']) && (int)$item['priority'] > 0) {
                $refPrio = $item;
                break;
            }
        }
        if ($refPrio === null) {
            return 1;
        }

        return ((int)($teamPrio['deviationID'] ?? 0) === (int)($refPrio['deviationID'] ?? 0)) ? 1 : 0;
    }

    private function metricFunctionQuality(array $teamSymptoms, array $refSymptoms): int
    {
        if (!$this->simulatorCheckArr($teamSymptoms)) {
            return 0;
        }

        $teamPrio = null;
        foreach ($teamSymptoms as $item) {
            if (!empty($item['priority']) && (int)$item['priority'] > 0) {
                $teamPrio = $item;
                break;
            }
        }
        if ($teamPrio === null) {
            return 0;
        }

        $refPrio = null;
        foreach ($refSymptoms as $item) {
            if (!empty($item['priority']) && (int)$item['priority'] > 0) {
                $refPrio = $item;
                break;
            }
        }
        if ($refPrio === null) {
            return 1;
        }

        return ((int)($teamPrio['functionID'] ?? 0) === (int)($refPrio['functionID'] ?? 0)) ? 1 : 0;
    }

    private function metricCompareWhatOkArrays(array $teamFacts, array $refFacts): int
    {
        if (!$this->simulatorCheckArr($teamFacts) || !$this->simulatorCheckArr($refFacts)) {
            return 0;
        }

        $refArr = [];
        $hasRef = false;

        foreach ($refFacts as $rf) {
            if (($rf['keyMeta'] ?? null) === 'what_ok') {
                $hasRef = true;
                $decoded = $this->decodeWhatOkValue($rf['keyValue'] ?? null);
                if (is_array($decoded)) {
                    $refArr[] = $decoded;
                }
            }
        }

        if (!$hasRef) {
            return 1;
        }

        $teamArr = [];
        foreach ($teamFacts as $tf) {
            if (($tf['keyMeta'] ?? null) === 'what_ok') {
                $decoded = $this->decodeWhatOkValue($tf['keyValue'] ?? null);
                if (is_array($decoded)) {
                    $teamArr[] = $decoded;
                }
            }
        }

        foreach ($teamArr as $t) {
            foreach ($refArr as $r) {
                if ((int)($t['normalityID'] ?? 0) === (int)($r['normalityID'] ?? 0)
                    && (int)($t['functionID'] ?? 0) === (int)($r['functionID'] ?? 0)) {
                    return 1;
                }
            }
        }

        return 0;
    }

    private function decodeWhatOkValue($raw): ?array
    {
        if ($raw === null) return null;

        if (is_array($raw)) {
            return $this->normalizeWhatOkTuple($raw);
        }

        if (is_string($raw)) {
            $decoded = json_decode($raw, true);
            if (is_string($decoded)) {
                $decoded = json_decode($decoded, true);
            }
            if (is_array($decoded)) {
                return $this->normalizeWhatOkTuple($decoded);
            }
        }

        return null;
    }

    private function normalizeWhatOkTuple(array $tuple): ?array
    {
        if (!array_key_exists('normalityID', $tuple) || !array_key_exists('functionID', $tuple)) {
            return null;
        }

        return [
            'normalityID' => (int)$tuple['normalityID'],
            'functionID' => (int)$tuple['functionID'],
        ];
    }

    private function metricCompareWhereFactArrays(array $teamFacts, array $refFacts, string $key): int
    {
        if (!$this->simulatorCheckArr($teamFacts) || !$this->simulatorCheckArr($refFacts)) {
            return 0;
        }

        $team = [];
        $ref = [];

        foreach ($teamFacts as $f) {
            if (($f['keyMeta'] ?? null) === $key) {
                $team[] = (int)($f['keyValue'] ?? 0);
            }
        }
        foreach ($refFacts as $f) {
            if (($f['keyMeta'] ?? null) === $key) {
                $ref[] = (int)($f['keyValue'] ?? 0);
            }
        }

        sort($team);
        sort($ref);

        return $team === $ref ? 1 : 0;
    }

    private function metricCompareWhenFactArrays(array $teamFacts, array $refFacts, string $key): int
    {
        if (!$this->simulatorCheckArr($teamFacts) || !$this->simulatorCheckArr($refFacts)) {
            return 0;
        }

        $team = [];
        $ref = [];

        foreach ($teamFacts as $f) {
            if (($f['keyMeta'] ?? null) === $key) {
                $team[] = $this->simulatorConvertTimestampToEpoch($f['keyValue'] ?? null);
            }
        }
        foreach ($refFacts as $f) {
            if (($f['keyMeta'] ?? null) === $key) {
                $ref[] = $this->simulatorConvertTimestampToEpoch($f['keyValue'] ?? null);
            }
        }

        sort($team);
        sort($ref);

        return $team === $ref ? 1 : 0;
    }

    private function simulatorConvertTimestampToEpoch($value): int
    {
        if ($value === null || $value === '') return 0;

        if (is_numeric($value)) {
            return (int)$value;
        }

        if (is_string($value)) {
            $ts = strtotime($value);
            return $ts !== false ? (int)$ts : 0;
        }

        return 0;
    }

    private function metricCausesOnListBeforeFirstRiskyAction(array $teamCauses, array $workflow, $firstCauseRelatedAction): array
    {
        if (!$this->simulatorCheckArr($teamCauses) || !$this->simulatorCheckArr($workflow)) {
            return [];
        }

        $firstTix = (int)$firstCauseRelatedAction;

        $teamCiSet = [];
        foreach ($teamCauses as $item) {
            $tix = (int)($item['tix'] ?? 0);
            if ($firstTix > 0 && $tix >= $firstTix) {
                continue;
            }
            if (!isset($item['ciID'])) {
                continue;
            }
            $ci = $item['ciID'];
            $teamCiSet[(string)$ci] = true;
        }

        $wfSorted = $workflow;
        usort($wfSorted, static function ($a, $b) {
            return (int)($a['tix'] ?? 0) <=> (int)($b['tix'] ?? 0);
        });

        $causeRowStatus = [];
        foreach ($wfSorted as $item) {
            $tix = (int)($item['tix'] ?? 0);
            if ($firstTix > 0 && $tix >= $firstTix) {
                break;
            }

            $crud = (int)($item['crud'] ?? 0);
            $y = (int)($item['y'] ?? 0);
            $info = $item['info'] ?? null;

            if ($y === 3 && ($crud === 1 || $crud === 4) && $info !== null && $info !== '') {
                $key = (string)$info;
                if (!isset($causeRowStatus[$key])) {
                    $causeRowStatus[$key] = ['create' => false, 'delete' => false];
                }
                if ($crud === 1) {
                    $causeRowStatus[$key]['create'] = true;
                } elseif ($crud === 4) {
                    $causeRowStatus[$key]['delete'] = true;
                }
            }
        }

        $fullyRemovedInfos = [];
        foreach ($causeRowStatus as $info => $st) {
            if (!empty($st['create']) && !empty($st['delete'])) {
                $fullyRemovedInfos[$info] = true;
            }
        }

        $ciNet = [];
        foreach ($wfSorted as $item) {
            $tix = (int)($item['tix'] ?? 0);
            if ($firstTix > 0 && $tix >= $firstTix) {
                break;
            }

            $ciID = $item['ciID'] ?? null;
            if ($ciID === null || $ciID === '') {
                continue;
            }

            $crud = (int)($item['crud'] ?? 0);
            $key = (string)$ciID;
            $prev = $ciNet[$key] ?? 0;

            if ($crud === 1) {
                $ciNet[$key] = $prev + 1;
            } elseif ($crud === 4) {
                $ciNet[$key] = max(0, $prev - 1);
            }
        }

        $presentCi = [];
        foreach ($ciNet as $ci => $cnt) {
            if ($cnt > 0) {
                $presentCi[$ci] = true;
            }
        }

        $seen = [];
        $result = [];

        foreach ($wfSorted as $item) {
            $tix = (int)($item['tix'] ?? 0);
            if ($firstTix > 0 && $tix >= $firstTix) {
                break;
            }

            $y = (int)($item['y'] ?? 0);
            $ciID = $item['ciID'] ?? null;
            $info = $item['info'] ?? null;

            if ($y !== 3) {
                continue;
            }
            if ($ciID === null) {
                continue;
            }

            $ciKey = (string)$ciID;

            if (empty($teamCiSet[$ciKey])) {
                continue;
            }
            if (empty($presentCi[$ciKey])) {
                continue;
            }

            if ($info !== null && $info !== '' && !empty($fullyRemovedInfos[(string)$info])) {
                continue;
            }

            if (!empty($seen[$ciKey])) {
                continue;
            }

            $seen[$ciKey] = true;
            $result[] = (int)($item['id'] ?? 0);
        }

        return $result;
    }

    private function metricAvoidableActionsIds(array $actionLog, array $refActionsNotToTake): array
    {
        if (!$this->simulatorCheckArr($actionLog) || !$this->simulatorCheckArr($refActionsNotToTake)) {
            return [];
        }

        $ciSet = [];
        foreach ($refActionsNotToTake as $item) {
            if (isset($item['ciID'])) {
                $ciSet[(string)$item['ciID']] = true;
            }
        }

        $result = [];
        foreach ($actionLog as $item) {
            $ciID = $item['ciID'] ?? null;
            $actionType = (int)($item['actionType'] ?? 0);
            $currentState = (int)($item['currentState'] ?? 0);

            if ($ciID === null) {
                continue;
            }

            if (!empty($ciSet[(string)$ciID]) && $actionType !== 1 && $currentState < 20) {
                $result[] = (int)($item['id'] ?? 0);
            }
        }

        return $result;
    }

    private function metricActionsNotOnCauseList(array $actionLog, array $teamCauses): array
    {
        if (!$this->simulatorCheckArr($actionLog) || !$this->simulatorCheckArr($teamCauses)) {
            return [];
        }

        $ignore = [12, 16, 19];

        $causeTimes = [];
        foreach ($teamCauses as $cause) {
            $ciID = $cause['ciID'] ?? null;
            $epochTs = (int)($cause['epochTs'] ?? 0);
            if ($ciID === null) {
                continue;
            }
            $key = (string)$ciID;
            $prev = $causeTimes[$key] ?? PHP_INT_MAX;
            if ($epochTs < $prev) {
                $causeTimes[$key] = $epochTs;
            }
        }

        $result = [];
        foreach ($actionLog as $item) {
            $currentState = (int)($item['currentState'] ?? 0);
            if ($currentState >= 20) {
                continue;
            }

            $actionID = (int)($item['actionID'] ?? 0);
            if (in_array($actionID, $ignore, true)) {
                continue;
            }

            $ciID = $item['ciID'] ?? null;
            $epochTs = (int)($item['epochTs'] ?? 0);

            if ($ciID === null) {
                continue;
            }

            $key = (string)$ciID;
            $timely = isset($causeTimes[$key]) && $causeTimes[$key] < $epochTs;

            if (!$timely) {
                $result[] = (int)($item['id'] ?? 0);
            }
        }

        return $result;
    }

    private function metricInappropriateActionOrder(array $actionLog): array
    {
        if (!$this->simulatorCheckArr($actionLog)) {
            return [];
        }

        $tempArr = [];
        foreach ($actionLog as $item) {
            if ((int)($item['currentState'] ?? 0) < 100) {
                $tempArr[] = $item;
            }
        }

        $count = count($tempArr);
        $result = [];

        for ($i = 1; $i < $count; $i++) {
            $prev = $tempArr[$i - 1];
            $curr = $tempArr[$i];

            $prevType = (int)($prev['actionType'] ?? 0);
            $currType = (int)($curr['actionType'] ?? 0);
            $prevCost = (int)($prev['totalCost'] ?? 0);
            $currCost = (int)($curr['totalCost'] ?? 0);

            if (!($prevType === 2 && $currType === 2) && $currCost < $prevCost) {
                $result[] = (int)($prev['id'] ?? 0);
            }
        }

        return $result;
    }

    private function metricActionsNotLogged(array $actionLog, array $teamActions): array
    {
        if (!$this->simulatorCheckArr($actionLog) || !$this->simulatorCheckArr($teamActions)) {
            return [];
        }

        $tmp1 = [];
        foreach ($actionLog as $item) {
            $actionID = (int)($item['actionID'] ?? 0);
            $currentState = (int)($item['currentState'] ?? 0);

            if ($actionID !== 19 && $currentState < 20) {
                $ciID = $item['ciID'] ?? '';
                $valKey = $ciID . '-' . $actionID;
                $tmp1[] = [
                    'id' => (int)($item['id'] ?? 0),
                    'val' => $valKey,
                ];
            }
        }

        $tmp2 = [];
        foreach ($teamActions as $item) {
            $ciID = $item['ciID'] ?? '';
            $actionID = (int)($item['actionID'] ?? 0);
            $tmp2[] = $ciID . '-' . $actionID;
        }

        $result = [];
        foreach ($tmp1 as $row) {
            if (!in_array($row['val'], $tmp2, true)) {
                $result[] = $row['id'];
            }
        }

        return $result;
    }

    private function metricTimeToClarify(array $workflow): array
    {
        if (!$this->simulatorCheckArr($workflow)) {
            return ['timeFrom' => 0, 'timeTo' => 0];
        }

        $tmp = [];
        $reversed = array_reverse($workflow);
        foreach ($reversed as $item) {
            if ((int)($item['crud'] ?? 0) === 9) {
                $tmp[] = (int)($item['tix'] ?? 0);
            }
        }

        $timeTo = $tmp[0] ?? 0;
        if ($timeTo > 0) {
            return ['timeFrom' => 1, 'timeTo' => $timeTo];
        }

        return ['timeFrom' => 0, 'timeTo' => 0];
    }

    private function metricTimeToSpecify(array $workflow): array
    {
        if (!$this->simulatorCheckArr($workflow)) {
            return ['timeFrom' => 0, 'timeTo' => 0];
        }

        $tmp1 = [];
        foreach ($workflow as $item) {
            if ((int)($item['y'] ?? 0) === 2) {
                $tmp1[] = (int)($item['tix'] ?? 0);
            }
        }
        $timeFrom = $tmp1[0] ?? 0;

        $tmp2 = [];
        $reversed = array_reverse($workflow);
        foreach ($reversed as $item) {
            if ((int)($item['y'] ?? 0) === 2) {
                $tmp2[] = (int)($item['tix'] ?? 0);
            }
        }
        $timeTo = $tmp2[0] ?? 0;

        if ($timeTo > 0) {
            return ['timeFrom' => $timeFrom, 'timeTo' => $timeTo];
        }

        return ['timeFrom' => 0, 'timeTo' => 0];
    }

    private function metricTimeToListCauses(array $workflow, $firstCauseRelatedAction): array
    {
        if (!$this->simulatorCheckArr($workflow)) {
            return ['timeFrom' => 0, 'timeTo' => 0];
        }

        $firstTix = (int)$firstCauseRelatedAction;

        $tmp = [];
        foreach ($workflow as $item) {
            $tix = (int)($item['tix'] ?? 0);
            $y = (int)($item['y'] ?? 0);
            $crud = (int)($item['crud'] ?? 0);

            if ($firstTix > 0 && $tix >= $firstTix) {
                continue;
            }
            if ($y === 3 && $crud === 1) {
                $tmp[] = $tix;
            }
        }

        sort($tmp);
        if (count($tmp) < 1) {
            return ['timeFrom' => 0, 'timeTo' => 0];
        }

        return [
            'timeFrom' => (int)$tmp[0],
            'timeTo' => (int)$tmp[count($tmp) - 1],
        ];
    }

    private function metricObviousLikelyCausesOnListBeforeFirstRiskyAction(
        array $teamCauses,
        array $refCauses,
        array $workflow,
        $firstCauseRelatedAction
    ): array {
        if (!$this->simulatorCheckArr($teamCauses) || !$this->simulatorCheckArr($refCauses) || !$this->simulatorCheckArr($workflow)) {
            return [];
        }

        $firstTix = (int)$firstCauseRelatedAction;

        $mostLikelySet = [];
        foreach ($refCauses as $item) {
            if (isset($item['ciID'])) {
                $mostLikelySet[(string)$item['ciID']] = true;
            }
        }

        $teamCiSet = [];
        foreach ($teamCauses as $item) {
            $tix = (int)($item['tix'] ?? 0);
            $ciID = $item['ciID'] ?? null;
            if ($ciID === null) {
                continue;
            }
            if ($firstTix > 0 && $tix >= $firstTix) {
                continue;
            }
            $key = (string)$ciID;
            if (!empty($mostLikelySet[$key])) {
                $teamCiSet[$key] = true;
            }
        }

        $workflowBeforeRisky = [];
        foreach ($workflow as $item) {
            $tix = (int)($item['tix'] ?? 0);
            if ($firstTix > 0 && $tix >= $firstTix) {
                continue;
            }
            $workflowBeforeRisky[] = $item;
        }

        $causeRowStatus = [];
        foreach ($workflowBeforeRisky as $item) {
            $crud = (int)($item['crud'] ?? 0);
            $y = (int)($item['y'] ?? 0);
            $info = $item['info'] ?? null;

            if ($y === 3 && ($crud === 1 || $crud === 4) && $info !== null) {
                $key = (string)$info;
                if (!isset($causeRowStatus[$key])) {
                    $causeRowStatus[$key] = ['create' => false, 'delete' => false];
                }

                if ($crud === 1) {
                    $causeRowStatus[$key]['create'] = true;
                }
                if ($crud === 4) {
                    $causeRowStatus[$key]['delete'] = true;
                }
            }
        }

        $fullyRemovedInfos = [];
        foreach ($causeRowStatus as $info => $status) {
            if (!empty($status['create']) && !empty($status['delete'])) {
                $fullyRemovedInfos[$info] = true;
            }
        }

        $cleanedWorkflow = [];
        foreach ($workflowBeforeRisky as $item) {
            $crud = (int)($item['crud'] ?? 0);
            $y = (int)($item['y'] ?? 0);
            $info = $item['info'] ?? null;

            if ($y === 3 && ($crud === 1 || $crud === 4) && $info !== null) {
                if (!empty($fullyRemovedInfos[(string)$info])) {
                    continue;
                }
            }

            $cleanedWorkflow[] = $item;
        }

        usort($cleanedWorkflow, static function ($a, $b) {
            return (int)($a['tix'] ?? 0) <=> (int)($b['tix'] ?? 0);
        });

        $ciToFirstWorkflowId = [];
        foreach ($cleanedWorkflow as $item) {
            $tix = (int)($item['tix'] ?? 0);
            $y = (int)($item['y'] ?? 0);
            $ciID = $item['ciID'] ?? null;

            if ($firstTix > 0 && $tix >= $firstTix) {
                break;
            }
            if ($y !== 3) {
                continue;
            }
            if ($ciID === null) {
                continue;
            }

            $key = (string)$ciID;
            if (empty($teamCiSet[$key])) {
                continue;
            }

            if (!isset($ciToFirstWorkflowId[$key])) {
                $ciToFirstWorkflowId[$key] = (int)($item['id'] ?? 0);
            }
        }

        return array_values($ciToFirstWorkflowId);
    }

    private function metricGetFluctuatingAnalysisData(array $workflow): array
    {
        if (!$this->simulatorCheckArr($workflow)) {
            return [];
        }

        $ignore = [12, 16, 19];
        $tArr = [];
        foreach ($workflow as $item) {
            $actionID = (int)($item['actionID'] ?? 0);
            if (!in_array($actionID, $ignore, true)) {
                $tArr[] = $item;
            }
        }

        $result = [];
        $count = count($tArr);

        for ($i = 1; $i < $count; $i++) {
            $prev = $tArr[$i - 1];
            $curr = $tArr[$i];

            if (($curr['y'] ?? null) !== ($prev['y'] ?? null)) {
                $result[] = (int)($curr['id'] ?? 0);
            }
        }

        return $result;
    }

    private function metricProblemStatus(array $actionLog): int
    {
        if (!$this->simulatorCheckArr($actionLog)) {
            return 0;
        }

        $maxNextState = 0;
        foreach ($actionLog as $item) {
            $ns = (int)($item['nextState'] ?? 0);
            if ($ns > $maxNextState) {
                $maxNextState = $ns;
            }
        }

        if ($maxNextState > 90) {
            return 2;
        }
        if ($maxNextState > 20) {
            return 1;
        }
        return 0;
    }

    private function metricProblemRiskTimeCost(array $actionLog, string $key): int
    {
        if (!$this->simulatorCheckArr($actionLog)) {
            return 0;
        }

        $sum = 0;
        foreach ($actionLog as $item) {
            $actionType = (int)($item['actionType'] ?? 0);
            if ($actionType === 0) {
                $sum += (int)($item[$key] ?? 0);
            }
        }
        return $sum;
    }

    private function metricSolutionLogged(array $actionLog, array $teamActions): int
    {
        if (!$this->simulatorCheckArr($actionLog) || !$this->simulatorCheckArr($teamActions)) {
            return 0;
        }

        $last = $actionLog[count($actionLog) - 1] ?? null;
        if ($last === null || (int)($last['nextState'] ?? 0) !== 99) {
            return 0;
        }

        $correctiveActions = [];
        foreach ($actionLog as $item) {
            if ((int)($item['actionType'] ?? 0) === 2 && (int)($item['currentState'] ?? 0) < 20) {
                $correctiveActions[] = $item;
            }
        }

        foreach ($correctiveActions as $ca) {
            $ciID = $ca['ciID'] ?? null;
            $action = (int)($ca['actionID'] ?? 0);
            $found = false;

            foreach ($teamActions as $ta) {
                if (($ta['ciID'] ?? null) === $ciID && (int)($ta['actionID'] ?? 0) === $action) {
                    $found = true;
                    break;
                }
            }

            if (!$found) {
                return 0;
            }
        }

        return 1;
    }

    private function metricCorrectCauseOnListBeforeFirstRiskyAction(array $actionLog, array $teamCauses, $firstCauseRelatedAction): int
    {
        if (!$this->simulatorCheckArr($actionLog) || !$this->simulatorCheckArr($teamCauses)) {
            return 0;
        }

        $firstTix = (int)$firstCauseRelatedAction;

        $ciIDsBefore = [];
        foreach ($teamCauses as $item) {
            $tix = (int)($item['tix'] ?? 0);
            $ciID = $item['ciID'] ?? null;
            if ($ciID === null) {
                continue;
            }
            if ($firstTix > 0 && $tix < $firstTix) {
                $ciIDsBefore[] = $ciID;
            }
        }

        $firstIterationCorrectiveAction = null;
        foreach ($actionLog as $item) {
            $currentState = (int)($item['currentState'] ?? 0);
            $nextState = (int)($item['nextState'] ?? 0);

            if ($currentState < 20 && $nextState > 20) {
                $firstIterationCorrectiveAction = $item;
                break;
            }
        }

        if ($firstIterationCorrectiveAction === null) {
            return 0;
        }

        $ciID = $firstIterationCorrectiveAction['ciID'] ?? null;
        if ($ciID === null) {
            return 0;
        }

        return in_array($ciID, $ciIDsBefore, true) ? 1 : 0;
    }
}
