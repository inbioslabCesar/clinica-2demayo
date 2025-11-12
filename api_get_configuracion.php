<?php
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '',
    'secure' => false, // Cambiado a false para desarrollo local (HTTP)
    'httponly' => true,
    'samesite' => 'Lax', // Cambiado de None a Lax para mejor compatibilidad
]);
session_start();

// CORS para localhost y producción
$allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',
    'https://clinica2demayo.com',
    'https://www.clinica2demayo.com'
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins)) {
    header('Access-Control-Allow-Origin: ' . $origin);
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Access-Control-Allow-Methods: GET, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

header('Content-Type: application/json');
require_once __DIR__ . '/config.php';

// Solo permitir método GET para obtener configuración
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    echo json_encode(['error' => 'Método no permitido']);
    http_response_code(405);
    exit;
}

try {
    // Obtener configuración actual sin restricciones de usuario
    // Esta API es solo de lectura para la información pública de la clínica
    $stmt = $pdo->query("SELECT * FROM configuracion_clinica ORDER BY created_at DESC LIMIT 1");
    $configuracion = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$configuracion) {
        // Si no hay configuración, devolver valores por defecto
        $configuracion = [
            'nombre_clinica' => 'Clínica 2 de Mayo',
            'direccion' => 'Av. Principal 123, Lima, Perú',
            'telefono' => '(01) 234-5678',
            'email' => 'info@clinica2demayo.com',
            'horario_atencion' => 'Lunes a Viernes: 7:00 AM - 8:00 PM\nSábados: 7:00 AM - 2:00 PM',
            'logo_url' => null,
            'website' => null,
            'ruc' => null,
            'especialidades' => null,
            'mision' => null,
            'vision' => null,
            'valores' => null,
            'director_general' => null,
            'jefe_enfermeria' => null,
            'contacto_emergencias' => null
        ];
    }
    
    echo json_encode([
        'success' => true,
        'data' => $configuracion
    ]);

} catch (PDOException $e) {
    echo json_encode([
        'error' => 'Error al obtener configuración',
        'details' => $e->getMessage()
    ]);
    http_response_code(500);
} catch (Exception $e) {
    echo json_encode([
        'error' => 'Error interno del servidor',
        'details' => $e->getMessage()
    ]);
    http_response_code(500);
}
?>
