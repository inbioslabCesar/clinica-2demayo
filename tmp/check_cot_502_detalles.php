<?php
require __DIR__ . '/../config.php';
$cid = 502;
$q = $conn->query("SELECT id,servicio_tipo,servicio_id,descripcion,cantidad,medico_id,consulta_id FROM cotizaciones_detalle WHERE cotizacion_id={$cid} ORDER BY id ASC");
while ($q && ($r = $q->fetch_assoc())) {
    echo json_encode($r, JSON_UNESCAPED_UNICODE) . "\n";
}
?>
