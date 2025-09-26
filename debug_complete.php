<?php
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '',
    'secure' => false,
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

// CORS
$allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'https://darkcyan-gnu-615778.hostingersite.com'
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins)) {
    header('Access-Control-Allow-Origin: ' . $origin);
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

header('Content-Type: application/json');
require_once __DIR__ . '/config.php';

// Debug completo
$debug_info = [
    'session_id' => session_id(),
    'session_status' => session_status(),
    'session_data' => $_SESSION,
    'cookies' => $_COOKIE,
    'headers' => getallheaders(),
    'request_info' => [
        'method' => $_SERVER['REQUEST_METHOD'],
        'origin' => $_SERVER['HTTP_ORIGIN'] ?? 'No Origin',
        'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? 'No User Agent',
        'referer' => $_SERVER['HTTP_REFERER'] ?? 'No Referer'
    ]
];

// Verificar si hay usuario logueado
if (isset($_SESSION['usuario']) && isset($_SESSION['usuario']['id'])) {
    $debug_info['authenticated'] = true;
    $debug_info['usuario_id'] = $_SESSION['usuario']['id'];
    $debug_info['usuario_data'] = $_SESSION['usuario'];
    $debug_info['is_admin'] = ($_SESSION['usuario']['rol'] === 'administrador');
    
    // Ya no necesitamos consultar la DB porque los datos están en sesión
    $debug_info['usuario_db'] = 'Datos ya en sesión, consulta DB no necesaria';
} else {
    $debug_info['authenticated'] = false;
}

echo json_encode($debug_info, JSON_PRETTY_PRINT);
?>