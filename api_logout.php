<?php
session_set_cookie_params([
    'samesite' => 'Lax', // Cambiado de None a Lax para mejor compatibilidad
    'secure' => isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on',
    'httponly' => true,
    'path' => '/',
]);
session_start();
// CORS para localhost, producción y subdominios Hostinger
$allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'https://clinica2demayo.com',
    'https://www.clinica2demayo.com'
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$currentHost = $_SERVER['HTTP_HOST'] ?? '';
if (in_array($origin, $allowedOrigins)) {
    header('Access-Control-Allow-Origin: ' . $origin);
} elseif ($currentHost && (strpos($currentHost, 'hostingersite.com') !== false || strpos($currentHost, 'clinica2demayo.com') !== false)) {
    header('Access-Control-Allow-Origin: https://' . $currentHost);
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With, Authorization');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS, PUT, DELETE');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}
// Destruir la sesión y limpiar cookies
$_SESSION = array();
if (ini_get("session.use_cookies")) {
    $params = session_get_cookie_params();
    setcookie(session_name(), '', time() - 42000, $params["path"], $params["domain"], $params["secure"], $params["httponly"]);
}
session_destroy();
header('Content-Type: application/json');
echo json_encode(['success' => true, 'message' => 'Sesión cerrada correctamente']);
