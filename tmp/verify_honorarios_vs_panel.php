<?php
require __DIR__ . '/../config.php';
$medicoId = 5;

echo "HONORARIOS_AGREGADO\n";
$q1 = $conn->query("SELECT
ROUND(COALESCE(SUM(CASE WHEN LOWER(TRIM(COALESCE(estado_pago_medico,'')))='pendiente' THEN monto_medico ELSE 0 END),0),2) pendiente,
ROUND(COALESCE(SUM(CASE WHEN LOWER(TRIM(COALESCE(estado_pago_medico,'')))='pagado' THEN monto_medico ELSE 0 END),0),2) pagado,
ROUND(COALESCE(SUM(CASE WHEN LOWER(TRIM(COALESCE(estado_pago_medico,'')))='cancelado' THEN monto_medico ELSE 0 END),0),2) cancelado,
ROUND(COALESCE(SUM(monto_medico),0),2) total
FROM honorarios_medicos_movimientos
WHERE medico_id = $medicoId");
echo json_encode(($q1?$q1->fetch_assoc():[]), JSON_UNESCAPED_UNICODE)."\n";

echo "\nHONORARIOS_POR_TIPO\n";
$q2 = $conn->query("SELECT LOWER(TRIM(COALESCE(tipo_servicio,''))) tipo_servicio,
LOWER(TRIM(COALESCE(estado_pago_medico,''))) estado_pago_medico,
COUNT(*) cantidad,
ROUND(COALESCE(SUM(monto_medico),0),2) monto
FROM honorarios_medicos_movimientos
WHERE medico_id = $medicoId
GROUP BY 1,2
ORDER BY 1,2");
while($q2 && ($r=$q2->fetch_assoc())) echo json_encode($r, JSON_UNESCAPED_UNICODE)."\n";

echo "\nULTIMOS_15\n";
$q3 = $conn->query("SELECT id, fecha, consulta_id, tipo_servicio, descripcion, estado_pago_medico, monto_medico, fecha_pago_medico, metodo_pago_medico, fuente_pago_medico
FROM honorarios_medicos_movimientos
WHERE medico_id = $medicoId
ORDER BY id DESC
LIMIT 15");
while($q3 && ($r=$q3->fetch_assoc())) echo json_encode($r, JSON_UNESCAPED_UNICODE)."\n";

// Simular sesión médica para leer endpoint del panel
if (session_status() !== PHP_SESSION_ACTIVE) session_start();
$_SESSION['medico_id'] = $medicoId;
$_SESSION['medico'] = ['id'=>$medicoId,'rol'=>'medico','nombre'=>'JHONY'];
$_GET = ['medico_id'=>(string)$medicoId];
ob_start();
include __DIR__ . '/../api_medico_cuenta_corriente.php';
$out = ob_get_clean();
$data = json_decode($out, true);

echo "\nAPI_CUENTA_CORRIENTE_RESUMEN\n";
echo json_encode($data['resumen'] ?? null, JSON_UNESCAPED_UNICODE)."\n";

echo "\nAPI_CUENTA_CORRIENTE_PERIODO\n";
echo json_encode($data['periodo_actual'] ?? null, JSON_UNESCAPED_UNICODE)."\n";
?>
