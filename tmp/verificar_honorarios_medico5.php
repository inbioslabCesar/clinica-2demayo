<?php
require __DIR__ . '/../config.php';
$medicoId = 5;

echo "RESUMEN_HONORARIOS_MOVIMIENTOS\n";
$q1 = $conn->query("SELECT
  LOWER(TRIM(COALESCE(tipo_servicio,''))) tipo_servicio,
  LOWER(TRIM(COALESCE(estado_pago_medico,''))) estado_pago_medico,
  COUNT(*) cantidad,
  ROUND(COALESCE(SUM(monto_medico),0),2) monto_total
FROM honorarios_medicos_movimientos
WHERE medico_id = $medicoId
GROUP BY 1,2
ORDER BY 1,2");
while($q1 && ($r=$q1->fetch_assoc())) echo json_encode($r, JSON_UNESCAPED_UNICODE)."\n";

echo "\nRESUMEN_GLOBAL\n";
$q2 = $conn->query("SELECT
  ROUND(COALESCE(SUM(CASE WHEN LOWER(TRIM(COALESCE(estado_pago_medico,'')))='pendiente' THEN monto_medico ELSE 0 END),0),2) pendiente,
  ROUND(COALESCE(SUM(CASE WHEN LOWER(TRIM(COALESCE(estado_pago_medico,'')))='pagado' THEN monto_medico ELSE 0 END),0),2) pagado,
  ROUND(COALESCE(SUM(CASE WHEN LOWER(TRIM(COALESCE(estado_pago_medico,'')))='cancelado' THEN monto_medico ELSE 0 END),0),2) cancelado,
  ROUND(COALESCE(SUM(monto_medico),0),2) total
FROM honorarios_medicos_movimientos
WHERE medico_id = $medicoId");
$r2 = $q2 ? $q2->fetch_assoc() : null;
echo json_encode($r2 ?: [], JSON_UNESCAPED_UNICODE)."\n";

echo "\nULTIMOS_20_MOVIMIENTOS\n";
$q3 = $conn->query("SELECT id, fecha, consulta_id, cotizacion_id, tipo_servicio, estado_pago_medico, monto_medico, detalle_honorario
FROM honorarios_medicos_movimientos
WHERE medico_id = $medicoId
ORDER BY id DESC
LIMIT 20");
while($q3 && ($r=$q3->fetch_assoc())) echo json_encode($r, JSON_UNESCAPED_UNICODE)."\n";

// cruzar con API medico cuenta corriente
$_GET['medico_id'] = (string)$medicoId;
ob_start();
include __DIR__ . '/../api_medico_cuenta_corriente.php';
$out = ob_get_clean();
$data = json_decode($out, true);
echo "\nAPI_MEDICO_CUENTA_CORRIENTE_RESUMEN\n";
echo json_encode($data['resumen'] ?? null, JSON_UNESCAPED_UNICODE)."\n";
?>
