<?php
require __DIR__ . '/../config.php';
$dni = '92378167';
$p = $conn->query("SELECT id,nombre,apellido,dni FROM pacientes WHERE dni = '$dni' LIMIT 1")->fetch_assoc();
if(!$p){ echo "NO_PAC\n"; exit; }
$pid = (int)$p['id'];
echo "PAC=".json_encode($p, JSON_UNESCAPED_UNICODE)."\n";

$q1 = $conn->query("SELECT id,cotizacion_id,paciente_id,medico_id,tipo,indicaciones,estado,fecha FROM ordenes_imagen WHERE paciente_id = $pid ORDER BY fecha DESC,id DESC");
echo "ORDENES_IMAGEN\n";
while($q1 && ($r=$q1->fetch_assoc())) echo json_encode($r, JSON_UNESCAPED_UNICODE)."\n";

$q2 = $conn->query("SELECT id,cotizacion_id,cotizacion_detalle_id,paciente_id,medico_id,servicio_tipo,descripcion,fecha_programada,hora_programada,estado_evento,correlativo_operativo
                   FROM agenda_servicios_cotizacion
                   WHERE paciente_id = $pid
                   ORDER BY fecha_programada DESC,hora_programada DESC,id DESC");
echo "AGENDA\n";
while($q2 && ($r=$q2->fetch_assoc())) echo json_encode($r, JSON_UNESCAPED_UNICODE)."\n";
?>
