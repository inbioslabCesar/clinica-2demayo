<?php
// Configuración específica para generación de PDFs (sin sesiones ni output)
// Detectar automáticamente el entorno
$isProduction = (
    (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ||
    (isset($_SERVER['HTTP_HOST']) && strpos($_SERVER['HTTP_HOST'], 'clinica2demayo.com') !== false) ||
    (isset($_SERVER['SERVER_NAME']) && strpos($_SERVER['SERVER_NAME'], 'clinica2demayo.com') !== false) ||
    (isset($_SERVER['HTTP_HOST']) && strpos($_SERVER['HTTP_HOST'], 'hostingersite.com') !== false)
);

// Configuración según el entorno
if ($isProduction) {
    // Configuración para PRODUCCIÓN (Hostinger)
    define('DB_HOST', 'localhost');
    define('DB_NAME', 'u330560936_bd2DeMayo');
    define('DB_USER', 'u330560936_user2DeMayo');
    define('DB_PASS', '2025-10-20Clinica2demayo');
} else {
    // Configuración para DESARROLLO (Laragon/Local)
    define('DB_HOST', 'localhost');
    define('DB_NAME', 'poli2demayo');
    define('DB_USER', 'root');
    define('DB_PASS', '');
}

// Conexión MySQLi sin output de errores
$mysqli = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);
if ($mysqli->connect_errno) {
    error_log('Error de conexión a la base de datos: ' . $mysqli->connect_error);
    die('Error de conexión a la base de datos');
}

// Configurar charset
$mysqli->set_charset("utf8mb4");

// Alias para compatibilidad
$conn = $mysqli;
?>