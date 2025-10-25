<?php
// CORS
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
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}
header('Content-Type: application/json');
require_once 'config.php';

$caja_id = isset($_GET['caja_id']) ? intval($_GET['caja_id']) : 0;
if (!$caja_id) {
    echo json_encode(['success' => false, 'error' => 'Caja ID requerido']);
    exit;
}
// Obtener fecha de la caja
// Usar la columna correcta 'fecha' para la fecha de la caja
$stmt = $conn->prepare('SELECT fecha FROM cajas WHERE id = ?');
$stmt->bind_param('i', $caja_id);
$stmt->execute();
$res = $stmt->get_result();
if ($row = $res->fetch_assoc()) {
    $fecha = $row['fecha'];
    // Sumar honorarios pagados en esa fecha
    $stmt2 = $conn->prepare("SELECT COALESCE(SUM(monto_medico),0) as total_honorarios FROM honorarios_medicos_movimientos WHERE estado_pago_medico = 'pagado' AND fecha = ?");
    $stmt2->bind_param('s', $fecha);
    $stmt2->execute();
    $res2 = $stmt2->get_result();
    $total = $res2->fetch_assoc()['total_honorarios'] ?? 0;
    echo json_encode(['success' => true, 'total_honorarios' => floatval($total)]);
} else {
    echo json_encode(['success' => false, 'error' => 'Caja no encontrada']);
}
?>
