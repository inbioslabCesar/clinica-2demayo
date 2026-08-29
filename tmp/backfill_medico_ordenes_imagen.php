<?php
require __DIR__ . '/../config.php';

$q = $conn->query("SELECT id, cotizacion_id, consulta_id, medico_id, indicaciones FROM ordenes_imagen WHERE COALESCE(medico_id,0)=0 AND COALESCE(cotizacion_id,0)>0 ORDER BY id ASC");
$updated = 0;
$checked = 0;
while ($q && ($row = $q->fetch_assoc())) {
    $checked++;
    $oid = (int)$row['id'];
    $cid = (int)$row['cotizacion_id'];
    $consultaId = (int)$row['consulta_id'];
    $detalleId = 0;
    $servicioId = 0;
    $medicoId = 0;

    $indic = (string)($row['indicaciones'] ?? '');
    if ($indic !== '' && preg_match('/detalle\s*#\s*(\d+)/i', $indic, $m)) {
        $detalleId = (int)($m[1] ?? 0);
    }

    if ($detalleId > 0) {
        $stmt = $conn->prepare('SELECT medico_id, consulta_id, servicio_id FROM cotizaciones_detalle WHERE cotizacion_id = ? AND id = ? LIMIT 1');
        if ($stmt) {
            $stmt->bind_param('ii', $cid, $detalleId);
            $stmt->execute();
            $d = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            $medicoId = (int)($d['medico_id'] ?? 0);
            if ($consultaId <= 0) $consultaId = (int)($d['consulta_id'] ?? 0);
            $servicioId = (int)($d['servicio_id'] ?? 0);
        }
    }

    if ($medicoId <= 0 && $servicioId > 0) {
        $stmt = $conn->prepare('SELECT medico_id FROM tarifas WHERE id = ? LIMIT 1');
        if ($stmt) {
            $stmt->bind_param('i', $servicioId);
            $stmt->execute();
            $t = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            $medicoId = (int)($t['medico_id'] ?? 0);
        }
    }

    if ($medicoId <= 0 && $detalleId > 0) {
        $stmt = $conn->prepare('SELECT medico_id FROM agenda_servicios_cotizacion WHERE cotizacion_id = ? AND cotizacion_detalle_id = ? AND medico_id > 0 ORDER BY id ASC LIMIT 1');
        if ($stmt) {
            $stmt->bind_param('ii', $cid, $detalleId);
            $stmt->execute();
            $a = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            $medicoId = (int)($a['medico_id'] ?? 0);
        }
    }

    if ($medicoId <= 0 && $consultaId > 0) {
        $stmt = $conn->prepare('SELECT medico_id FROM consultas WHERE id = ? LIMIT 1');
        if ($stmt) {
            $stmt->bind_param('i', $consultaId);
            $stmt->execute();
            $c = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            $medicoId = (int)($c['medico_id'] ?? 0);
        }
    }

    if ($medicoId > 0) {
        $stmt = $conn->prepare('UPDATE ordenes_imagen SET medico_id = ? WHERE id = ? AND COALESCE(medico_id,0)=0');
        if ($stmt) {
            $stmt->bind_param('ii', $medicoId, $oid);
            $stmt->execute();
            if ($stmt->affected_rows > 0) $updated++;
            $stmt->close();
        }
    }
}

echo "checked={$checked} updated={$updated}\n";

$qc = $conn->query("SELECT cotizacion_id, COUNT(*) AS total, SUM(CASE WHEN COALESCE(medico_id,0)=0 THEN 1 ELSE 0 END) AS sin_medico FROM ordenes_imagen WHERE cotizacion_id IN (500,501,502) GROUP BY cotizacion_id ORDER BY cotizacion_id ASC");
while ($qc && ($r = $qc->fetch_assoc())) {
    echo json_encode($r, JSON_UNESCAPED_UNICODE) . "\n";
}
?>
