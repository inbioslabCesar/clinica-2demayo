<?php
// Módulo de Honorarios: lógica para registrar movimiento de honorarios médicos
class HonorarioModule {
    private static function servicioPermiteHonorario($servicioTipo) {
        $tipo = self::normalizarTipoServicioMovimiento($servicioTipo);
        return in_array($tipo, ['consulta', 'rayosx', 'ecografia', 'operacion', 'procedimientos'], true);
    }

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

    private static function normalizarTipoServicioMovimiento($servicioTipo) {
        $tipo = strtolower(trim((string)$servicioTipo));
        if ($tipo === 'rayos_x' || $tipo === 'rayos x' || $tipo === 'rx') return 'rayosx';
        if ($tipo === 'procedimiento' || $tipo === 'procedimientos') return 'procedimientos';
        if ($tipo === 'cirugia' || $tipo === 'cirugias') return 'cirugias';
        if ($tipo === 'tratamiento' || $tipo === 'tratamientos') return 'tratamientos';
        if ($tipo === 'emergencia' || $tipo === 'emergencias') return 'emergencias';
        if ($tipo === 'operaciones') return 'operacion';

        $permitidos = ['consulta', 'rayosx', 'ecografia', 'ocupacional', 'procedimientos', 'cirugias', 'tratamientos', 'emergencias', 'operacion', 'hospitalizacion'];
        return in_array($tipo, $permitidos, true) ? $tipo : 'consulta';
    }

    private static function toFloatFlexible($value) {
        if (is_int($value) || is_float($value)) {
            return (float)$value;
        }
        if (is_string($value)) {
            $normalized = str_replace(',', '.', trim($value));
            return is_numeric($normalized) ? (float)$normalized : 0.0;
        }
        return 0.0;
    }

    private static function resumirDescripcionFirma($descripcion) {
        $raw = trim((string)$descripcion);
        if ($raw === '') {
            return '';
        }

        if (stripos($raw, ' | CAMPANA ') !== false) {
            $segmentos = array_map('trim', explode('|', $raw));
            $base = trim((string)($segmentos[0] ?? ''));
            if ($base !== '') {
                return strtolower($base);
            }
        }

        $marcadoresMeta = [
            ' | Modo:',
            ' | Medico:',
            ' | Clinica:',
            ' | Clinica objetivo:',
            ' | REPARTO MANUAL COBRO',
        ];

        foreach ($marcadoresMeta as $meta) {
            $pos = stripos($raw, $meta);
            if ($pos !== false) {
                return strtolower(trim(substr($raw, 0, $pos)));
            }
        }

        return strtolower($raw);
    }

    private static function decodificarSnapshotDetalle($detalleConsulta) {
        $snapshot = $detalleConsulta['snapshot_json'] ?? null;
        if (is_array($snapshot)) {
            return $snapshot;
        }
        if (is_string($snapshot) && trim($snapshot) !== '') {
            $decoded = json_decode($snapshot, true);
            if (is_array($decoded)) {
                return $decoded;
            }
        }
        return [];
    }

    private static function obtenerReglaHonorarioPaquete($detalleConsulta, $snapshot) {
        $regla = $detalleConsulta['honorario_regla'] ?? null;
        if (is_string($regla) && trim($regla) !== '') {
            $decoded = json_decode($regla, true);
            if (is_array($decoded)) {
                $regla = $decoded;
            }
        }
        if (!is_array($regla) || empty($regla)) {
            $regla = $snapshot['honorario_regla'] ?? null;
        }
        return is_array($regla) ? $regla : null;
    }

    private static function esDetallePaquete($detalleConsulta, $snapshot) {
        $paqueteId = (int)($detalleConsulta['paquete_id'] ?? ($snapshot['paquete_id'] ?? 0));
        return $paqueteId > 0;
    }

    private static function construirDescripcionPaquete($descripcionBase, $detalleConsulta, $snapshot, $modoHonorario, $montoMedico, $montoClinica) {
        $paqueteId = (int)($detalleConsulta['paquete_id'] ?? ($snapshot['paquete_id'] ?? 0));
        $paqueteCodigo = trim((string)($detalleConsulta['paquete_codigo'] ?? ($snapshot['paquete_codigo'] ?? '')));
        $paqueteNombre = trim((string)($detalleConsulta['paquete_nombre'] ?? ($snapshot['paquete_nombre'] ?? '')));

        if ($paqueteId <= 0 && $paqueteCodigo === '' && $paqueteNombre === '') {
            return $descripcionBase;
        }

        $partes = [];
        if ($paqueteCodigo !== '') {
            $partes[] = $paqueteCodigo;
        } elseif ($paqueteId > 0) {
            $partes[] = 'PAQ #' . $paqueteId;
        }
        if ($paqueteNombre !== '') {
            $partes[] = $paqueteNombre;
        }
        $etiquetaPaquete = implode(' - ', $partes);
        if ($etiquetaPaquete === '') {
            $etiquetaPaquete = 'PAQ #' . $paqueteId;
        }

        $montoClinicaObjetivo = (float)($detalleConsulta['paquete_monto_clinica_fijo'] ?? ($snapshot['paquete_monto_clinica_fijo'] ?? 0));
        $sufijoObjetivo = $montoClinicaObjetivo > 0
            ? ' | Clinica objetivo: S/ ' . number_format($montoClinicaObjetivo, 2, '.', '')
            : '';

        return trim($descripcionBase) . ' | CAMPANA ' . $etiquetaPaquete . ' | Modo: ' . $modoHonorario . ' | Medico: S/ ' . number_format((float)$montoMedico, 2, '.', '') . ' | Clinica: S/ ' . number_format((float)$montoClinica, 2, '.', '') . $sufijoObjetivo;
    }

    private static function resolverRepartoManualDetalle($detalleConsulta, $tarifaTotalBase) {
        $montoMedicoRaw = $detalleConsulta['monto_medico_override'] ?? null;
        $montoClinicaRaw = $detalleConsulta['monto_clinica_override'] ?? null;
        $porcentajeMedicoRaw = $detalleConsulta['porcentaje_medico_override'] ?? null;
        $repartoManualFlag = !empty($detalleConsulta['reparto_manual_aplicado']) || !empty($detalleConsulta['reparto_manual']);

        $tieneOverrideExplicito = $montoMedicoRaw !== null || $montoClinicaRaw !== null || $porcentajeMedicoRaw !== null;
        if (!$repartoManualFlag && !$tieneOverrideExplicito) {
            return null;
        }

        $tarifaTotal = round(max(0.0, self::toFloatFlexible($tarifaTotalBase)), 2);
        if ($tarifaTotal <= 0) {
            return [
                'aplicado' => true,
                'tarifa_total' => 0.0,
                'monto_medico' => 0.0,
                'monto_clinica' => 0.0,
                'porcentaje_medico' => 0.0,
                'porcentaje_clinica' => 0.0,
            ];
        }

        $montoMedico = null;
        if ($montoMedicoRaw !== null && $montoMedicoRaw !== '') {
            $montoMedico = self::toFloatFlexible($montoMedicoRaw);
        } elseif ($porcentajeMedicoRaw !== null && $porcentajeMedicoRaw !== '') {
            $porcentaje = min(max(self::toFloatFlexible($porcentajeMedicoRaw), 0.0), 100.0);
            $montoMedico = round(($tarifaTotal * $porcentaje) / 100, 2);
        } elseif ($montoClinicaRaw !== null && $montoClinicaRaw !== '') {
            $montoClinica = self::toFloatFlexible($montoClinicaRaw);
            $montoMedico = round($tarifaTotal - $montoClinica, 2);
        }

        if ($montoMedico === null) {
            return null;
        }

        $montoMedico = round(min(max($montoMedico, 0.0), $tarifaTotal), 2);
        $montoClinica = round(max(0.0, $tarifaTotal - $montoMedico), 2);
        $porcentajeMedico = $tarifaTotal > 0 ? round(($montoMedico * 100) / $tarifaTotal, 2) : 0.0;
        $porcentajeClinica = $tarifaTotal > 0 ? round(($montoClinica * 100) / $tarifaTotal, 2) : 0.0;

        return [
            'aplicado' => true,
            'tarifa_total' => $tarifaTotal,
            'monto_medico' => $montoMedico,
            'monto_clinica' => $montoClinica,
            'porcentaje_medico' => $porcentajeMedico,
            'porcentaje_clinica' => $porcentajeClinica,
        ];
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

        $tarifa_total_unitario = floatval($tarifa[$precio_key]);
        $cantidadDetalle = self::toFloatFlexible($detalleConsulta['cantidad'] ?? 1);
        if ($cantidadDetalle <= 0) {
            $cantidadDetalle = 1.0;
        }
        $tarifa_total = round($tarifa_total_unitario * $cantidadDetalle, 2);
        $snapshot = self::decodificarSnapshotDetalle($detalleConsulta);
        $esPaquete = self::esDetallePaquete($detalleConsulta, $snapshot);
        $reglaPaquete = self::obtenerReglaHonorarioPaquete($detalleConsulta, $snapshot);
        $modoHonorarioPaquete = strtolower(trim((string)($reglaPaquete['modo_honorario'] ?? 'usar_configuracion_medico')));
        if ($esPaquete) {
            $subtotalDetalle = self::toFloatFlexible($detalleConsulta['subtotal'] ?? 0);
            if ($subtotalDetalle > 0) {
                $tarifa_total = round($subtotalDetalle, 2);
            }
        }
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

        $repartoManual = self::resolverRepartoManualDetalle($detalleConsulta, $tarifa_total);
        if (is_array($repartoManual) && !empty($repartoManual['aplicado'])) {
            $tarifa_total = (float)$repartoManual['tarifa_total'];
            $monto_medico = (float)$repartoManual['monto_medico'];
            $monto_clinica = (float)$repartoManual['monto_clinica'];
            $porcentaje_aplicado_medico = (float)$repartoManual['porcentaje_medico'];
            $porcentaje_aplicado_clinica = (float)$repartoManual['porcentaje_clinica'];
        }

        if ($monto_medico === null && $esPaquete && $reglaPaquete && in_array($modoHonorarioPaquete, ['monto_fijo_medico_paquete', 'porcentaje_medico_paquete'], true)) {
            if ($modoHonorarioPaquete === 'monto_fijo_medico_paquete') {
                $montoFijo = max(0.0, self::toFloatFlexible($reglaPaquete['monto_fijo_medico'] ?? 0));
                $montoFijoEscalado = $montoFijo * $cantidadDetalle;
                $monto_medico = round(min($montoFijoEscalado, max(0.0, $tarifa_total)), 2);
                $porcentaje_aplicado_medico = $tarifa_total > 0 ? round(($monto_medico * 100) / $tarifa_total, 2) : 0.0;
            } else {
                $porcentaje = self::toFloatFlexible($reglaPaquete['porcentaje_medico'] ?? 0);
                $porcentaje = min(max($porcentaje, 0.0), 100.0);
                $monto_medico = round($tarifa_total * $porcentaje / 100, 2);
                $porcentaje_aplicado_medico = $porcentaje;
            }
        } elseif ($monto_medico === null && !empty($tarifa['monto_medico'])) {
            $monto_medico = round(floatval($tarifa['monto_medico']) * $cantidadDetalle, 2);
            $porcentaje_aplicado_medico = 0;
        } elseif ($monto_medico === null && !empty($tarifa['porcentaje_medico'])) {
            $monto_medico = round($tarifa_total * floatval($tarifa['porcentaje_medico']) / 100, 2);
            $porcentaje_aplicado_medico = floatval($tarifa['porcentaje_medico']);
        } elseif ($monto_medico === null) {
            $monto_medico = 0;
            $porcentaje_aplicado_medico = 0;
        }

        if ($monto_clinica !== null) {
            $monto_clinica = round(max(0.0, $monto_clinica), 2);
            $porcentaje_aplicado_clinica = $tarifa_total > 0 ? round(($monto_clinica * 100) / $tarifa_total, 2) : 0.0;
        } elseif ($esPaquete) {
            $monto_clinica = round(max(0.0, $tarifa_total - $monto_medico), 2);
            $porcentaje_aplicado_clinica = $tarifa_total > 0 ? round(($monto_clinica * 100) / $tarifa_total, 2) : 0.0;
        } elseif (!empty($tarifa['monto_clinica'])) {
            $monto_clinica = round(floatval($tarifa['monto_clinica']) * $cantidadDetalle, 2);
            $porcentaje_aplicado_clinica = 0;
        } elseif (!empty($tarifa['porcentaje_clinica'])) {
            $monto_clinica = round($tarifa_total * floatval($tarifa['porcentaje_clinica']) / 100, 2);
            $porcentaje_aplicado_clinica = floatval($tarifa['porcentaje_clinica']);
        } else {
            $monto_clinica = 0;
            $porcentaje_aplicado_clinica = 0;
        }

        $descripcionBase = (string)($tarifa['descripcion'] ?? ($detalleConsulta['descripcion'] ?? 'Servicio médico'));
        $descripcionFinal = $esPaquete
            ? self::construirDescripcionPaquete(
                $descripcionBase,
                $detalleConsulta,
                $snapshot,
                $modoHonorarioPaquete,
                $monto_medico,
                $monto_clinica
            )
            : $descripcionBase;

        if (is_array($repartoManual) && !empty($repartoManual['aplicado'])) {
            $descripcionFinal .= ' | REPARTO MANUAL COBRO';
        }

        return [
            'success' => true,
            'consulta_id' => isset($detalleConsulta['consulta_id']) ? intval($detalleConsulta['consulta_id']) : null,
            'medico_id' => $medico_id,
            'paciente_id' => isset($detalleConsulta['paciente_id']) ? intval($detalleConsulta['paciente_id']) : null,
            'tarifa_id' => isset($tarifa['id']) ? intval($tarifa['id']) : null,
            'tipo_precio' => $tipo_precio,
            'tipo_servicio' => self::normalizarTipoServicioMovimiento($servicio_key),
            'descripcion' => $descripcionFinal,
            'tarifa_total' => $tarifa_total,
            'monto_clinica' => $monto_clinica,
            'monto_medico' => $monto_medico,
            'porcentaje_aplicado_clinica' => $porcentaje_aplicado_clinica,
            'porcentaje_aplicado_medico' => $porcentaje_aplicado_medico,
            'metodo_pago_medico' => self::normalizarMetodoPagoMedico($metodo_pago),
            'reparto_manual_aplicado' => (is_array($repartoManual) && !empty($repartoManual['aplicado'])) ? 1 : 0
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
        $tipo_servicio = self::normalizarTipoServicioMovimiento($datos['tipo_servicio'] ?? 'consulta');
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
        if (!empty($detalleConsulta['renuncia_honorario_medico'])) {
            return null;
        }

        if (!self::servicioPermiteHonorario($servicio_key)) {
            return null;
        }

        $datos = self::calcularDatosMovimiento($detalleConsulta, $tarifa, $servicio_key, $metodo_pago);
        if (!($datos['success'] ?? false)) {
            return $datos;
        }

        // Una tarifa sin participación médica es ingreso exclusivo de la clínica.
        // No debe crear una deuda ni una fila de liquidación por S/ 0.00.
        if ((float)($datos['monto_medico'] ?? 0) <= 0.00001) {
            return null;
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
        if (!empty($detalleConsulta['renuncia_honorario_medico'])) {
            return ['success' => true, 'sin_honorario_medico' => true];
        }

        if (!self::servicioPermiteHonorario($servicio_key)) {
            return ['success' => true, 'sin_honorario_medico' => true];
        }

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
        $repartoManualAplicado = !empty($datos['reparto_manual_aplicado']);

        // Mantener el mismo criterio del cobro directo: sin monto médico no hay
        // honorario por cobrar que luego pueda llegar a liquidación.
        if ($montoMedico <= 0.00001) {
            return ['success' => true, 'sin_honorario_medico' => true];
        }

        // firma_origen identifica el SERVICIO dentro de la cotización, no el cobro individual.
        // Evitar descripcion completa porque puede incluir montos variables por abono parcial.
        $detalleOrigenId = isset($detalleConsulta['cotizacion_detalle_id'])
            ? (int)$detalleConsulta['cotizacion_detalle_id']
            : (isset($detalleConsulta['detalle_id']) ? (int)$detalleConsulta['detalle_id'] : 0);
        $consultaOrigenId = isset($datos['consulta_id']) ? (int)$datos['consulta_id'] : 0;
        $descripcionFirma = self::resumirDescripcionFirma($descripcion);

        $firmaOrigenPartes = [
            $cotizacionId,
            $medicoId,
            $pacienteId,
            $tarifaId,
            $tipoServicio,
        ];

        if ($detalleOrigenId > 0) {
            $firmaOrigenPartes[] = 'detalle:' . $detalleOrigenId;
        } elseif ($consultaOrigenId > 0) {
            $firmaOrigenPartes[] = 'consulta:' . $consultaOrigenId;
        }

        $firmaOrigenPartes[] = 'desc:' . $descripcionFirma;

        if ($repartoManualAplicado) {
            $firmaOrigenPartes[] = 'reparto_manual';
            $firmaOrigenPartes[] = $cobroId;
        }
        $firmaOrigen = sha1(implode('|', $firmaOrigenPartes));

        $observaciones = 'Pendiente por consolidar al 100% (Opción B)';
        if ($repartoManualAplicado) {
            $observaciones .= ' | Reparto manual en cobro';
        }

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

            // Registros heredados con S/ 0.00 no deben generar liquidaciones.
            if ((float)($row['monto_medico'] ?? 0) <= 0.00001) {
                $stmtOmitir = $conn->prepare("UPDATE honorarios_por_cobrar SET estado_consolidacion = 'anulado', updated_at = NOW() WHERE id = ?");
                if ($stmtOmitir) {
                    $stmtOmitir->bind_param("i", $hpcId);
                    $stmtOmitir->execute();
                }
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
