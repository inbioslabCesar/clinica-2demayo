
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
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);
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
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Content-Type: application/json');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}
require_once __DIR__ . '/db.php';

date_default_timezone_set('America/Lima');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'error' => 'Método no permitido']);
    exit;
}

try {
    if (!isset($_SESSION['usuario']) || !is_array($_SESSION['usuario'])) {
        echo json_encode(['success' => false, 'error' => 'Usuario no autenticado']);
        exit;
    }

    $input = json_decode(file_get_contents('php://input'), true);
    $caja_id = intval($input['caja_id'] ?? 0);
    $monto_cierre = floatval($input['monto_cierre'] ?? 0);
    $observaciones_cierre = trim($input['observaciones_cierre'] ?? '');
    $hora_cierre = date('H:i:s');
    $fecha_cierre = date('Y-m-d');

    if ($caja_id <= 0) {
        echo json_encode(['success' => false, 'error' => 'ID de caja inválido']);
        exit;
    }

    // Actualizar la caja como cerrada
    $stmt = $pdo->prepare("UPDATE cajas SET estado = 'cerrada', monto_cierre = ?, hora_cierre = ?, observaciones_cierre = ? WHERE id = ?");
    $stmt->execute([$monto_cierre, $hora_cierre, $observaciones_cierre, $caja_id]);

    echo json_encode([
        'success' => true,
        'message' => 'Caja cerrada exitosamente',
        'caja_id' => $caja_id,
        'monto_cierre' => $monto_cierre,
        'hora_cierre' => $hora_cierre
    ]);

} catch (Exception $e) {
    error_log('Error en api_caja_cerrar.php: ' . $e->getMessage());
    echo json_encode([
        'success' => false,
        'error' => 'Error interno del servidor: ' . $e->getMessage()
    ]);
}
?>
