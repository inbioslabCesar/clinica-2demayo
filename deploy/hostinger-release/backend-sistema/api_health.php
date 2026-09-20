<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config/db_resolver.php';

$runtimeConfig = resolve_db_runtime_config(__DIR__);

function read_request_value($key)
{
    if (isset($_POST[$key])) return trim((string)$_POST[$key]);
    if (isset($_GET[$key])) return trim((string)$_GET[$key]);
    return '';
}

function read_header_value($name)
{
    $serverKey = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    return isset($_SERVER[$serverKey]) ? trim((string)$_SERVER[$serverKey]) : '';
}

function opcache_status_summary()
{
    if (!function_exists('opcache_get_status')) {
        return null;
    }
    $status = @opcache_get_status(false);
    if (!is_array($status)) {
        return null;
    }

    return [
        'opcache_enabled' => (bool)($status['opcache_enabled'] ?? false),
        'cache_full' => (bool)($status['cache_full'] ?? false),
        'restart_pending' => (bool)($status['restart_pending'] ?? false),
        'restart_in_progress' => (bool)($status['restart_in_progress'] ?? false),
        'num_cached_scripts' => (int)($status['opcache_statistics']['num_cached_scripts'] ?? 0),
        'hits' => (int)($status['opcache_statistics']['hits'] ?? 0),
        'misses' => (int)($status['opcache_statistics']['misses'] ?? 0),
    ];
}

$action = strtolower(read_request_value('action'));
if ($action === 'reset_opcache') {
    $expectedToken = trim((string)(getenv('OPCACHE_RESET_TOKEN') ?: ($runtimeConfig['OPCACHE_RESET_TOKEN'] ?? '')));
    $providedToken = read_header_value('X-Opcache-Token');
    if ($providedToken === '') {
        $providedToken = read_request_value('token');
    }

    if ($expectedToken === '') {
        http_response_code(403);
        echo json_encode([
            'success' => false,
            'error' => 'OPCACHE_RESET_TOKEN no configurado',
        ]);
        exit;
    }

    if ($providedToken === '' || !hash_equals($expectedToken, $providedToken)) {
        http_response_code(403);
        echo json_encode([
            'success' => false,
            'error' => 'Token invalido para reset de OPcache',
        ]);
        exit;
    }

    if (!function_exists('opcache_reset')) {
        http_response_code(501);
        echo json_encode([
            'success' => false,
            'error' => 'La funcion opcache_reset no esta disponible en este servidor',
        ]);
        exit;
    }

    $before = opcache_status_summary();
    $resetOk = @opcache_reset();
    $after = opcache_status_summary();

    if (!$resetOk) {
        http_response_code(500);
    }

    echo json_encode([
        'success' => (bool)$resetOk,
        'action' => 'reset_opcache',
        'message' => $resetOk
            ? 'OPcache reiniciado correctamente'
            : 'No se pudo reiniciar OPcache',
        'before' => $before,
        'after' => $after,
        'timestamp' => date('c'),
    ]);
    exit;
}

$dbHost = (string)($runtimeConfig['DB_HOST'] ?? 'localhost');
$dbName = (string)($runtimeConfig['DB_NAME'] ?? '');
$dbUser = (string)($runtimeConfig['DB_USER'] ?? 'root');
$dbPass = (string)($runtimeConfig['DB_PASS'] ?? '');
$dbPort = (int)($runtimeConfig['DB_PORT'] ?? 3306);
if ($dbPort <= 0) {
    $dbPort = 3306;
}

$checks = [
    'app' => [
        'ok' => true,
        'code' => 'APP_OK',
        'message' => 'Backend operativo',
    ],
    'db' => [
        'ok' => false,
        'code' => 'DB_DOWN',
        'message' => 'Base de datos no disponible',
        'connect_errno' => null,
    ],
];

$dbOk = false;
$mysqli = @mysqli_init();

if ($mysqli instanceof mysqli) {
    @mysqli_options($mysqli, MYSQLI_OPT_CONNECT_TIMEOUT, 2);
    $connected = @mysqli_real_connect($mysqli, $dbHost, $dbUser, $dbPass, $dbName, $dbPort);
    if ($connected) {
        $dbOk = true;
        $checks['db']['ok'] = true;
        $checks['db']['code'] = 'DB_OK';
        $checks['db']['message'] = 'Base de datos operativa';
        $checks['db']['connect_errno'] = 0;
    } else {
        $checks['db']['connect_errno'] = mysqli_connect_errno();
        $connectError = (string)mysqli_connect_error();
        if ($connectError !== '') {
            $checks['db']['message'] = $connectError;
        }
    }
    @mysqli_close($mysqli);
} else {
    $checks['db']['code'] = 'DB_INIT_FAILED';
    $checks['db']['message'] = 'No se pudo inicializar la conexion a base de datos';
}

$healthy = $checks['app']['ok'] && $dbOk;
if (!$healthy) {
    http_response_code(503);
}

$statusCode = $healthy ? 'HEALTHY' : 'UNHEALTHY';
if (!$healthy && $checks['db']['ok'] === false) {
    $statusCode = 'DB_DOWN';
}

echo json_encode([
    'success' => $healthy,
    'healthy' => $healthy,
    'status_code' => $statusCode,
    'checks' => $checks,
    'timestamp' => date('c'),
]);
