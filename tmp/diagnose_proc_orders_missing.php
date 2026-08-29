<?php
require __DIR__ . '/../config.php';

echo "COUNT_ORDENES_PROCEDIMIENTOS\n";
$q1=$conn->query("SELECT COUNT(*) total, SUM(CASE WHEN cotizacion_id IS NOT NULL AND cotizacion_id>0 THEN 1 ELSE 0 END) con_cotizacion, SUM(CASE WHEN consulta_id IS NOT NULL AND consulta_id>0 THEN 1 ELSE 0 END) con_consulta FROM ordenes_procedimientos");
echo json_encode(($q1?$q1->fetch_assoc():[]), JSON_UNESCAPED_UNICODE)."\n";

echo "\nULTIMAS_20_ORDENES_PROCEDIMIENTOS\n";
$q2=$conn->query("SELECT id,consulta_id,paciente_id,cotizacion_id,procedimientos_json,estado,fecha,updated_at FROM ordenes_procedimientos ORDER BY id DESC LIMIT 20");
while($q2 && ($r=$q2->fetch_assoc())) echo json_encode($r, JSON_UNESCAPED_UNICODE)."\n";

// Revisar casos de cotizacion pagada con procedimientos pero sin orden

echo "\nCOTIZACIONES_PAGADAS_CON_PROCED_Y_SIN_ORDEN (10)\n";
$sql = "SELECT c.id cotizacion_id, c.paciente_id, c.fecha, c.estado,
        SUM(CASE WHEN LOWER(TRIM(COALESCE(cd.servicio_tipo,''))) IN ('procedimiento','procedimientos') THEN 1 ELSE 0 END) n_proc,
        MAX(cd.consulta_id) consulta_id
FROM cotizaciones c
INNER JOIN cotizaciones_detalle cd ON cd.cotizacion_id=c.id
LEFT JOIN ordenes_procedimientos op ON op.cotizacion_id=c.id
WHERE LOWER(TRIM(COALESCE(c.estado,''))) IN ('pagado','pagada','parcial','control')
GROUP BY c.id
HAVING n_proc > 0 AND COUNT(op.id)=0
ORDER BY c.id DESC
LIMIT 10";
$q3=$conn->query($sql);
while($q3 && ($r=$q3->fetch_assoc())) echo json_encode($r, JSON_UNESCAPED_UNICODE)."\n";
?>
