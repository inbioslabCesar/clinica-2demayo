<?php
require __DIR__ . '/../config.php';

$medicoId = 5;
$fecha = '2026-08-24';

// Atenciones (agenda) con correlativo del dia
$qAgenda = $conn->query("SELECT id, cotizacion_id, cotizacion_detalle_id, titulo_evento, fecha_programada, hora_programada, estado_evento\n                         FROM agenda_servicios_cotizacion\n                         WHERE medico_id = $medicoId\n                           AND fecha_programada = '$fecha'\n                           AND LOWER(TRIM(COALESCE(servicio_tipo,''))) IN ('rayosx','rayos_x','rayos x','rx')\n                         ORDER BY hora_programada ASC, id ASC");
$idx = 0;
$agendaRows = [];
while($qAgenda && ($r=$qAgenda->fetch_assoc())) {
  $idx++;
  $r['correlativo_calculado'] = $idx;
  $agendaRows[] = $r;
}
echo "AGENDA_CORRELATIVOS\n";
foreach($agendaRows as $r) echo json_encode($r, JSON_UNESCAPED_UNICODE)."\n";

// Ordenes imagen del mismo medico/dia (filtrables como en Mis Informes)
$qOi = $conn->query("SELECT id, cotizacion_id, medico_id, tipo, indicaciones, estado, fecha\n                    FROM ordenes_imagen\n                    WHERE medico_id = $medicoId\n                      AND tipo = 'rx'\n                      AND DATE(fecha) = '$fecha'\n                    ORDER BY id ASC");
echo "\\nORDENES_RX\n";
while($qOi && ($r=$qOi->fetch_assoc())) echo json_encode($r, JSON_UNESCAPED_UNICODE)."\n";
?>
