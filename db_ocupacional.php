<?php

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/modules/ModulosInstalacion.php';

// Guardia del módulo: sin licencia activa ninguna API ocupacional abre su conexión ni responde datos.
ModulosInstalacion::exigir(isset($mysqli) && $mysqli ? $mysqli : ($pdo ?? null), 'ocupacional');

$ocupRuntimeHost = isset($runtimeConfig['DB_OCUP_HOST']) ? (string) $runtimeConfig['DB_OCUP_HOST'] : '';
$ocupRuntimeName = isset($runtimeConfig['DB_OCUP_NAME']) ? (string) $runtimeConfig['DB_OCUP_NAME'] : '';
$ocupRuntimeUser = isset($runtimeConfig['DB_OCUP_USER']) ? (string) $runtimeConfig['DB_OCUP_USER'] : '';
$ocupRuntimePass = isset($runtimeConfig['DB_OCUP_PASS']) ? (string) $runtimeConfig['DB_OCUP_PASS'] : '';
$ocupRuntimePort = isset($runtimeConfig['DB_OCUP_PORT']) ? (int) $runtimeConfig['DB_OCUP_PORT'] : 0;

$ocupHost = getenv('DB_OCUP_HOST');
if ($ocupHost === false || $ocupHost === '') {
    $ocupHost = $ocupRuntimeHost !== '' ? $ocupRuntimeHost : DB_HOST;
}

// Interruptor de las contraseñas de empresa (ver modules/OcupacionalSecretos.php):
// 1 = visibles solo para administradores (transición); 0 o ausente = con hash y nunca devueltas.
if (!defined('OCUP_PASSWORDS_VISIBLES')) {
    $ocupVisiblesRaw = getenv('OCUP_PASSWORDS_VISIBLES');
    if ($ocupVisiblesRaw === false || $ocupVisiblesRaw === '') {
        $ocupVisiblesRaw = isset($runtimeConfig['OCUP_PASSWORDS_VISIBLES']) ? (string) $runtimeConfig['OCUP_PASSWORDS_VISIBLES'] : '0';
    }
    define('OCUP_PASSWORDS_VISIBLES', in_array(strtolower(trim((string) $ocupVisiblesRaw)), ['1', 'true', 'si', 'yes', 'on'], true));
}

// Por defecto los datos ocupacionales viven en la misma BD. Para separarlos (confidencialidad) basta
// definir DB_OCUP_NAME (y su usuario) en la configuración de la instancia.
$ocupName = getenv('DB_OCUP_NAME');
if ($ocupName === false || $ocupName === '') {
    $ocupName = $ocupRuntimeName !== '' ? $ocupRuntimeName : DB_NAME;
}

$ocupUser = getenv('DB_OCUP_USER');
if ($ocupUser === false || $ocupUser === '') {
    $ocupUser = $ocupRuntimeUser !== '' ? $ocupRuntimeUser : DB_USER;
}

$ocupPass = getenv('DB_OCUP_PASS');
if ($ocupPass === false || $ocupPass === '') {
    if ($ocupRuntimePass !== '') {
        $ocupPass = $ocupRuntimePass;
    } else {
        $ocupPass = DB_PASS;
    }
}

$ocupPortEnv = getenv('DB_OCUP_PORT');
if ($ocupPortEnv === false || $ocupPortEnv === '') {
    $ocupPort = $ocupRuntimePort > 0 ? $ocupRuntimePort : 3306;
} else {
    $ocupPort = (int) $ocupPortEnv;
}
if ($ocupPort <= 0) {
    $ocupPort = 3306;
}

$mysqliOcup = new mysqli($ocupHost, $ocupUser, $ocupPass, $ocupName, $ocupPort);
if ($mysqliOcup->connect_errno) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'No se pudo conectar a la BD de salud ocupacional'
    ]);
    exit;
}

$mysqliOcup->set_charset('utf8mb4');
$mysqliOcup->query("SET time_zone = '-05:00'");

try {
    $dsn = 'mysql:host=' . $ocupHost . ';dbname=' . $ocupName . ';port=' . $ocupPort;
    $pdoOcup = new PDO($dsn, $ocupUser, $ocupPass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::MYSQL_ATTR_INIT_COMMAND => 'SET NAMES utf8mb4'
    ]);
    $pdoOcup->exec("SET time_zone = '-05:00'");
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'No se pudo inicializar PDO para salud ocupacional'
    ]);
    exit;
}
