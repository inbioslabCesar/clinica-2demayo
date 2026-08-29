<?php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../modules/CorrelativoOperativoModule.php';

$consultaIds = [188, 189];
$agendaIds = [310, 311];

$pairs = [];
$rowsConsultas = [];
$rowsAgenda = [];

$q1 = $conn->query("SELECT id, medico_id, fecha, hora, correlativo_dia_medico FROM consultas WHERE id IN (188,189)");
while ($r = $q1->fetch_assoc()) {
    $rowsConsultas[] = $r;
    $pairs[(int)$r['medico_id'] . '|' . (string)$r['fecha']] = [
        'medico_id' => (int)$r['medico_id'],
        'fecha' => (string)$r['fecha'],
    ];
}

$q2 = $conn->query("SELECT id, medico_id, fecha_programada, hora_programada, estado_evento, cotizacion_id FROM agenda_servicios_cotizacion WHERE id IN (310,311)");
while ($r = $q2->fetch_assoc()) {
    $rowsAgenda[] = $r;
    $pairs[(int)$r['medico_id'] . '|' . (string)$r['fecha_programada']] = [
        'medico_id' => (int)$r['medico_id'],
        'fecha' => (string)$r['fecha_programada'],
    ];
}

$maps = correlativo_operativo_rank_maps($conn, array_values($pairs));

foreach ($rowsConsultas as $r) {
    $id = (int)$r['id'];
    $rank = (int)($maps['consulta'][$id] ?? 0);
    echo 'CONSULTA id=' . $id
        . ' hora=' . (string)$r['hora']
        . ' corr_consulta=' . (int)($r['correlativo_dia_medico'] ?? 0)
        . ' corr_unificado=' . $rank
        . PHP_EOL;
}

foreach ($rowsAgenda as $r) {
    $id = (int)$r['id'];
    $rank = (int)($maps['agenda'][$id] ?? 0);
    echo 'AGENDA id=' . $id
        . ' cot=' . (int)$r['cotizacion_id']
        . ' hora=' . (string)$r['hora_programada']
        . ' estado=' . (string)$r['estado_evento']
        . ' corr_unificado=' . $rank
        . PHP_EOL;
}
