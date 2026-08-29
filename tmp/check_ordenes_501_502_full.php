<?php
require __DIR__ . '/../config.php';
$q = $conn->query("SELECT id,cotizacion_id,medico_id,tipo,indicaciones,estado,fecha FROM ordenes_imagen WHERE cotizacion_id IN (501,502) ORDER BY cotizacion_id,id");
while($q && ($r=$q->fetch_assoc())) echo json_encode($r, JSON_UNESCAPED_UNICODE)."\n";
?>
