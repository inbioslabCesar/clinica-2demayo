<?php
require __DIR__ . '/../config.php';

$sql = "SELECT oi.id, oi.cotizacion_id, oi.medico_id, oi.tipo, oi.indicaciones, a.medico_id AS agenda_medico
        FROM ordenes_imagen oi
        INNER JOIN agenda_servicios_cotizacion a ON a.cotizacion_id = oi.cotizacion_id
        WHERE oi.cotizacion_id IN (501,502)
          AND oi.tipo = 'rx'
          AND oi.indicaciones REGEXP 'Detalle #[0-9]+'
          AND LOWER(TRIM(COALESCE(a.servicio_tipo,''))) IN ('rayosx','rayos_x','rayos x','rx')";
$res = $conn->query($sql);
$upd = 0;
while ($res && ($r = $res->fetch_assoc())) {
    $oid = (int)$r['id'];
    $indic = (string)$r['indicaciones'];
    $cid = (int)$r['cotizacion_id'];
    $agendaMed = (int)($r['agenda_medico'] ?? 0);
    if ($agendaMed <= 0) continue;

    if (!preg_match('/detalle\s*#\s*(\d+)/i', $indic, $m)) continue;
    $detalleId = (int)($m[1] ?? 0);
    if ($detalleId <= 0) continue;

    $stmtAg = $conn->prepare('SELECT medico_id FROM agenda_servicios_cotizacion WHERE cotizacion_id = ? AND cotizacion_detalle_id = ? AND medico_id > 0 ORDER BY id ASC LIMIT 1');
    if (!$stmtAg) continue;
    $stmtAg->bind_param('ii', $cid, $detalleId);
    $stmtAg->execute();
    $rowAg = $stmtAg->get_result()->fetch_assoc();
    $stmtAg->close();
    $medFinal = (int)($rowAg['medico_id'] ?? 0);
    if ($medFinal <= 0) continue;

    $stmtUp = $conn->prepare('UPDATE ordenes_imagen SET medico_id = ? WHERE id = ?');
    if ($stmtUp) {
        $stmtUp->bind_param('ii', $medFinal, $oid);
        $stmtUp->execute();
        if ($stmtUp->affected_rows > 0) $upd++;
        $stmtUp->close();
    }
}

echo "updated={$upd}\n";
$q = $conn->query("SELECT id,cotizacion_id,medico_id,tipo,indicaciones FROM ordenes_imagen WHERE cotizacion_id IN (501,502) ORDER BY cotizacion_id,id");
while($q && ($r=$q->fetch_assoc())) echo json_encode($r, JSON_UNESCAPED_UNICODE)."\n";
?>
