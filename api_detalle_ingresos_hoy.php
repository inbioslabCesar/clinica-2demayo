<?php
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '.clinica2demayo.com',
    'secure' => true,
    'httponly' => true,
    'samesite' => 'Lax',
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
require_once 'config.php';

try {
    // Verificar autenticación
    if (!isset($_SESSION['usuario']) || !is_array($_SESSION['usuario'])) {
        echo json_encode(['success' => false, 'error' => 'Usuario no autenticado']);
        exit;
    }

    $usuario_id = $_SESSION['usuario']['id'];
    $fecha_hoy = date('Y-m-d');

    // Obtener la caja actual del usuario
    $stmt = $pdo->prepare("
        SELECT id FROM cajas 
        WHERE fecha = ? AND usuario_id = ? AND estado != 'cerrada'
        ORDER BY created_at DESC 
        LIMIT 1
    ");
    $stmt->execute([$fecha_hoy, $usuario_id]);
    $caja = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$caja) {
        echo json_encode(['success' => false, 'error' => 'No hay caja abierta']);
        exit;
    }

    // Obtener últimas transacciones detalladas
    $stmt = $pdo->prepare("
        SELECT 
            i.tipo_ingreso,
            i.area,
            i.descripcion,
            i.monto,
            i.metodo_pago,
            DATE_FORMAT(i.fecha_hora, '%H:%i') as hora,
            i.paciente_nombre,
            CASE 
                WHEN i.metodo_pago = 'efectivo' THEN '💵'
                WHEN i.metodo_pago IN ('tarjeta_debito', 'tarjeta_credito') THEN '💳'
                WHEN i.metodo_pago = 'yape' THEN '📱'
                WHEN i.metodo_pago = 'plin' THEN '📱'
                WHEN i.metodo_pago = 'transferencia' THEN '🏦'
                ELSE '💰'
            END as icono_metodo
        FROM ingresos_diarios i
        WHERE i.caja_id = ?
        ORDER BY i.fecha_hora DESC
        LIMIT 20
    ");
    $stmt->execute([$caja['id']]);
    $ultimas_transacciones = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Obtener ingresos agrupados por área
    $stmt = $pdo->prepare("
        SELECT 
            i.tipo_ingreso,
            i.area,
            COUNT(*) as cantidad_transacciones,
            SUM(i.monto) as total_monto,
            AVG(i.monto) as promedio_monto,
            SUM(CASE WHEN i.metodo_pago = 'efectivo' THEN i.monto ELSE 0 END) as efectivo,
            SUM(CASE WHEN i.metodo_pago IN ('tarjeta_debito', 'tarjeta_credito') THEN i.monto ELSE 0 END) as tarjetas,
            SUM(CASE WHEN i.metodo_pago IN ('transferencia', 'yape', 'plin') THEN i.monto ELSE 0 END) as transferencias,
            MIN(DATE_FORMAT(i.fecha_hora, '%H:%i')) as primera_transaccion,
            MAX(DATE_FORMAT(i.fecha_hora, '%H:%i')) as ultima_transaccion
        FROM ingresos_diarios i
        WHERE i.caja_id = ?
        GROUP BY i.tipo_ingreso, i.area
        HAVING COUNT(*) > 0
        ORDER BY total_monto DESC, cantidad_transacciones DESC
    ");
    $stmt->execute([$caja['id']]);
    $ingresos_por_area = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Formatear los montos
    foreach ($ingresos_por_area as &$area) {
        $area['total_monto'] = floatval($area['total_monto']);
        $area['promedio_monto'] = floatval($area['promedio_monto']);
        $area['efectivo'] = floatval($area['efectivo']);
        $area['tarjetas'] = floatval($area['tarjetas']);
        $area['transferencias'] = floatval($area['transferencias']);
    }

    foreach ($ultimas_transacciones as &$transaccion) {
        $transaccion['monto'] = floatval($transaccion['monto']);
    }

    // Obtener estadísticas adicionales
    $stmt = $pdo->prepare("
        SELECT 
            COUNT(*) as total_transacciones,
            COUNT(DISTINCT i.tipo_ingreso) as tipos_servicio_activos,
            COUNT(DISTINCT i.area) as areas_activas,
            SUM(i.monto) as total_ingresos,
            DATE_FORMAT(MIN(i.fecha_hora), '%H:%i') as primera_transaccion_dia,
            DATE_FORMAT(MAX(i.fecha_hora), '%H:%i') as ultima_transaccion_dia
        FROM ingresos_diarios i
        WHERE i.caja_id = ?
    ");
    $stmt->execute([$caja['id']]);
    $estadisticas = $stmt->fetch(PDO::FETCH_ASSOC);

    echo json_encode([
        'success' => true,
        'ultimas_transacciones' => $ultimas_transacciones,
        'ingresos_por_area' => $ingresos_por_area,
        'estadisticas' => [
            'total_transacciones' => intval($estadisticas['total_transacciones']),
            'tipos_servicio_activos' => intval($estadisticas['tipos_servicio_activos']),
            'areas_activas' => intval($estadisticas['areas_activas']),
            'total_ingresos' => floatval($estadisticas['total_ingresos']),
            'primera_transaccion_dia' => $estadisticas['primera_transaccion_dia'],
            'ultima_transaccion_dia' => $estadisticas['ultima_transaccion_dia']
        ]
    ]);

} catch (Exception $e) {
    error_log("Error en api_detalle_ingresos_hoy.php: " . $e->getMessage());
    echo json_encode([
        'success' => false,
        'error' => 'Error interno del servidor'
    ]);
}
?>