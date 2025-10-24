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

// CORS para localhost y producción
$allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'https://clinica2demayo.com',
    'https://www.clinica2demayo.com'
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins)) {
    header('Access-Control-Allow-Origin: ' . $origin);
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}
header('Content-Type: application/json');
require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Método no permitido']);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true);

if (!isset($data['ids']) || !is_array($data['ids']) || count($data['ids']) === 0) {
    echo json_encode(['success' => false, 'error' => 'No se recibieron honorarios a pagar']);
    exit;
}

$metodo_pago = $data['metodo_pago'] ?? 'efectivo';
$observaciones = $data['observaciones'] ?? null;
$fecha_pago = date('Y-m-d');

try {
    $pdo->beginTransaction();
    $sql = "UPDATE honorarios_medicos_movimientos SET estado_pago_medico = 'pagado', fecha_pago_medico = ?, metodo_pago_medico = ?, observaciones = ? WHERE id IN (" . implode(',', array_fill(0, count($data['ids']), '?')) . ")";
    $params = array_merge([$fecha_pago, $metodo_pago, $observaciones], $data['ids']);
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $pdo->commit();
    echo json_encode(['success' => true, 'message' => 'Honorarios marcados como pagados']);
} catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Error al registrar pago: ' . $e->getMessage()]);
}
?>
