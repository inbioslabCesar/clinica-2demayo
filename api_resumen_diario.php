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
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Content-Type: application/json');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}
require_once __DIR__ . '/db.php';

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

if ($usuario['rol'] === 'administrador') {
    // Total ingresos del día (todos)
    $stmt = $pdo->prepare('SELECT SUM(monto) as total FROM ingresos_diarios WHERE DATE(fecha_hora) = ?');
    $stmt->execute([$fecha]);
    $total = $stmt->fetchColumn();

    // Ingresos por tipo de servicio
    $stmt = $pdo->prepare('SELECT tipo_ingreso, SUM(monto) as total_servicio FROM ingresos_diarios WHERE DATE(fecha_hora) = ? GROUP BY tipo_ingreso');
    $stmt->execute([$fecha]);
    $ingresos_por_servicio = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Ingresos por área
    $stmt = $pdo->prepare('SELECT area, SUM(monto) as total_area FROM ingresos_diarios WHERE DATE(fecha_hora) = ? GROUP BY area');
    $stmt->execute([$fecha]);
    $ingresos_por_area = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Ingresos por tipo de pago
    $stmt = $pdo->prepare('SELECT metodo_pago, SUM(monto) as total_pago FROM ingresos_diarios WHERE DATE(fecha_hora) = ? GROUP BY metodo_pago');
    $stmt->execute([$fecha]);
    $ingresos_por_pago = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Obtener el monto de apertura de la caja abierta del día
    $stmt = $pdo->prepare('SELECT monto_apertura FROM cajas WHERE DATE(fecha) = ? AND estado = "abierta" ORDER BY hora_apertura ASC LIMIT 1');
    $stmt->execute([$fecha]);
    $monto_apertura = $stmt->fetchColumn();
    if ($monto_apertura === false || $monto_apertura === null) {
        $monto_apertura = 0;
    }

    // Listado de cajas del día con monto de apertura y cobrado por cada recepcionista
    $stmt = $pdo->prepare('
        SELECT c.id, c.usuario_id, u.nombre as usuario_nombre, c.turno, c.estado,
            c.monto_apertura,
            SUM(i.monto) as total_caja
        FROM cajas c
        LEFT JOIN usuarios u ON c.usuario_id = u.id
        LEFT JOIN ingresos_diarios i ON i.caja_id = c.id
        WHERE DATE(c.fecha) = ?
        GROUP BY c.id, c.usuario_id, c.turno, c.estado, u.nombre, c.monto_apertura
        ORDER BY c.turno ASC, c.estado DESC
    ');
    $stmt->execute([$fecha]);
    $cajas_resumen = $stmt->fetchAll(PDO::FETCH_ASSOC);

} else {
    // Solo ingresos del usuario actual (recepcionista)
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

    // Consultar el monto de apertura de la caja del recepcionista
    $stmt = $pdo->prepare('SELECT monto_apertura FROM cajas WHERE DATE(fecha) = ? AND usuario_id = ? AND estado = "abierta" ORDER BY hora_apertura ASC LIMIT 1');
    $stmt->execute([$fecha, $usuario['id']]);
    $monto_apertura = $stmt->fetchColumn();
    if ($monto_apertura === false || $monto_apertura === null) {
        $monto_apertura = 0;
    }

    $cajas_resumen = [];
}

echo json_encode([
    'success' => true,
    'fecha' => $fecha,
    'total' => floatval($total),
    'monto_apertura' => floatval($monto_apertura),
    'por_servicio' => $ingresos_por_servicio,
    'por_area' => $ingresos_por_area,
    'por_pago' => $ingresos_por_pago,
    'cajas_resumen' => $cajas_resumen
]);
?>
