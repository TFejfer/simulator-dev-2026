<?php
declare(strict_types=1);

namespace Engine\Publish;

/**
 * PublishKey
 *
 * Generates stable, unique keys for published JSON payloads.
 * Keys must be deterministic and never depend on untrusted client input.
 *
 * We intentionally include:
 * - the payload scope name (shared/exercise_static/exercise_state)
 * - module name for exercise payloads (problem/risk/rca) to avoid collisions
 * - content-identifying dimensions (theme/scenario/state/lang)
 * - schema_version so you can change JSON format safely later
 */
final class PublishKey
{
    /**
     * shared_content is delivery-scoped:
     * It follows the language.
     *
     * shared_content:{lang}:v{schema}
     */
    public static function sharedContent(string $languageCode, int $schemaVersion): string
    {
        $lang = strtolower(trim($languageCode));
        if ($lang === '') {
            throw new \InvalidArgumentException('languageCode is required');
        }
        return sprintf('shared_content:%s:v%d', $lang, $schemaVersion);
    }

    /**
     * exercise_static_content is content-scoped:
     * It can be reused across deliveries when theme/scenario/lang are the same.
     *
     * exercise_static_content:{module}:{theme}:{scenario}:{lang}:v{schema}
     */
    public static function exerciseStaticContent(
        string $module,
        int $themeId,
        int $scenarioId,
        string $languageCode,
        int $schemaVersion
    ): string {
        $module = strtolower(trim($module));
        if ($module === '') {
            throw new \InvalidArgumentException('module is required');
        }

        $lang = strtolower(trim($languageCode));
        if ($lang === '') {
            throw new \InvalidArgumentException('languageCode is required');
        }

        return sprintf(
            'exercise_static_content:%s:%d:%d:%s:v%d',
            $module, $themeId, $scenarioId, $lang, $schemaVersion
        );
    }

    /**
     * exercise_state_content is content+state scoped:
     * Reusable across deliveries if theme/scenario/state/lang match.
     *
     * exercise_state_content:{module}:{theme}:{scenario}:{state}:{lang}:v{schema}
     */
    public static function exerciseStateContent(
        string $module,
        int $themeId,
        int $scenarioId,
        int $state,
        string $languageCode,
        int $schemaVersion
    ): string {
        $module = strtolower(trim($module));
        if ($module === '') {
            throw new \InvalidArgumentException('module is required');
        }

        $lang = strtolower(trim($languageCode));
        if ($lang === '') {
            throw new \InvalidArgumentException('languageCode is required');
        }

        // Optional safety clamp (state should be <100)
        if ($state < 0) $state = 0;
        if ($state > 99) $state = 99;

        return sprintf(
            'exercise_state_content:%s:%d:%d:%d:%s:v%d',
            $module, $themeId, $scenarioId, $state, $lang, $schemaVersion
        );
    }
}