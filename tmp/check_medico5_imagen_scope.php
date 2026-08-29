<?php
require __DIR__ . '/../config.php';
$medico_id = 5;
$where = "(
    oi.medico_id = {$medico_id}
    OR (
        COALESCE(oi.medico_id, 0) = 0
        AND EXISTS (
            SELECT 1
            FROM agenda_servicios_cotizacion a
            WHERE a.cotizacion_id = oi.cotizacion_id
              AND a.medico_id = {$medico_id}
              AND (
                    (oi.tipo = 'rx' AND LOWER(TRIM(COALESCE(a.servicio_tipo, ''))) IN ('rayosx', 'rayos_x', 'rayos x', 'rx'))
                    OR (oi.tipo = 'ecografia' AND LOWER(TRIM(COALESCE(a.servicio_tipo, ''))) = 'ecografia')
                    OR (oi.tipo = 'tomografia' AND LOWER(TRIM(COALESCE(a.servicio_tipo, ''))) = 'tomografia')
                  )
        )
    )
)";
$q = $conn->query("SELECT oi.id,oi.cotizacion_id,oi.medico_id,oi.tipo FROM ordenes_imagen oi WHERE {$where} ORDER BY oi.id DESC LIMIT 12");
while ($q && ($r = $q->fetch_assoc())) {
  echo json_encode($r, JSON_UNESCAPED_UNICODE) . "\n";
}
?>
