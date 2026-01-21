<?php
declare(strict_types=1);

/**
 * /var/www/ajax/logout.php
 *
 * Destroys session and returns JSON { ok, data, error }.
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

try {
	if (session_status() === PHP_SESSION_NONE) {
		session_start();
	}

	$_SESSION = [];
	if (ini_get('session.use_cookies')) {
		$params = session_get_cookie_params();
		setcookie(session_name(), '', time() - 42000,
			$params['path'] ?? '/',
			$params['domain'] ?? '',
			(bool)($params['secure'] ?? false),
			(bool)($params['httponly'] ?? true)
		);
	}

	session_destroy();
	session_write_close();

	echo json_encode(['ok' => true, 'data' => null, 'error' => null], JSON_UNESCAPED_UNICODE);
	exit;

} catch (Throwable) {
	http_response_code(500);
	echo json_encode(['ok' => false, 'data' => null, 'error' => 'Server error'], JSON_UNESCAPED_UNICODE);
	exit;
}