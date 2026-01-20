<?php
declare(strict_types=1);

/**
 * /var/www/ajax/setup_status.php
 *
 * Dynamic endpoint (no cache):
 * - Uses _guard.php
 * - Reads (access_id, token) from session
 * - Uses ActiveParticipantRepository (no SQL here)
 * - Returns JSON { ok, data, error }
 */

require_once __DIR__ . '/_guard_dynamic.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

try {
    $token = (string)($_SESSION['session_token'] ?? '');
    $meta  = $_SESSION['delivery_meta'] ?? $_SESSION['delivery_context'] ?? null;

    $accessId = 0;
    if (is_array($meta)) {
        $accessId = (int)($meta['access_id'] ?? $meta['accessID'] ?? $meta['accessId'] ?? 0);
    }

    if ($accessId <= 0 || $token === '') {
        http_response_code(401);
        echo json_encode(['ok' => false, 'data' => null, 'error' => 'Invalid session'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // Release session lock early
    session_write_close();

    if (!isset($dbRuntime) || !($dbRuntime instanceof PDO)) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'data' => null, 'error' => 'DB not available'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $repo = new \Modules\Training\Auth\Repositories\ActiveParticipantRepository($dbRuntime);

    $row = $repo->findSetupStatus($accessId, $token);

    if ($row === null) {
        echo json_encode([
            'ok' => true,
            'data' => [
                'can_proceed'        => false,
                'pending_approval'   => false,
                'team_no'            => 0,
                'requested_team_no'  => 0,
                'language_code'      => 'en',
                'first_name'         => '',
            ],
            'error' => null
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $pendingApproval = ($row['requested_team_no'] > 0);
    $canProceed      = !$pendingApproval; // legacy semantics, uændret

    echo json_encode([
        'ok' => true,
        'data' => [
            'can_proceed'        => $canProceed,
            'pending_approval'   => $pendingApproval,
            'team_no'            => $row['team_no'],
            'requested_team_no'  => $row['requested_team_no'],
            'language_code'      => $row['language_code'] ?: 'en',
            'first_name'         => $row['first_name'],
        ],
        'error' => null
    ], JSON_UNESCAPED_UNICODE);

} catch (\Throwable $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'data' => null, 'error' => 'Server error'], JSON_UNESCAPED_UNICODE);
}