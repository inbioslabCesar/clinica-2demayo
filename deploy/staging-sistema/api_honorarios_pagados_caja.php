<?php
require_once __DIR__ . '/init_api.php';
require_once 'config.php';

$caja_id = isset($_GET['caja_id']) ? intval($_GET['caja_id']) : 0;
if (!$caja_id) {
    echo json_encode(['success' => false, 'error' => 'Caja ID requerido']);
    exit;
}
// Obtener fecha de la caja
// Usar la columna correcta 'fecha' para la fecha de la caja

// Buscar el rango de fechas de los ingresos del día asociados a la caja
$stmt = $conn->prepare('SELECT MIN(DATE(fecha_hora)) as min_fecha, MAX(DATE(fecha_hora)) as max_fecha FROM ingresos_diarios WHERE caja_id = ?');
$stmt->bind_param('i', $caja_id);
$stmt->execute();
$res = $stmt->get_result();
if ($row = $res->fetch_assoc()) {
    $min_fecha = $row['min_fecha'];
    $max_fecha = $row['max_fecha'];
    error_log('Rango de fechas de ingresos: ' . $min_fecha . ' a ' . $max_fecha);
    if ($min_fecha && $max_fecha) {
        // Buscar honorarios pagados en ese rango
        $stmt2 = $conn->prepare("SELECT COALESCE(SUM(monto_medico),0) as total_honorarios FROM honorarios_medicos_movimientos WHERE estado_pago_medico = 'pagado' AND DATE(fecha) BETWEEN ? AND ?");
        $stmt2->bind_param('ss', $min_fecha, $max_fecha);
        $stmt2->execute();
        $res2 = $stmt2->get_result();
        $total = $res2->fetch_assoc()['total_honorarios'] ?? 0;
        error_log('Total honorarios pagados encontrado: ' . $total);
        echo json_encode(['success' => true, 'total_honorarios' => floatval($total)]);
    } else {
        // No hay ingresos, no hay honorarios pagados
        echo json_encode(['success' => true, 'total_honorarios' => 0]);
    }
} else {
    echo json_encode(['success' => false, 'error' => 'No se encontraron ingresos para la caja']);
}
?>
