<?php
declare(strict_types=1);

namespace Modules\Problem\Repositories;

use PDO;

final class WorkflowLogRepository
{
	public function __construct(
		private PDO $dbRuntime
	) {}

	/**
	 * Insert a workflow/statistics event.
	 *
	 * This is skill-agnostic and should be called from service-layer
	 * in the SAME transaction as the form write.
	 *
	 * @param array{
	 *   access_id:int,
	 *   team_no:int,
	 *   outline_id:int,
	 *   exercise_no:int,
	 *   theme_id?:int|null,
	 *   scenario_id?:int|null,
	 *   step_no:int,
	 *   crud:int,
	 *   ci_id?:string|null,
	 *   action_id?:int|null,
	 *   deviation_id?:int|null,
	 *   function_id?:int|null,
	 *   info?:string|null,
	 *   actor_token?:string|null
	 * } $e
	 */
	public function insert(array $e): void
	{
		$stmt = $this->dbRuntime->prepare("
			INSERT INTO log_team_workflow (
				access_id, team_no, outline_id, exercise_no,
				theme_id, scenario_id,
				step_no, crud,
				ci_id, action_id, deviation_id, function_id,
				info, actor_token
			) VALUES (
				:access_id, :team_no, :outline_id, :exercise_no,
				:theme_id, :scenario_id,
				:step_no, :crud,
				:ci_id, :action_id, :deviation_id, :function_id,
				:info, :actor_token
			)
		");

		$stmt->execute([
			':access_id' => (int)$e['access_id'],
			':team_no' => (int)$e['team_no'],
			':outline_id' => (int)$e['outline_id'],
			':exercise_no' => (int)$e['exercise_no'],

			':theme_id' => isset($e['theme_id']) ? (int)$e['theme_id'] : null,
			':scenario_id' => isset($e['scenario_id']) ? (int)$e['scenario_id'] : null,

			':step_no' => (int)$e['step_no'],
			':crud' => (int)$e['crud'],

			':ci_id' => $e['ci_id'] ?? null,
			':action_id' => isset($e['action_id']) ? (int)$e['action_id'] : null,
			':deviation_id' => isset($e['deviation_id']) ? (int)$e['deviation_id'] : null,
			':function_id' => isset($e['function_id']) ? (int)$e['function_id'] : null,

			':info' => $e['info'] ?? null,
			':actor_token' => $e['actor_token'] ?? null,
		]);
	}
}