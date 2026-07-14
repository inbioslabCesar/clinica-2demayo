<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config/db_resolver.php';

$runtimeConfig = resolve_db_runtime_config(__DIR__);
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
