<?php
declare(strict_types=1);

namespace Modules\Problem\Repositories;

use PDO;
use PDOException;

final class ProblemMenuVisibilityRepository
{
	public function __construct(
		private PDO $dbProblemContent
	) {}

	/**
	 * Returns visibility map { code => 0|1|2 } for Problem info-source buttons.
	 *
	 * Inputs:
	 * - format_id, step_no, position_count, role_id
	 * - theme_id, scenario_id
	 *
	 * Rule:
	 * - A source_code is visible if format.is_visible=1 AND scenario.is_visible=1.
	 * - Badge is applied when visible and format.has_badge=1.
	 *
	 * Derived buttons:
	 * - per (Performance) derived from pes + pea (visible if either visible)
	 * - log (System log) derived from sls + sla (visible if either visible)
	 */
	public function resolveVisibility(
		int $formatId,
		int $stepNo,
		int $positionCount,
		int $roleId,
		int $themeId,
		int $scenarioId
	): array {
		// Defensive guards
		if ($formatId <= 0 || $stepNo <= 0 || $positionCount <= 0 || $roleId <= 0) return [];
		if ($themeId <= 0 || $scenarioId <= 0) return [];

		// 1) Load format rows (visible+badge)
		$formatMap = []; // code => [visible, badge]
		try {
			$stmt = $this->dbProblemContent->prepare("
				SELECT source_code, is_visible, has_badge
				FROM problem_visibility_info_sources_format
				WHERE format_id = :format_id
				  AND step_no = :step_no
				  AND position_count = :position_count
				  AND role_id = :role_id
			");
			$stmt->execute([
				':format_id' => $formatId,
				':step_no' => $stepNo,
				':position_count' => $positionCount,
				':role_id' => $roleId,
			]);

			$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
			foreach ($rows as $r) {
				$code = (string)($r['source_code'] ?? '');
				if ($code === '') continue;
				$formatMap[$code] = [
					'visible' => (int)($r['is_visible'] ?? 0),
					'badge' => (int)($r['has_badge'] ?? 0),
				];
			}
		} catch (PDOException) {
			return [];
		}

		// 2) Load scenario rows (visible only)
		$scenarioVisible = []; // code => visible
		try {
			$stmt = $this->dbProblemContent->prepare("
				SELECT source_code, is_visible
				FROM problem_visibility_info_sources_scenario
				WHERE theme_id = :theme_id
				  AND scenario_id = :scenario_id
			");
			$stmt->execute([
				':theme_id' => $themeId,
				':scenario_id' => $scenarioId,
			]);

			$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
			foreach ($rows as $r) {
				$code = (string)($r['source_code'] ?? '');
				if ($code === '') continue;
				$scenarioVisible[$code] = (int)($r['is_visible'] ?? 0);
			}
		} catch (PDOException) {
			return [];
		}

		// 3) Combine
		$out = [];

		$codes = ['inb','exc','pro','mai','pes','pea','sls','sla','act'];

		foreach ($codes as $c) {
			$f = $formatMap[$c] ?? ['visible' => 0, 'badge' => 0];
			$s = $scenarioVisible[$c] ?? 0;

			$visible = ($f['visible'] >= 1 && $s >= 1) ? 1 : 0;
			if ($visible === 0) {
				$out[$c] = 0;
				continue;
			}

			$out[$c] = ($f['badge'] >= 1) ? 2 : 1;
		}

		// 4) Derived buttons: per and log (as in legacy intent)
		$pes = $out['pes'] ?? 0;
		$pea = $out['pea'] ?? 0;
		$sls = $out['sls'] ?? 0;
		$sla = $out['sla'] ?? 0;

		$out['per'] = ($pes > 0 || $pea > 0) ? (max($pes, $pea)) : 0;
		$out['log'] = ($sls > 0 || $sla > 0) ? (max($sls, $sla)) : 0;

		// You likely do NOT have menu buttons for pes/pea/sls/sla,
		// but keeping them does not hurt. Menu rendering will ignore unknown codes.

		return $out;
	}
}