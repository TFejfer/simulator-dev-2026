<?php
declare(strict_types=1);

namespace Modules\Shared\Repositories;

use PDO;
use InvalidArgumentException;

final class SharedContentTextsRepository
{
    public function __construct(private PDO $dbSharedContent) {}

    // COMMON CONTENT
    public function readCommonTerminologyRows(string $languageCode): array
    {
        return $this->readKeyTextRows(
            masterTable: 'i18n_common_terminology_master',
            transTable:  'i18n_common_terminology_translations',
            languageCode: $languageCode
        );
    }

    public function readFormatRows(string $languageCode): array
    {
        return $this->readKeyTextRows(
            masterTable: 'i18n_format_master',
            transTable:  'i18n_format_translations',
            languageCode: $languageCode
        );
    }

    public function readThemeRows(string $languageCode): array
    {
        return $this->readKeyTextRows(
            masterTable: 'i18n_themes_master',
            transTable:  'i18n_themes_translations',
            languageCode: $languageCode
        );
    }

    public function readMenuButtonRows(string $languageCode): array
    {
        return $this->readKeyTextRows(
            masterTable: 'i18n_menu_buttons_master',
            transTable:  'i18n_menu_buttons_translations',
            languageCode: $languageCode,
            extraMasterCols: [
                'code',
                'icon_class',
                'item_type',
                'context',
                'sequence_no',
                'skill_id',
            ],
            allowedMasterCols: [
                'code',
                'icon_class',
                'item_type',
                'context',
                'sequence_no',
                'skill_id',
            ]
        );
    }

    public function readFaqQuestionRows(string $languageCode): array
    {
        return $this->readKeyTextRows(
            masterTable: 'i18n_faq_questions_master',
            transTable:  'i18n_faq_questions_translations',
            languageCode: $languageCode
        );
    }

    public function readFaqAnswerRows(string $languageCode): array
    {
        return $this->readKeyTextRows(
            masterTable: 'i18n_faq_answers_master',
            transTable:  'i18n_faq_answers_translations',
            languageCode: $languageCode
        );
    }

    // PROBLEM SKILL CONTENT
    public function readTroubleshootingMethodRows(string $languageCode): array
    {
        return $this->readKeyTextRows(
            masterTable: 'i18n_troubleshooting_method_master',
            transTable:  'i18n_troubleshooting_method_translations',
            languageCode: $languageCode
        );
    }

    public function readProblemTermsRows(string $languageCode): array
    {
        return $this->readKeyTextRows(
            masterTable: 'i18n_problem_terms_master',
            transTable:  'i18n_problem_terms_translations',
            languageCode: $languageCode
        );
    }

    public function readDeviationsRows(string $languageCode): array
    {
        return $this->readKeyTextRows(
            masterTable: 'i18n_deviations_master',
            transTable:  'i18n_deviations_translations',
            languageCode: $languageCode
        );
    }

    public function readDeviationExplainationRows(string $languageCode): array
    {
        return $this->readKeyTextRows(
            masterTable: 'i18n_deviation_explanation_master',
            transTable:  'i18n_deviation_explanation_translations',
            languageCode: $languageCode
        );
    }

    public function readFunctionsRows(string $languageCode): array
    {
        return $this->readKeyTextRows(
            masterTable: 'i18n_functions_master',
            transTable:  'i18n_functions_translations',
            languageCode: $languageCode,
            extraMasterCols: [
                'theme_id',
                'function_id',
            ],
            allowedMasterCols: [
                'theme_id',
                'function_id',
            ]
        );
    }

    public function readNormalityRows(string $languageCode): array
    {
        return $this->readKeyTextRows(
            masterTable: 'i18n_normality_master',
            transTable:  'i18n_normality_translations',
            languageCode: $languageCode
        );
    }

    public function readCauseDeviationRows(string $languageCode): array
    {
        return $this->readKeyTextRows(
            masterTable: 'i18n_cause_deviation_master',
            transTable:  'i18n_cause_deviation_translations',
            languageCode: $languageCode
        );
    }

    public function readIntroductionTermsRows(string $languageCode): array
    {
        return $this->readKeyTextRows(
            masterTable: 'i18n_problem_intro_master',
            transTable:  'i18n_problem_intro_translations',
            languageCode: $languageCode,
            extraMasterCols: [
                'theme_id',
                'scenario_id',
                'task_code',
                'category',
                'sequence_no',
                'correct_answer',
            ],
            allowedMasterCols: [
                'theme_id',
                'scenario_id',
                'task_code',
                'category',
                'sequence_no',
                'correct_answer',
            ]
        );
    }

    public function readKtTermsRows(string $languageCode): array
    {
        return $this->readKeyTextRows(
            masterTable: 'i18n_kt_terms_master',
            transTable:  'i18n_kt_terms_translations',
            languageCode: $languageCode
        );
    }

    public function readCiActionsRows(string $languageCode): array
    {
        return $this->readKeyTextRows(
            masterTable: 'i18n_ci_actions_master',
            transTable:  'i18n_ci_actions_translations',
            languageCode: $languageCode
        );
    }

    public function readProblemResultTermsRows(string $languageCode): array
    {
        return $this->readKeyTextRows(
            masterTable: 'i18n_problem_result_terms_master',
            transTable:  'i18n_problem_result_terms_translations',
            languageCode: $languageCode,
            extraMasterCols: [
                'type_code',
                'item_id',
                'item_element',
                'sequence_no',
            ],
            allowedMasterCols: [
                'type_code',
                'item_id',
                'item_element',
                'sequence_no',
            ]
        );
    }

    // RISK SKILL CONTENT
    public function readRiskTermsRows(string $languageCode): array
    {
        return $this->readKeyTextRows(
            masterTable: 'i18n_risk_terms_master',
            transTable:  'i18n_risk_terms_translations',
            languageCode: $languageCode
        );
    }

    public function readAvoidMethodRows(string $languageCode): array
    {
        return $this->readKeyTextRows(
            masterTable: 'i18n_avoid_method_master',
            transTable:  'i18n_avoid_method_translations',
            languageCode: $languageCode
        );
    }

    // RCA SKILL CONTENT
    public function readRcaTermsRows(string $languageCode): array
    {
        return $this->readKeyTextRows(
            masterTable: 'i18n_rca_terms_master',
            transTable:  'i18n_rca_terms_translations',
            languageCode: $languageCode
        );
    }

    /**
     * Returns ALL menu buttons (includes skill_id) so the client can filter by exercise_meta.skill_id.
     *
     * Return rows:
     * [
     *   ['key_code'=>..., 'code'=>..., 'icon_class'=>..., 'item_type'=>..., 'context'=>..., 'sequence_no'=>..., 'skill_id'=>..., 'text_value'=>...],
     *   ...
     * ]
     */
    /*
    public function readMenuButtonRows(string $languageCode): array
    {
        $languageCode = strtolower(trim($languageCode));

        $sql = "
            SELECT
                m.key_code,
                m.code,
                m.icon_class,
                m.item_type,
                m.context,
                m.sequence_no,
                m.skill_id,
                COALESCE(NULLIF(TRIM(t.translated_text), ''), m.source_text) AS text_value
            FROM i18n_menu_buttons_master m
            LEFT JOIN i18n_menu_buttons_translations t
                   ON t.master_id = m.id
                  AND t.language_code = :language_code
            ORDER BY m.sequence_no ASC, m.id ASC
        ";

        $st = $this->dbSharedContent->prepare($sql);
        $st->execute([':language_code' => $languageCode]);

        return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }
        */

    /**
     * Convert rows [key_code,text_value] into a map key=>text.
     * Note: if key_code exists more than once, later rows overwrite earlier rows.
     */
    public function rowsToMap(array $rows): array
    {
        $out = [];
        foreach ($rows as $r) {
            if (!isset($r['key_code'])) {
                continue;
            }
            $out[(string)$r['key_code']] = (string)($r['text_value'] ?? '');
        }
        return $out;
    }

    /**
     * Read i18n rows as: key_code + text_value (+ optional extra columns).
     *
     * Security note:
     * - Table names and column names cannot be bound parameters in PDO.
     * - Therefore: wrappers MUST pass only known table names, and extra columns MUST be whitelisted.
     *
     * @param string   $masterTable     e.g. 'i18n_kt_terms_master'
     * @param string   $transTable      e.g. 'i18n_kt_terms_translations'
     * @param string   $languageCode
     * @param string[] $extraMasterCols Extra columns from master table (e.g. ['theme_id','scenario_id',...])
     * @param string[] $allowedMasterCols Whitelist for this call (must include every entry from $extraMasterCols)
     * @return array<int, array<string,mixed>>
     */
    private function readKeyTextRows(
        string $masterTable,
        string $transTable,
        string $languageCode,
        array $extraMasterCols = [],
        array $allowedMasterCols = []
    ): array {
        $languageCode = strtolower(trim($languageCode));

        // Validate extra columns against whitelist (per-wrapper).
        if ($extraMasterCols) {
            $allowed = array_fill_keys($allowedMasterCols, true);

            foreach ($extraMasterCols as $col) {
                $col = trim($col);

                // Hard format check: identifiers only (no spaces, commas, functions, etc.)
                if (!preg_match('/^[a-zA-Z_][a-zA-Z0-9_]*$/', $col)) {
                    throw new InvalidArgumentException("Invalid column name: {$col}");
                }
                if (!isset($allowed[$col])) {
                    throw new InvalidArgumentException("Column not allowed for this query: {$col}");
                }
            }
        }

        $extraSelect = '';
        if ($extraMasterCols) {
            // Always qualify with m. to avoid ambiguity and to keep it simple.
            $parts = array_map(static fn(string $c): string => "m.{$c}", $extraMasterCols);
            $extraSelect = ",\n                " . implode(",\n                ", $parts);
        }

        $sql = "
            SELECT
                m.key_code,
                COALESCE(NULLIF(TRIM(t.translated_text), ''), m.source_text) AS text_value
                {$extraSelect}
            FROM {$masterTable} m
            LEFT JOIN {$transTable} t
                ON t.master_id = m.id
            AND t.language_code = :language_code
            ORDER BY m.id ASC
        ";

        $st = $this->dbSharedContent->prepare($sql);
        $st->execute([':language_code' => $languageCode]);

        return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
    }
}
