<?php
require __DIR__ . '/../config.php';

if (!($conn instanceof mysqli)) {
    fwrite(STDERR, "Sin conexion mysqli\n");
    exit(1);
}
$conn->set_charset('utf8mb4');

$hasCotizacionId = false;
$colChk = $conn->query("SHOW COLUMNS FROM ordenes_procedimientos LIKE 'cotizacion_id'");
if ($colChk && $colChk->num_rows > 0) {
    $hasCotizacionId = true;
}

$sql = "SELECT c.id AS cotizacion_id,
               c.paciente_id,
               MAX(CASE WHEN cd.consulta_id > 0 THEN cd.consulta_id ELSE 0 END) AS consulta_id,
               GROUP_CONCAT(DISTINCT CASE
                   WHEN LOWER(TRIM(COALESCE(cd.servicio_tipo,''))) IN ('procedimiento','procedimientos')
                   THEN CAST(cd.servicio_id AS CHAR)
                   ELSE NULL
               END ORDER BY cd.servicio_id SEPARATOR ',') AS proc_ids
        FROM cotizaciones c
        INNER JOIN cotizaciones_detalle cd ON cd.cotizacion_id = c.id
        WHERE LOWER(TRIM(COALESCE(c.estado,''))) IN ('pagado','pagada','parcial','control')
          AND LOWER(TRIM(COALESCE(cd.servicio_tipo,''))) IN ('procedimiento','procedimientos')
          AND cd.servicio_id > 0
        GROUP BY c.id, c.paciente_id
        HAVING consulta_id > 0";

$res = $conn->query($sql);
if (!$res) {
    fwrite(STDERR, "Error query base: " . $conn->error . "\n");
    exit(1);
}

$inserted = 0;
$updated = 0;
$skipped = 0;
$errors = 0;

$conn->begin_transaction();
try {
    while ($row = $res->fetch_assoc()) {
        $cotizacionId = (int)$row['cotizacion_id'];
        $pacienteId = (int)$row['paciente_id'];
        $consultaId = (int)$row['consulta_id'];
        $procRaw = trim((string)($row['proc_ids'] ?? ''));

        if ($cotizacionId <= 0 || $pacienteId <= 0 || $consultaId <= 0 || $procRaw === '') {
            $skipped++;
            continue;
        }

        $procIds = array_values(array_unique(array_filter(array_map('intval', explode(',', $procRaw)), fn($v) => $v > 0)));
        if (empty($procIds)) {
            $skipped++;
            continue;
        }

        $jsonProc = json_encode($procIds, JSON_UNESCAPED_UNICODE);
        if ($jsonProc === false) {
            $jsonProc = json_encode($procIds);
        }

        $existing = null;
        if ($hasCotizacionId) {
            $stmtFind = $conn->prepare("SELECT id, procedimientos_json, consulta_id, paciente_id FROM ordenes_procedimientos WHERE cotizacion_id = ? ORDER BY id DESC LIMIT 1");
            if ($stmtFind) {
                $stmtFind->bind_param('i', $cotizacionId);
                $stmtFind->execute();
                $existing = $stmtFind->get_result()->fetch_assoc();
                $stmtFind->close();
            }
        } else {
            $stmtFind = $conn->prepare("SELECT id, procedimientos_json, consulta_id, paciente_id FROM ordenes_procedimientos WHERE consulta_id = ? ORDER BY id DESC LIMIT 1");
            if ($stmtFind) {
                $stmtFind->bind_param('i', $consultaId);
                $stmtFind->execute();
                $existing = $stmtFind->get_result()->fetch_assoc();
                $stmtFind->close();
            }
        }

        if ($existing && (int)$existing['id'] > 0) {
            $existingId = (int)$existing['id'];
            $prev = json_decode((string)($existing['procedimientos_json'] ?? '[]'), true);
            if (!is_array($prev)) {
                $prev = [];
            }
            $prevIds = array_values(array_unique(array_filter(array_map('intval', $prev), fn($v) => $v > 0)));
            $finalIds = array_values(array_unique(array_merge($prevIds, $procIds)));
            $jsonFinal = json_encode($finalIds, JSON_UNESCAPED_UNICODE);
            if ($jsonFinal === false) {
                $jsonFinal = json_encode($finalIds);
            }

            $stmtUpd = $conn->prepare("UPDATE ordenes_procedimientos
                                       SET procedimientos_json = ?,
                                           consulta_id = CASE WHEN consulta_id IS NULL OR consulta_id = 0 THEN ? ELSE consulta_id END,
                                           paciente_id = CASE WHEN paciente_id IS NULL OR paciente_id = 0 THEN ? ELSE paciente_id END,
                                           updated_at = NOW()
                                       WHERE id = ?");
            if ($stmtUpd) {
                $stmtUpd->bind_param('siii', $jsonFinal, $consultaId, $pacienteId, $existingId);
                $stmtUpd->execute();
                $stmtUpd->close();
                $updated++;
            } else {
                $errors++;
            }
            continue;
        }

        if ($hasCotizacionId) {
            $stmtIns = $conn->prepare("INSERT INTO ordenes_procedimientos (consulta_id, procedimientos_json, estado, paciente_id, cotizacion_id, usuario_id) VALUES (?, ?, 'pendiente', ?, ?, 0)");
            if ($stmtIns) {
                $stmtIns->bind_param('isii', $consultaId, $jsonProc, $pacienteId, $cotizacionId);
                $stmtIns->execute();
                $stmtIns->close();
                $inserted++;
            } else {
                $errors++;
            }
        } else {
            $stmtIns = $conn->prepare("INSERT INTO ordenes_procedimientos (consulta_id, procedimientos_json, estado, paciente_id, usuario_id) VALUES (?, ?, 'pendiente', ?, 0)");
            if ($stmtIns) {
                $stmtIns->bind_param('isi', $consultaId, $jsonProc, $pacienteId);
                $stmtIns->execute();
                $stmtIns->close();
                $inserted++;
            } else {
                $errors++;
            }
        }
    }

    $conn->commit();
} catch (Throwable $e) {
    $conn->rollback();
    fwrite(STDERR, "Excepcion: " . $e->getMessage() . "\n");
    exit(1);
}

echo "BACKFILL_ORDENES_PROCEDIMIENTOS\n";
echo json_encode([
    'inserted' => $inserted,
    'updated' => $updated,
    'skipped' => $skipped,
    'errors' => $errors,
], JSON_UNESCAPED_UNICODE) . "\n";

$qCase = $conn->query("SELECT id, consulta_id, paciente_id, cotizacion_id, procedimientos_json, estado FROM ordenes_procedimientos WHERE cotizacion_id = 499 ORDER BY id DESC LIMIT 1");
$rowCase = $qCase ? $qCase->fetch_assoc() : null;
echo "CASE_499\n";
echo json_encode($rowCase ?: new stdClass(), JSON_UNESCAPED_UNICODE) . "\n";
?>
