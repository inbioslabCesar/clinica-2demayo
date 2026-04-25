<?php

class ContratoModule
{
    private static function tableExists($conn, $table)
    {
        $stmt = $conn->prepare('SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1');
        if (!$stmt) return false;
        $stmt->bind_param('s', $table);
        $stmt->execute();
        $res = $stmt->get_result();
        $ok = $res && $res->num_rows > 0;
        $stmt->close();
        return $ok;
    }

    private static function columnExists($conn, $table, $column)
    {
        $stmt = $conn->prepare('SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1');
        if (!$stmt) return false;
        $stmt->bind_param('ss', $table, $column);
        $stmt->execute();
        $res = $stmt->get_result();
        $ok = $res && $res->num_rows > 0;
        $stmt->close();
        return $ok;
    }

    private static function normalizeServicioTipo($value)
    {
        $tipo = strtolower(trim((string)$value));
        if ($tipo === 'rayos x' || $tipo === 'rayos_x' || $tipo === 'rx') return 'rayosx';
        if ($tipo === 'procedimientos') return 'procedimiento';
        if ($tipo === 'operaciones') return 'operacion';
        return $tipo;
    }

    private static function findAgendaCoverageForDate($conn, $pacienteId, $servicioTipo, $servicioId, $fecha)
    {
        if (!self::tableExists($conn, 'agenda_contrato')) {
            return null;
        }

        $whereDetalleActivo = '';
        if (self::tableExists($conn, 'cotizaciones_detalle') && self::columnExists($conn, 'cotizaciones_detalle', 'estado_item')) {
            $whereDetalleActivo = " AND cd.estado_item <> 'eliminado'";
        }

        $exprFechaCotizacion = self::columnExists($conn, 'cotizaciones', 'created_at')
            ? 'c.created_at'
            : (self::columnExists($conn, 'cotizaciones', 'fecha') ? 'c.fecha' : 'NULL');

        $stmt = $conn->prepare(
            "SELECT cp.id AS contrato_paciente_id,
                    cps.id AS contrato_paciente_servicio_id
             FROM contratos_paciente cp
             INNER JOIN contratos_paciente_servicios cps
                 ON cps.contrato_paciente_id = cp.id
             INNER JOIN agenda_contrato ac
                 ON ac.contrato_paciente_id = cp.id
                AND ac.plantilla_item_id = cps.plantilla_item_id
             WHERE cp.paciente_id = ?
               AND cp.estado = 'activo'
               AND cps.servicio_tipo = ?
               AND cps.servicio_id = ?
               AND ? BETWEEN cp.fecha_inicio AND cp.fecha_fin
               AND DATE(ac.fecha_programada) = ?
               AND ac.estado_evento IN ('atendido', 'espontaneo')
                             AND NOT EXISTS (
                                     SELECT 1
                                     FROM cotizaciones c
                                     INNER JOIN cotizaciones_detalle cd ON cd.cotizacion_id = c.id
                                     WHERE c.paciente_id = cp.paciente_id
                                         AND cd.contrato_paciente_id = cp.id
                                         AND cd.contrato_paciente_servicio_id = cps.id
                                         AND cd.origen_cobro = 'contrato'
                                         AND DATE({$exprFechaCotizacion}) = ?{$whereDetalleActivo}
                             )
             ORDER BY ac.fecha_programada ASC, ac.id ASC
             LIMIT 1"
        );
        if (!$stmt) return null;

                $stmt->bind_param('isisss', $pacienteId, $servicioTipo, $servicioId, $fecha, $fecha, $fecha);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        return $row ?: null;
    }

    public static function validarCoberturaServicio($conn, $pacienteId, $servicioTipo, $servicioId, $cantidad = 1.0, $fechaRef = null)
    {
        $out = [
            'aplica_contrato' => false,
            'origen_cobro' => 'regular',
            'contrato_paciente_id' => 0,
            'contrato_paciente_servicio_id' => 0,
            'monto_lista_referencial' => null,
            'motivo' => 'sin_contrato',
            'consumo_previamente_registrado' => false,
        ];

        $pacienteId = (int)$pacienteId;
        $servicioId = (int)$servicioId;
        $cantidad = max(0.01, (float)$cantidad);
        $servicioTipo = self::normalizeServicioTipo($servicioTipo);
        if ($pacienteId <= 0 || $servicioId <= 0 || $servicioTipo === '') return $out;

        if (!self::tableExists($conn, 'contratos_paciente') || !self::tableExists($conn, 'contratos_paciente_servicios')) {
            return $out;
        }

        $fecha = $fechaRef ? date('Y-m-d', strtotime((string)$fechaRef)) : date('Y-m-d');

        $stmt = $conn->prepare(
            "SELECT cp.id AS contrato_paciente_id,
                    cps.id AS contrato_paciente_servicio_id,
                    cps.cantidad_total,
                    cps.cantidad_consumida,
                                        EXISTS (
                                                SELECT 1
                                                FROM agenda_contrato ac
                                                WHERE ac.contrato_paciente_id = cp.id
                                                    AND ac.plantilla_item_id = cps.plantilla_item_id
                                                    AND DATE(ac.fecha_programada) = ?
                                                    AND ac.estado_evento IN ('pendiente', 'confirmado', 'reprogramado', 'atendido', 'espontaneo')
                                        ) AS programado_en_fecha,
                    cp.estado,
                    cp.fecha_inicio,
                    cp.fecha_fin
             FROM contratos_paciente cp
             INNER JOIN contratos_paciente_servicios cps ON cps.contrato_paciente_id = cp.id
             WHERE cp.paciente_id = ?
               AND cp.estado = 'activo'
               AND cps.servicio_tipo = ?
               AND cps.servicio_id = ?
               AND ? BETWEEN cp.fecha_inicio AND cp.fecha_fin
             ORDER BY cp.fecha_fin DESC, cp.id DESC, cps.id ASC"
        );

        if (!$stmt) return $out;
        $stmt->bind_param('sisis', $fecha, $pacienteId, $servicioTipo, $servicioId, $fecha);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();

        if (!$rows) return $out;

        $rowDisponible = null;
        $rowProgramadoSinCupo = null;
        $rowSinCupo = null;
        foreach ($rows as $row) {
            $programadoEnFecha = ((int)($row['programado_en_fecha'] ?? 0)) === 1;
            if (!$programadoEnFecha) {
                if ($rowSinCupo === null) {
                    $rowSinCupo = $row;
                }
                continue;
            }

            $total = (float)($row['cantidad_total'] ?? 0);
            $consumido = (float)($row['cantidad_consumida'] ?? 0);
            $disponible = max(0.0, $total - $consumido);
            if ($rowProgramadoSinCupo === null) {
                $rowProgramadoSinCupo = $row;
            }
            if ($disponible + 0.00001 >= $cantidad) {
                $rowDisponible = $row;
                break;
            }
        }

        if ($rowDisponible) {
            $out['aplica_contrato'] = true;
            $out['origen_cobro'] = 'contrato';
            $out['contrato_paciente_id'] = (int)($rowDisponible['contrato_paciente_id'] ?? 0);
            $out['contrato_paciente_servicio_id'] = (int)($rowDisponible['contrato_paciente_servicio_id'] ?? 0);
            $out['motivo'] = 'cubierto';
            return $out;
        }

        if ($rowProgramadoSinCupo === null) {
            if ($rowSinCupo) {
                $out['origen_cobro'] = 'extra';
                $out['contrato_paciente_id'] = (int)($rowSinCupo['contrato_paciente_id'] ?? 0);
                $out['contrato_paciente_servicio_id'] = (int)($rowSinCupo['contrato_paciente_servicio_id'] ?? 0);
                $out['motivo'] = 'fuera_programacion';
                return $out;
            }
            return $out;
        }

        $agendaCoverage = self::findAgendaCoverageForDate($conn, $pacienteId, $servicioTipo, $servicioId, $fecha);
        if ($agendaCoverage) {
            $out['aplica_contrato'] = true;
            $out['origen_cobro'] = 'contrato';
            $out['contrato_paciente_id'] = (int)($agendaCoverage['contrato_paciente_id'] ?? 0);
            $out['contrato_paciente_servicio_id'] = (int)($agendaCoverage['contrato_paciente_servicio_id'] ?? 0);
            $out['motivo'] = 'agenda_preconsumida';
            $out['consumo_previamente_registrado'] = true;
            return $out;
        }

        if ($rowProgramadoSinCupo) {
            $out['origen_cobro'] = 'extra';
            $out['contrato_paciente_id'] = (int)($rowProgramadoSinCupo['contrato_paciente_id'] ?? 0);
            $out['contrato_paciente_servicio_id'] = (int)($rowProgramadoSinCupo['contrato_paciente_servicio_id'] ?? 0);
            $out['motivo'] = 'sin_cupo';
            return $out;
        }

        return $out;
    }

    public static function registrarConsumoDesdeCotizacionDetalle($conn, $cotizacionDetalleId, $meta, $pacienteId, $cotizacionId, $cantidad, $usuarioId = 0)
    {
        $cotizacionDetalleId = (int)$cotizacionDetalleId;
        if ($cotizacionDetalleId <= 0) return;

        if (!empty($meta['consumo_previamente_registrado'])) {
            return;
        }

        $contratoPacienteId = (int)($meta['contrato_paciente_id'] ?? 0);
        $contratoPacienteServicioId = (int)($meta['contrato_paciente_servicio_id'] ?? 0);
        if ($contratoPacienteId <= 0 || $contratoPacienteServicioId <= 0) return;

        if (!self::tableExists($conn, 'contratos_consumos') || !self::tableExists($conn, 'contratos_paciente_servicios')) {
            return;
        }

        $stmtCheck = $conn->prepare('SELECT id FROM contratos_consumos WHERE cotizacion_detalle_id = ? LIMIT 1');
        if ($stmtCheck) {
            $stmtCheck->bind_param('i', $cotizacionDetalleId);
            $stmtCheck->execute();
            $exists = $stmtCheck->get_result()->fetch_assoc();
            $stmtCheck->close();
            if ($exists) return;
        }

        $cantidad = max(0.01, (float)$cantidad);
        $modoCobertura = strtolower(trim((string)($meta['origen_cobro'] ?? 'regular'))) === 'contrato' ? 'contrato' : 'extra';
        $montoCubierto = $modoCobertura === 'contrato' ? (float)($meta['monto_lista_referencial'] ?? 0) : 0.0;
        $montoExtra = $modoCobertura === 'extra' ? (float)($meta['monto_lista_referencial'] ?? 0) : 0.0;

        $stmtIns = $conn->prepare('INSERT INTO contratos_consumos (contrato_paciente_id, contrato_paciente_servicio_id, paciente_id, cotizacion_id, cotizacion_detalle_id, cantidad_consumida, modo_cobertura, monto_cubierto, monto_cobrado_extra, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        if (!$stmtIns) return;
        $pid = (int)$pacienteId;
        $cid = (int)$cotizacionId;
        $uid = (int)$usuarioId;
        $stmtIns->bind_param('iiiiidsddi', $contratoPacienteId, $contratoPacienteServicioId, $pid, $cid, $cotizacionDetalleId, $cantidad, $modoCobertura, $montoCubierto, $montoExtra, $uid);
        $stmtIns->execute();
        $stmtIns->close();

        if ($modoCobertura === 'contrato') {
            $stmtUpd = $conn->prepare("UPDATE contratos_paciente_servicios
                                      SET cantidad_consumida = cantidad_consumida + ?,
                                          estado = CASE
                                            WHEN (cantidad_total - (cantidad_consumida + ?)) <= 0 THEN 'agotado'
                                            ELSE 'en_uso'
                                          END
                                      WHERE id = ?");
            if ($stmtUpd) {
                $stmtUpd->bind_param('ddi', $cantidad, $cantidad, $contratoPacienteServicioId);
                $stmtUpd->execute();
                $stmtUpd->close();
            }
        }
    }

    public static function revertirConsumoDesdeCotizacionDetalle($conn, $cotizacionDetalleId, $cantidadRevertir = null)
    {
        $cotizacionDetalleId = (int)$cotizacionDetalleId;
        if ($cotizacionDetalleId <= 0) return;

        if (!self::tableExists($conn, 'contratos_consumos')) {
            return;
        }

        $stmtSel = $conn->prepare('SELECT id, contrato_paciente_servicio_id, cantidad_consumida, modo_cobertura, monto_cubierto, monto_cobrado_extra FROM contratos_consumos WHERE cotizacion_detalle_id = ? LIMIT 1 FOR UPDATE');
        if (!$stmtSel) return;
        $stmtSel->bind_param('i', $cotizacionDetalleId);
        $stmtSel->execute();
        $consumo = $stmtSel->get_result()->fetch_assoc();
        $stmtSel->close();

        if (!$consumo) return;

        $consumoId = (int)($consumo['id'] ?? 0);
        $cpsId = (int)($consumo['contrato_paciente_servicio_id'] ?? 0);
        $consumoCantidad = max(0.0, (float)($consumo['cantidad_consumida'] ?? 0));
        $modo = strtolower(trim((string)($consumo['modo_cobertura'] ?? 'regular')));
        if ($consumoId <= 0 || $consumoCantidad <= 0.00001) {
            return;
        }

        $revertir = $cantidadRevertir === null ? $consumoCantidad : max(0.0, (float)$cantidadRevertir);
        if ($revertir <= 0.00001) return;
        if ($revertir > $consumoCantidad) $revertir = $consumoCantidad;

        if ($modo === 'contrato' && $cpsId > 0 && self::tableExists($conn, 'contratos_paciente_servicios')) {
            $stmtUpdCps = $conn->prepare(
                "UPDATE contratos_paciente_servicios
                 SET cantidad_consumida = GREATEST(cantidad_consumida - ?, 0),
                     estado = CASE
                         WHEN GREATEST(cantidad_consumida - ?, 0) <= 0 THEN 'pendiente'
                         WHEN GREATEST(cantidad_consumida - ?, 0) >= cantidad_total THEN 'agotado'
                         ELSE 'en_uso'
                     END
                 WHERE id = ?"
            );
            if ($stmtUpdCps) {
                $stmtUpdCps->bind_param('dddi', $revertir, $revertir, $revertir, $cpsId);
                $stmtUpdCps->execute();
                $stmtUpdCps->close();
            }
        }

        $restante = $consumoCantidad - $revertir;
        if ($restante <= 0.00001) {
            $stmtDel = $conn->prepare('DELETE FROM contratos_consumos WHERE id = ?');
            if ($stmtDel) {
                $stmtDel->bind_param('i', $consumoId);
                $stmtDel->execute();
                $stmtDel->close();
            }
            return;
        }

        $factor = $restante / $consumoCantidad;
        $montoCubiertoNuevo = max(0.0, (float)($consumo['monto_cubierto'] ?? 0) * $factor);
        $montoExtraNuevo = max(0.0, (float)($consumo['monto_cobrado_extra'] ?? 0) * $factor);
        $stmtUpdConsumo = $conn->prepare('UPDATE contratos_consumos SET cantidad_consumida = ?, monto_cubierto = ?, monto_cobrado_extra = ? WHERE id = ?');
        if ($stmtUpdConsumo) {
            $stmtUpdConsumo->bind_param('dddi', $restante, $montoCubiertoNuevo, $montoExtraNuevo, $consumoId);
            $stmtUpdConsumo->execute();
            $stmtUpdConsumo->close();
        }
    }
}
