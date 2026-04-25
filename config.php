<?php
// Conexión centralizada para MySQLi y PDO con configuración dinámica por instancia.
require_once __DIR__ . '/config/db_resolver.php';

$runtimeConfig = resolve_db_runtime_config(__DIR__);
$appEnv = strtolower((string)($runtimeConfig['APP_ENV'] ?? 'production'));
$isProduction = $appEnv === 'production';

if ($isProduction) {
    ini_set('display_errors', 0);
    ini_set('display_startup_errors', 0);
    ini_set('log_errors', 1);
    error_reporting(E_ALL & ~E_NOTICE & ~E_DEPRECATED & ~E_STRICT);
} else {
    ini_set('display_errors', 1);
    ini_set('display_startup_errors', 1);
    error_reporting(E_ALL);
}

if (!defined('DB_HOST')) define('DB_HOST', (string)$runtimeConfig['DB_HOST']);
if (!defined('DB_NAME')) define('DB_NAME', (string)$runtimeConfig['DB_NAME']);
if (!defined('DB_USER')) define('DB_USER', (string)$runtimeConfig['DB_USER']);
if (!defined('DB_PASS')) define('DB_PASS', (string)$runtimeConfig['DB_PASS']);
if (!defined('APP_ENV')) define('APP_ENV', $appEnv);
if (!defined('APP_INSTANCE_KEY')) define('APP_INSTANCE_KEY', (string)($runtimeConfig['_meta']['instance'] ?? 'default'));
if (!defined('IS_PRODUCTION')) define('IS_PRODUCTION', $isProduction);
if (!defined('ASISTENTE_KB_PASSWORD')) define('ASISTENTE_KB_PASSWORD', (string)($runtimeConfig['ASISTENTE_KB_PASSWORD'] ?? ''));

$dbSessionTimeZone = '-05:00'; // Hora oficial de Lima (sin DST)

$mysqli = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);
if ($mysqli->connect_errno) {
    http_response_code(500);
    $payload = ['error' => 'Error de conexión a la base de datos'];
    if (function_exists('api_debug_enabled') && api_debug_enabled()) {
        $payload['debug'] = [
            'db_host' => DB_HOST,
            'db_name' => DB_NAME,
            'db_user' => DB_USER,
            'connect_errno' => $mysqli->connect_errno,
            'connect_error' => $mysqli->connect_error,
            'instance' => defined('APP_INSTANCE_KEY') ? APP_INSTANCE_KEY : null,
        ];
    }
    echo json_encode($payload);
    exit;
}
$mysqli->set_charset('utf8mb4');
$mysqli->query("SET time_zone = '{$dbSessionTimeZone}'");

// Alias para compatibilidad
$conn = $mysqli;

try {
    $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4';
    $pdo = new PDO($dsn, DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    $pdo->exec("SET time_zone = '{$dbSessionTimeZone}'");
} catch (PDOException $e) {
    http_response_code(500);
    $payload = ['error' => 'Error de conexión PDO a la base de datos'];
    if (function_exists('api_debug_enabled') && api_debug_enabled()) {
        $payload['debug'] = [
            'db_host' => DB_HOST,
            'db_name' => DB_NAME,
            'db_user' => DB_USER,
            'pdo_code' => $e->getCode(),
            'pdo_message' => $e->getMessage(),
            'instance' => defined('APP_INSTANCE_KEY') ? APP_INSTANCE_KEY : null,
        ];
    }
    echo json_encode($payload);
    exit;
}

if (session_status() === PHP_SESSION_NONE) {
    if ($isProduction) {
        ini_set('session.cookie_httponly', 1);
        ini_set('session.cookie_secure', 1);
        ini_set('session.use_strict_mode', 1);
        ini_set('session.cookie_samesite', 'Strict');
    }
    session_start();
}
?>