<?php
$conn = new mysqli('localhost', 'root', '', 'poli2demayo');
if ($conn->connect_error) die('Connection failed: ' . $conn->connect_error);

// Step 1: Check cotizaciones columns
$r = $conn->query("SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cotizaciones'");
$cols = [];
while ($row = $r->fetch_assoc()) $cols[] = $row['column_name'];
echo "cotizaciones columns: " . implode(', ', $cols) . "\n\n";

// Step 2: Check cotizacion 247 fecha column
$r2 = $conn->query("SELECT id, paciente_id, fecha, observaciones FROM cotizaciones WHERE id = 247");
$cot = $r2->fetch_assoc();
echo "cot[fecha] = '{$cot['fecha']}'\n";
$fechaRefRaw = trim((string)($cot['fecha'] ?? ''));
$fechaRefDia = $fechaRefRaw !== '' ? substr($fechaRefRaw, 0, 10) : '';
echo "fechaRefDia = '$fechaRefDia'\n\n";

// Step 3: Check table_exists logic - does cotizacion_movimientos exist?
$r3 = $conn->query("SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'cotizacion_movimientos'");
echo "cotizacion_movimientos exists: " . ($r3->num_rows > 0 ? 'YES' : 'NO') . "\n";
$r4 = $conn->query("SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'honorarios_medicos_movimientos'");
echo "honorarios_medicos_movimientos exists: " . ($r4->num_rows > 0 ? 'YES' : 'NO') . "\n\n";

// Step 4: check if honorarios_medicos_movimientos has cobro_id column
$r5 = $conn->query("SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'honorarios_medicos_movimientos' AND column_name = 'cobro_id'");
echo "honorarios_medicos_movimientos.cobro_id exists: " . ($r5->num_rows > 0 ? 'YES' : 'NO') . "\n\n";

// Step 5: Execute the join query directly
$stmt = $conn->prepare("SELECT hm.consulta_id, hm.medico_id
                        FROM cotizacion_movimientos cm
                        INNER JOIN honorarios_medicos_movimientos hm ON hm.cobro_id = cm.cobro_id
                        WHERE cm.cotizacion_id = ?
                        ORDER BY hm.id DESC LIMIT 1");
$cotId = 247;
$stmt->bind_param("i", $cotId);
$stmt->execute();
$rowHon = $stmt->get_result()->fetch_assoc();
$stmt->close();
echo "honorarios join result:\n";
print_r($rowHon);
echo "consultaHon = " . (int)($rowHon['consulta_id'] ?? 0) . "\n";
echo "medicoHon = " . (int)($rowHon['medico_id'] ?? 0) . "\n\n";

// Step 6: Try the final query
$pacienteId = 1008;
$medicoHon = (int)($rowHon['medico_id'] ?? 0);
if ($fechaRefDia !== '' && $medicoHon > 0) {
    $stmt2 = $conn->prepare("SELECT id FROM consultas WHERE paciente_id = ? AND medico_id = ? AND fecha = ? ORDER BY id DESC LIMIT 1");
    $stmt2->bind_param("iis", $pacienteId, $medicoHon, $fechaRefDia);
    $stmt2->execute();
    $rowFinal = $stmt2->get_result()->fetch_assoc();
    $stmt2->close();
    echo "consulta by paciente+medico+fecha:\n";
    print_r($rowFinal);
} else {
    echo "Could not run final query: fechaRefDia='$fechaRefDia', medicoHon=$medicoHon\n";
}
