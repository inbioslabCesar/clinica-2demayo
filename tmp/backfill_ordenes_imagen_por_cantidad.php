<?php
require __DIR__ . '/../config.php';

function tipoOrdenImagen($servicioTipo, $descripcion = '') {
    $tipo = strtolower(trim((string)$servicioTipo));
    $desc = strtolower(trim((string)$descripcion));
    if (in_array($tipo, ['rayosx','rayos_x','rayos x','rx'], true)) return 'rx';
    if ($tipo === 'ecografia') return 'ecografia';
    if ($tipo === 'tomografia') return 'tomografia';
    if (in_array($tipo, ['procedimiento','procedimientos'], true)) {
        if (preg_match('/tomograf|\btac\b/u', $desc)) return 'tomografia';
        if (preg_match('/rayos\s*x|\brx\b/u', $desc)) return 'rx';
        if (preg_match('/ecograf/i', $desc)) return 'ecografia';
    }
    return null;
}

function resolverMedico($conn, $cid, $detalleId, $consultaId, $servicioId) {
    $mid = 0;
    if ($servicioId > 0) {
        $s = $conn->prepare('SELECT medico_id FROM tarifas WHERE id = ? LIMIT 1');
        if ($s) { $s->bind_param('i', $servicioId); $s->execute(); $r=$s->get_result()->fetch_assoc(); $s->close(); $mid=(int)($r['medico_id']??0); }
    }
    if ($mid <= 0 && $detalleId > 0) {
        $s = $conn->prepare('SELECT medico_id FROM agenda_servicios_cotizacion WHERE cotizacion_id = ? AND cotizacion_detalle_id = ? AND medico_id > 0 ORDER BY id ASC LIMIT 1');
        if ($s) { $s->bind_param('ii', $cid, $detalleId); $s->execute(); $r=$s->get_result()->fetch_assoc(); $s->close(); $mid=(int)($r['medico_id']??0); }
    }
    if ($mid <= 0 && $consultaId > 0) {
        $s = $conn->prepare('SELECT medico_id FROM consultas WHERE id = ? LIMIT 1');
        if ($s) { $s->bind_param('i', $consultaId); $s->execute(); $r=$s->get_result()->fetch_assoc(); $s->close(); $mid=(int)($r['medico_id']??0); }
    }
    return $mid;
}

$created = 0;
$checked = 0;

$sql = "SELECT cd.id, cd.cotizacion_id, cd.servicio_tipo, cd.servicio_id, cd.descripcion, cd.cantidad, cd.consulta_id, c.paciente_id
        FROM cotizaciones_detalle cd
        INNER JOIN cotizaciones c ON c.id = cd.cotizacion_id
        WHERE COALESCE(cd.cantidad,1) > 1
          AND LOWER(TRIM(COALESCE(cd.servicio_tipo,''))) IN ('rayosx','rayos_x','rayos x','rx','ecografia','tomografia')";
$res = $conn->query($sql);
while ($res && ($d = $res->fetch_assoc())) {
    $checked++;
    $detalleId = (int)$d['id'];
    $cid = (int)$d['cotizacion_id'];
    $pacId = (int)$d['paciente_id'];
    $consultaId = (int)($d['consulta_id'] ?? 0);
    $servicioId = (int)($d['servicio_id'] ?? 0);
    $cant = max(1, (int)($d['cantidad'] ?? 1));
    $tipo = tipoOrdenImagen($d['servicio_tipo'] ?? '', $d['descripcion'] ?? '');
    if (!$tipo) continue;
    $desc = trim((string)($d['descripcion'] ?? ''));
    if ($desc === '') $desc = strtoupper($tipo);

    $exist = 0;
    $qExist = $conn->prepare("SELECT COUNT(*) AS c FROM ordenes_imagen WHERE cotizacion_id = ? AND indicaciones LIKE CONCAT('%Detalle #', ?, '%')");
    if ($qExist) {
        $qExist->bind_param('ii', $cid, $detalleId);
        $qExist->execute();
        $re = $qExist->get_result()->fetch_assoc();
        $qExist->close();
        $exist = (int)($re['c'] ?? 0);
    }

    $faltan = max(0, $cant - $exist);
    if ($faltan <= 0) continue;

    $medicoId = resolverMedico($conn, $cid, $detalleId, $consultaId, $servicioId);

    for ($u = $exist + 1; $u <= $cant; $u++) {
        $indic = 'Detalle #' . $detalleId . ' - ' . $desc . ' | Unidad ' . $u . '/' . $cant . ' | Orden creada desde cotización #' . $cid;
        $stmt = $conn->prepare("INSERT INTO ordenes_imagen (consulta_id, paciente_id, medico_id, tipo, indicaciones, estado, solicitado_por, cotizacion_id, carga_anticipada) VALUES (?, ?, ?, ?, ?, 'pendiente', 0, ?, 0)");
        if ($stmt) {
            $stmt->bind_param('iiissi', $consultaId, $pacId, $medicoId, $tipo, $indic, $cid);
            $stmt->execute();
            if ($stmt->affected_rows > 0) $created++;
            $stmt->close();
        }
    }
}

echo "checked_detalles={$checked} created_ordenes={$created}\n";
$qc = $conn->query("SELECT cotizacion_id, COUNT(*) total FROM ordenes_imagen WHERE cotizacion_id IN (500,501,502) GROUP BY cotizacion_id ORDER BY cotizacion_id");
while($qc && ($r=$qc->fetch_assoc())) echo json_encode($r, JSON_UNESCAPED_UNICODE)."\n";
?>
