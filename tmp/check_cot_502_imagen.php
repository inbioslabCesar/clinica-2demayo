<?php
require __DIR__ . '/../config.php';
$cid = 502;
echo "AGENDA\n";
$q1 = $conn->query("SELECT id,cotizacion_detalle_id,servicio_tipo,medico_id,fecha_programada,hora_programada,estado_evento,titulo_evento FROM agenda_servicios_cotizacion WHERE cotizacion_id={$cid} ORDER BY id ASC");
while ($q1 && ($r = $q1->fetch_assoc())) {
    echo json_encode($r, JSON_UNESCAPED_UNICODE) . "\n";
}
echo "ORDENES_IMAGEN\n";
$q2 = $conn->query("SELECT id,cotizacion_id,medico_id,tipo,estado,fecha,indicaciones FROM ordenes_imagen WHERE cotizacion_id={$cid} ORDER BY id ASC");
while ($q2 && ($r = $q2->fetch_assoc())) {
    echo json_encode($r, JSON_UNESCAPED_UNICODE) . "\n";
}
?>
