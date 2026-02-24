<?php
declare(strict_types=1);

/**
 * /var/www/bootstrap.php
 *
 * Purpose:
 * - Single place to wire dependencies (PDO, repositories, builders, services).
 * - Avoid duplicate wiring across many AJAX endpoints.
 * - Enforce consistent DB usage (multi-db setup).
 * - Keep endpoints thin: endpoints must only include this file + call services.
 *
 * IMPORTANT RULES:
 * - No business logic in bootstrap.
 * - No reading untrusted request params here.
 * - No DB connections created inside repositories/builders (constructor injection only).
 */

// -------------------------------------------------
// Minimal PSR-4 autoloader for /var/www
// - Engine\  => /var/www/Engine/
// - Modules\ => /var/www/Modules/
// - App\     => /var/www/App/
// -------------------------------------------------
spl_autoload_register(static function (string $class): void {
    $prefixes = [
        'Engine\\'  => '/var/www/Engine/',
        'Modules\\' => '/var/www/Modules/',
        'App\\'     => '/var/www/App/',
    ];

    foreach ($prefixes as $prefix => $baseDir) {
        if (strncmp($class, $prefix, strlen($prefix)) !== 0) {
            continue;
        }

        $relative = substr($class, strlen($prefix));
        $file = $baseDir . str_replace('\\', '/', $relative) . '.php';

        if (is_file($file)) {
            require_once $file;
        }

        return;
    }
});

// -------------------------------------------------
// Optional Composer autoload (only if present)
// -------------------------------------------------
$composerAutoload = __DIR__ . '/vendor/autoload.php';
if (is_file($composerAutoload)) {
    require_once $composerAutoload;
}

// -------------------------------------------------
// Session hardening (shared across endpoints/pages)
// -------------------------------------------------
session_set_cookie_params([
    'lifetime' => 36000,
    'secure'   => true,
    'httponly' => true,
    'samesite' => 'Lax',
]);

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

// -------------------------------------------------
// Convert PHP warnings/notices into exceptions (dev-friendly)
// NOTE: suppressed errors via @ are not converted.
// -------------------------------------------------
set_error_handler(static function (int $severity, string $message, string $file, int $line): bool {
    if (!(error_reporting() & $severity)) {
        return false;
    }
    throw new \ErrorException($message, 0, $severity, $file, $line);
});

use Engine\Database\DatabaseManager;
use Modules\Shared\Support\Databases;

// ---------- 1) PDO connections ----------

$dbm = DatabaseManager::getInstance();

/**
 * IMPORTANT: published_payloads MUST live in exactly one DB.
 * We standardize on RUNTIME for publish storage.
 */
$dbPublish = $dbm->getConnection(Databases::RUNTIME);

// Separate handles for clarity (even if same physical DB today)
$dbRuntime = $dbm->getConnection(Databases::RUNTIME);

$dbSharedContent  = $dbm->getConnection(Databases::SHARED_CONTENT);
$dbProblemContent = $dbm->getConnection(Databases::PROBLEM_CONTENT);
// Future (when you add them):
// $dbRiskContent    = $dbm->getConnection(Databases::RISK_CONTENT);
// $dbRcaContent     = $dbm->getConnection(Databases::RCA_CONTENT);

// ---------- 2) Engine publish (generic, no domain knowledge) ----------

$publishedRepo   = new \Engine\Publish\PublishedPayloadRepository($dbPublish);
$publishedEngine = new \Engine\Publish\PublishedPayloadService($publishedRepo);

// ---------- 3) Shared facade (key generation + publish orchestration) ----------

$publishedJsonService = new \Modules\Shared\Services\PublishedJsonService($publishedEngine);

// ---------- 4) Shared content (shared_content payload) ----------

$sharedTextsRepo      = new \Modules\Shared\Repositories\SharedContentTextsRepository($dbSharedContent);
$sharedExerciseParamsRepo = null;
if (class_exists(\Modules\Shared\Repositories\SharedExerciseParametersRepository::class)) {
    $sharedExerciseParamsRepo = new \Modules\Shared\Repositories\SharedExerciseParametersRepository($dbSharedContent);
}
$lottieRepo = null;
if (class_exists(\Modules\Shared\Repositories\LottieRepository::class)) {
    $lottieRepo = new \Modules\Shared\Repositories\LottieRepository($dbSharedContent);
}

$sharedContentBuilder = new \Modules\Shared\Services\SharedContent\Builders\SharedContentPayloadBuilder(
    $sharedTextsRepo,
    $sharedExerciseParamsRepo
);
$sharedContentService = new \Modules\Shared\Services\SharedContent\SharedContentService($publishedJsonService, $sharedContentBuilder);

// ---------- Shared: notifications (runtime, dynamic; no publish) ----------
//$notificationRepo = new \Modules\Shared\Repositories\NotificationRepository($dbRuntime);
//$instructorNotificationService = new \Modules\Shared\Services\Notifications\InstructorNotificationService($notificationRepo);

// ---------- 5) Problem: state resolver (reads runtime truth from log_exercise) ----------

$problemStateRepo = new \Modules\Problem\Repositories\ExerciseStateResolverRepository($dbRuntime);

// ---------- 6) Problem: repositories used by InfoSource builders ----------

$problemInfoSourceRepo = new \Modules\Problem\Repositories\ProblemInfoSourceRepository(
    $dbProblemContent,
    $dbRuntime
);

// ---------- 6.5) Problem: theme configuration items ----------

$themeConfigurationItemsRepo = new \Modules\Problem\Repositories\ThemeConfigurationItems($dbProblemContent);
$themeConfigurationItemsService = new \Modules\Problem\Services\ThemeConfigurationItemsService($themeConfigurationItemsRepo);

// ---------- 7) Problem: InfoSource builders (existing) ----------
// Builders depend on the repository (not PDO directly).

$inboxBuilder         = new \Modules\Problem\Services\InfoSources\Builders\InboxInfoSourceBuilder($problemInfoSourceRepo);
$maintenanceBuilder   = new \Modules\Problem\Services\InfoSources\Builders\MaintenanceInfoSourceBuilder($problemInfoSourceRepo);
$processBuilder       = new \Modules\Problem\Services\InfoSources\Builders\ProcessInfoSourceBuilder($problemInfoSourceRepo);

$inspectAndActBuilder = new \Modules\Problem\Services\InfoSources\Builders\InspectAndActInfoSourceBuilder($problemInfoSourceRepo);
$performanceBuilder   = new \Modules\Problem\Services\InfoSources\Builders\PerformanceInfoSourceBuilder($problemInfoSourceRepo);
$systemLogBuilder     = new \Modules\Problem\Services\InfoSources\Builders\SystemLogInfoSourceBuilder($problemInfoSourceRepo);

// ---------- 7) Problem: aggregate payload builders ----------

$problemStaticPayloadBuilder = new \Modules\Problem\Services\ExercisePayload\Builders\ProblemExerciseStaticPayloadBuilder(
    $inboxBuilder,
    $maintenanceBuilder,
    $processBuilder,
    $themeConfigurationItemsService
);

$problemStatePayloadBuilder = new \Modules\Problem\Services\ExercisePayload\Builders\ProblemExerciseStatePayloadBuilder(
    $inspectAndActBuilder,
    $performanceBuilder,
    $systemLogBuilder
);

// ---------- 8) Problem: services used by AJAX endpoints ----------

$problemExerciseStaticService = new \Modules\Problem\Services\ExercisePayload\ProblemExerciseStaticService(
    $publishedJsonService,
    $problemStaticPayloadBuilder
);

$problemExerciseStateService = new \Modules\Problem\Services\ExercisePayload\ProblemExerciseStateService(
    $publishedJsonService,
    $problemStateRepo,
    $problemStatePayloadBuilder
);

// ---------- 9) Training: Auth (participant login) ----------

$trainingUserRepo    = new \Modules\Training\Auth\Repositories\TrainingUserRepository($dbRuntime);
$trainingAccessRepo  = new \Modules\Training\Auth\Repositories\AccessRepository($dbRuntime);
$trainingAttemptRepo = new \Modules\Training\Auth\Repositories\LoginAttemptRepository($dbRuntime);
$trainingActiveRepo  = new \Modules\Training\Auth\Repositories\ActiveParticipantRepository($dbRuntime);

// ---------- 9.5) Training: exercise steps (shared_content) ----------

$exerciseStepsRepo = new \Modules\Training\Auth\Repositories\ExerciseStepsRepository($dbSharedContent);

// ---------- 10) Training: Exercise meta (runtime cache + DB truth) ----------

$exerciseRuntimeRepo = new \Modules\Training\Auth\Repositories\ExerciseRuntimeRepository($dbRuntime);
$scenarioMetaRepo = null;
$exerciseParamsRepo = null;

// Optional dependency: only available if PROBLEM_CONTENT or SHARED_CONTENT layer exists.
// Bootstrap must NOT fatal if content layer is not loaded yet.
if (isset($dbProblemContent) && $dbProblemContent instanceof \PDO
    && class_exists(\Modules\Problem\Content\Repositories\ProblemScenarioMetaRepository::class)
) {
    $scenarioMetaRepo = new \Modules\Problem\Content\Repositories\ProblemScenarioMetaRepository(
        $dbProblemContent, // PROBLEM_CONTENT PDO
        false,             // useApcu
        300                // ttl
    );
}

// Use SHARED_CONTENT params for problem_* keys.
if (class_exists(\Modules\Shared\Repositories\SharedExerciseParametersRepository::class)) {
    $exerciseParamsRepo = new \Modules\Shared\Repositories\SharedExerciseParametersRepository($dbSharedContent);
}

$exerciseMetaService = new \Modules\Training\Auth\Services\ExerciseMetaService(
	$exerciseRuntimeRepo,
	$trainingActiveRepo,
    $scenarioMetaRepo,
    $exerciseParamsRepo
);

// ---------- 10.5) Problem: metrics (runtime + content) ----------

$problemMetricsRepo = new \Modules\Problem\Repositories\Metrics\ProblemMetricsRepository($dbRuntime);
$problemSuccessCriteriaRepo = new \Modules\Problem\Repositories\Metrics\ProblemSuccessCriteriaRepository($dbRuntime);
$problemExerciseLogRepo = new \Modules\Problem\Repositories\Metrics\ProblemExerciseLogRepository($dbRuntime);
$problemWorkflowLogRepo = new \Modules\Problem\Repositories\Metrics\WorkflowLogReadRepository($dbRuntime);

$refActionsNotToTakeRepo = new \Modules\Problem\Content\Repositories\ReferenceActionsNotToTakeRepository($dbProblemContent);
$refSymptomsRepo = new \Modules\Problem\Content\Repositories\ReferenceSymptomsRepository($dbProblemContent);
$refFactsRepo = new \Modules\Problem\Content\Repositories\ReferenceFactsRepository($dbProblemContent);
$refCausesRepo = new \Modules\Problem\Content\Repositories\ReferenceCausesRepository($dbProblemContent);

$problemMetricsService = new \Modules\Problem\Services\Metrics\ProblemMetricsService(
    $exerciseRuntimeRepo,
    $problemExerciseLogRepo,
    $problemWorkflowLogRepo,
    new \Modules\Problem\Repositories\Forms\SymptomsRepository($dbRuntime),
    new \Modules\Problem\Repositories\Forms\FactsRepository($dbRuntime),
    new \Modules\Problem\Repositories\Forms\CausesRepository($dbRuntime),
    new \Modules\Problem\Repositories\Forms\ActionsRepository($dbRuntime),
    $refActionsNotToTakeRepo,
    $refSymptomsRepo,
    $refFactsRepo,
    $refCausesRepo,
    $problemMetricsRepo,
    $problemSuccessCriteriaRepo
);

// League repo is a stub until league tables are wired
$leagueRepo = new \Modules\Training\Auth\Repositories\LeagueRepository($dbRuntime);

$csrfService    = new \Modules\Training\Auth\Support\CsrfService();
$sessionService = new \Modules\Training\Auth\Support\SessionService();

$loginPolicyService     = new \Modules\Training\Auth\Services\LoginPolicyService();
$outlineRepo = new \Modules\Training\Auth\Repositories\OutlineRepository($dbSharedContent);
$templateRepo = new \Modules\Shared\Repositories\FormTemplateRepository($dbSharedContent);

$deliveryMetaBuilder = new \Modules\Training\Auth\Services\DeliveryMetaBuilder(
	$outlineRepo,
	$templateRepo
);

// Pace strategies
$instructorPacedStrategy = new \Modules\Training\Auth\Services\Pace\InstructorPacedStrategy($trainingActiveRepo);
$leagueStrategy          = new \Modules\Training\Auth\Services\Pace\LeagueStrategy($leagueRepo);
$paceFactory             = new \Modules\Training\Auth\Services\Pace\PaceStrategyFactory($instructorPacedStrategy, $leagueStrategy);

// Heart beat
$heartbeatRepo = new \Modules\Training\Auth\Repositories\UserHeartbeatRepository($dbRuntime);

// Monitoring hook: list of monitor access IDs (replace later with DB flag)
$monitorHook = new \Modules\Training\Auth\Services\Monitoring\AccessIdMonitoringHook(
    $dbRuntime,
    monitorAccessIds: [1]
);

$participantLoginService = new \Modules\Training\Auth\Services\ParticipantLoginService(
    $trainingUserRepo,
    $trainingAccessRepo,
    $trainingAttemptRepo,
    $heartbeatRepo,
    $loginPolicyService,
    $deliveryMetaBuilder,
    $paceFactory,
    $monitorHook,
    $csrfService,
    $sessionService,
    $trainingActiveRepo
);

$logoutService = new \Modules\Training\Auth\Services\ParticipantLogoutService(
    $heartbeatRepo,
    $sessionService
);

/**
 * Exported variables for endpoints:
 * - $sharedContentService
 * - $problemExerciseStaticService
 * - $problemExerciseStateService
 * - $participantLoginService
 * - $logoutService
 * - $exerciseMetaService
 * - $exerciseParamsRepo (optional)
 * - $csrfService (optional for endpoints that render HTML forms)
 *
 * Endpoints should:
 * - require this bootstrap
 * - call the appropriate service
 * - handle ETag/304
 * - echo JSON
 */
