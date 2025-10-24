<?php
// API para verificar el estado de autenticación del usuario
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '',
    'secure' => isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on',
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

// CORS headers
$allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'https://clinica2demayo.com'
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins)) {
    header('Access-Control-Allow-Origin: ' . $origin);
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

try {
    // Verificar si hay usuario autenticado
    if (isset($_SESSION['usuario']) && is_array($_SESSION['usuario'])) {
        // Usuario normal autenticado (estructura existente)
        echo json_encode([
            'success' => true,
            'authenticated' => true,
            'usuario_id' => $_SESSION['usuario']['id'] ?? null,
            'nombre' => $_SESSION['usuario']['nombre'] ?? '',
            'rol' => $_SESSION['usuario']['rol'] ?? '',
            'usuario' => $_SESSION['usuario']['usuario'] ?? '',
            'tipo' => 'usuario'
        ]);
    } elseif (isset($_SESSION['medico_id']) && isset($_SESSION['medico'])) {
        // Médico autenticado
        echo json_encode([
            'success' => true,
            'authenticated' => true,
            'usuario_id' => $_SESSION['medico_id'],
            'nombre' => $_SESSION['medico']['nombre'] ?? '',
            'rol' => 'medico',
            'tipo' => 'medico'
        ]);
    } else {
        // No autenticado
        echo json_encode([
            'success' => false,
            'authenticated' => false,
            'error' => 'Usuario no autenticado'
        ]);
    }
} catch (Exception $e) {
    error_log("Error en api_auth_status.php: " . $e->getMessage());
    echo json_encode([
        'success' => false,
        'authenticated' => false,
        'error' => 'Error interno del servidor'
    ]);
}
?>