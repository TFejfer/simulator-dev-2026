<?php
declare(strict_types=1);

require_once __DIR__ . '/_guard.php';

$schemaVersion = 1;

$exerciseMeta = $_SESSION['exercise_meta'] ?? null;
if (!$exerciseMeta) {
    http_response_code(401);
    exit;
}

$out = $problemExerciseStaticService->getOrBuild($exerciseMeta, $schemaVersion);

$clientEtag = $_SERVER['HTTP_IF_NONE_MATCH'] ?? '';
if ($clientEtag !== '' && trim($clientEtag, '"') === $out['etag']) {
    header('HTTP/1.1 304 Not Modified');
    exit;
}

header('Content-Type: application/json; charset=utf-8');
header('ETag: "'.$out['etag'].'"');
header('Cache-Control: private, max-age=0, must-revalidate');
echo $out['json'];
