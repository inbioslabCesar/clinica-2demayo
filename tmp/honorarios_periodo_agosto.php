<?php
require __DIR__ . '/../config.php';
$medicoId=5;
$ini='2026-08-01';
$fin='2026-08-31';
$q=$conn->query("SELECT
ROUND(COALESCE(SUM(CASE WHEN LOWER(TRIM(COALESCE(estado_pago_medico,'')))='pendiente' THEN monto_medico ELSE 0 END),0),2) pendiente_periodo,
ROUND(COALESCE(SUM(CASE WHEN LOWER(TRIM(COALESCE(estado_pago_medico,'')))='pagado' THEN monto_medico ELSE 0 END),0),2) pagado_periodo,
ROUND(COALESCE(SUM(CASE WHEN LOWER(TRIM(COALESCE(estado_pago_medico,'')))='cancelado' THEN monto_medico ELSE 0 END),0),2) cancelado_periodo
FROM honorarios_medicos_movimientos
WHERE medico_id=$medicoId
AND fecha BETWEEN '$ini' AND '$fin'");
$r=$q?$q->fetch_assoc():[];
echo json_encode($r, JSON_UNESCAPED_UNICODE)."\n";
?>
