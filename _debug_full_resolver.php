<?php
$conn = new mysqli('localhost', 'root', '', 'poli2demayo');
if ($conn->connect_error) die('Connection failed: ' . $conn->connect_error);
$conn->query("SET NAMES utf8mb4");

$cotizacionId = 247;

// Simulate column_exists without caching 
function column_exists_test($conn, $table, $column) {
    $r = $conn->query("SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = '$table' AND column_name = '$column'");
    return $r && $r->num_rows > 0;
}

function table_exists_test($conn, $table) {
    $r = $conn->query("SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = '$table'");
    return $r && $r->num_rows > 0;
}

// Step 1: Check columns
$hasCreatedAtCot = column_exists_test($conn, 'cotizaciones', 'created_at');
$hasFechaCot = column_exists_test($conn, 'cotizaciones', 'fecha');
echo "hasCreatedAtCot: " . ($hasCreatedAtCot ? 'YES' : 'NO') . "\n";
echo "hasFechaCot: " . ($hasFechaCot ? 'YES' : 'NO') . "\n";

$selectFechaRef = $hasCreatedAtCot && $hasFechaCot
    ? 'COALESCE(NULLIF(created_at, ""), NULLIF(fecha, ""))'
    : ($hasCreatedAtCot ? 'created_at' : ($hasFechaCot ? 'fecha' : 'NULL'));
echo "selectFechaRef: $selectFechaRef\n\n";

// Step 2: Fetch cotizacion
$sql = "SELECT paciente_id, {$selectFechaRef} AS fecha_ref, observaciones FROM cotizaciones WHERE id = ? LIMIT 1";
echo "SQL: $sql\n";
$stmt = $conn->prepare($sql);
$stmt->bind_param("i", $cotizacionId);
$stmt->execute();
$cot = $stmt->get_result()->fetch_assoc();
$stmt->close();
echo "cot row: "; print_r($cot);

$pacienteId = (int)($cot['paciente_id'] ?? 0);
$fechaRefRaw = trim((string)($cot['fecha_ref'] ?? ''));
$fechaRefDia = $fechaRefRaw !== '' ? substr($fechaRefRaw, 0, 10) : '';
echo "\npacienteId=$pacienteId, fechaRefDia='$fechaRefDia'\n\n";

// Step 3: Try observaciones
$obs = trim((string)($cot['observaciones'] ?? ''));
echo "obs: '$obs'\n";
if ($obs !== '' && preg_match('/consulta\s*#\s*(\d+)/i', $obs, $m)) {
    echo "FOUND by obs: " . (int)$m[1] . "\n";
    exit;
} else {
    echo "obs match: NO\n\n";
}

// Step 4: cotizaciones_detalle.consulta_id
$hasConsultaIdDet = column_exists_test($conn, 'cotizaciones_detalle', 'consulta_id');
echo "cotizaciones_detalle.consulta_id exists: " . ($hasConsultaIdDet ? 'YES' : 'NO') . "\n";
if ($hasConsultaIdDet) {
    $stmtDet = $conn->prepare("SELECT consulta_id FROM cotizaciones_detalle WHERE cotizacion_id = ? AND consulta_id IS NOT NULL AND consulta_id > 0 ORDER BY id ASC LIMIT 1");
    $stmtDet->bind_param("i", $cotizacionId);
    $stmtDet->execute();
    $rowDet = $stmtDet->get_result()->fetch_assoc();
    $stmtDet->close();
    echo "detalle result: "; print_r($rowDet);
    $idDet = (int)($rowDet['consulta_id'] ?? 0);
    if ($idDet > 0) {
        echo "FOUND by detalle: $idDet\n";
        exit;
    }
}

// Step 5: honorarios_medicos_movimientos join
$hasCotMovimientos = table_exists_test($conn, 'cotizacion_movimientos');
$hasHonMovimientos = table_exists_test($conn, 'honorarios_medicos_movimientos');
echo "\ncotizacion_movimientos: " . ($hasCotMovimientos ? 'YES' : 'NO') . "\n";
echo "honorarios_medicos_movimientos: " . ($hasHonMovimientos ? 'YES' : 'NO') . "\n";

if ($hasCotMovimientos && $hasHonMovimientos) {
    $stmtHon = $conn->prepare("SELECT hm.consulta_id, hm.medico_id
                               FROM cotizacion_movimientos cm
                               INNER JOIN honorarios_medicos_movimientos hm ON hm.cobro_id = cm.cobro_id
                               WHERE cm.cotizacion_id = ?
                               ORDER BY hm.id DESC LIMIT 1");
    $stmtHon->bind_param("i", $cotizacionId);
    $stmtHon->execute();
    $rowHon = $stmtHon->get_result()->fetch_assoc();
    $stmtHon->close();
    echo "honorarios join result: "; print_r($rowHon);

    $consultaHon = (int)($rowHon['consulta_id'] ?? 0);
    $medicoHon = (int)($rowHon['medico_id'] ?? 0);
    echo "consultaHon=$consultaHon, medicoHon=$medicoHon\n";

    if ($consultaHon > 0) {
        echo "FOUND by honorario consulta_id: $consultaHon\n";
        exit;
    }

    if ($pacienteId > 0 && $fechaRefDia !== '' && $medicoHon > 0) {
        $stmtConsDiaMed = $conn->prepare("SELECT id FROM consultas WHERE paciente_id = ? AND medico_id = ? AND fecha = ? ORDER BY id DESC LIMIT 1");
        $stmtConsDiaMed->bind_param("iis", $pacienteId, $medicoHon, $fechaRefDia);
        $stmtConsDiaMed->execute();
        $rowConsDiaMed = $stmtConsDiaMed->get_result()->fetch_assoc();
        $stmtConsDiaMed->close();
        echo "consulta by paciente+medico+fecha: "; print_r($rowConsDiaMed);
        $idDiaMed = (int)($rowConsDiaMed['id'] ?? 0);
        if ($idDiaMed > 0) {
            echo "FOUND: $idDiaMed\n";
            exit;
        }
    }
}

echo "\nRESULT: 0 (not found)\n";
