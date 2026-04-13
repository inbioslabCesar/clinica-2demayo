<?php
// Módulo de Honorarios: lógica para registrar movimiento de honorarios médicos
class HonorarioModule {
    private static function tableExists($conn, $tableName) {
        $stmt = $conn->prepare("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1");
        if (!$stmt) {
            return false;
        }
        $stmt->bind_param("s", $tableName);
        $stmt->execute();
        $res = $stmt->get_result();
        return $res && $res->num_rows > 0;
    }

    private static function normalizarMetodoPagoMedico($metodoPago) {
        $metodo = strtolower(trim((string)$metodoPago));
        $permitidos = ['efectivo', 'transferencia', 'cheque', 'deposito', 'tarjeta', 'yape', 'plin'];
        return in_array($metodo, $permitidos, true) ? $metodo : 'efectivo';
    }

    private static function calcularDatosMovimiento($detalleConsulta, $tarifa, $servicio_key, $metodo_pago) {
        // Determinar tipo de precio
        $tipo_precio = 'particular';
        if ($metodo_pago === 'seguro') {
            $tipo_precio = 'seguro';
        } elseif ($metodo_pago === 'convenio') {
            $tipo_precio = 'convenio';
        }

        $precio_key = 'precio_' . $tipo_precio;
        if (!isset($tarifa[$precio_key])) {
            return [
                'success' => false,
                'error' => 'Error: No se encontró el precio correspondiente en la tarifa (' . $precio_key . ')'
            ];
        }

        $tarifa_total = floatval($tarifa[$precio_key]);
        $medico_id = isset($detalleConsulta['medico_id']) ? intval($detalleConsulta['medico_id']) : 0;
        if ($medico_id <= 0 && !empty($tarifa['medico_id'])) {
            $medico_id = intval($tarifa['medico_id']);
        }

        if ($medico_id <= 0) {
            return [
                'success' => false,
                'error' => 'Error: El medico_id no puede ser nulo o vacío'
            ];
        }

        $monto_medico = null;
        $monto_clinica = null;
        $porcentaje_aplicado_medico = null;
        $porcentaje_aplicado_clinica = null;

        if (!empty($tarifa['monto_medico'])) {
            $monto_medico = floatval($tarifa['monto_medico']);
            $porcentaje_aplicado_medico = 0;
        } elseif (!empty($tarifa['porcentaje_medico'])) {
            $monto_medico = round($tarifa_total * floatval($tarifa['porcentaje_medico']) / 100, 2);
            $porcentaje_aplicado_medico = floatval($tarifa['porcentaje_medico']);
        } else {
            $monto_medico = 0;
            $porcentaje_aplicado_medico = 0;
        }

        if (!empty($tarifa['monto_clinica'])) {
            $monto_clinica = floatval($tarifa['monto_clinica']);
            $porcentaje_aplicado_clinica = 0;
        } elseif (!empty($tarifa['porcentaje_clinica'])) {
            $monto_clinica = round($tarifa_total * floatval($tarifa['porcentaje_clinica']) / 100, 2);
            $porcentaje_aplicado_clinica = floatval($tarifa['porcentaje_clinica']);
        } else {
            $monto_clinica = 0;
            $porcentaje_aplicado_clinica = 0;
        }

        return [
            'success' => true,
            'consulta_id' => isset($detalleConsulta['consulta_id']) ? intval($detalleConsulta['consulta_id']) : null,
            'medico_id' => $medico_id,
            'paciente_id' => isset($detalleConsulta['paciente_id']) ? intval($detalleConsulta['paciente_id']) : null,
            'tarifa_id' => isset($tarifa['id']) ? intval($tarifa['id']) : null,
            'tipo_precio' => $tipo_precio,
            'tipo_servicio' => strtolower(trim((string)$servicio_key)),
            'descripcion' => (string)($tarifa['descripcion'] ?? ($detalleConsulta['descripcion'] ?? 'Servicio médico')),
            'tarifa_total' => $tarifa_total,
            'monto_clinica' => $monto_clinica,
            'monto_medico' => $monto_medico,
            'porcentaje_aplicado_clinica' => $porcentaje_aplicado_clinica,
            'porcentaje_aplicado_medico' => $porcentaje_aplicado_medico,
            'metodo_pago_medico' => self::normalizarMetodoPagoMedico($metodo_pago)
        ];
    }

    private static function insertarMovimientoDesdeDatos($conn, $datos, $cobro_id, $observaciones = null) {
        $stmt_honorario = $conn->prepare("INSERT INTO honorarios_medicos_movimientos (
            consulta_id, medico_id, paciente_id, tarifa_id, tipo_precio, fecha, hora, tipo_servicio, descripcion, tarifa_total,
            monto_clinica, monto_medico, porcentaje_aplicado_clinica, porcentaje_aplicado_medico, estado_pago_medico, metodo_pago_medico,
            observaciones, created_at, cobro_id
        ) VALUES (?, ?, ?, ?, ?, CURDATE(), CURTIME(), ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?, ?, NOW(), ?)");

        if (!$stmt_honorario) {
            return 0;
        }

        $consulta_id = $datos['consulta_id'];
        $medico_id = $datos['medico_id'];
        $paciente_id = $datos['paciente_id'];
        $tarifa_id = $datos['tarifa_id'];
        $tipo_precio = $datos['tipo_precio'];
        $tipo_servicio = $datos['tipo_servicio'];
        $descripcion = $datos['descripcion'];
        $tarifa_total = $datos['tarifa_total'];
        $monto_clinica = $datos['monto_clinica'];
        $monto_medico = $datos['monto_medico'];
        $porcentaje_aplicado_clinica = $datos['porcentaje_aplicado_clinica'];
        $porcentaje_aplicado_medico = $datos['porcentaje_aplicado_medico'];
        $metodo_pago_medico = $datos['metodo_pago_medico'];
        $obs = $observaciones;

        $stmt_honorario->bind_param(
            "iiiisssdddddssi",
            $consulta_id,
            $medico_id,
            $paciente_id,
            $tarifa_id,
            $tipo_precio,
            $tipo_servicio,
            $descripcion,
            $tarifa_total,
            $monto_clinica,
            $monto_medico,
            $porcentaje_aplicado_clinica,
            $porcentaje_aplicado_medico,
            $metodo_pago_medico,
            $obs,
            $cobro_id
        );
        $stmt_honorario->execute();

        return (int)$conn->insert_id;
    }

    public static function registrarMovimiento($conn, $detalleConsulta, $tarifa, $servicio_key, $metodo_pago, $cobro_id) {
        $datos = self::calcularDatosMovimiento($detalleConsulta, $tarifa, $servicio_key, $metodo_pago);
        if (!($datos['success'] ?? false)) {
            return $datos;
        }

        $movId = self::insertarMovimientoDesdeDatos($conn, $datos, (int)$cobro_id, null);
        if ($movId <= 0) {
            return [
                'success' => false,
                'error' => 'No se pudo registrar el movimiento de honorario médico'
            ];
        }

        return $movId;
    }

    public static function registrarPorCobrar($conn, $detalleConsulta, $tarifa, $servicio_key, $metodo_pago, $cobro_id, $cotizacion_id, $usuario_cobro_id, $caja_id = null, $turno = null) {
        if ((int)$cotizacion_id <= 0) {
            return [
                'success' => false,
                'error' => 'No se pudo registrar honorario por cobrar: cotizacion_id inválido'
            ];
        }

        if (!self::tableExists($conn, 'honorarios_por_cobrar')) {
            return [
                'success' => false,
                'error' => 'No existe la tabla honorarios_por_cobrar. Ejecuta primero la migración.'
            ];
        }

        $datos = self::calcularDatosMovimiento($detalleConsulta, $tarifa, $servicio_key, $metodo_pago);
        if (!($datos['success'] ?? false)) {
            return $datos;
        }

        $cotizacionId = (int)$cotizacion_id;
        $cobroId = (int)$cobro_id;
        $medicoId = (int)$datos['medico_id'];
        $pacienteId = (int)($datos['paciente_id'] ?? 0);
        $tarifaId = (int)($datos['tarifa_id'] ?? 0);
        $tipoPrecio = (string)$datos['tipo_precio'];
        $tipoServicio = (string)$datos['tipo_servicio'];
        $descripcion = (string)$datos['descripcion'];
        $tarifaTotal = (float)$datos['tarifa_total'];
        $montoClinica = (float)$datos['monto_clinica'];
        $montoMedico = (float)$datos['monto_medico'];
        $porcClinica = (float)$datos['porcentaje_aplicado_clinica'];
        $porcMedico = (float)$datos['porcentaje_aplicado_medico'];
        $metodoPagoMedico = (string)$datos['metodo_pago_medico'];
        $usuarioCobroId = (int)$usuario_cobro_id;
        $cajaId = $caja_id !== null ? (int)$caja_id : null;
        $turnoVal = $turno !== null ? (string)$turno : null;

        // firma_origen identifica el SERVICIO dentro de la cotización, no el cobro individual.
        // Así, múltiples cobros parciales del mismo servicio usan la misma firma y no generan filas duplicadas.
        $firmaOrigen = sha1(implode('|', [
            $cotizacionId,
            $medicoId,
            $tarifaId,
            $tipoServicio,
            trim(strtolower($descripcion))
        ]));

        $observaciones = 'Pendiente por consolidar al 100% (Opción B)';

        $sql = "INSERT INTO honorarios_por_cobrar (
            cotizacion_id, cobro_id, consulta_id, medico_id, paciente_id, tarifa_id,
            tipo_precio, tipo_servicio, descripcion, tarifa_total, monto_clinica, monto_medico,
            porcentaje_aplicado_clinica, porcentaje_aplicado_medico, metodo_pago_medico,
            usuario_cobro_id, caja_id, turno, observaciones, firma_origen,
            estado_consolidacion, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', NOW(), NOW())
        ON DUPLICATE KEY UPDATE
            cobro_id          = VALUES(cobro_id),
            usuario_cobro_id  = VALUES(usuario_cobro_id),
            caja_id           = VALUES(caja_id),
            turno             = VALUES(turno),
            updated_at        = NOW()";

        $stmt = $conn->prepare($sql);
        if (!$stmt) {
            return [
                'success' => false,
                'error' => 'No se pudo preparar registro en honorarios_por_cobrar'
            ];
        }

        $consultaId = $datos['consulta_id'];
        $stmt->bind_param(
            "iiiiiisssdddddsiisss",
            $cotizacionId,
            $cobroId,
            $consultaId,
            $medicoId,
            $pacienteId,
            $tarifaId,
            $tipoPrecio,
            $tipoServicio,
            $descripcion,
            $tarifaTotal,
            $montoClinica,
            $montoMedico,
            $porcClinica,
            $porcMedico,
            $metodoPagoMedico,
            $usuarioCobroId,
            $cajaId,
            $turnoVal,
            $observaciones,
            $firmaOrigen
        );

        $ok = $stmt->execute();
        if (!$ok) {
            return [
                'success' => false,
                'error' => 'No se pudo registrar honorario por cobrar'
            ];
        }

        return ['success' => true];
    }

    public static function consolidarPorCobrarCotizacion($conn, $cotizacion_id) {
        $cotizacionId = (int)$cotizacion_id;
        if ($cotizacionId <= 0 || !self::tableExists($conn, 'honorarios_por_cobrar')) {
            return 0;
        }

        $stmtSel = $conn->prepare("SELECT * FROM honorarios_por_cobrar WHERE cotizacion_id = ? AND estado_consolidacion = 'pendiente' ORDER BY id ASC");
        if (!$stmtSel) {
            return 0;
        }
        $stmtSel->bind_param("i", $cotizacionId);
        $stmtSel->execute();
        $rows = $stmtSel->get_result()->fetch_all(MYSQLI_ASSOC);

        if (empty($rows)) {
            return 0;
        }

        $totalConsolidados = 0;

        foreach ($rows as $row) {
            $hpcId = (int)($row['id'] ?? 0);
            if ($hpcId <= 0) {
                continue;
            }

            $stmtDup = $conn->prepare("SELECT id FROM honorarios_medicos_movimientos WHERE cobro_id = ? AND medico_id = ? AND paciente_id <=> ? AND tipo_servicio = ? AND ABS(monto_medico - ?) < 0.01 AND observaciones LIKE ? ORDER BY id DESC LIMIT 1");
            if ($stmtDup) {
                $cobroIdDup = (int)($row['cobro_id'] ?? 0);
                $medicoIdDup = (int)($row['medico_id'] ?? 0);
                $pacienteIdDup = isset($row['paciente_id']) ? (int)$row['paciente_id'] : null;
                $tipoServicioDup = (string)($row['tipo_servicio'] ?? 'consulta');
                $montoMedicoDup = (float)($row['monto_medico'] ?? 0);
                $likeObs = '%[hpc_id=' . $hpcId . ']%';
                $stmtDup->bind_param("iiisds", $cobroIdDup, $medicoIdDup, $pacienteIdDup, $tipoServicioDup, $montoMedicoDup, $likeObs);
                $stmtDup->execute();
                $dup = $stmtDup->get_result()->fetch_assoc();
                if ($dup && !empty($dup['id'])) {
                    $movExistente = (int)$dup['id'];
                    $stmtUpDup = $conn->prepare("UPDATE honorarios_por_cobrar SET estado_consolidacion = 'consolidado', honorario_movimiento_id_final = ?, consolidado_at = NOW(), updated_at = NOW() WHERE id = ?");
                    if ($stmtUpDup) {
                        $stmtUpDup->bind_param("ii", $movExistente, $hpcId);
                        $stmtUpDup->execute();
                    }
                    continue;
                }
            }

            $datos = [
                'consulta_id' => isset($row['consulta_id']) ? (int)$row['consulta_id'] : null,
                'medico_id' => (int)($row['medico_id'] ?? 0),
                'paciente_id' => isset($row['paciente_id']) ? (int)$row['paciente_id'] : null,
                'tarifa_id' => isset($row['tarifa_id']) ? (int)$row['tarifa_id'] : null,
                'tipo_precio' => (string)($row['tipo_precio'] ?? 'particular'),
                'tipo_servicio' => (string)($row['tipo_servicio'] ?? 'consulta'),
                'descripcion' => (string)($row['descripcion'] ?? 'Servicio médico'),
                'tarifa_total' => (float)($row['tarifa_total'] ?? 0),
                'monto_clinica' => (float)($row['monto_clinica'] ?? 0),
                'monto_medico' => (float)($row['monto_medico'] ?? 0),
                'porcentaje_aplicado_clinica' => (float)($row['porcentaje_aplicado_clinica'] ?? 0),
                'porcentaje_aplicado_medico' => (float)($row['porcentaje_aplicado_medico'] ?? 0),
                'metodo_pago_medico' => self::normalizarMetodoPagoMedico($row['metodo_pago_medico'] ?? 'efectivo')
            ];

            $obs = trim((string)($row['observaciones'] ?? ''));
            $obsConsolidacion = trim($obs . ' [cotizacion_id=' . $cotizacionId . '][hpc_id=' . $hpcId . ']');
            $movId = self::insertarMovimientoDesdeDatos($conn, $datos, (int)($row['cobro_id'] ?? 0), $obsConsolidacion);
            if ($movId <= 0) {
                continue;
            }

            $stmtUp = $conn->prepare("UPDATE honorarios_por_cobrar SET estado_consolidacion = 'consolidado', honorario_movimiento_id_final = ?, consolidado_at = NOW(), updated_at = NOW() WHERE id = ?");
            if ($stmtUp) {
                $stmtUp->bind_param("ii", $movId, $hpcId);
                $stmtUp->execute();
            }

            $totalConsolidados++;
        }

        return $totalConsolidados;
    }
}
