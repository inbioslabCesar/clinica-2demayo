<?php
require __DIR__ . '/config.php';

$consultaId = 10;

function dumpQuery($conn, $title, $sql) {
    echo "\n=== {$title} ===\n";
    $res = $conn->query($sql);
    if (!$res) {
        echo "ERROR SQL: " . $conn->error . "\n";
        return;
    }
    while ($row = $res->fetch_assoc()) {
        echo json_encode($row, JSON_UNESCAPED_UNICODE) . "\n";
    }
}

dumpQuery($mysqli, 'HC consulta 10', "SELECT id, consulta_id, fecha_registro, JSON_LENGTH(datos, '$.receta') AS receta_len, JSON_EXTRACT(datos, '$.receta') AS receta_json FROM historia_clinica WHERE consulta_id = 10 ORDER BY id DESC LIMIT 1");

dumpQuery($mysqli, 'Sync receta consulta 10', "SELECT id, consulta_id, hc_id, cotizacion_id, receta_hash, receta_items_total, items_sincronizados, items_pendientes, estado, ultimo_error, updated_at FROM hc_receta_cotizacion_sync WHERE consulta_id = 10 ORDER BY id DESC LIMIT 5");

dumpQuery($mysqli, 'Pendientes receta consulta 10', "SELECT id, sync_id, consulta_id, hc_id, item_idx, codigo, nombre, motivo, estado, created_at FROM hc_receta_cotizacion_items_pendientes WHERE consulta_id = 10 ORDER BY id DESC LIMIT 20");

dumpQuery($mysqli, 'Cotizaciones relacionadas consulta 10', "SELECT c.id, c.estado, c.total, c.total_pagado, c.saldo_pendiente, c.fecha, c.observaciones FROM cotizaciones c WHERE c.id IN (SELECT DISTINCT cotizacion_id FROM cotizaciones_detalle WHERE consulta_id = 10 UNION SELECT cotizacion_id FROM hc_receta_cotizacion_sync WHERE consulta_id = 10) ORDER BY c.id DESC");

dumpQuery($mysqli, 'Detalles consulta 10', "SELECT id, cotizacion_id, servicio_tipo, servicio_id, descripcion, cantidad, precio_unitario, subtotal, estado_item, motivo_edicion, es_externo, incluir_en_cobro, nombre_externo, motivo_externo, consulta_id FROM cotizaciones_detalle WHERE consulta_id = 10 ORDER BY cotizacion_id DESC, id DESC");
