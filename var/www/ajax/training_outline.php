<?php
declare(strict_types=1);

/**
 * /var/www/ajax/training_outline.php
 *
 * Static delivery-level payload:
 * - Outline rows for the current delivery (from SHARED_CONTENT DB).
 *
 * Cacheable endpoint:
 * - Sends ETag and supports 304 Not Modified.
 *
 * Response:
 * { ok:true, data:{ outline:[...] }, error:null }
 */

require_once __DIR__ . '/_guard_dynamic.php';

use Engine\Database\DatabaseManager;
use Modules\Training\Auth\Repositories\OutlineRepository;

header('Content-Type: application/json; charset=utf-8');

try {
	$meta = $_SESSION['delivery_meta'] ?? null;
	if (!is_array($meta)) {
		http_response_code(401);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Missing delivery_meta'], JSON_UNESCAPED_UNICODE);
		exit;
	}

	// Delivery identifier used by outlines.delivery_id
	$deliveryId = (string)($meta['delivery_id'] ?? $meta['deliveryId'] ?? $meta['deliveryID'] ?? '');
	$deliveryId = trim($deliveryId);

	if ($deliveryId === '') {
		http_response_code(422);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'Missing delivery_id'], JSON_UNESCAPED_UNICODE);
		exit;
	}

	// Release session lock early
	session_write_close();

	// SHARED_CONTENT database (outlines table lives here)
	$dbSharedContent = DatabaseManager::getInstance()->getConnection('shared_content');

	$repo = new OutlineRepository($dbSharedContent);
	$rows = $repo->findAllByDeliveryId($deliveryId);

	$payload = [
		'ok' => true,
		'data' => [
			'outline' => $rows,
		],
		'error' => null,
	];

	$json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
	if ($json === false) {
		http_response_code(500);
		echo json_encode(['ok' => false, 'data' => null, 'error' => 'JSON encode failed'], JSON_UNESCAPED_UNICODE);
		exit;
	}

	// ETag/304 (stable hash of body)
	$etagBare = hash('sha256', $json);
	$etagHeader = 'W/"' . $etagBare . '"';

	header('Cache-Control: private, max-age=0, must-revalidate');
	header('ETag: ' . $etagHeader);

	// Normalize If-None-Match: strip quotes and weak prefix
	$norm = static function (string $v): string {
		$v = trim($v);
		$v = trim($v, "\" \t\r\n");
		if (str_starts_with($v, 'W/')) {
			$v = trim(substr($v, 2));
		}
		$v = trim($v, "\" \t\r\n");
		return $v;
	};

	$clientEtag = (string)($_SERVER['HTTP_IF_NONE_MATCH'] ?? '');
	if ($clientEtag !== '' && hash_equals($etagBare, $norm($clientEtag))) {
		http_response_code(304);
		exit;
	}

	echo $json;
	exit;

} catch (Throwable $e) {
	http_response_code(500);
	echo json_encode(['ok' => false, 'data' => null, 'error' => 'Server error'], JSON_UNESCAPED_UNICODE);
	exit;
}