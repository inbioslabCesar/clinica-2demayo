<?php
require 'config.php';

function dumpRows($title, $conn, $sql) {
    echo "\n==== $title ====\n";
    $res = $conn->query($sql);
    if (!$res) {
        echo "SQL ERROR: " . $conn->error . "\n";
        return;
    }
    if ($res->num_rows === 0) {
        echo "(sin filas)\n";
        return;
    }
    while ($row = $res->fetch_assoc()) {
        echo json_encode($row, JSON_UNESCAPED_UNICODE) . "\n";
    }
}

dumpRows('cotizacion', $conn, "SELECT id, fecha, usuario_id, paciente_id, total, total_pagado, saldo_pendiente, estado FROM cotizaciones WHERE id = 191");
dumpRows('cotizacion_detalle', $conn, "SELECT id, cotizacion_id, servicio_tipo, servicio_id, descripcion, cantidad, precio_unitario, subtotal, medico_id, consulta_id, estado_item FROM cotizaciones_detalle WHERE cotizacion_id = 191 ORDER BY id");
dumpRows('cotizacion_movimientos', $conn, "SELECT id, cotizacion_id, cobro_id, tipo_movimiento, monto, saldo_anterior, saldo_nuevo, descripcion, usuario_id, created_at FROM cotizacion_movimientos WHERE cotizacion_id = 191 ORDER BY id");
dumpRows('cobros_de_cotizacion', $conn, "SELECT c.id, c.fecha, c.tipo_pago, c.usuario_id, c.paciente_id, c.monto_total FROM cobros c INNER JOIN cotizacion_movimientos cm ON cm.cobro_id = c.id WHERE cm.cotizacion_id = 191 ORDER BY c.id");
dumpRows('honorarios_por_cotizacion', $conn, "SELECT id, cobro_id, medico_id, paciente_id, tipo_servicio, descripcion, monto_medico, estado_pago_medico, fecha, turno, created_at, observaciones FROM honorarios_medicos_movimientos WHERE cobro_id IN (SELECT DISTINCT cobro_id FROM cotizacion_movimientos WHERE cotizacion_id = 191 AND cobro_id IS NOT NULL) ORDER BY id");
dumpRows('eventos_cotizacion', $conn, "SELECT id, cotizacion_id, evento_tipo, usuario_id, created_at FROM cotizacion_eventos WHERE cotizacion_id = 191 ORDER BY id");
?>
