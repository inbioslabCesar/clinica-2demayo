<?php
// API para verificar el estado actual de la caja
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
    'https://clinica2demayo.com'
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins)) {
    header('Access-Control-Allow-Origin: ' . $origin);
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS, DELETE');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Capturar errores fatales y enviar JSON con CORS
set_exception_handler(function($e) use ($origin, $allowedOrigins) {
    http_response_code(500);
    if (in_array($origin, $allowedOrigins)) {
        header('Access-Control-Allow-Origin: ' . $origin);
    }
    header('Access-Control-Allow-Credentials: true');
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => 'Error del servidor: ' . $e->getMessage()]);
    exit();
});
header('Content-Type: application/json');
require_once 'db.php';

try {
    // Verificar si el usuario está autenticado
    if (!isset($_SESSION['usuario']) || !is_array($_SESSION['usuario'])) {
        echo json_encode(['success' => false, 'error' => 'Usuario no autenticado']);
        exit;
    }

    $usuario_id = $_SESSION['usuario']['id'];
    $fecha_hoy = date('Y-m-d');

    // Buscar caja abierta para el usuario en el día actual
    $stmt = $pdo->prepare("
        SELECT 
            id,
            fecha,
            estado,
            monto_apertura,
            hora_apertura,
            total_efectivo,
            total_tarjetas,
            total_transferencias,
            total_otros,
            (total_efectivo + total_tarjetas + total_transferencias + total_otros) as total_dia,
            observaciones_apertura
        FROM cajas 
        WHERE fecha = ? AND usuario_id = ? AND estado != 'cerrada'
        ORDER BY created_at DESC 
        LIMIT 1
    ");
    
    $stmt->execute([$fecha_hoy, $usuario_id]);
    $caja = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($caja) {
        // Formatear hora de apertura
        $caja['hora_apertura'] = date('H:i', strtotime($caja['hora_apertura']));
        
        echo json_encode([
            'success' => true,
            'caja' => $caja,
            'estado' => 'abierta'
        ]);
    } else {
        echo json_encode([
            'success' => true,
            'caja' => null,
            'estado' => 'cerrada'
        ]);
    }

} catch (Exception $e) {
    error_log("Error en api_caja_estado.php: " . $e->getMessage());
    echo json_encode([
        'success' => false,
        'error' => 'Error interno del servidor'
    ]);
}
?>