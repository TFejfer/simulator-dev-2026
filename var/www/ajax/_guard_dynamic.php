<?php
declare(strict_types=1);

/**
 * AJAX guard (dynamic endpoints)
 *
 * Purpose:
 * - Minimal overhead for polling/heartbeat/setup endpoints.
 * - Provides: valid session + $dbRuntime (PDO).
 *
 * Rules:
 * - Do NOT load App/bootstrap.php (too heavy for frequent calls).
 * - Load only Composer autoload + DatabaseManager.
 */

define('INSTALL_ROOT', '/var/www/');

require_once INSTALL_ROOT . 'vendor/autoload.php';

use Engine\Database\DatabaseManager;

// Start session (must match global session settings)
if (session_status() !== PHP_SESSION_ACTIVE) {
	session_start();
}

// Optional debug: session presence only (no DB, no app bootstrap)
if (!empty($_GET['debug'])) {
	header('Content-Type: application/json; charset=utf-8');
	echo json_encode([
		'session_status' => session_status(),
		'session_id' => session_id(),
		'cookie_phpsessid' => $_COOKIE['PHPSESSID'] ?? null,
		'has_user_id' => isset($_SESSION['user_id']),
		'has_delivery_meta' => isset($_SESSION['delivery_meta']),
		'has_session_token' => isset($_SESSION['session_token']),
		'session_keys' => array_keys($_SESSION ?? []),
	], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
	exit;
}

$uid = $_SESSION['user_id'] ?? null;
$ctx = $_SESSION['delivery_meta'] ?? null;

if (empty($uid) || !is_array($ctx)) {
	http_response_code(401);
	header('Content-Type: application/json; charset=utf-8');
	echo json_encode(['ok' => false, 'data' => null, 'error' => 'Not authenticated'], JSON_UNESCAPED_UNICODE);
	exit;
}

if (empty($_SESSION['session_token'])) {
	http_response_code(401);
	header('Content-Type: application/json; charset=utf-8');
	echo json_encode(['ok' => false, 'data' => null, 'error' => 'Invalid session'], JSON_UNESCAPED_UNICODE);
	exit;
}

// Runtime DB connection (from /etc/simulator/secrets.php)
try {
	$dbRuntime = DatabaseManager::getInstance()->getConnection('runtime');
} catch (Throwable $e) {
	http_response_code(500);
	header('Content-Type: application/json; charset=utf-8');
	echo json_encode(['ok' => false, 'data' => null, 'error' => 'DB not available'], JSON_UNESCAPED_UNICODE);
	exit;
}