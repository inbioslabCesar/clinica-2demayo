<?php
// Módulo de Laboratorio: lógica para registrar movimientos de laboratorio de referencia
class LaboratorioModule {
    private static function columnExists($conn, $table, $column) {
        $stmt = $conn->prepare("SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1");
        if (!$stmt) return false;
        $stmt->bind_param('ss', $table, $column);
        $stmt->execute();
        $res = $stmt->get_result();
        return $res && $res->num_rows > 0;
    }

    private static function resolverTurnoCobro($turno) {
        $t = strtolower(trim((string)$turno));
        if ($t !== '') return $t;
        $hora = intval(date('H'));
        if ($hora < 13) return 'mañana';
        if ($hora < 19) return 'tarde';
        return 'noche';
    }

    // --- Registrar movimiento en laboratorio_referencia_movimientos ---
    public static function registrarMovimientoReferencia($conn, $cobro_id, $detalle, $caja_id, $paciente_id, $usuario_id = null, $turno_cobro = null, $cotizacion_id = null) {
        $turnoCobroFinal = self::resolverTurnoCobro($turno_cobro);
        $hasCotizacionId = self::columnExists($conn, 'laboratorio_referencia_movimientos', 'cotizacion_id');
        $cotizacionIdFinal = isset($detalle['cotizacion_id']) ? intval($detalle['cotizacion_id']) : intval($cotizacion_id ?? 0);
        $monto_liquidar = 0;
        if ($detalle['tipo_derivacion'] === 'monto') {
            $monto_liquidar = floatval($detalle['valor_derivacion']);
        } elseif ($detalle['tipo_derivacion'] === 'porcentaje') {
            $monto_liquidar = round(floatval($detalle['subtotal']) * floatval($detalle['valor_derivacion']) / 100, 2);
        }

        // Intentar vincular un pendiente creado desde cotización (cobro_id=0) para evitar duplicados.
        $lab_nombre = trim((string)($detalle['laboratorio_referencia'] ?? ''));
        $lab_tipo = trim((string)($detalle['tipo_derivacion'] ?? ''));
        $examen_id = isset($detalle['servicio_id']) ? intval($detalle['servicio_id']) : 0;
        if ($examen_id > 0) {
            $findPendingMov = function($withCotizacion) use ($conn, $hasCotizacionId, $cotizacionIdFinal, $paciente_id, $examen_id, $lab_nombre, $lab_tipo, $monto_liquidar) {
                if ($withCotizacion && $hasCotizacionId && $cotizacionIdFinal > 0) {
                    $stmtFind = $conn->prepare("SELECT id FROM laboratorio_referencia_movimientos WHERE cobro_id = 0 AND estado = 'pendiente' AND cotizacion_id = ? AND paciente_id = ? AND examen_id = ? AND laboratorio = ? AND tipo = ? AND ABS(monto - ?) < 0.01 ORDER BY id DESC LIMIT 1");
                    if (!$stmtFind) return 0;
                    $stmtFind->bind_param('iiissd', $cotizacionIdFinal, $paciente_id, $examen_id, $lab_nombre, $lab_tipo, $monto_liquidar);
                } else {
                    $stmtFind = $conn->prepare("SELECT id FROM laboratorio_referencia_movimientos WHERE cobro_id = 0 AND estado = 'pendiente' AND paciente_id = ? AND examen_id = ? AND laboratorio = ? AND tipo = ? AND ABS(monto - ?) < 0.01 ORDER BY id DESC LIMIT 1");
                    if (!$stmtFind) return 0;
                    $stmtFind->bind_param('iissd', $paciente_id, $examen_id, $lab_nombre, $lab_tipo, $monto_liquidar);
                }
                $stmtFind->execute();
                $row = $stmtFind->get_result()->fetch_assoc();
                return ($row && !empty($row['id'])) ? intval($row['id']) : 0;
            };

            $movId = $findPendingMov(true);
            if (!$movId) {
                $movId = $findPendingMov(false);
            }
            if ($movId > 0) {
                $stmtLink = $conn->prepare("UPDATE laboratorio_referencia_movimientos SET cobro_id = ?, caja_id = COALESCE(caja_id, ?), cobrado_por = COALESCE(cobrado_por, ?), turno_cobro = ?, fecha = COALESCE(fecha, CURDATE()), hora = COALESCE(hora, CURTIME()), hora_cobro = COALESCE(hora_cobro, CURTIME()) WHERE id = ?");
                if ($stmtLink) {
                    $stmtLink->bind_param('iiisi', $cobro_id, $caja_id, $usuario_id, $turnoCobroFinal, $movId);
                    return $stmtLink->execute();
                }
            }
        }

        if ($hasCotizacionId) {
            $stmt_lab = $conn->prepare("INSERT INTO laboratorio_referencia_movimientos (
                cobro_id, cotizacion_id, examen_id, laboratorio, monto, tipo, estado, paciente_id, caja_id, fecha, hora, observaciones, cobrado_por, turno_cobro, hora_cobro
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE(), CURTIME(), ?, ?, ?, CURTIME())");
        } else {
            $stmt_lab = $conn->prepare("INSERT INTO laboratorio_referencia_movimientos (
                cobro_id, examen_id, laboratorio, monto, tipo, estado, paciente_id, caja_id, fecha, hora, observaciones, cobrado_por, turno_cobro, hora_cobro
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURDATE(), CURTIME(), ?, ?, ?, CURTIME())");
        }
        $lab_nombre = $detalle['laboratorio_referencia'] ?? '';
        $lab_tipo = $detalle['tipo_derivacion'] ?? '';
        $lab_estado = 'pendiente';
        $lab_obs = $detalle['descripcion'] ?? '';
        if ($hasCotizacionId) {
            $stmt_lab->bind_param(
                "iiissssiisis",
                $cobro_id,
                $cotizacionIdFinal,
                $detalle['servicio_id'],
                $lab_nombre,
                $monto_liquidar,
                $lab_tipo,
                $lab_estado,
                $paciente_id,
                $caja_id,
                $lab_obs,
                $usuario_id,
                $turnoCobroFinal
            );
        } else {
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
                $turnoCobroFinal
            );
        }
        return $stmt_lab->execute();
    }
}
