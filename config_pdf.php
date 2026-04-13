<?php
// Configuración específica para generación de PDFs (sin sesiones ni output).
require_once __DIR__ . '/config/db_resolver.php';

$runtimeConfig = resolve_db_runtime_config(__DIR__);

if (!defined('DB_HOST')) define('DB_HOST', (string)$runtimeConfig['DB_HOST']);
if (!defined('DB_NAME')) define('DB_NAME', (string)$runtimeConfig['DB_NAME']);
if (!defined('DB_USER')) define('DB_USER', (string)$runtimeConfig['DB_USER']);
if (!defined('DB_PASS')) define('DB_PASS', (string)$runtimeConfig['DB_PASS']);

$mysqli = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);
if ($mysqli->connect_errno) {
    error_log('Error de conexión a la base de datos: ' . $mysqli->connect_error);
    die('Error de conexión a la base de datos');
}

$mysqli->set_charset('utf8mb4');
$conn = $mysqli;
?>