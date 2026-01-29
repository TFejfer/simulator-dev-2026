<?php
declare(strict_types=1);

namespace Modules\Problem\Support;

final class JsonResponder
{
    /**
     * @param array<string,mixed> $payload
     */
    public static function ok(array $payload, int $code = 200): void
    {
        http_response_code($code);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    /**
     * @param array<string,mixed> $payload
     */
    public static function error(array $payload, int $code = 400): void
    {
        self::ok($payload, $code);
    }
}