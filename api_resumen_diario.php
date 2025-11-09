<?php
// CORS para localhost y producción
date_default_timezone_set('America/Lima');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '',
    'secure' => true, // Mejor compatibilidad móvil y Chrome
    'httponly' => true,
    'samesite' => 'None', // Mejor compatibilidad móvil y Chrome
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
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}
header('Content-Type: application/json');
require_once __DIR__ . '/config.php';

$usuario = $_SESSION['usuario'];
$fecha = isset($_GET['fecha']) ? $_GET['fecha'] : date('Y-m-d');

// Egreso honorarios médicos
$egreso_honorarios = 0.0;
$stmt = $pdo->prepare('SELECT SUM(monto) as egreso_honorarios FROM egresos WHERE DATE(created_at) = ? AND usuario_id = ? AND tipo_egreso = "honorario_medico"');
$stmt->execute([$fecha, $usuario['id']]);
$tmp_honorarios = $stmt->fetchColumn();
if ($tmp_honorarios !== false && $tmp_honorarios !== null) {
    $egreso_honorarios = floatval($tmp_honorarios);
}

// Egreso operativo (otros egresos, excluyendo honorarios médicos)

$egreso_operativo = 0.0;
$stmt = $pdo->prepare('SELECT SUM(monto) as egreso_operativo FROM egresos WHERE DATE(created_at) = ? AND usuario_id = ? AND tipo_egreso != "honorario_medico"');
$stmt->execute([$fecha, $usuario['id']]);
$tmp_operativo = $stmt->fetchColumn();
if ($tmp_operativo !== false && $tmp_operativo !== null) {
    $egreso_operativo = floatval($tmp_operativo);
}

// Egreso laboratorio de referencia (pagados)

$stmt = $pdo->prepare('SELECT SUM(monto) as egreso_lab_ref FROM laboratorio_referencia_movimientos WHERE DATE(fecha) = ? AND caja_id IS NOT NULL AND caja_id = ? AND estado = "pagado"');
$stmt->execute([$fecha, $usuario['caja_id'] ?? 0]);
$egreso_lab_ref = $stmt->fetchColumn();
$egreso_lab_ref = $egreso_lab_ref ? floatval($egreso_lab_ref) : 0.0;
    $stmt = $pdo->prepare('SELECT SUM(monto) as total FROM ingresos_diarios WHERE DATE(fecha_hora) = ? AND usuario_id = ?');
    $stmt->execute([$fecha, $usuario['id']]);
    $total = $stmt->fetchColumn();

    $stmt = $pdo->prepare('SELECT tipo_ingreso, SUM(monto) as total_servicio FROM ingresos_diarios WHERE DATE(fecha_hora) = ? AND usuario_id = ? GROUP BY tipo_ingreso');
    $stmt->execute([$fecha, $usuario['id']]);
    $ingresos_por_servicio = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $stmt = $pdo->prepare('SELECT area, SUM(monto) as total_area FROM ingresos_diarios WHERE DATE(fecha_hora) = ? AND usuario_id = ? GROUP BY area');
    $stmt->execute([$fecha, $usuario['id']]);
    $ingresos_por_area = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $stmt = $pdo->prepare('SELECT metodo_pago, SUM(monto) as total_pago FROM ingresos_diarios WHERE DATE(fecha_hora) = ? AND usuario_id = ? GROUP BY metodo_pago');
    $stmt->execute([$fecha, $usuario['id']]);
    $ingresos_por_pago = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Consultar el monto de apertura y estado de la caja del usuario actual
    $stmt = $pdo->prepare('SELECT monto_apertura, estado FROM cajas WHERE DATE(fecha) = ? AND usuario_id = ? ORDER BY hora_apertura ASC LIMIT 1');
    $stmt->execute([$fecha, $usuario['id']]);
    $caja_row = $stmt->fetch(PDO::FETCH_ASSOC);
    $monto_apertura = ($caja_row && isset($caja_row['monto_apertura'])) ? $caja_row['monto_apertura'] : 0;
    $caja_abierta = ($caja_row && isset($caja_row['estado']) && $caja_row['estado'] === 'abierta') ? true : false;

    $cajas_resumen = array();
    // Solo el administrador ve el resumen de todas las cajas, las recepcionistas solo ven su propia caja
    if ($usuario['rol'] === 'administrador') {
        $stmt = $pdo->prepare('SELECT c.id, c.usuario_id, u.nombre as usuario_nombre, u.rol as usuario_rol, c.turno, c.estado, c.monto_apertura, SUM(i.monto) as total_caja FROM cajas c LEFT JOIN usuarios u ON c.usuario_id = u.id LEFT JOIN ingresos_diarios i ON i.caja_id = c.id WHERE DATE(c.fecha) = ? GROUP BY c.id, c.usuario_id, c.turno, c.estado, u.nombre, u.rol, c.monto_apertura ORDER BY c.turno ASC, c.estado DESC');
        $stmt->execute([$fecha]);
        $cajas_resumen = $stmt->fetchAll(PDO::FETCH_ASSOC);
        // Para cada caja, calcular egresos y ganancia propios
        foreach ($cajas_resumen as &$caja) {
            // Egreso honorarios médicos por caja
            $stmtEgreso = $pdo->prepare('SELECT SUM(monto) as egreso_honorarios FROM egresos WHERE caja_id = ? AND tipo_egreso = "honorario_medico"');
            $stmtEgreso->execute([$caja['id']]);
            $egresoCaja = $stmtEgreso->fetchColumn();
            $caja['egreso_honorarios'] = $egresoCaja ? floatval($egresoCaja) : 0.0;
            // Egreso laboratorio de referencia por caja
            $stmtLabRef = $pdo->prepare('SELECT SUM(monto) as egreso_lab_ref FROM laboratorio_referencia_movimientos WHERE caja_id = ? AND estado = "pagado"');
            $stmtLabRef->execute([$caja['id']]);
            $egresoLabRef = $stmtLabRef->fetchColumn();
            $caja['egreso_lab_ref'] = $egresoLabRef ? floatval($egresoLabRef) : 0.0;
            // Egreso operativo por caja
            $stmtOperativo = $pdo->prepare('SELECT SUM(monto) as egreso_operativo FROM egresos WHERE caja_id = ? AND tipo_egreso != "honorario_medico"');
            $stmtOperativo->execute([$caja['id']]);
            $egresoOperativo = $stmtOperativo->fetchColumn();
            $caja['egreso_operativo'] = $egresoOperativo ? floatval($egresoOperativo) : 0.0;
            // Ganancia por caja
            $caja['ganancia_dia'] = floatval($caja['total_caja']) - ($caja['egreso_honorarios'] + $caja['egreso_lab_ref'] + $caja['egreso_operativo']);
        }
        unset($caja);
    } elseif ($usuario['rol'] === 'recepcionista') {
        // Solo mostrar la caja del usuario actual
        $stmt = $pdo->prepare('SELECT c.id, c.usuario_id, u.nombre as usuario_nombre, u.rol as usuario_rol, c.turno, c.estado, c.monto_apertura, SUM(i.monto) as total_caja FROM cajas c LEFT JOIN usuarios u ON c.usuario_id = u.id LEFT JOIN ingresos_diarios i ON i.caja_id = c.id WHERE DATE(c.fecha) = ? AND c.usuario_id = ? GROUP BY c.id, c.usuario_id, c.turno, c.estado, u.nombre, u.rol, c.monto_apertura ORDER BY c.turno ASC, c.estado DESC');
        $stmt->execute([$fecha, $usuario['id']]);
        $cajas_resumen = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($cajas_resumen as &$caja) {
            $stmtEgreso = $pdo->prepare('SELECT SUM(monto) as egreso_honorarios FROM egresos WHERE caja_id = ? AND tipo_egreso = "honorario_medico"');
            $stmtEgreso->execute([$caja['id']]);
            $egresoCaja = $stmtEgreso->fetchColumn();
            $caja['egreso_honorarios'] = $egresoCaja ? floatval($egresoCaja) : 0.0;
            $stmtLabRef = $pdo->prepare('SELECT SUM(monto) as egreso_lab_ref FROM laboratorio_referencia_movimientos WHERE caja_id = ? AND estado = "pagado"');
            $stmtLabRef->execute([$caja['id']]);
            $egresoLabRef = $stmtLabRef->fetchColumn();
            $caja['egreso_lab_ref'] = $egresoLabRef ? floatval($egresoLabRef) : 0.0;
            $stmtOperativo = $pdo->prepare('SELECT SUM(monto) as egreso_operativo FROM egresos WHERE caja_id = ? AND tipo_egreso != "honorario_medico"');
            $stmtOperativo->execute([$caja['id']]);
            $egresoOperativo = $stmtOperativo->fetchColumn();
            $caja['egreso_operativo'] = $egresoOperativo ? floatval($egresoOperativo) : 0.0;
            $caja['ganancia_dia'] = floatval($caja['total_caja']) - ($caja['egreso_honorarios'] + $caja['egreso_lab_ref'] + $caja['egreso_operativo']);
        }
        unset($caja);
    }

    $ganancia_dia = floatval($total) - ($egreso_honorarios + $egreso_lab_ref + $egreso_operativo);

echo json_encode(array(
    'success' => true,
    'fecha' => $fecha,
    'total' => floatval($total),
    'monto_apertura' => floatval($monto_apertura),
    'por_servicio' => $ingresos_por_servicio,
    'por_area' => $ingresos_por_area,
    'por_pago' => $ingresos_por_pago,
    'egreso_honorarios' => $egreso_honorarios,
    'egreso_lab_ref' => $egreso_lab_ref,
    'egreso_operativo' => $egreso_operativo,
    'ganancia_dia' => $ganancia_dia,
    'cajas_resumen' => $cajas_resumen,
    'caja_abierta' => $caja_abierta
));
