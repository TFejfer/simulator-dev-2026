<?php
declare(strict_types=1);

namespace Modules\Shared\Services\SharedContent\Builders;

use Modules\Shared\Contracts\PayloadBuilderInterface;
use Modules\Shared\Repositories\SharedContentTextsRepository;
use Modules\Shared\Repositories\SharedExerciseParametersRepository;

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
    public function __construct(
        private SharedContentTextsRepository $repo,
        private ?SharedExerciseParametersRepository $exerciseParamsRepo = null
    ) {}

    public function build(array $ctx): array
    {
        $lang = strtolower(trim((string)($ctx['language_code'] ?? '')));
        if ($lang === '') {
            throw new \InvalidArgumentException('language_code is required');
        }

        $schemaVersion = (int)($ctx['schema_version'] ?? 1);

        $payload = [
            'schema_version' => $schemaVersion,
            'bucket' => 'shared_content',
            'language_code' => $lang,

            // COMMON CONTENT
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

            // PROBLEM SKILL CONTENT
            'troubleshooting_methods' => $this->repo->rowsToMap(
                $this->repo->readTroubleshootingMethodRows($lang)
            ),
            'problem_terms' => $this->repo->rowsToMap(
                $this->repo->readProblemTermsRows($lang)
            ),
            'deviations' => $this->repo->rowsToMap(
                $this->repo->readDeviationsRows($lang)
            ),
            'deviation_explanation' => $this->repo->rowsToMap(
                $this->repo->readDeviationExplainationRows($lang)
            ),
            
            'functions' => $this->repo->readFunctionsRows($lang),
            'normality' => $this->repo->rowsToMap(
                $this->repo->readNormalityRows($lang)
            ),
            'cause_deviations' => $this->repo->rowsToMap(
                $this->repo->readCauseDeviationRows($lang)
            ),
            'introduction_terms' => $this->repo->readIntroductionTermsRows($lang),
            'kt_terms' => $this->repo->rowsToMap(
                $this->repo->readKtTermsRows($lang)
            ),
            'ci_actions' => $this->repo->rowsToMap(
                $this->repo->readCiActionsRows($lang)
            ),
            
            // RISK SKILL CONTENT
            'risk_terms' => $this->repo->rowsToMap(
                $this->repo->readRiskTermsRows($lang)
            ),
            'avoid_methods' => $this->repo->rowsToMap(
                $this->repo->readAvoidMethodRows($lang)
            ),

            // RCA SKILL CONTENT
            'rca_terms' => $this->repo->rowsToMap(
                $this->repo->readRcaTermsRows($lang)
            ),
        ];

        // Static exercise parameters (language-agnostic)
        if ($this->exerciseParamsRepo) {
            $payload['exercise_parameters'] = $this->exerciseParamsRepo->readAll();
        }

        return $payload;
    }
}