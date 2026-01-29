<?php
declare(strict_types=1);

/**
 * /var/www/ajax/problem/_forms_bootstrap.php
 *
 * Shared bootstrap for Problem forms endpoints.
 *
 * Responsibilities:
 * - Validate session + delivery_meta
 * - Parse JSON/POST input
 * - Provide scope (access_id, team_no, outline_id, exercise_no)
 * - Provide actor_token (session_token)
 * - Provide theme_id/scenario_id for upsert-style forms
 *
 * Endpoints should remain thin:
 * - validate + map request -> service call
 * - return JSON { ok, data, error }
 */

use Modules\Problem\Support\Request;

final class ProblemFormsBootstrap
{
	/** @return array{meta:array, in:array, scope:array, actor_token:string, theme_id:int, scenario_id:int} */
	public static function init(): array
	{
		$meta = $_SESSION['delivery_meta'] ?? null;
		if (!is_array($meta)) {
			http_response_code(401);
			echo json_encode(['ok' => false, 'data' => null, 'error' => 'Missing delivery_meta'], JSON_UNESCAPED_UNICODE);
			exit;
		}

		$accessId = (int)($meta['access_id'] ?? 0);
		$teamNo = (int)($meta['team_no'] ?? 0);
		$deliveryId = (int)($meta['delivery_id'] ?? 0);

		// Actor token is used for:
		// - write attribution (actor_token)
		// - polling exclusion (client filters its own token)
		$actorToken = (string)($meta['session_token'] ?? ($_SESSION['session_token'] ?? ''));

		if ($accessId <= 0 || $deliveryId <= 0) {
			http_response_code(422);
			echo json_encode(['ok' => false, 'data' => null, 'error' => 'Missing access_id or delivery_id'], JSON_UNESCAPED_UNICODE);
			exit;
		}

		if ($teamNo <= 0) {
			// Team guard should handle this client-side, but keep endpoint safe.
			echo json_encode([
				'ok' => true,
				'data' => [
					'_guard' => 'team_no<=0',
				],
				'error' => null
			], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
			exit;
		}

		if ($actorToken === '') {
			http_response_code(401);
			echo json_encode(['ok' => false, 'data' => null, 'error' => 'Missing session_token'], JSON_UNESCAPED_UNICODE);
			exit;
		}

		$in = Request::input();

		// Scope fields: prefer request values; fallback to meta.
		$outlineId = Request::int($in, 'outline_id', (int)($meta['outline_id'] ?? 0));
		$exerciseNo = Request::int($in, 'exercise_no', 0);

		if ($outlineId <= 0 || $exerciseNo <= 0) {
			http_response_code(422);
			echo json_encode(['ok' => false, 'data' => null, 'error' => 'Missing outline_id or exercise_no'], JSON_UNESCAPED_UNICODE);
			exit;
		}

		$themeId = Request::int($in, 'theme_id', (int)($meta['theme_id'] ?? 0));
		$scenarioId = Request::int($in, 'scenario_id', (int)($meta['scenario_id'] ?? 0));

		session_write_close();

		return [
			'meta' => $meta,
			'in' => $in,
			'scope' => [
				'access_id' => $accessId,
				'team_no' => $teamNo,
				'delivery_id' => $deliveryId,
				'outline_id' => $outlineId,
				'exercise_no' => $exerciseNo,
			],
			'actor_token' => $actorToken,
			'theme_id' => $themeId,
			'scenario_id' => $scenarioId,
		];
	}
}