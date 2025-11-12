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
        SELECT id, total_efectivo, total_tarjetas, total_transferencias, total_otros
        FROM cajas 
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

    // Calcular totales REALES desde ingresos_diarios (datos actualizados)
    $stmt_totales = $pdo->prepare("
        SELECT 
            metodo_pago,
            SUM(monto) as total
        FROM ingresos_diarios 
        WHERE caja_id = ?
        GROUP BY metodo_pago
    ");
    $stmt_totales->execute([$caja['id']]);
    $totales_reales = $stmt_totales->fetchAll(PDO::FETCH_KEY_PAIR);

    // Mapear a los campos de la tabla cajas
    $total_efectivo = floatval($totales_reales['efectivo'] ?? 0);
    $total_tarjetas = floatval($totales_reales['tarjeta'] ?? 0);
    $total_transferencias = floatval($totales_reales['transferencia'] ?? 0) + 
                           floatval($totales_reales['yape'] ?? 0) + 
                           floatval($totales_reales['plin'] ?? 0);  // AQUÍ aparecerán Yape/Plin
    $total_otros = floatval($totales_reales['seguro'] ?? 0) + 
                   floatval($totales_reales['otros'] ?? 0);

    // Calcular total del día
    $total_dia = $total_efectivo + $total_tarjetas + $total_transferencias + $total_otros;

    // Obtener resumen por tipo de ingreso
    $stmt = $pdo->prepare("
        SELECT 
            tipo_ingreso,
            COUNT(*) as cantidad_transacciones,
            SUM(monto) as total_monto,
            SUM(CASE WHEN metodo_pago = 'efectivo' THEN monto ELSE 0 END) as efectivo,
            SUM(CASE WHEN metodo_pago IN ('tarjeta_debito', 'tarjeta_credito') THEN monto ELSE 0 END) as tarjetas,
            SUM(CASE WHEN metodo_pago IN ('transferencia', 'yape', 'plin') THEN monto ELSE 0 END) as transferencias
        FROM ingresos_diarios 
        WHERE caja_id = ?
        GROUP BY tipo_ingreso
        ORDER BY total_monto DESC
    ");
    $stmt->execute([$caja['id']]);
    $ingresos_por_tipo = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Obtener últimas transacciones
    $stmt = $pdo->prepare("
        SELECT 
            tipo_ingreso,
            area,
            descripcion,
            monto,
            metodo_pago,
            DATE_FORMAT(fecha_hora, '%H:%i') as hora,
            paciente_nombre
        FROM ingresos_diarios 
        WHERE caja_id = ?
        ORDER BY fecha_hora DESC
        LIMIT 10
    ");
    $stmt->execute([$caja['id']]);
    $ultimas_transacciones = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'success' => true,
        'resumen' => [
            'total_efectivo' => $total_efectivo,
            'total_tarjetas' => $total_tarjetas,
            'total_transferencias' => $total_transferencias,  // AQUÍ aparecerán Yape/Plin
            'total_otros' => $total_otros,
            'total_dia' => $total_dia,
            'ingresos_por_tipo' => $ingresos_por_tipo,
            'ultimas_transacciones' => $ultimas_transacciones,
            'cantidad_total_transacciones' => count($ultimas_transacciones)
        ]
    ]);

} catch (Exception $e) {
    error_log("Error en api_resumen_ingresos.php: " . $e->getMessage());
    echo json_encode([
        'success' => false,
        'error' => 'Error interno del servidor'
    ]);
}
?>