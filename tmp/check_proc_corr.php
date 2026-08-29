<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../modules/CorrelativoOperativoModule.php';

$q = $conn->query("SELECT id, cotizacion_id, medico_id, fecha_programada, hora_programada, estado_evento FROM agenda_servicios_cotizacion WHERE cotizacion_id IN (438,442) ORDER BY id");
$rows = [];
$pairs = [];
while ($r = $q->fetch_assoc()) {
    $rows[] = $r;
    $key = (int)$r['medico_id'] . '|' . (string)$r['fecha_programada'];
    $pairs[$key] = [
        'medico_id' => (int)$r['medico_id'],
        'fecha' => (string)$r['fecha_programada'],
    ];
}

$maps = correlativo_operativo_rank_maps($conn, array_values($pairs));
foreach ($rows as $r) {
    $agendaId = (int)$r['id'];
    $corr = (int)($maps['agenda'][$agendaId] ?? 0);
    echo 'agenda_id=' . $agendaId
        . ' cot=' . (int)$r['cotizacion_id']
        . ' fecha=' . (string)$r['fecha_programada']
        . ' hora=' . (string)$r['hora_programada']
        . ' estado=' . (string)$r['estado_evento']
        . ' corr=' . $corr
        . PHP_EOL;
}
