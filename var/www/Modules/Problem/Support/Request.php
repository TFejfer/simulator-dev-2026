<?php
declare(strict_types=1);

namespace Modules\Problem\Support;

final class Request
{
    /**
     * Read JSON body (POST/PUT) or fallback to $_POST.
     *
     * @return array<string,mixed>
     */
    public static function input(): array
    {
        $raw = file_get_contents('php://input');
        if (is_string($raw) && $raw !== '') {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) return $decoded;
        }
        return $_POST ?: [];
    }

    public static function int(array $in, string $key, int $default = 0): int
    {
        $v = $in[$key] ?? $default;
        return is_numeric($v) ? (int)$v : $default;
    }

    public static function str(array $in, string $key, string $default = ''): string
    {
        $v = $in[$key] ?? $default;
        return is_string($v) ? $v : $default;
    }

    public static function arr(array $in, string $key): array
    {
        $v = $in[$key] ?? [];
        return is_array($v) ? $v : [];
    }
}