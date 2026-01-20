<?php
declare(strict_types=1);

namespace Modules\Problem\Services\InfoSources\Builders;

use Modules\Problem\Repositories\ProblemInfoSourceRepository;
use Modules\Problem\Services\InfoSources\InfoSourceKey;

/**
 * SystemLogInfoSourceBuilder
 *
 * Responsibility:
 * - Fetch parsed system log rows (SLS = "should", SLA = "actual")
 * - Apply:
 *   - SLA exception mapping (same-as scenario/state)
 *   - Message template i18n (fallback to EN)
 *   - Constant i18n (colors, gates, targets, etc.)
 *   - Legacy client formatting: [no,time,source,destination,info]
 *
 * Output contract:
 * {
 *   "sls": [ [no,time,source,destination,info], ... ],
 *   "sla": [ [no,time,source,destination,info], ... ] // empty if SLA table does not exist
 * }
 */
final class SystemLogInfoSourceBuilder
{
    public function __construct(
        private ProblemInfoSourceRepository $repo
    ) {}

    public function build(InfoSourceKey $k): array
    {
        // ------------------------------------------------------------
        // 1) SLS ("should") always: systemlog__sls<theme>
        // ------------------------------------------------------------
        $slsTable   = sprintf('systemlog__sls%02d', $k->themeId);
        $slsRowsRaw = $this->repo->readSystemLogParsedRows($slsTable);
        $sls        = $this->formatRows($slsRowsRaw, $k->languageCode);

        // ------------------------------------------------------------
        // 2) SLA ("actual") table is scenario/state specific.
        //    Apply same-as mapping if configured, and return [] if table
        //    does not exist.
        // ------------------------------------------------------------
        [$effScenario, $effState] = $this->resolveSlaScenarioState($k);

        $slaTable = sprintf('systemlog__sla%02d%02d%02d', $k->themeId, $effScenario, $effState);
        $sla      = [];

        if ($this->repo->contentTableExists($slaTable)) {
            $slaRowsRaw = $this->repo->readSystemLogParsedRows($slaTable);
            $sla        = $this->formatRows($slaRowsRaw, $k->languageCode);
        }

        return ['sls' => $sls, 'sla' => $sla];
    }

    /**
     * SLA exception mapping:
     * system_log_exceptions_sla can point this (theme,scenario,state) to another
     * (same_as_scenario_id, same_as_state).
     */
    private function resolveSlaScenarioState(InfoSourceKey $k): array
    {
        $effScenario = $k->scenarioId;
        $effState    = $k->state;

        $ex = $this->repo->readSlaException([
            ':theme_id'    => $k->themeId,
            ':scenario_id' => $k->scenarioId,
            ':state'       => $k->state,
        ]);

        if ($ex) {
            $effScenario = (int)$ex['same_as_scenario_id'];
            $effState    = (int)$ex['same_as_state'];
        }

        return [$effScenario, $effState];
    }

    /**
     * Convert parsed rows to legacy client format:
     * [log_number, log_time, source_label, destination_label, info_text]
     */
    private function formatRows(array $rows, string $languageCode): array
    {
        if (!$rows) {
            return [];
        }

        // ------------------------------------------------------------
        // 1) Collect msg_keys (after last-resort normalization) and CI type ids
        //    so we can bulk-load templates and CI labels.
        // ------------------------------------------------------------
        $msgKeys = [];
        $typeIds = [];

        foreach ($rows as $r) {
			if (!empty($r['msg_key'])) {
				$msgKeys[] = (string)$r['msg_key'];
			}

			// Add msg_type translation keys (REQ/ACK/RSP)
			$mt = (string)($r['msg_type'] ?? '');
			if ($mt !== '') {
				$msgKeys[] = 'systemlog.msg_type.' . $mt;
			}

			$src = (string)($r['log_source'] ?? '');
			$dst = (string)($r['log_destination'] ?? '');

			if (preg_match('/^([0-9]{2})[A-Z]$/', $src, $m)) $typeIds[] = (int)$m[1];
			if (preg_match('/^([0-9]{2})[A-Z]$/', $dst, $m)) $typeIds[] = (int)$m[1];
		}

        $msgKeys = array_values(array_unique($msgKeys));
        $typeIds = array_values(array_unique($typeIds));

        $templates = $this->repo->readSystemLogMessageTemplates($msgKeys, $languageCode);
        $ciLabels  = $this->repo->readCiTypeLabels($typeIds, $languageCode);

        // ------------------------------------------------------------
        // 2) Prefetch constant translations (colors/gates/targets/etc.)
        // ------------------------------------------------------------
        $constantKeyCodesNeeded = $this->collectConstantKeyCodes($rows);
        $constants              = $this->repo->readSystemLogConstantsByKeyCodes($constantKeyCodesNeeded, $languageCode);

        // ------------------------------------------------------------
        // 3) Build legacy output rows
        // ------------------------------------------------------------
        $out = [];

        foreach ($rows as $r) {
            $logNumber = (int)($r['log_number'] ?? 0);
            $logTime   = (string)($r['log_time'] ?? '0');

            $srcLabel = $this->formatCiEndpoint((string)($r['log_source'] ?? ''), $ciLabels);
            $dstLabel = $this->formatCiEndpoint((string)($r['log_destination'] ?? ''), $ciLabels);

            $rawKey = (string)($r['msg_key'] ?? '');
            $msgKey = $this->normalizeMsgKey($rawKey);

            $infoText = $this->formatInfoText(
                $msgKey,
                (string)($r['msg_type'] ?? ''),
                $r['args_json'] ?? null,
                (string)($r['msg_body'] ?? ''),
                $templates,
                $constants
            );

            $out[] = [$logNumber, $logTime, $srcLabel, $dstLabel, $infoText];
        }

        return $out;
    }

    /**
     * Last-resort msg_key normalization.
     * This protects you if some tables still contain legacy strings.
     *
     * IMPORTANT: Prefer fixing this in DB cleanup, but this avoids regressions
     * while you're migrating/validating.
     */
    private function normalizeMsgKey(string $msgKey): string
    {
        $k = trim($msgKey);
        if ($k === '') return '';

        return match ($k) {
            'Position {color}',
            'Position {color} {degrees} degrees' => 'position.color',
            default => $k,
        };
    }

    /**
     * Legacy formatting:
     * - "54A" => "{CI label} A"
     * - suffix "O" => do not append suffix
     */
    private function formatCiEndpoint(string $code, array $ciLabels): string
    {
        if (!preg_match('/^([0-9]{2})([A-Z])$/', $code, $m)) {
            return $code;
        }

        $typeId = (int)$m[1];
        $suffix = (string)$m[2];

        $base = $ciLabels[$typeId] ?? (string)$typeId;

        if (strtoupper($suffix) === 'O') return $base;

        return $base . ' ' . $suffix;
    }

    /**
     * Build final info text:
     * - template comes from msg_key i18n (repo should fallback to EN)
     * - args_json supplies placeholder replacements
     * - prefix with msg_type (REQ/RSP/ACK) when available
     *
     * Fallback:
     * - If msg_key/template missing -> msg_body (as-is)
     */
    private function formatInfoText(
    string $msgKey,
    string $msgType,
    mixed $argsJson,
    string $msgBodyFallback,
    array $templates,
    array $constants
	): string {
		// 1) Resolve message body template (msg_key -> i18n template, fallback to msg_body)
		$template = ($msgKey !== '') ? ($templates[$msgKey] ?? '') : '';
		if ($template === '') {
			// No template found => keep legacy behavior by falling back to raw msg_body
			$template = $msgBodyFallback;
		}
		if ($template === '') {
			return '';
		}

		// 2) Decode args_json and normalize common migration mistakes
		$args = $this->decodeArgs($argsJson);
		$args = $this->normalizeArgsForMsgKey($msgKey, $args);

		// 3) Translate constants (colors/targets/gates/left/right) if present
		foreach (['target', 'color', 'gate', 'left', 'right'] as $k) {
			if (!isset($args[$k]) || !is_scalar($args[$k])) continue;
			$args[$k] = $this->translateConstantToken((string)$args[$k], $constants);
		}

		// Optional placeholder used by some translations
		if (!isset($args['unit'])) $args['unit'] = '';

		// 4) Apply placeholder replacements in the template
		$text = $template;
		foreach ($args as $k => $v) {
			if (!is_scalar($v)) continue;
			$text = str_replace('{' . $k . '}', (string)$v, $text);
		}

		// 5) Prefix with translated msg_type (REQ/ACK/RSP) if available
		$type = strtoupper(trim($msgType));
		if ($type === 'REQ' || $type === 'RSP' || $type === 'ACK') {
			$typeKey = 'systemlog.msg_type.' . $type;

			// NOTE: we reuse $templates because it's already "translation OR source_text" fallback.
			// If the msg_type key is missing entirely, fallback to raw REQ/ACK/RSP.
			$typeLabel = $templates[$typeKey] ?? $type;

			return trim($typeLabel . ' ' . $text);
		}

		return $text;
	}

    /**
     * Normalize args_json keys/values to match your i18n templates.
     *
     * Typical migration errors you've seen:
     * - speed.value stored {"speed":"-25"} but template uses {value}
     * - rotation_sensor.value stored {"degrees":"470"} but template uses {value}
     * - position strings sometimes store "470 degrees" in degrees -> strip unit
     */
    private function normalizeArgsForMsgKey(string $msgKey, array $args): array
    {
        // If template expects {value} but args uses a domain-specific field name:
        if (!isset($args['value'])) {
            if ($msgKey === 'speed.value' && isset($args['speed'])) {
                $args['value'] = (string)$args['speed'];
            } elseif ($msgKey === 'distance.value' && isset($args['distance'])) {
                $args['value'] = (string)$args['distance'];
            } elseif ($msgKey === 'angle.value' && isset($args['angle'])) {
                $args['value'] = (string)$args['angle'];
            } elseif ($msgKey === 'rotation_sensor.value' && isset($args['degrees'])) {
                $args['value'] = (string)$args['degrees'];
            } elseif ($msgKey === 'reflected_light.value' && isset($args['pct'])) {
                $args['value'] = (string)$args['pct'];
            }
        }

        // Templates that use {threshold} sometimes get "distance" or "value" incorrectly.
        // Keep threshold if present; do nothing otherwise.

        // Clean up "470 degrees" -> "470" when it is clearly numeric-with-unit
        foreach (['degrees','value'] as $k) {
            if (!isset($args[$k]) || !is_scalar($args[$k])) continue;
            $v = trim((string)$args[$k]);
            if (preg_match('/^-?\d+\s*degrees$/i', $v)) {
                $args[$k] = (string)(int)trim(str_ireplace('degrees', '', $v));
            }
        }

        return $args;
    }

    private function decodeArgs(mixed $argsJson): array
    {
        if (is_string($argsJson) && $argsJson !== '') {
            $decoded = json_decode($argsJson, true);
            return is_array($decoded) ? $decoded : [];
        }
        if (is_array($argsJson)) return $argsJson;

        return [];
    }

    /**
     * Translation strategy:
     * 1) If token looks like KEY.CODE and exists in constants -> translate directly.
     * 2) Otherwise map common raw values to your constant key_codes.
     */
    private function translateConstantToken(string $token, array $constants): string
    {
        $t = trim($token);
        if ($t === '') return '';

        // 1) Already a constant key_code (preferred)
        if (preg_match('/^[A-Z_]+\.[A-Z0-9_]+$/', $t)) {
            return $constants[$t] ?? $t;
        }

        // 2) Fallback mappings (raw English-like values)
        foreach (['Black','Blue','Green','Red','Yellow','White'] as $c) {
            if (strcasecmp($t, $c) === 0) {
                $kc = 'COLOR.' . strtoupper($c);
                return $constants[$kc] ?? $t;
            }
        }
        if (strcasecmp($t, 'No color') === 0) {
            return $constants['COLOR.NONE'] ?? $t;
        }

        if (preg_match('/^Gate\s*([ABC])$/i', $t, $m)) {
            $kc = 'GATE.' . strtoupper($m[1]);
            return $constants[$kc] ?? $t;
        }
        if (preg_match('/^[ABC]$/', strtoupper($t))) {
            $kc = 'GATE.' . strtoupper($t);
            return $constants[$kc] ?? $t;
        }

        if (strcasecmp($t, 'Truck') === 0) {
            return $constants['TARGET.TRUCK'] ?? $t;
        }
        if (strcasecmp($t, 'red line') === 0) {
            return $constants['TARGET.RED_LINE'] ?? $t;
        }

        return $t;
    }

    /**
     * Collect constant key_codes needed for translation.
     * If args already store key_codes, we just collect those.
     * Otherwise we infer minimal key_codes based on common values.
     */
    private function collectConstantKeyCodes(array $rows): array
    {
        $need = [];

        foreach ($rows as $r) {
            $args = $this->decodeArgs($r['args_json'] ?? null);

            foreach (['target','color','gate','left','right'] as $k) {
                if (!isset($args[$k]) || !is_scalar($args[$k])) continue;
                $t = trim((string)$args[$k]);

                // Already key_code
                if (preg_match('/^[A-Z_]+\.[A-Z0-9_]+$/', $t)) {
                    $need[] = $t;
                    continue;
                }

                // Fallback inference
                foreach (['Black','Blue','Green','Red','Yellow','White'] as $c) {
                    if (strcasecmp($t, $c) === 0) $need[] = 'COLOR.' . strtoupper($c);
                }
                if (strcasecmp($t, 'No color') === 0) $need[] = 'COLOR.NONE';

                if (preg_match('/^Gate\s*([ABC])$/i', $t, $m)) $need[] = 'GATE.' . strtoupper($m[1]);
                if (preg_match('/^[ABC]$/', strtoupper($t))) $need[] = 'GATE.' . strtoupper($t);

                if (strcasecmp($t, 'Truck') === 0) $need[] = 'TARGET.TRUCK';
                if (strcasecmp($t, 'red line') === 0) $need[] = 'TARGET.RED_LINE';
            }
        }

        return array_values(array_unique($need));
    }
}