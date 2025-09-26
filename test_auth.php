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

// Test simple de autenticación
if (isset($_SESSION['usuario_id'])) {
    echo json_encode([
        'success' => true,
        'message' => 'Usuario autenticado correctamente',
        'usuario_id' => $_SESSION['usuario_id'],
        'session_data' => $_SESSION
    ]);
} else {
    echo json_encode([
        'success' => false,
        'message' => 'Usuario no autenticado',
        'session_id' => session_id(),
        'cookies' => $_COOKIE
    ]);
}
?>