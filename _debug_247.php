<?php
$conn = new mysqli('localhost', 'root', '', 'poli2demayo');
if ($conn->connect_error) die('Connection failed: ' . $conn->connect_error);

echo "=== cotizacion 247 raw ===\n";
$r = $conn->query('SELECT id, paciente_id, fecha, observaciones FROM cotizaciones WHERE id = 247');
$row = $r->fetch_assoc();
print_r($row);

echo "\n=== cotizaciones_detalle for 247 ===\n";
$r2 = $conn->query('SELECT id, servicio_tipo, consulta_id, descripcion FROM cotizaciones_detalle WHERE cotizacion_id = 247');
while ($row2 = $r2->fetch_assoc()) print_r($row2);

echo "\n=== cotizacion_movimientos for 247 ===\n";
$r3 = $conn->query('SELECT id, cobro_id, tipo_movimiento, monto FROM cotizacion_movimientos WHERE cotizacion_id = 247');
while ($row3 = $r3->fetch_assoc()) print_r($row3);

// Check honorarios for cobro linked to cot 247
echo "\n=== cobro_ids linked to cot 247 ===\n";
$r4 = $conn->query('SELECT DISTINCT cobro_id FROM cotizacion_movimientos WHERE cotizacion_id = 247 AND cobro_id > 0');
while ($row4 = $r4->fetch_assoc()) {
    $cobroId = $row4['cobro_id'];
    echo "cobro_id: $cobroId\n";
    $r5 = $conn->query("SELECT id, consulta_id, medico_id FROM honorarios_medicos_movimientos WHERE cobro_id = $cobroId LIMIT 5");
    if ($r5) {
        echo "  honorarios_medicos_movimientos:\n";
        while ($row5 = $r5->fetch_assoc()) print_r($row5);
    } else {
        echo "  honorarios_medicos_movimientos: no results or table missing\n";
    }
}

// Direct consulta search for paciente 1008
echo "\n=== consultas for paciente_id=1008 (last 5) ===\n";
$r6 = $conn->query('SELECT id, paciente_id, medico_id, fecha FROM consultas WHERE paciente_id = 1008 ORDER BY id DESC LIMIT 5');
while ($row6 = $r6->fetch_assoc()) print_r($row6);
