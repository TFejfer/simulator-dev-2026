<?php
declare(strict_types=1);

namespace Engine\Database;

use InvalidArgumentException;
use PDO;

/**
 * DatabaseManager
 *
 * Single point of truth for creating PDO connections.
 *
 * Why:
 * - You now have multiple databases (runtime/shared/problem/risk/rca).
 * - Creating a separate singleton class per DB is copy/paste maintenance.
 * - This manager caches PDO instances (one per logical DB name).
 *
 * How:
 * - Reads config from /etc/simulator/secrets.php
 * - Exposes getConnection('runtime') etc.
 *
 * Notes:
 * - Connections are created lazily: only when requested.
 * - PDO::ATTR_PERSISTENT is enabled. If you ever see odd connection behavior,
 *   disable it first (set to false) and retest.
 */
final class DatabaseManager
{
    private static ?self $instance = null;

    /** @var array<string, PDO> */
    private array $connections = [];

    /** @var array<string, array{dsn:string, username:string, password:string}> */
    private array $config;

    private function __construct()
    {
        /** @var array<string, array{dsn:string, username:string, password:string}> $cfg */
        $cfg = require '/etc/simulator/secrets.php';
        $this->config = $cfg;
    }

    public static function getInstance(): self
    {
        return self::$instance ??= new self();
    }

    /**
     * Returns a cached PDO connection for a logical DB name.
     *
     * @throws InvalidArgumentException if name is empty or unknown
     */
    public function getConnection(string $name): PDO
    {
        $name = strtolower(trim($name));
        if ($name === '') {
            throw new InvalidArgumentException('Database name is required');
        }

        // Return existing connection if already created
        if (isset($this->connections[$name])) {
            return $this->connections[$name];
        }

        // Validate config exists
        if (!isset($this->config[$name])) {
            throw new InvalidArgumentException("Unknown database config: {$name}");
        }

        $db = $this->config[$name];

        // Create PDO connection
        $pdo = new PDO(
            $db['dsn'],
            $db['username'],
            $db['password'],
            [
                PDO::ATTR_PERSISTENT => true,
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ]
        );

        // Cache and return
        $this->connections[$name] = $pdo;
        return $pdo;
    }
}
