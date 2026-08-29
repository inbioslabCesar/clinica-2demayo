<?php
require __DIR__ . '/../config.php';
$pid = 129; // Lucero

echo "ORDENES_IMAGEN_LUCERO\n";
$q = $conn->query("SELECT id,cotizacion_id,medico_id,tipo,indicaciones,estado,fecha FROM ordenes_imagen WHERE paciente_id=$pid AND tipo='rx' ORDER BY fecha DESC,id DESC");
while($q && ($r=$q->fetch_assoc())) echo json_encode($r, JSON_UNESCAPED_UNICODE)."\n";

echo "\nCOTIZACIONES_LUCERO\n";
$q2 = $conn->query("SELECT id,estado,total,total_pagado,saldo_pendiente,fecha FROM cotizaciones WHERE paciente_id=$pid ORDER BY id DESC LIMIT 10");
while($q2 && ($r=$q2->fetch_assoc())) echo json_encode($r, JSON_UNESCAPED_UNICODE)."\n";

echo "\nAGENDA_RX_LUCERO\n";
$q3 = $conn->query("SELECT id,cotizacion_id,cotizacion_detalle_id,medico_id,servicio_tipo,titulo_evento,fecha_programada,hora_programada,estado_evento,created_at FROM agenda_servicios_cotizacion WHERE paciente_id=$pid AND LOWER(TRIM(COALESCE(servicio_tipo,''))) IN ('rayosx','rayos_x','rayos x','rx') ORDER BY fecha_programada DESC,hora_programada DESC,id DESC");
while($q3 && ($r=$q3->fetch_assoc())) echo json_encode($r, JSON_UNESCAPED_UNICODE)."\n";
?>
