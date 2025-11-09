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
date_default_timezone_set('America/Lima');
$fecha_pago = date('Y-m-d');

try {
    $pdo->beginTransaction();
    // Actualizar honorarios como pagados
    $sql = "UPDATE honorarios_medicos_movimientos SET estado_pago_medico = 'pagado', fecha_pago_medico = ?, metodo_pago_medico = ?, observaciones = ? WHERE id IN (" . implode(',', array_fill(0, count($data['ids']), '?')) . ")";
    $params = array_merge([$fecha_pago, $metodo_pago, $observaciones], $data['ids']);
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    // Obtener caja abierta del usuario actual
    $usuario_id = $_SESSION['usuario']['id'];
    $stmtCaja = $pdo->prepare("SELECT id FROM cajas WHERE estado = 'abierta' AND usuario_id = ? ORDER BY created_at DESC LIMIT 1");
    $stmtCaja->execute([$usuario_id]);
    $cajaRow = $stmtCaja->fetch(PDO::FETCH_ASSOC);
    $caja_id = $cajaRow ? $cajaRow['id'] : null;

    // Registrar egreso por cada honorario pagado, asociando la caja del movimiento
    $sqlMov = "SELECT id, monto_medico, medico_id, caja_id FROM honorarios_medicos_movimientos WHERE id IN (" . implode(',', array_fill(0, count($data['ids']), '?')) . ")";
    $stmtMov = $pdo->prepare($sqlMov);
    $stmtMov->execute($data['ids']);
    $honorarios = $stmtMov->fetchAll(PDO::FETCH_ASSOC);
    foreach ($honorarios as $hon) {
        if (!$hon['caja_id']) {
            $pdo->rollBack();
            echo json_encode(['success' => false, 'error' => 'El movimiento de honorario no tiene caja asociada. No se puede registrar el egreso.']);
            exit;
        }
        $stmtEgreso = $pdo->prepare("INSERT INTO egresos (fecha, tipo_egreso, monto, metodo_pago, usuario_id, caja_id, estado, medico_id, honorario_movimiento_id, created_at) VALUES (CURDATE(), 'honorario_medico', ?, ?, ?, ?, 'pagado', ?, ?, NOW())");
        $stmtEgreso->execute([
            $hon['monto_medico'],
            $metodo_pago,
            $usuario_id,
            $hon['caja_id'],
            $hon['medico_id'],
            $hon['id']
        ]);
    }
    $pdo->commit();
    echo json_encode(['success' => true, 'message' => 'Honorarios marcados como pagados y egresos registrados']);
} catch (Exception $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Error al registrar pago: ' . $e->getMessage()]);
}
?>
