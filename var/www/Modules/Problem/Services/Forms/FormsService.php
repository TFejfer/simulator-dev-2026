<?php
declare(strict_types=1);

namespace Modules\Problem\Services\Forms;

use PDO;
use Throwable;
use Modules\Problem\DTO\FormRequest;
use Modules\Problem\DTO\FormResponse;
use Modules\Problem\DTO\FormConflictResponse;

use Modules\Problem\Repositories\Forms\FormVersionRepository;
use Modules\Problem\Repositories\Forms\SymptomsRepository;
use Modules\Problem\Repositories\Forms\FactsRepository;
use Modules\Problem\Repositories\Forms\CausesRepository;
use Modules\Problem\Repositories\Forms\ActionsRepository;
use Modules\Problem\Repositories\Forms\IterationsRepository;
use Modules\Problem\Repositories\Forms\DescriptionRepository;
use Modules\Problem\Repositories\Forms\ReflectionsRepository;
use Modules\Problem\Repositories\Forms\SpecificationRepository;
use Modules\Problem\Repositories\WorkflowLogRepository;

final class FormsService
{
    public function __construct(
        private PDO $db,
        private FormVersionRepository $versions,
        private SymptomsRepository $symptoms,
        private FactsRepository $facts,
        private CausesRepository $causes,
        private ActionsRepository $actions,
        private IterationsRepository $iterations,
        private DescriptionRepository $description,
        private ReflectionsRepository $reflections,
        private SpecificationRepository $specification,
        private FormsPayloadBuilder $payloadBuilder,
        private WorkflowLogRepository $workflow,
    ) {}

    /**
     * Read a form (no transaction needed).
     */
    public function read(FormRequest $req, int $themeId = 0, int $scenarioId = 0): FormResponse
    {
        $data = $this->payloadBuilder->buildFormData(
            $req->formKey,
            $req->accessId,
            $req->teamNo,
            $req->outlineId,
            $req->exerciseNo,
            $themeId,
            $scenarioId
        );

        // Versions table may not have a row yet; treat as 0
        $v = $this->db->prepare("
            SELECT version
            FROM problem_form_versions
            WHERE access_id = :access_id AND team_no = :team_no
              AND outline_id = :outline_id AND exercise_no = :exercise_no
              AND form_key = :form_key
            LIMIT 1
        ");
        $v->execute([
            ':access_id' => $req->accessId,
            ':team_no' => $req->teamNo,
            ':outline_id' => $req->outlineId,
            ':exercise_no' => $req->exerciseNo,
            ':form_key' => $req->formKey,
        ]);
        $row = $v->fetch(PDO::FETCH_ASSOC);
        $version = $row ? (int)$row['version'] : 0;

        return new FormResponse(true, $req->formKey, $version, $data);
    }

    /**
     * Write with OCC:
     * - Lock version row
     * - Check expected_version
     * - Apply mutation
     * - Bump version (will trigger log_poll)
     * - Return canonical form data + new version
     *
     * @return FormResponse|FormConflictResponse
     */
    public function write(FormRequest $req, int $themeId = 0, int $scenarioId = 0): FormResponse|FormConflictResponse
    {
        FormsGuard::assertScope($req->accessId, $req->teamNo, $req->outlineId, $req->exerciseNo, $req->actorToken);

        try {
            $this->db->beginTransaction();

            $current = $this->versions->lockCurrentVersion(
                $req->accessId, $req->teamNo, $req->outlineId, $req->exerciseNo, $req->formKey
            );

            if ($req->expectedVersion !== $current) {
                // Conflict: return canonical form state with current version
                $data = $this->payloadBuilder->buildFormData(
                    $req->formKey, $req->accessId, $req->teamNo, $req->outlineId, $req->exerciseNo, $themeId, $scenarioId
                );
                $this->db->rollBack();
                return new FormConflictResponse($req->formKey, $current, $data);
            }

            // Apply mutation
            $this->applyMutation($req, $themeId, $scenarioId);

            // Bump version (INSERT/UPDATE); triggers log_poll
            $newVersion = $this->versions->bumpVersion(
                $req->accessId, $req->teamNo, $req->outlineId, $req->exerciseNo, $req->formKey, $req->actorToken
            );

            $this->db->commit();

            // Read canonical data after commit (safe + deterministic)
            $data = $this->payloadBuilder->buildFormData(
                $req->formKey, $req->accessId, $req->teamNo, $req->outlineId, $req->exerciseNo, $themeId, $scenarioId
            );

            return new FormResponse(true, $req->formKey, $newVersion, $data);

        } catch (Throwable $e) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $e;
        }
    }

    /**
     * @param array<string,mixed> $p
     */
    private function applyMutation(FormRequest $req, int $themeId, int $scenarioId): void
    {
        $p = $req->payload;

        switch ($req->formKey) {
            case 'symptoms':
                if ($req->crud === 'create') {
                    $this->symptoms->create(
                        $req->accessId, $req->teamNo, $req->outlineId, $req->exerciseNo,
                        $themeId ?: null, $scenarioId ?: null,
                        (int)($p['deviation_id'] ?? 0),
                        (int)($p['function_id'] ?? 0),
                        (string)($p['clarify_text'] ?? ''),
                        $req->actorToken
                    );

                    // Workflow logging
                    $this->workflow->insert([
                        'access_id' => $req->accessId,
                        'team_no' => $req->teamNo,
                        'outline_id' => $req->outlineId,
                        'exercise_no' => $req->exerciseNo,
                        'theme_id' => $themeId ?: null,
                        'scenario_id' => $scenarioId ?: null,
                        'step_no' => 1,
                        'crud' => 1,
                        'deviation_id' => (int)($p['deviation_id'] ?? 0),
                        'function_id' => (int)($p['function_id'] ?? 0),
                        'info' => 'symptom',
                        'actor_token' => $req->actorToken
                    ]);

                    return;
                }
                if ($req->crud === 'update') {
                    $this->symptoms->updateText(
                        $req->accessId, $req->teamNo, $req->outlineId, $req->exerciseNo,
                        (int)($p['id'] ?? 0),
                        (string)($p['clarify_text'] ?? ''),
                        $req->actorToken
                    );
                    return;
                }
                if ($req->crud === 'delete') {
                    $id = (int)($p['id'] ?? 0);
	                $row = $this->symptoms->findById($req->accessId, $req->teamNo, $req->outlineId, $req->exerciseNo, $id);

                    $this->symptoms->delete(
                        $req->accessId, $req->teamNo, $req->outlineId, $req->exerciseNo,
                        (int)($p['id'] ?? 0)
                    );

                    // Workflow logging
                    if ($row) {
                        $this->workflow->insert([
                            'access_id' => $req->accessId,
                            'team_no' => $req->teamNo,
                            'outline_id' => $req->outlineId,
                            'exercise_no' => $req->exerciseNo,
                            'theme_id' => $themeId ?: null,
                            'scenario_id' => $scenarioId ?: null,
                            'step_no' => 1,
                            'crud' => 4,
                            'deviation_id' => (int)($row['deviation_id'] ?? 0),
                            'function_id' => (int)($row['function_id'] ?? 0),
                            'actor_token' => $req->actorToken
                        ]);
                    }

                    return;
                }
                if ($req->crud === 'priority') {
                    $id = (int)($p['id'] ?? 0);
	                $row = $this->symptoms->findById($req->accessId, $req->teamNo, $req->outlineId, $req->exerciseNo, $id);

                    $this->symptoms->setPriority(
                        $req->accessId, $req->teamNo, $req->outlineId, $req->exerciseNo,
                        (int)($p['id'] ?? 0),
                        $req->actorToken
                    );

                    // Workflow logging
                    if ($row) {
                        $this->workflow->insert([
                            'access_id' => $req->accessId,
                            'team_no' => $req->teamNo,
                            'outline_id' => $req->outlineId,
                            'exercise_no' => $req->exerciseNo,
                            'theme_id' => $themeId ?: null,
                            'scenario_id' => $scenarioId ?: null,
                            'step_no' => 1,
                            'crud' => 9,
                            'deviation_id' => (int)($row['deviation_id'] ?? 0),
                            'function_id' => (int)($row['function_id'] ?? 0),
                            'info' => 'priority',
                            'actor_token' => $req->actorToken
                        ]);
                    }
                    return;
                }
                break;

            case 'facts':
                if ($req->crud === 'create') {
                    $this->facts->create(
                        $req->accessId, $req->teamNo, $req->outlineId, $req->exerciseNo,
                        $themeId ?: null, $scenarioId ?: null,
                        (string)($p['key_meta'] ?? ''),
                        (string)($p['key_value'] ?? ''),
                        (string)($p['text'] ?? ''),
                        $req->actorToken
                    );

                    // Workflow logging
                    $keyMeta = (string)($p['key_meta'] ?? '');
                    if (!in_array($keyMeta, ['other_ok', 'other_not'], true)) {
                        $this->workflow->insert([
                            'access_id' => $req->accessId,
                            'team_no' => $req->teamNo,
                            'outline_id' => $req->outlineId,
                            'exercise_no' => $req->exerciseNo,
                            'theme_id' => $themeId ?: null,
                            'scenario_id' => $scenarioId ?: null,
                            'step_no' => 2,
                            'crud' => 1,
                            'info' => $keyMeta,
                            'actor_token' => $req->actorToken
                        ]);
                    }

                    return;
                }
                if ($req->crud === 'update') {
                    $this->facts->updateText(
                        $req->accessId, $req->teamNo, $req->outlineId, $req->exerciseNo,
                        (int)($p['id'] ?? 0),
                        (string)($p['text'] ?? ''),
                        $req->actorToken
                    );
                    return;
                }
                if ($req->crud === 'delete') {
                    $this->facts->delete(
                        $req->accessId, $req->teamNo, $req->outlineId, $req->exerciseNo,
                        (int)($p['id'] ?? 0)
                    );
                    return;
                }
                break;

            case 'causes':
                if ($req->crud === 'create') {
                    $ciId = (string)($p['ci_id'] ?? '');
                    $deviationText = (string)($p['deviation_text'] ?? '');

                    // Create row (get id so we can log info like legacy did)
                    $listNo = $this->causes->nextListNo($req->accessId, $req->teamNo, $req->outlineId, $req->exerciseNo);

                    $newId = $this->causes->create(
                        $req->accessId,
                        $req->teamNo,
                        $req->outlineId,
                        $req->exerciseNo,
                        $themeId ?: null,
                        $scenarioId ?: null,
                        $ciId,
                        $deviationText,
                        $listNo,
                        $req->actorToken
                    );

                    // Workflow (legacy: insert cause logged with info = new id)
                    $this->workflow->insert([
                        'access_id' => $req->accessId,
                        'team_no' => $req->teamNo,
                        'outline_id' => $req->outlineId,
                        'exercise_no' => $req->exerciseNo,
                        'theme_id' => $themeId ?: null,
                        'scenario_id' => $scenarioId ?: null,
                        'step_no' => 3,
                        'crud' => 1,
                        'ci_id' => $ciId !== '' ? $ciId : null,
                        'info' => (string)$newId,
                        'actor_token' => $req->actorToken
                    ]);

                    return;
                }
                if ($req->crud === 'delete') {
                    $id = (int)($p['id'] ?? 0);
                    if ($id <= 0) return;

                    // Load row before delete so we can log ci_id like legacy did
                    $row = $this->causes->findById($req->accessId, $req->teamNo, $req->outlineId, $req->exerciseNo, $id);

                    $this->causes->delete($req->accessId, $req->teamNo, $req->outlineId, $req->exerciseNo, $id);

                    // Workflow (legacy: delete cause logged with info = deleted id)
                    $this->workflow->insert([
                        'access_id' => $req->accessId,
                        'team_no' => $req->teamNo,
                        'outline_id' => $req->outlineId,
                        'exercise_no' => $req->exerciseNo,
                        'theme_id' => $themeId ?: null,
                        'scenario_id' => $scenarioId ?: null,
                        'step_no' => 3,
                        'crud' => 4,
                        'ci_id' => $row ? ((string)($row['ci_id'] ?? '') ?: null) : null,
                        'info' => (string)$id,
                        'actor_token' => $req->actorToken
                    ]);

                    return;
                }
                if ($req->crud === 'update') {
                    $this->causes->update(
                        $req->accessId, $req->teamNo, $req->outlineId, $req->exerciseNo,
                        (int)($p['id'] ?? 0),
                        (string)($p['likelihood_text'] ?? ''),
                        (string)($p['evidence_text'] ?? ''),
                        (int)($p['is_proven'] ?? 0),
                        (int)($p['is_disproven'] ?? 0),
                        (string)($p['test_what'] ?? ''),
                        (string)($p['test_where'] ?? ''),
                        (string)($p['test_when'] ?? ''),
                        (string)($p['test_extent'] ?? ''),
                        $req->actorToken
                    );
                    return;
                }
                if ($req->crud === 'arrange') {
                    $ids = $p['ids_in_order'] ?? [];
                    if (!is_array($ids)) $ids = [];
                    $ids = array_values(array_filter(array_map('intval', $ids), fn($v) => $v > 0));
                    $this->causes->arrange(
                        $req->accessId, $req->teamNo, $req->outlineId, $req->exerciseNo,
                        $ids,
                        $req->actorToken
                    );
                    return;
                }
                break;

            case 'actions':
                if ($req->crud === 'create') {
                    $ciId = (string)($p['ci_id'] ?? '');
                    $actionId = (int)($p['action_id'] ?? 0);
                    $effectText = (string)($p['effect_text'] ?? '');

                    $newId = $this->actions->create(
                        $req->accessId,
                        $req->teamNo,
                        $req->outlineId,
                        $req->exerciseNo,
                        $themeId ?: null,
                        $scenarioId ?: null,
                        $ciId,
                        $actionId,
                        $effectText,
                        $req->actorToken
                    );

                    // Workflow (legacy: insert action logged with ciID + actionID + info=actionID)
                    $this->workflow->insert([
                        'access_id' => $req->accessId,
                        'team_no' => $req->teamNo,
                        'outline_id' => $req->outlineId,
                        'exercise_no' => $req->exerciseNo,
                        'theme_id' => $themeId ?: null,
                        'scenario_id' => $scenarioId ?: null,
                        'step_no' => 4,
                        'crud' => 1,
                        'ci_id' => $ciId !== '' ? $ciId : null,
                        'action_id' => $actionId > 0 ? $actionId : null,
                        'info' => $actionId > 0 ? (string)$actionId : null,
                        'actor_token' => $req->actorToken
                    ]);

                    return;
                }
                if ($req->crud === 'update') {
                    $this->actions->update(
                        $req->accessId, $req->teamNo, $req->outlineId, $req->exerciseNo,
                        (int)($p['id'] ?? 0),
                        (string)($p['effect_text'] ?? ''),
                        $req->actorToken
                    );
                    return;
                }
                if ($req->crud === 'delete') {
                    $id = (int)($p['id'] ?? 0);
                    if ($id <= 0) return;

                    // Load row before delete so we can log ci_id/action_id like legacy did
                    $row = $this->actions->findById($req->accessId, $req->teamNo, $req->outlineId, $req->exerciseNo, $id);

                    $this->actions->delete($req->accessId, $req->teamNo, $req->outlineId, $req->exerciseNo, $id);

                    // Workflow (legacy: delete action logged with ciID + actionID)
                    $this->workflow->insert([
                        'access_id' => $req->accessId,
                        'team_no' => $req->teamNo,
                        'outline_id' => $req->outlineId,
                        'exercise_no' => $req->exerciseNo,
                        'theme_id' => $themeId ?: null,
                        'scenario_id' => $scenarioId ?: null,
                        'step_no' => 4,
                        'crud' => 4,
                        'ci_id' => $row ? ((string)($row['ci_id'] ?? '') ?: null) : null,
                        'action_id' => $row ? ((int)($row['action_id'] ?? 0) ?: null) : null,
                        'actor_token' => $req->actorToken
                    ]);

                    return;
                }
                break;

            case 'iterations':
                if ($req->crud === 'upsert') {
                    $this->iterations->upsert(
                        $req->accessId, $req->teamNo, $req->outlineId, $req->exerciseNo,
                        $themeId, $scenarioId,
                        (string)($p['text'] ?? ''),
                        $req->actorToken
                    );
                    return;
                }
                break;

            case 'description':
                if ($req->crud === 'upsert') {
                    $this->description->upsert(
                        $req->accessId, $req->teamNo, $req->outlineId, $req->exerciseNo,
                        $themeId, $scenarioId,
                        (string)($p['short_description'] ?? ''),
                        (string)($p['long_description'] ?? ''),
                        (string)($p['work_notes'] ?? ''),
                        $req->actorToken
                    );
                    return;
                }
                break;

            case 'reflections':
                if ($req->crud === 'upsert') {
                    $this->reflections->upsert(
                        $req->accessId, $req->teamNo, $req->outlineId, $req->exerciseNo,
                        (string)($p['keep_text'] ?? ''),
                        (string)($p['improve_text'] ?? ''),
                        $req->actorToken
                    );
                    return;
                }
                break;

            case 'specification':
                if ($req->crud === 'upsert') {
                    $field = (string)($p['field'] ?? '');
                    $text = (string)($p['text'] ?? '');
                    $this->specification->upsertOne(
                        $req->accessId,
                        $req->teamNo,
                        $req->outlineId,
                        $req->exerciseNo,
                        $themeId,
                        $scenarioId,
                        $field,
                        $text,
                        $req->actorToken
                    );
                    return;
                }
        }

        throw new \InvalidArgumentException('Invalid crud/form combination');
    }
}