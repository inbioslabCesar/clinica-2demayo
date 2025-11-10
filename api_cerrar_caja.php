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
header('Content-Type: application/json');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
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

if (!isset($_SESSION['usuario']) || !is_array($_SESSION['usuario'])) {
    echo json_encode(['success' => false, 'error' => 'Acceso denegado']);
    exit;
}

$usuario = $_SESSION['usuario'];
$usuario_id = $usuario['id'];
$fecha = date('Y-m-d');

// Leer datos enviados
$input = json_decode(file_get_contents('php://input'), true);
// Leer monto contado y observaciones de cierre
$monto_contado = isset($input['monto_contado']) ? floatval($input['monto_contado']) : null;
$observaciones_cierre = isset($input['observaciones']) ? trim($input['observaciones']) : '';
if ($monto_contado === null) {
    echo json_encode(['success' => false, 'error' => 'Monto contado no recibido']);
    exit;
}

// Buscar la caja abierta del usuario actual
$stmt = $pdo->prepare('SELECT id, monto_apertura FROM cajas WHERE usuario_id = ? AND DATE(fecha) = ? AND estado = "abierta" ORDER BY hora_apertura ASC LIMIT 1');
$stmt->execute([$usuario_id, $fecha]);
$caja = $stmt->fetch(PDO::FETCH_ASSOC);
if (!$caja) {
    echo json_encode(['success' => false, 'error' => 'No hay caja abierta para cerrar']);
    exit;
}
$caja_id = $caja['id'];

// Calcular el total registrado en efectivo, yape y plin
$stmt = $pdo->prepare('SELECT metodo_pago, SUM(monto) as total FROM ingresos_diarios WHERE caja_id = ? GROUP BY metodo_pago');
$stmt->execute([$caja_id]);
$totales_pago = $stmt->fetchAll(PDO::FETCH_ASSOC);
$total_efectivo = 0;
$total_yape = 0;
$total_plin = 0;
$total_tarjetas = 0;
$total_transferencias = 0;
foreach ($totales_pago as $row) {
    $metodo = strtolower($row['metodo_pago']);
    if ($metodo === 'efectivo') $total_efectivo = floatval($row['total']);
    if ($metodo === 'yape') $total_yape = floatval($row['total']);
    if ($metodo === 'plin') $total_plin = floatval($row['total']);
    if ($metodo === 'tarjeta') $total_tarjetas = floatval($row['total']);
    if ($metodo === 'transferencia') $total_transferencias = floatval($row['total']);
}

// Calcular egresos
$stmt = $pdo->prepare('SELECT SUM(monto) FROM egresos WHERE caja_id = ? AND tipo_egreso = "honorario_medico"');
$stmt->execute([$caja_id]);
$egreso_honorarios = $stmt->fetchColumn();
if ($egreso_honorarios === false || $egreso_honorarios === null) {
    $egreso_honorarios = 0;
}

$stmt = $pdo->prepare('SELECT SUM(monto) FROM laboratorio_referencia_movimientos WHERE caja_id = ? AND estado = "pagado"');
$stmt->execute([$caja_id]);
$egreso_lab_ref = $stmt->fetchColumn();
if ($egreso_lab_ref === false || $egreso_lab_ref === null) {
    $egreso_lab_ref = 0;
}

$stmt = $pdo->prepare('SELECT SUM(monto) FROM egresos WHERE caja_id = ? AND tipo_egreso != "honorario_medico"');
$stmt->execute([$caja_id]);
$egreso_operativo = $stmt->fetchColumn();
if ($egreso_operativo === false || $egreso_operativo === null) {
    $egreso_operativo = 0;
}

$total_egresos = floatval($egreso_honorarios) + floatval($egreso_lab_ref) + floatval($egreso_operativo);
$efectivo_esperado = floatval($total_efectivo) - $total_egresos;
$diferencia = $monto_contado - $efectivo_esperado;

// Actualizar la caja: estado cerrada, guardar monto contado, diferencia, observaciones, totales por método de pago y totales por tipo de egreso
$stmt = $pdo->prepare('UPDATE cajas SET estado = "cerrada", monto_cierre = ?, diferencia = ?, hora_cierre = NOW(), observaciones_cierre = ?, total_efectivo = ?, total_yape = ?, total_plin = ?, total_tarjetas = ?, total_transferencias = ?, egreso_honorarios = ?, egreso_lab_ref = ?, egreso_operativo = ?, total_egresos = ? WHERE id = ?');
$stmt->execute([
    $monto_contado,
    $diferencia,
    $observaciones_cierre,
    $total_efectivo,
    $total_yape,
    $total_plin,
    $total_tarjetas,
    $total_transferencias,
    floatval($egreso_honorarios),
    floatval($egreso_lab_ref),
    floatval($egreso_operativo),
    $total_egresos,
    $caja_id
]);

// Opcional: registrar log de cierre
// $stmtLog = $pdo->prepare('INSERT INTO log_cierres_caja (caja_id, usuario_id, fecha, monto_contado, diferencia) VALUES (?, ?, NOW(), ?, ?)');
// $stmtLog->execute([$caja_id, $usuario_id, $monto_contado, $diferencia]);

echo json_encode([
    'success' => true,
    'mensaje' => 'Caja cerrada correctamente',
    'diferencia' => $diferencia,
    'totales' => [
        'total_efectivo' => $total_efectivo,
        'total_yape' => $total_yape,
        'total_plin' => $total_plin,
        'total_tarjetas' => $total_tarjetas,
        'total_transferencias' => $total_transferencias,
        'egreso_honorarios' => floatval($egreso_honorarios),
        'egreso_lab_ref' => floatval($egreso_lab_ref),
        'egreso_operativo' => floatval($egreso_operativo),
        'total_egresos' => $total_egresos
    ]
]);
?>
