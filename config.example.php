<?php
// Archivo de configuración de ejemplo para Clínica 2 de Mayo
// Copia este archivo como config.php y configura tus credenciales

// === CONFIGURACIÓN DE BASE DE DATOS ===

// Para desarrollo local (XAMPP/Laragon)
define('DB_HOST', 'localhost');
define('DB_NAME', 'poli2demayo');
define('DB_USER', 'root');
define('DB_PASS', '');

// Para producción (descomenta y configura)
// define('DB_HOST', 'tu_servidor_mysql');
// define('DB_NAME', 'tu_base_de_datos');
// define('DB_USER', 'tu_usuario');
// define('DB_PASS', 'tu_contraseña');

// === CONFIGURACIÓN DE CONEXIÓN ===
$mysqli = new mysqli(DB_HOST, DB_USER, DB_PASS, DB_NAME);
if ($mysqli->connect_errno) {
    http_response_code(500);
    echo json_encode(['error' => 'Error de conexión a la base de datos']);
    exit;
}

// Configurar charset
$mysqli->set_charset('utf8');

// Alias para compatibilidad
$conn = $mysqli;

// === CONFIGURACIÓN DE SESIÓN ===
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// === CONFIGURACIÓN DE CORS (para desarrollo) ===
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Content-Type: application/json; charset=utf-8');

?>