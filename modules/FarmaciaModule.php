<?php
// Módulo de Farmacia: lógica para actualizar stock y registrar movimientos de medicamentos
class FarmaciaModule {
    public static function procesarVenta($conn, $detalle, $cobro_id, $nombre_paciente, $dni_paciente, $hc_paciente, $usuario_id, $cotizacion_id = 0) {
        $medicamento_id = $detalle['servicio_id'];
        $cantidad_vendida = $detalle['cantidad'];
        // Obtener información del medicamento
        $stmt_med = $conn->prepare("SELECT stock, unidades_por_caja, nombre FROM medicamentos WHERE id = ?");
        $stmt_med->bind_param("i", $medicamento_id);
        $stmt_med->execute();
        $med_result = $stmt_med->get_result()->fetch_assoc();
        if (!$med_result) {
            throw new Exception("Medicamento no encontrado ID: $medicamento_id");
        }
        $stock_actual = intval($med_result['stock']);
        $unidades_por_caja = intval($med_result['unidades_por_caja']) ?: 1;
        $nombre_medicamento = $med_result['nombre'];
        // Determinar si es venta por unidad o caja
        $es_caja = strpos($detalle['descripcion'], '(Caja)') !== false;
        if ($es_caja) {
            $cantidad_total_unidades = $cantidad_vendida * $unidades_por_caja;
            $tipo_movimiento = 'venta_caja';
        } else {
            $cantidad_total_unidades = $cantidad_vendida;
            $tipo_movimiento = 'venta_unidad';
        }

        // Si la venta proviene de una cotización de farmacia con reserva previa,
        // no volver a descontar stock para evitar doble rebaja al cobrar.
        if ((int)$cotizacion_id > 0) {
            $tag = '%[RESERVA_STOCK_COTIZACION cotizacion_id=' . (int)$cotizacion_id . ' medicamento_id=' . (int)$medicamento_id . ']%';
            $stmt_reserva = $conn->prepare("SELECT id FROM movimientos_medicamento WHERE medicamento_id = ? AND observaciones LIKE ? LIMIT 1");
            if ($stmt_reserva) {
                $stmt_reserva->bind_param("is", $medicamento_id, $tag);
                $stmt_reserva->execute();
                $reserva = $stmt_reserva->get_result()->fetch_assoc();
                if ($reserva) {
                    return true;
                }
            }
        }

        // Verificar stock suficiente
        if ($stock_actual < $cantidad_total_unidades) {
            throw new Exception("Stock insuficiente para $nombre_medicamento. Disponible: $stock_actual, solicitado: $cantidad_total_unidades");
        }
        $nuevo_stock = $stock_actual - $cantidad_total_unidades;
        // Actualizar stock del medicamento
        $stmt_stock = $conn->prepare("UPDATE medicamentos SET stock = ? WHERE id = ?");
        $stmt_stock->bind_param("ii", $nuevo_stock, $medicamento_id);
        $stmt_stock->execute();
        // Registrar movimiento de salida con información del paciente
        $observaciones = "Venta - Cobro #$cobro_id - Paciente: $nombre_paciente (DNI: $dni_paciente, HC: $hc_paciente) - " . ($es_caja ? "$cantidad_vendida caja(s)" : "$cantidad_vendida unidad(es)");
        $stmt_mov = $conn->prepare("INSERT INTO movimientos_medicamento (medicamento_id, tipo_movimiento, cantidad, observaciones, usuario_id, fecha_hora) VALUES (?, ?, ?, ?, ?, NOW())");
        $stmt_mov->bind_param("isisi", $medicamento_id, $tipo_movimiento, $cantidad_total_unidades, $observaciones, $usuario_id);
        return $stmt_mov->execute();
    }
}
