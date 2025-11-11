<?php
// Módulo de Laboratorio: lógica para registrar movimientos de laboratorio de referencia
class LaboratorioModule {
    // --- Registrar movimiento en laboratorio_referencia_movimientos ---
    public static function registrarMovimientoReferencia($conn, $cobro_id, $detalle, $caja_id, $paciente_id, $usuario_id = null, $turno_cobro = null) {
        $monto_liquidar = 0;
        if ($detalle['tipo_derivacion'] === 'monto') {
            $monto_liquidar = floatval($detalle['valor_derivacion']);
        } elseif ($detalle['tipo_derivacion'] === 'porcentaje') {
            $monto_liquidar = round(floatval($detalle['subtotal']) * floatval($detalle['valor_derivacion']) / 100, 2);
        }
        $stmt_lab = $conn->prepare("INSERT INTO laboratorio_referencia_movimientos (
            cobro_id, examen_id, laboratorio, monto, tipo, estado, paciente_id, caja_id, fecha, hora, observaciones, cobrado_por, turno_cobro, hora_cobro
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURDATE(), CURTIME(), ?, ?, ?, CURTIME())");
        $lab_nombre = $detalle['laboratorio_referencia'] ?? '';
        $lab_tipo = $detalle['tipo_derivacion'] ?? '';
        $lab_estado = 'pendiente';
        $lab_obs = $detalle['descripcion'] ?? '';
        // 11 parámetros: i (cobro_id), i (servicio_id), s (laboratorio), d (monto), s (tipo), s (estado), i (paciente_id), i (caja_id), s (observaciones), i (cobrado_por), s (turno_cobro)
        $stmt_lab->bind_param(
            "iissssiisis",
            $cobro_id,
            $detalle['servicio_id'],
            $lab_nombre,
            $monto_liquidar,
            $lab_tipo,
            $lab_estado,
            $paciente_id,
            $caja_id,
            $lab_obs,
            $usuario_id,
            $turno_cobro
        );
        return $stmt_lab->execute();
    }
}
