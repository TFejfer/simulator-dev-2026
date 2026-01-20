<?php
declare(strict_types=1);

namespace Engine\Support;

use ErrorException;
use Throwable;

final class Debug
{
    public static function enableIfRequested(): void
    {
        if (empty($_GET['debug'])) {
            return;
        }

        ini_set('display_errors', '1');
        ini_set('display_startup_errors', '1');
        error_reporting(E_ALL);

        set_error_handler(function ($severity, $message, $file, $line) {
            throw new ErrorException($message, 0, $severity, $file, $line);
        });

        set_exception_handler(function (Throwable $e) {
            http_response_code(500);
            echo "<pre style='white-space:pre-wrap;font:13px/1.4 monospace'>";
            echo "UNCAUGHT EXCEPTION\n";
            echo get_class($e) . ": " . $e->getMessage() . "\n\n";
            echo $e->getFile() . ":" . $e->getLine() . "\n\n";
            echo $e->getTraceAsString();
            echo "</pre>";
            exit;
        });
    }
}