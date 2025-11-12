<?php
// API para verificar el estado de autenticación del usuario
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '.clinica2demayo.com', // Compartir cookie entre www y sin www
    'secure' => true,
    'httponly' => true,
    'samesite' => 'Lax',
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
header('Content-Type: application/json');

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