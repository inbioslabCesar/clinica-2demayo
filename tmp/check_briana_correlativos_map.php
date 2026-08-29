<?php
require __DIR__ . '/../config.php';
$pid = 166;
$sql = "SELECT
          oi.id AS orden_id,
          oi.cotizacion_id,
          oi.medico_id,
          oi.indicaciones,
          oi.fecha,
          a.id AS agenda_id,
          a.cotizacion_detalle_id,
          a.fecha_programada,
          a.hora_programada,
          a.descripcion,
          a.estado_evento
        FROM ordenes_imagen oi
        LEFT JOIN agenda_servicios_cotizacion a
          ON a.cotizacion_id = oi.cotizacion_id
         AND LOWER(TRIM(COALESCE(a.servicio_tipo,''))) IN ('rayosx','rayos_x','rayos x','rx')
         AND oi.indicaciones REGEXP CONCAT('Detalle #', a.cotizacion_detalle_id, '([^0-9]|$)')
        WHERE oi.paciente_id = $pid
          AND oi.cotizacion_id = 502
          AND oi.tipo = 'rx'
        ORDER BY oi.id ASC, a.id ASC";
$q = $conn->query($sql);
while($q && ($r=$q->fetch_assoc())) echo json_encode($r, JSON_UNESCAPED_UNICODE)."\n";
?>
