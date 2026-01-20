<?php
declare(strict_types=1);

/**
 * /var/www/ajax/shared_content.php
 *
 * Returns shared (semi-static) content for a delivery (e.g. common_terms).
 * Uses ETag + 304 to avoid re-downloading unchanged payload.
 *
 * Contract:
 * - 200: echoes JSON string payload (built by SharedContentService)
 * - 304: no body
 *
 * Headers:
 * - ETag: W/"<hash>"
 * - Cache-Control: private, max-age=0, must-revalidate
 */

require_once __DIR__ . '/_guard.php';

header('Content-Type: application/json; charset=utf-8');

try {
    $schemaVersion = 1;

    $deliveryMeta = $_SESSION['delivery_meta'] ?? null;
    if (!is_array($deliveryMeta)) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'data' => null, 'error' => 'Missing delivery_meta'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $accessId = (int)($deliveryMeta['access_id'] ?? 0);
    if ($accessId <= 0) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'data' => null, 'error' => 'Missing delivery_meta.access_id'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $deliveryMeta['language_code'] = (string)($deliveryMeta['language_code'] ?? 'en');
    if ($deliveryMeta['language_code'] === '') {
        $deliveryMeta['language_code'] = 'en';
    }

    // Release session lock early
    session_write_close();

    $out = $sharedContentService->getOrBuild($deliveryMeta, $schemaVersion);

    $etag = (string)($out['etag'] ?? '');
    $json = (string)($out['json'] ?? '');

    // -----------------------------
    // ETag / 304 handling
    // -----------------------------

    // Normalize to bare token: strip quotes, strip weak prefix
    $norm = static function (string $v): string {
        $v = trim($v);

        // Strip outer quotes first (IMPORTANT for values like: "W/abc...")
        $v = trim($v, "\" \t\r\n");

        // Strip weak prefix if present
        if (str_starts_with($v, 'W/')) {
            $v = trim(substr($v, 2));
        }

        // Strip quotes again just in case
        $v = trim($v, "\" \t\r\n");

        return $v;
    };

    $etagBare = $norm($etag);

    // Always send cache directives
    header('Cache-Control: private, max-age=0, must-revalidate');

    if ($etagBare !== '') {
        // Always emit weak ETag in a consistent format
        $etagHeader = 'W/"' . $etagBare . '"';
        header('ETag: ' . $etagHeader);

        $clientEtag = (string)($_SERVER['HTTP_IF_NONE_MATCH'] ?? '');
        $clientBare = $norm($clientEtag);

        if ($clientBare !== '' && hash_equals($etagBare, $clientBare)) {
            http_response_code(304);
            exit;
        }
    }

    // -----------------------------
    // 200 + body
    // -----------------------------

    if ($json === '') {
        http_response_code(500);
        echo json_encode(['ok' => false, 'data' => null, 'error' => 'Shared content payload was empty'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    echo $json;
    exit;

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(
        [
            'ok'    => false,
            'data'  => null,
            'error' => $e->getMessage(),
            'where' => basename($e->getFile()) . ':' . $e->getLine(),
        ],
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
    exit;
}