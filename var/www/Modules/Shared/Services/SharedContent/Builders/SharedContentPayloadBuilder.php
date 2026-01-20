<?php
declare(strict_types=1);

namespace Modules\Shared\Services\SharedContent\Builders;

use Modules\Shared\Contracts\PayloadBuilderInterface;
use Modules\Shared\Repositories\SharedContentTextsRepository;

/**
 * SharedContentPayloadBuilder
 *
 * Builds shared_content JSON for a given language_code.
 * This includes simulator-wide shared text tables used by all modules (problem/risk/rca).
 *
 * IMPORTANT:
 * - Do NOT include session meta (rights, teams, tokens).
 * - Only include content that is safe and needed by the client.
 * - Keep it deterministic: same DB inputs => same JSON output.
 */
final class SharedContentPayloadBuilder implements PayloadBuilderInterface
{
    public function __construct(private SharedContentTextsRepository $repo) {}

    public function build(array $ctx): array
    {
        $lang = strtolower(trim((string)($ctx['language_code'] ?? '')));
        if ($lang === '') {
            throw new \InvalidArgumentException('language_code is required');
        }

        $schemaVersion = (int)($ctx['schema_version'] ?? 1);

        return [
            'schema_version' => $schemaVersion,
            'bucket' => 'shared_content',
            'language_code' => $lang,

            'common_terms' => $this->repo->rowsToMap(
                $this->repo->readCommonTerminologyRows($lang)
            ),
            'formats' => $this->repo->rowsToMap(
                $this->repo->readFormatRows($lang)
            ),
            'themes' => $this->repo->rowsToMap(
                $this->repo->readThemeRows($lang)
            ),

            // full list; client filters by exercise_meta.skill_id
            'menu_buttons' => $this->repo->readMenuButtonRows($lang),

            'faq_questions' => $this->repo->rowsToMap(
                $this->repo->readFaqQuestionRows($lang)
            ),
            'faq_answers' => $this->repo->rowsToMap(
                $this->repo->readFaqAnswerRows($lang)
            ),
        ];
    }
}