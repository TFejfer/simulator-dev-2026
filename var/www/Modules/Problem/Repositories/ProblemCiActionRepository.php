<?php
declare(strict_types=1);

namespace Modules\Problem\Repositories;

use PDO;
use Throwable;

final class ProblemCiActionRepository
{
	public function __construct(private PDO $dbProblemContent) {}

	/**
	 * @return array{cost:int, time_min:int}|null
	 */
	public function findActionTimeAndCost(int $ciTypeId, int $actionId): ?array
	{
		if ($ciTypeId <= 0 || $actionId <= 0) return null;

		try {
			$stmt = $this->dbProblemContent->prepare("
				SELECT cost, time_min
				FROM problem_ci_action_time_and_cost
				WHERE ci_type_id = :ci_type_id
				  AND action_id  = :action_id
				LIMIT 1
			");
			$stmt->execute([
				':ci_type_id' => $ciTypeId,
				':action_id' => $actionId,
			]);

			$row = $stmt->fetch(PDO::FETCH_ASSOC);
			if ($row === false) return null;

			return [
				'cost' => (int)($row['cost'] ?? 0),
				'time_min' => (int)($row['time_min'] ?? 0),
			];
		} catch (Throwable) {
			return null;
		}
	}

	/**
	 * Resolves outcome_id/next_state for an action.
	 * Mirrors legacy fallback behavior by trying progressively broader matches.
	 *
	 * Priority (highest first):
	 *  4) theme+scenario+current_state+ci_id+action_id
	 *  3) theme+scenario+current_state=0+ci_id+action_id
	 *  2) theme=0+scenario=0+current_state=0+ci_id+action_id
	 *  1) theme=0+scenario=0+current_state=0+ci_id+action_id=0
	 *  0) theme=0+scenario=0+current_state=0+ci_id='00O'+action_id=0
	 *
	 * For any match except priority 4, next_state falls back to current_state.
	 *
	 * @return array{outcome_id:int, next_state:int}|null
	 */
	public function findActionOutcome(int $themeId, int $scenarioId, int $currentState, string $ciId, int $actionId): ?array
	{
		$ciId = trim($ciId);
		// theme_id / scenario_id may be 0 in fallback rows
		if ($currentState <= 0 || $ciId === '' || $actionId <= 0) return null;

		try {
			// Use positional placeholders; some PDO setups struggle with repeated named params in UNION queries.
			$stmt = $this->dbProblemContent->prepare("
				SELECT outcome_id, next_state, priority
				FROM (
					SELECT
						outcome_id,
						next_state,
						CASE WHEN outcome_id IS NOT NULL AND outcome_id <> 0 THEN 4 ELSE 0 END AS priority
					FROM problem_ci_action_next_state
					WHERE theme_id = ?
					  AND scenario_id = ?
					  AND current_state = ?
					  AND ci_id = ?
					  AND action_id = ?

					UNION ALL

					SELECT
						outcome_id,
						next_state,
						CASE WHEN outcome_id IS NOT NULL AND outcome_id <> 0 THEN 3 ELSE 0 END AS priority
					FROM problem_ci_action_next_state
					WHERE theme_id = ?
					  AND scenario_id = ?
					  AND current_state = 0
					  AND ci_id = ?
					  AND action_id = ?

					UNION ALL

					SELECT
						outcome_id,
						next_state,
						CASE WHEN outcome_id IS NOT NULL AND outcome_id <> 0 THEN 2 ELSE 0 END AS priority
					FROM problem_ci_action_next_state
					WHERE theme_id = 0
					  AND scenario_id = 0
					  AND current_state = 0
					  AND ci_id = ?
					  AND action_id = ?

					UNION ALL

					SELECT
						outcome_id,
						next_state,
						CASE WHEN outcome_id IS NOT NULL AND outcome_id <> 0 THEN 1 ELSE 0 END AS priority
					FROM problem_ci_action_next_state
					WHERE theme_id = 0
					  AND scenario_id = 0
					  AND current_state = 0
					  AND ci_id = ?
					  AND action_id = 0

					UNION ALL

					SELECT
						outcome_id,
						next_state,
						CASE WHEN outcome_id IS NOT NULL AND outcome_id <> 0 THEN 0 ELSE 0 END AS priority
					FROM problem_ci_action_next_state
					WHERE theme_id = 0
					  AND scenario_id = 0
					  AND current_state = 0
					  AND ci_id = '00O'
					  AND action_id = 0
				) x
				ORDER BY priority DESC
				LIMIT 1
			");
			$stmt->execute([
				$themeId, $scenarioId, $currentState, $ciId, $actionId,
				$themeId, $scenarioId, $ciId, $actionId,
				$ciId, $actionId,
				$ciId,
			]);

			$row = $stmt->fetch(PDO::FETCH_ASSOC);
			if ($row === false) return null;

			$priority = (int)($row['priority'] ?? 0);
			$nextState = (int)($row['next_state'] ?? 0);
			if ($priority !== 4) {
				$nextState = $currentState;
			}

			return [
				'outcome_id' => (int)($row['outcome_id'] ?? 0),
				'next_state' => $nextState,
			];
		} catch (Throwable) {
			return null;
		}
	}
}
