<?php
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '',
    'secure' => false, // Cambiado a false para desarrollo local (HTTP)
    'httponly' => true,
    'samesite' => 'Lax', // Cambiado de None a Lax para mejor compatibilidad
]);
session_start(); // Asegurando que session_start se llame después de la configuración de cookies
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
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Content-Type: application/json');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}
require_once __DIR__ . '/config.php';

date_default_timezone_set('America/Lima');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    echo json_encode(['success' => false, 'error' => 'Método no permitido']);
    exit;
}

// Solo administrador puede ver el resumen total
if (!isset($_SESSION['usuario']) || !is_array($_SESSION['usuario'])) {
    echo json_encode(['success' => false, 'error' => 'Acceso denegado']);
    exit;
}

$usuario = $_SESSION['usuario'];
$fecha = isset($_GET['fecha']) ? $_GET['fecha'] : date('Y-m-d');

$monto_apertura = 0;

// Mostrar solo el resumen de la caja del usuario actual (admin o recepcionista)
// Calcular egreso de honorarios médicos
// Egreso honorarios médicos
$stmt = $pdo->prepare('SELECT SUM(monto) as egreso_honorarios FROM egresos WHERE DATE(created_at) = ? AND usuario_id = ? AND tipo_egreso = "honorario_medico"');
$stmt->execute([$fecha, $usuario['id']]);
$egreso_honorarios = $stmt->fetchColumn();
$egreso_honorarios = $egreso_honorarios ? floatval($egreso_honorarios) : 0.0;

// Egreso laboratorio de referencia (pagados)
$stmt = $pdo->prepare('SELECT SUM(monto) as egreso_lab_ref FROM laboratorio_referencia_movimientos WHERE DATE(fecha) = ? AND estado = "pagado"');
$stmt->execute([$fecha]);
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

    $cajas_resumen = [];
    if ($usuario['rol'] === 'administrador') {
        // Listado de cajas del día con monto de apertura, rol y cobrado por cada recepcionista
        $stmt = $pdo->prepare('
            SELECT c.id, c.usuario_id, u.nombre as usuario_nombre, u.rol as usuario_rol, c.turno, c.estado,
                c.monto_apertura,
                SUM(i.monto) as total_caja
            FROM cajas c
            LEFT JOIN usuarios u ON c.usuario_id = u.id
            LEFT JOIN ingresos_diarios i ON i.caja_id = c.id
            WHERE DATE(c.fecha) = ?
            GROUP BY c.id, c.usuario_id, c.turno, c.estado, u.nombre, u.rol, c.monto_apertura
            ORDER BY c.turno ASC, c.estado DESC
        ');
        $stmt->execute([$fecha]);
        $cajas_resumen = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Para cada caja, obtener ingresos por tipo de pago y tipo de servicio
        foreach ($cajas_resumen as &$caja) {
            // Ingresos por tipo de pago
            $stmtPago = $pdo->prepare('SELECT metodo_pago, SUM(monto) as total_pago FROM ingresos_diarios WHERE caja_id = ? GROUP BY metodo_pago');
            $stmtPago->execute([$caja['id']]);
            $caja['por_pago'] = $stmtPago->fetchAll(PDO::FETCH_ASSOC);

            // Ingresos por tipo de servicio
            $stmtServ = $pdo->prepare('SELECT tipo_ingreso, SUM(monto) as total_servicio FROM ingresos_diarios WHERE caja_id = ? GROUP BY tipo_ingreso');
            $stmtServ->execute([$caja['id']]);
            $caja['por_servicio'] = $stmtServ->fetchAll(PDO::FETCH_ASSOC);
            // Egreso honorarios médicos por caja
            $stmtEgreso = $pdo->prepare('SELECT SUM(monto) as egreso_honorarios FROM egresos WHERE caja_id = ? AND tipo_egreso = "honorario_medico"');
            $stmtEgreso->execute([$caja['id']]);
            $egresoCaja = $stmtEgreso->fetchColumn();
            $caja['egreso_honorarios'] = $egresoCaja ? floatval($egresoCaja) : 0.0;
        }
        unset($caja);

        // Resumen principal solo de la caja del usuario actual (admin)
        $stmtCajaAdmin = $pdo->prepare('SELECT id FROM cajas WHERE DATE(fecha) = ? AND usuario_id = ? LIMIT 1');
        $stmtCajaAdmin->execute([$fecha, $usuario['id']]);
        $cajaAdminRow = $stmtCajaAdmin->fetch(PDO::FETCH_ASSOC);
        $cajaAdminId = $cajaAdminRow ? $cajaAdminRow['id'] : null;
        if ($cajaAdminId) {
            // Ingresos por tipo de pago solo de la caja admin
            $stmtPagoAdmin = $pdo->prepare('SELECT metodo_pago, SUM(monto) as total_pago FROM ingresos_diarios WHERE caja_id = ? GROUP BY metodo_pago');
            $stmtPagoAdmin->execute([$cajaAdminId]);
            $ingresos_por_pago = $stmtPagoAdmin->fetchAll(PDO::FETCH_ASSOC);

            // Ingresos por tipo de servicio solo de la caja admin
            $stmtServAdmin = $pdo->prepare('SELECT tipo_ingreso, SUM(monto) as total_servicio FROM ingresos_diarios WHERE caja_id = ? GROUP BY tipo_ingreso');
            $stmtServAdmin->execute([$cajaAdminId]);
            $ingresos_por_servicio = $stmtServAdmin->fetchAll(PDO::FETCH_ASSOC);

            // Total solo de la caja admin
            $stmtTotalAdmin = $pdo->prepare('SELECT SUM(monto) as total FROM ingresos_diarios WHERE caja_id = ?');
            $stmtTotalAdmin->execute([$cajaAdminId]);
            $total = $stmtTotalAdmin->fetchColumn();
            $total = $total ? floatval($total) : 0.0;
        }
    }

echo json_encode([
    'success' => true,
    'fecha' => $fecha,
    'total' => floatval($total),
    'monto_apertura' => floatval($monto_apertura),
    'por_servicio' => $ingresos_por_servicio,
    'por_area' => $ingresos_por_area,
    'por_pago' => $ingresos_por_pago,
    'egreso_honorarios' => $egreso_honorarios,
    'egreso_lab_ref' => $egreso_lab_ref,
    'cajas_resumen' => $cajas_resumen,
    'caja_abierta' => $caja_abierta
]);
?>
