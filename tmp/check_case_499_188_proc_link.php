<?php
require __DIR__ . '/../config.php';
$cotId = 499;
$consultaId = 188;

echo "COTIZACION\n";
$q0=$conn->query("SELECT id,paciente_id,estado,fecha,total,total_pagado,saldo_pendiente FROM cotizaciones WHERE id=$cotId LIMIT 1");
while($q0 && ($r=$q0->fetch_assoc())) echo json_encode($r, JSON_UNESCAPED_UNICODE)."\n";

echo "\nDETALLES_COTIZACION\n";
$q1=$conn->query("SELECT id,servicio_tipo,servicio_id,descripcion,cantidad,consulta_id,medico_id,estado_item FROM cotizaciones_detalle WHERE cotizacion_id=$cotId ORDER BY id ASC");
while($q1 && ($r=$q1->fetch_assoc())) echo json_encode($r, JSON_UNESCAPED_UNICODE)."\n";

echo "\nCONSULTA_188\n";
$q2=$conn->query("SELECT id,paciente_id,medico_id,fecha,hora,estado,tipo_consulta FROM consultas WHERE id=$consultaId LIMIT 1");
while($q2 && ($r=$q2->fetch_assoc())) echo json_encode($r, JSON_UNESCAPED_UNICODE)."\n";

echo "\nORDENES_PROCEDIMIENTOS_POR_CONSULTA_188\n";
$q3=$conn->query("SELECT id,consulta_id,paciente_id,cotizacion_id,procedimientos_json,estado,fecha,updated_at FROM ordenes_procedimientos WHERE consulta_id=$consultaId ORDER BY id DESC");
$c3=0; while($q3 && ($r=$q3->fetch_assoc())){ $c3++; echo json_encode($r, JSON_UNESCAPED_UNICODE)."\n"; }
if($c3===0) echo "(sin filas)\n";

echo "\nORDENES_PROCEDIMIENTOS_POR_COT_499\n";
$q4=$conn->query("SELECT id,consulta_id,paciente_id,cotizacion_id,procedimientos_json,estado,fecha,updated_at FROM ordenes_procedimientos WHERE cotizacion_id=$cotId ORDER BY id DESC");
$c4=0; while($q4 && ($r=$q4->fetch_assoc())){ $c4++; echo json_encode($r, JSON_UNESCAPED_UNICODE)."\n"; }
if($c4===0) echo "(sin filas)\n";

if ($c4 > 0) {
  $q5=$conn->query("SELECT id,descripcion FROM tarifas WHERE id IN (SELECT CAST(JSON_UNQUOTE(JSON_EXTRACT(procedimientos_json, '$[0]')) AS UNSIGNED) FROM ordenes_procedimientos WHERE cotizacion_id=$cotId LIMIT 1)");
  while($q5 && ($r=$q5->fetch_assoc())) echo json_encode($r, JSON_UNESCAPED_UNICODE)."\n";
}
?>
