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

$dbConnectMaxAttempts = max(1, (int)(getenv('DB_CONNECT_RETRIES') ?: '5'));
$dbConnectBaseDelayUs = max(0, (int)(getenv('DB_CONNECT_RETRY_DELAY_US') ?: '220000'));

if (!function_exists('db_connect_error_retryable')) {
    function db_connect_error_retryable($code, string $message): bool {
        $intCode = (int)$code;
        if (in_array($intCode, [1040, 1203, 1205, 2002, 2003, 2006, 2013], true)) {
            return true;
        }

        $msg = strtolower(trim($message));
        if ($msg === '') {
            return false;
        }

        $signals = [
            'operation not permitted',
            'too many connections',
            'server has gone away',
            'lost connection',
            'connection refused',
            'resource temporarily unavailable',
            "can't connect",
            'temporarily unavailable',
            'timeout',
            'timed out',
        ];
        foreach ($signals as $needle) {
            if (strpos($msg, $needle) !== false) {
                return true;
            }
        }
        return false;
    }
}

$mysqli = null;
$mysqliException = null;
$mysqliConnectErrno = 0;
$mysqliConnectError = '';

for ($attempt = 1; $attempt <= $dbConnectMaxAttempts; $attempt++) {
    $mysqli = null;
    $mysqliException = null;
    $mysqliConnectErrno = 0;
    $mysqliConnectError = '';

    try {
        $mysqli = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);
        if ($mysqli && !$mysqli->connect_errno) {
            break;
        }
        $mysqliConnectErrno = (int)($mysqli ? $mysqli->connect_errno : 0);
        $mysqliConnectError = (string)($mysqli ? $mysqli->connect_error : '');
    } catch (Throwable $e) {
        $mysqliException = $e;
        $mysqliConnectError = $e->getMessage();
    }

    $retryable = db_connect_error_retryable($mysqliConnectErrno, $mysqliConnectError);
    if ($mysqliException) {
        $retryable = db_connect_error_retryable($mysqliException->getCode(), $mysqliException->getMessage());
    }

    if ($attempt >= $dbConnectMaxAttempts || !$retryable) {
        break;
    }

    usleep($dbConnectBaseDelayUs * $attempt);
}

if ($mysqliException) {
    if (function_exists('api_log_server_error')) {
        api_log_server_error('db-mysqli-exception', $mysqliException->getMessage(), $mysqliException->getFile(), (int)$mysqliException->getLine());
    }

    $payload = [];
    if (function_exists('api_debug_enabled') && api_debug_enabled()) {
        $payload['debug'] = [
            'db_host' => DB_HOST,
            'db_name' => DB_NAME,
            'db_user' => DB_USER,
            'exception_class' => get_class($mysqliException),
            'exception_message' => $mysqliException->getMessage(),
            'attempts' => $dbConnectMaxAttempts,
            'instance' => defined('APP_INSTANCE_KEY') ? APP_INSTANCE_KEY : null,
        ];
    }

    if (function_exists('api_emit_error')) {
        api_emit_error('Error de conexión a la base de datos', 500, $payload);
    } else {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(array_merge(['success' => false, 'error' => 'Error de conexión a la base de datos'], $payload));
    }
    exit;
}

if (!$mysqli || $mysqli->connect_errno) {
    if (function_exists('api_log_server_error')) {
        api_log_server_error('db-mysqli', (string)($mysqli ? $mysqli->connect_error : $mysqliConnectError), __FILE__, __LINE__);
    }

    $payload = [];
    if (function_exists('api_debug_enabled') && api_debug_enabled()) {
        $payload['debug'] = [
            'db_host' => DB_HOST,
            'db_name' => DB_NAME,
            'db_user' => DB_USER,
            'connect_errno' => $mysqli ? $mysqli->connect_errno : $mysqliConnectErrno,
            'connect_error' => $mysqli ? $mysqli->connect_error : $mysqliConnectError,
            'attempts' => $dbConnectMaxAttempts,
            'instance' => defined('APP_INSTANCE_KEY') ? APP_INSTANCE_KEY : null,
        ];
    }

    if (function_exists('api_emit_error')) {
        api_emit_error('Error de conexión a la base de datos', 500, $payload);
    } else {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(array_merge(['success' => false, 'error' => 'Error de conexión a la base de datos'], $payload));
    }
    exit;
}
$mysqli->set_charset('utf8mb4');
$mysqli->query("SET time_zone = '{$dbSessionTimeZone}'");

// Alias para compatibilidad
$conn = $mysqli;

$skipPdoInit = defined('SKIP_PDO_INIT') && SKIP_PDO_INIT;
$pdo = null;

if (!$skipPdoInit) {
    $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4';
    $pdoException = null;

    for ($attempt = 1; $attempt <= $dbConnectMaxAttempts; $attempt++) {
        $pdo = null;
        $pdoException = null;

        try {
            $pdo = new PDO($dsn, DB_USER, DB_PASS, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
            $pdo->exec("SET time_zone = '{$dbSessionTimeZone}'");
            break;
        } catch (PDOException $e) {
            $pdoException = $e;
            if ($attempt >= $dbConnectMaxAttempts || !db_connect_error_retryable($e->getCode(), $e->getMessage())) {
                break;
            }
            usleep($dbConnectBaseDelayUs * $attempt);
        }
    }

    if (!$pdo) {
        $e = $pdoException instanceof PDOException ? $pdoException : new PDOException('No se pudo establecer conexión PDO');
        if (function_exists('api_log_server_error')) {
            api_log_server_error('db-pdo', $e->getMessage(), __FILE__, __LINE__);
        }

        $payload = [];
        if (function_exists('api_debug_enabled') && api_debug_enabled()) {
            $payload['debug'] = [
                'db_host' => DB_HOST,
                'db_name' => DB_NAME,
                'db_user' => DB_USER,
                'pdo_code' => $e->getCode(),
                'pdo_message' => $e->getMessage(),
                'attempts' => $dbConnectMaxAttempts,
                'instance' => defined('APP_INSTANCE_KEY') ? APP_INSTANCE_KEY : null,
            ];
        }

        if (function_exists('api_emit_error')) {
            api_emit_error('Error de conexión PDO a la base de datos', 500, $payload);
        } else {
            http_response_code(500);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode(array_merge(['success' => false, 'error' => 'Error de conexión PDO a la base de datos'], $payload));
        }
        exit;
    }
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