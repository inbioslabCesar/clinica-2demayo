<?php
require __DIR__ . '/../config.php';

$nombre = 'BRIANA YARITA GARCIA TACILLA';

$stmtPac = $conn->prepare("SELECT id, nombre FROM pacientes WHERE UPPER(nombre) LIKE UPPER(?) ORDER BY id DESC LIMIT 5");
$like = '%' . $nombre . '%';
$stmtPac->bind_param('s', $like);
$stmtPac->execute();
$resPac = $stmtPac->get_result();
$pacs = [];
while($r = $resPac->fetch_assoc()) $pacs[] = $r;
$stmtPac->close();

echo "PACIENTES\n";
foreach($pacs as $p) echo json_encode($p, JSON_UNESCAPED_UNICODE)."\n";

if (!$pacs) exit;
$pid = (int)$pacs[0]['id'];

echo "\nCOTIZACIONES RECIENTES\n";
$qCot = $conn->query("SELECT id, fecha, total, estado, paciente_id FROM cotizaciones WHERE paciente_id = {$pid} ORDER BY id DESC LIMIT 10");
while($qCot && ($r=$qCot->fetch_assoc())) echo json_encode($r, JSON_UNESCAPED_UNICODE)."\n";

echo "\nAGENDA RX (cot 502/501 si aplica)\n";
$qAg = $conn->query("SELECT id, cotizacion_id, cotizacion_detalle_id, medico_id, servicio_tipo, descripcion, fecha_programada, estado, correlativo_operativo
                     FROM agenda_servicios_cotizacion
                     WHERE paciente_id = {$pid}
                     ORDER BY id DESC LIMIT 30");
while($qAg && ($r=$qAg->fetch_assoc())) echo json_encode($r, JSON_UNESCAPED_UNICODE)."\n";

echo "\nORDENES IMAGEN\n";
$qOi = $conn->query("SELECT oi.id, oi.cotizacion_id, oi.medico_id, oi.tipo, oi.indicaciones, oi.estado, oi.fecha, oi.paciente_id
                     FROM ordenes_imagen oi
                     WHERE oi.paciente_id = {$pid}
                     ORDER BY oi.id DESC LIMIT 30");
while($qOi && ($r=$qOi->fetch_assoc())) echo json_encode($r, JSON_UNESCAPED_UNICODE)."\n";
?>
