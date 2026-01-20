<?php
declare(strict_types=1);

namespace Modules\Shared\Repositories;

use PDO;

final class SharedContentTextsRepository
{
    public function __construct(private PDO $dbSharedContent) {}

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

    /**
     * Returns ALL menu buttons (includes skill_id) so the client can filter by exercise_meta.skill_id.
     *
     * Return rows:
     * [
     *   ['key_code'=>..., 'code'=>..., 'icon_class'=>..., 'item_type'=>..., 'context'=>..., 'sequence_no'=>..., 'skill_id'=>..., 'text_value'=>...],
     *   ...
     * ]
     */
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

    private function readKeyTextRows(string $masterTable, string $transTable, string $languageCode): array
    {
        $languageCode = strtolower(trim($languageCode));

        $sql = "
            SELECT
                m.key_code,
                COALESCE(NULLIF(TRIM(t.translated_text), ''), m.source_text) AS text_value
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
