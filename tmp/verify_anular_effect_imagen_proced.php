<?php
require __DIR__ . '/../config.php';
$medicoId = 5;

echo "IMAGEN_ANULADAS_QUE_SIGUEN_EN_TABLA\n";
$q1 = $conn->query("SELECT oi.id, oi.cotizacion_id, oi.tipo, oi.estado, oi.indicaciones, oi.fecha, c.estado cot_estado
                    FROM ordenes_imagen oi
                    INNER JOIN cotizaciones c ON c.id = oi.cotizacion_id
                    WHERE oi.medico_id = $medicoId
                      AND LOWER(TRIM(COALESCE(c.estado,''))) IN ('anulada','cancelada')
                    ORDER BY oi.id DESC LIMIT 20");
$c1=0;
while($q1 && ($r=$q1->fetch_assoc())){ $c1++; echo json_encode($r, JSON_UNESCAPED_UNICODE)."\n"; }
if($c1===0) echo "(sin filas)\n";

echo "\nPROCEDIMIENTOS_DETALLE_ANULADOS_MEDICO\n";
$q2 = $conn->query("SELECT cd.id detalle_id, cd.cotizacion_id, cd.descripcion, cd.estado_item, ct.estado cot_estado, ct.fecha
                    FROM cotizaciones_detalle cd
                    INNER JOIN cotizaciones ct ON ct.id = cd.cotizacion_id
                    LEFT JOIN consultas c ON c.id = cd.consulta_id
                    WHERE LOWER(TRIM(COALESCE(cd.servicio_tipo,''))) IN ('procedimiento','procedimientos')
                      AND (COALESCE(cd.medico_id,0) = $medicoId OR COALESCE(c.medico_id,0) = $medicoId)
                      AND LOWER(TRIM(COALESCE(ct.estado,''))) IN ('anulada','anulado','cancelada','cancelado')
                    ORDER BY cd.id DESC LIMIT 20");
$c2=0;
while($q2 && ($r=$q2->fetch_assoc())){ $c2++; echo json_encode($r, JSON_UNESCAPED_UNICODE)."\n"; }
if($c2===0) echo "(sin filas)\n";

echo "\nPROCEDIMIENTOS_QUE_ENTRARIAN_PANEL_ACTUAL\n";
$q3 = $conn->query("SELECT COUNT(*) total
                    FROM cotizaciones_detalle cd
                    INNER JOIN cotizaciones ct ON ct.id = cd.cotizacion_id
                    LEFT JOIN procedimientos_atenciones pa ON pa.cotizacion_detalle_id = cd.id
                    LEFT JOIN consultas c ON c.id = cd.consulta_id
                    WHERE LOWER(TRIM(COALESCE(cd.servicio_tipo,''))) IN ('procedimiento','procedimientos')
                      AND LOWER(TRIM(COALESCE(ct.estado,''))) NOT IN ('anulado','anulada')
                      AND LOWER(TRIM(COALESCE(cd.estado_item,'activo'))) <> 'eliminado'
                      AND LOWER(TRIM(COALESCE(pa.estado,'pendiente'))) <> 'cancelado'
                      AND (COALESCE(cd.medico_id,0) = $medicoId OR COALESCE(c.medico_id,0) = $medicoId)");
$r3 = $q3 ? $q3->fetch_assoc() : null;
echo json_encode($r3 ?: ['total'=>0], JSON_UNESCAPED_UNICODE)."\n";
?>
