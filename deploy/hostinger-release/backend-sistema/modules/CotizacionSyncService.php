<?php

class CotizacionSyncService
{
    private static function tableExists($conn, $table)
    {
        $stmt = $conn->prepare("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1");
        if (!$stmt) {
            return false;
        }
        $stmt->bind_param('s', $table);
        $stmt->execute();
        $res = $stmt->get_result();
        return $res && $res->num_rows > 0;
    }

    private static function mapTipoIngreso($servicioTipo)
    {
        $tipo = strtolower(trim((string)$servicioTipo));
        $map = [
            'consulta' => 'consulta',
            'laboratorio' => 'laboratorio',
            'ecografia' => 'ecografia',
            'rayosx' => 'rayosx',
            'rayos_x' => 'rayosx',
            'procedimiento' => 'procedimiento',
            'procedimientos' => 'procedimiento',
            'operacion' => 'operaciones',
            'operaciones' => 'operaciones',
            'cirugia' => 'operaciones',
            'cirugia_mayor' => 'operaciones',
            'farmacia' => 'farmacia',
        ];

        return $map[$tipo] ?? 'otros';
    }

    private static function restaurarStockFarmaciaPorCobro($conn, $cotizacionId, $cobroId, $usuarioId, $motivo)
    {
        if (!self::tableExists($conn, 'cobros_detalle') || !self::tableExists($conn, 'medicamentos')) {
            return 0;
        }

        $stmtDet = $conn->prepare("SELECT id, servicio_tipo, descripcion FROM cobros_detalle WHERE cobro_id = ?");
        if (!$stmtDet) {
            return 0;
        }
        $stmtDet->bind_param('i', $cobroId);
        $stmtDet->execute();
        $resDet = $stmtDet->get_result();

        $acum = [];
        $cacheUnidadesCaja = [];

        while ($row = $resDet->fetch_assoc()) {
            $arr = json_decode((string)($row['descripcion'] ?? ''), true);
            if (!is_array($arr)) {
                continue;
            }

            $rowTipo = strtolower(trim((string)($row['servicio_tipo'] ?? '')));

            foreach ($arr as $it) {
                if (!is_array($it)) {
                    continue;
                }

                $itemTipo = strtolower(trim((string)($it['servicio_tipo'] ?? $rowTipo)));
                if ($itemTipo !== 'farmacia') {
                    continue;
                }

                $medId = isset($it['servicio_id']) ? (int)$it['servicio_id'] : 0;
                if ($medId <= 0) {
                    continue;
                }

                $cantidad = isset($it['cantidad']) ? (int)$it['cantidad'] : 0;
                if ($cantidad <= 0) {
                    continue;
                }

                if (!isset($cacheUnidadesCaja[$medId])) {
                    $stmtMed = $conn->prepare("SELECT unidades_por_caja FROM medicamentos WHERE id = ? LIMIT 1");
                    $unidadesCaja = 1;
                    if ($stmtMed) {
                        $stmtMed->bind_param('i', $medId);
                        $stmtMed->execute();
                        $med = $stmtMed->get_result()->fetch_assoc();
                        if ($med) {
                            $unidadesCaja = max(1, (int)($med['unidades_por_caja'] ?? 1));
                        }
                    }
                    $cacheUnidadesCaja[$medId] = $unidadesCaja;
                }

                $desc = strtolower(trim((string)($it['descripcion'] ?? '')));
                $esCaja = strpos($desc, '(caja)') !== false;
                $factor = $esCaja ? $cacheUnidadesCaja[$medId] : 1;
                $unidades = $cantidad * $factor;
                if ($unidades <= 0) {
                    continue;
                }

                if (!isset($acum[$medId])) {
                    $acum[$medId] = 0;
                }
                $acum[$medId] += $unidades;
            }
        }

        if (empty($acum)) {
            return 0;
        }

        $totalRestaurado = 0;
        $tag = '[REVERSA_STOCK cotizacion_id=' . (int)$cotizacionId . ' cobro_id=' . (int)$cobroId . ']';
        $puedeLogMov = self::tableExists($conn, 'movimientos_medicamento');

        foreach ($acum as $medId => $unidades) {
            $medId = (int)$medId;
            $unidades = (int)$unidades;
            if ($medId <= 0 || $unidades <= 0) {
                continue;
            }

            if ($puedeLogMov) {
                $stmtDup = $conn->prepare("SELECT id FROM movimientos_medicamento WHERE medicamento_id = ? AND observaciones LIKE ? LIMIT 1");
                if ($stmtDup) {
                    $like = '%' . $tag . '%';
                    $stmtDup->bind_param('is', $medId, $like);
                    $stmtDup->execute();
                    $dup = $stmtDup->get_result()->fetch_assoc();
                    if ($dup) {
                        continue;
                    }
                }
            }

            $stmtUpd = $conn->prepare("UPDATE medicamentos SET stock = stock + ? WHERE id = ?");
            if (!$stmtUpd) {
                continue;
            }
            $stmtUpd->bind_param('ii', $unidades, $medId);
            $stmtUpd->execute();
            if ($stmtUpd->affected_rows > 0) {
                $totalRestaurado += $unidades;

                if ($puedeLogMov) {
                    $tipoMov = 'devolucion_unidad';
                    $observaciones = 'Reposicion por anulacion de cotizacion #' . (int)$cotizacionId . ' y cobro #' . (int)$cobroId . ' ' . $tag . ' Motivo: ' . $motivo;
                    $stmtMov = $conn->prepare("INSERT INTO movimientos_medicamento (medicamento_id, tipo_movimiento, cantidad, observaciones, usuario_id, fecha_hora) VALUES (?, ?, ?, ?, ?, NOW())");
                    if ($stmtMov) {
                        $stmtMov->bind_param('isisi', $medId, $tipoMov, $unidades, $observaciones, $usuarioId);
                        $stmtMov->execute();
                    }
                }
            }
        }

        return $totalRestaurado;
    }

    public static function obtenerCobroIdsPorCotizacion($conn, $cotizacionId)
    {
        $ids = [];
        $stmt = $conn->prepare("SELECT DISTINCT cobro_id FROM cotizacion_movimientos WHERE cotizacion_id = ? AND cobro_id IS NOT NULL ORDER BY cobro_id DESC");
        if (!$stmt) {
            return $ids;
        }

        $stmt->bind_param('i', $cotizacionId);
        $stmt->execute();
        $res = $stmt->get_result();
        while ($row = $res->fetch_assoc()) {
            $id = isset($row['cobro_id']) ? (int)$row['cobro_id'] : 0;
            if ($id > 0) {
                $ids[] = $id;
            }
        }

        return $ids;
    }

    private static function insertarReversaDesdeIngreso($conn, $ingreso, $usuarioId, $motivo)
    {
        $ingresoId = (int)($ingreso['id'] ?? 0);
        $monto = (float)($ingreso['monto'] ?? 0);
        if ($ingresoId <= 0 || $monto <= 0) {
            return false;
        }

        $tag = '[REVERSA ingreso_id=' . $ingresoId . ']';
        $stmtExists = $conn->prepare("SELECT id FROM ingresos_diarios WHERE referencia_id = ? AND referencia_tabla = 'cobros' AND descripcion LIKE ? LIMIT 1");
        if ($stmtExists) {
            $cobroId = (int)($ingreso['referencia_id'] ?? 0);
            $like = '%' . $tag . '%';
            $stmtExists->bind_param('is', $cobroId, $like);
            $stmtExists->execute();
            $dup = $stmtExists->get_result()->fetch_assoc();
            if ($dup) {
                return false;
            }
        }

        $descripcion = trim(($ingreso['descripcion'] ?? 'Ingreso') . ' ' . $tag . ' Motivo: ' . $motivo);
        $montoReversa = -1 * $monto;

        $stmtIns = $conn->prepare(
            "INSERT INTO ingresos_diarios (
                caja_id, tipo_ingreso, area, descripcion, monto, metodo_pago, referencia_id, referencia_tabla,
                paciente_id, paciente_nombre, usuario_id, turno, honorario_movimiento_id, cobrado_por,
                liquidado_por, fecha_liquidacion, fecha_hora
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())"
        );
        if (!$stmtIns) {
            return false;
        }

        $cajaId = isset($ingreso['caja_id']) ? (int)$ingreso['caja_id'] : null;
        $tipoIngreso = (string)($ingreso['tipo_ingreso'] ?? 'otros');
        $area = (string)($ingreso['area'] ?? 'Reversa');
        $metodoPago = (string)($ingreso['metodo_pago'] ?? 'otros');
        $referenciaId = isset($ingreso['referencia_id']) ? (int)$ingreso['referencia_id'] : null;
        $referenciaTabla = (string)($ingreso['referencia_tabla'] ?? 'cobros');
        $pacienteId = isset($ingreso['paciente_id']) ? (int)$ingreso['paciente_id'] : null;
        $pacienteNombre = (string)($ingreso['paciente_nombre'] ?? '');
        $usuarioRegistro = $usuarioId > 0 ? $usuarioId : (int)($ingreso['usuario_id'] ?? 0);
        $turno = isset($ingreso['turno']) ? (string)$ingreso['turno'] : null;
        $honorarioMovId = isset($ingreso['honorario_movimiento_id']) ? (int)$ingreso['honorario_movimiento_id'] : null;
        $cobradoPor = isset($ingreso['cobrado_por']) ? (int)$ingreso['cobrado_por'] : $usuarioRegistro;
        $liquidadoPor = isset($ingreso['liquidado_por']) ? (int)$ingreso['liquidado_por'] : null;
        $fechaLiquidacion = isset($ingreso['fecha_liquidacion']) ? $ingreso['fecha_liquidacion'] : null;

        $stmtIns->bind_param(
            'isssdsisisisiiis',
            $cajaId,
            $tipoIngreso,
            $area,
            $descripcion,
            $montoReversa,
            $metodoPago,
            $referenciaId,
            $referenciaTabla,
            $pacienteId,
            $pacienteNombre,
            $usuarioRegistro,
            $turno,
            $honorarioMovId,
            $cobradoPor,
            $liquidadoPor,
            $fechaLiquidacion
        );

        return $stmtIns->execute();
    }

    public static function reversarCobroCompletoPorCotizacion($conn, $cotizacionId, $usuarioId, $motivo)
    {
        $cobroIds = self::obtenerCobroIdsPorCotizacion($conn, $cotizacionId);
        if (empty($cobroIds)) {
            return ['cobros_afectados' => 0, 'reversas_ingreso' => 0, 'stock_restaurado' => 0];
        }

        $totalReversas = 0;
        $cobrosAfectados = 0;
        $stockRestaurado = 0;

        foreach ($cobroIds as $cobroId) {
            $stmtEstado = $conn->prepare("UPDATE cobros SET estado = 'anulado', observaciones = CONCAT(COALESCE(observaciones, ''), ' | ANULADO POR COTIZACION #', ?, ': ', ?) WHERE id = ? AND estado <> 'anulado'");
            if ($stmtEstado) {
                $stmtEstado->bind_param('isi', $cotizacionId, $motivo, $cobroId);
                $stmtEstado->execute();
                if ($stmtEstado->affected_rows > 0) {
                    $cobrosAfectados++;
                }
            }

            $stmtIng = $conn->prepare("SELECT * FROM ingresos_diarios WHERE referencia_id = ? AND referencia_tabla = 'cobros' AND monto > 0 ORDER BY id ASC");
            if (!$stmtIng) {
                continue;
            }
            $stmtIng->bind_param('i', $cobroId);
            $stmtIng->execute();
            $resIng = $stmtIng->get_result();
            while ($ing = $resIng->fetch_assoc()) {
                if (self::insertarReversaDesdeIngreso($conn, $ing, $usuarioId, $motivo)) {
                    $totalReversas++;
                }
            }

            $stockRestaurado += self::restaurarStockFarmaciaPorCobro($conn, $cotizacionId, $cobroId, $usuarioId, $motivo);
        }

        return [
            'cobros_afectados' => $cobrosAfectados,
            'reversas_ingreso' => $totalReversas,
            'stock_restaurado' => $stockRestaurado,
        ];
    }

    public static function reversarMontoParcialPorCotizacion($conn, $cotizacionId, $servicioTipo, $monto, $usuarioId, $motivo)
    {
        $monto = round((float)$monto, 2);
        if ($monto <= 0) {
            return ['monto_reversado' => 0.0, 'cobro_id' => null, 'reversa_insertada' => false];
        }

        $cobroIds = self::obtenerCobroIdsPorCotizacion($conn, $cotizacionId);
        if (empty($cobroIds)) {
            return ['monto_reversado' => 0.0, 'cobro_id' => null, 'reversa_insertada' => false];
        }

        $cobroId = (int)$cobroIds[0];
        $tipoIngreso = self::mapTipoIngreso($servicioTipo);

        $stmtDisponible = $conn->prepare(
            "SELECT COALESCE(SUM(monto), 0) AS neto
             FROM ingresos_diarios
             WHERE referencia_id = ? AND referencia_tabla = 'cobros' AND tipo_ingreso = ?"
        );
        if (!$stmtDisponible) {
            return ['monto_reversado' => 0.0, 'cobro_id' => $cobroId, 'reversa_insertada' => false];
        }
        $stmtDisponible->bind_param('is', $cobroId, $tipoIngreso);
        $stmtDisponible->execute();
        $neto = (float)($stmtDisponible->get_result()->fetch_assoc()['neto'] ?? 0);

        $montoAplicado = min($monto, max(0, $neto));
        if ($montoAplicado <= 0) {
            return ['monto_reversado' => 0.0, 'cobro_id' => $cobroId, 'reversa_insertada' => false];
        }

        $stmtBase = $conn->prepare(
            "SELECT * FROM ingresos_diarios
             WHERE referencia_id = ? AND referencia_tabla = 'cobros' AND tipo_ingreso = ? AND monto > 0
             ORDER BY id DESC LIMIT 1"
        );
        if (!$stmtBase) {
            return ['monto_reversado' => 0.0, 'cobro_id' => $cobroId, 'reversa_insertada' => false];
        }
        $stmtBase->bind_param('is', $cobroId, $tipoIngreso);
        $stmtBase->execute();
        $base = $stmtBase->get_result()->fetch_assoc();
        if (!$base) {
            return ['monto_reversado' => 0.0, 'cobro_id' => $cobroId, 'reversa_insertada' => false];
        }

        $tag = '[REVERSA_PARCIAL cotizacion_id=' . (int)$cotizacionId . ']';
        $descripcion = trim(($base['descripcion'] ?? 'Ingreso') . ' ' . $tag . ' Motivo: ' . $motivo);

        $stmtIns = $conn->prepare(
            "INSERT INTO ingresos_diarios (
                caja_id, tipo_ingreso, area, descripcion, monto, metodo_pago, referencia_id, referencia_tabla,
                paciente_id, paciente_nombre, usuario_id, turno, honorario_movimiento_id, cobrado_por,
                liquidado_por, fecha_liquidacion, fecha_hora
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())"
        );
        if (!$stmtIns) {
            return ['monto_reversado' => 0.0, 'cobro_id' => $cobroId, 'reversa_insertada' => false];
        }

        $cajaId = isset($base['caja_id']) ? (int)$base['caja_id'] : null;
        $area = (string)($base['area'] ?? 'Ajuste');
        $montoNegativo = -1 * $montoAplicado;
        $metodoPago = (string)($base['metodo_pago'] ?? 'otros');
        $referenciaId = isset($base['referencia_id']) ? (int)$base['referencia_id'] : null;
        $referenciaTabla = (string)($base['referencia_tabla'] ?? 'cobros');
        $pacienteId = isset($base['paciente_id']) ? (int)$base['paciente_id'] : null;
        $pacienteNombre = (string)($base['paciente_nombre'] ?? '');
        $usuarioRegistro = $usuarioId > 0 ? $usuarioId : (int)($base['usuario_id'] ?? 0);
        $turno = isset($base['turno']) ? (string)$base['turno'] : null;
        $honorarioMovId = isset($base['honorario_movimiento_id']) ? (int)$base['honorario_movimiento_id'] : null;
        $cobradoPor = isset($base['cobrado_por']) ? (int)$base['cobrado_por'] : $usuarioRegistro;
        $liquidadoPor = isset($base['liquidado_por']) ? (int)$base['liquidado_por'] : null;
        $fechaLiquidacion = isset($base['fecha_liquidacion']) ? $base['fecha_liquidacion'] : null;

        $stmtIns->bind_param(
            'isssdsisisisiiis',
            $cajaId,
            $tipoIngreso,
            $area,
            $descripcion,
            $montoNegativo,
            $metodoPago,
            $referenciaId,
            $referenciaTabla,
            $pacienteId,
            $pacienteNombre,
            $usuarioRegistro,
            $turno,
            $honorarioMovId,
            $cobradoPor,
            $liquidadoPor,
            $fechaLiquidacion
        );

        $ok = $stmtIns->execute();
        if (!$ok) {
            return ['monto_reversado' => 0.0, 'cobro_id' => $cobroId, 'reversa_insertada' => false];
        }

        // Mantener consistencia con consumo_total (suma de cobros pagados).
        $stmtCob = $conn->prepare("SELECT total, estado FROM cobros WHERE id = ? FOR UPDATE");
        if ($stmtCob) {
            $stmtCob->bind_param('i', $cobroId);
            $stmtCob->execute();
            $cob = $stmtCob->get_result()->fetch_assoc();
            if ($cob) {
                $totalAnterior = (float)($cob['total'] ?? 0);
                $estadoCobro = strtolower((string)($cob['estado'] ?? 'pagado'));
                $totalNuevo = max(0, round($totalAnterior - $montoAplicado, 2));
                $estadoNuevo = $estadoCobro;
                if ($totalNuevo <= 0) {
                    $estadoNuevo = 'anulado';
                }
                $stmtUpCob = $conn->prepare("UPDATE cobros SET total = ?, estado = ?, observaciones = CONCAT(COALESCE(observaciones, ''), ' | AJUSTE COTIZACION #', ?, ': ', ?) WHERE id = ?");
                if ($stmtUpCob) {
                    $stmtUpCob->bind_param('dsisi', $totalNuevo, $estadoNuevo, $cotizacionId, $motivo, $cobroId);
                    $stmtUpCob->execute();
                }
            }
        }

        return ['monto_reversado' => $montoAplicado, 'cobro_id' => $cobroId, 'reversa_insertada' => true];
    }
}
