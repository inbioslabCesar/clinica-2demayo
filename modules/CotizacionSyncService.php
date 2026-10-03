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

    /**
     * Revierte lo que un cobro puntual le abonó a las cotizaciones a las que
     * estaba vinculado (tabla `cobros_cotizaciones`), para que su
     * total_pagado/saldo_pendiente/estado vuelvan a reflejar la realidad tras
     * anular el cobro. Sin esto, una cotización podía quedar marcada "pagado"
     * con el cobro que la pagó ya anulado (el mismo tipo de descuadre que
     * motivó esta reescritura). No toca cotizaciones que ya están anuladas
     * por completo (esas siguen su propio flujo).
     */
    private static function reversarVinculosCotizacionPorCobro($conn, $cobroId, $usuarioId, $motivo)
    {
        $cobroId = (int)$cobroId;
        $afectadas = 0;
        if ($cobroId <= 0 || !self::tableExists($conn, 'cobros_cotizaciones') || !self::tableExists($conn, 'cotizaciones')) {
            return $afectadas;
        }

        $stmtCC = $conn->prepare("SELECT cotizacion_id, monto_aplicado, descuento_aplicado FROM cobros_cotizaciones WHERE cobro_id = ? AND estado_resultado <> 'anulado'");
        if (!$stmtCC) {
            return $afectadas;
        }
        $stmtCC->bind_param('i', $cobroId);
        $stmtCC->execute();
        $vinculos = $stmtCC->get_result()->fetch_all(MYSQLI_ASSOC);

        $stmtCC2 = $conn->prepare("UPDATE cobros_cotizaciones SET estado_resultado = 'anulado', updated_at = NOW() WHERE cobro_id = ? AND cotizacion_id = ? AND estado_resultado <> 'anulado'");

        foreach ($vinculos as $vinculo) {
            $cotizacionId = (int)($vinculo['cotizacion_id'] ?? 0);
            $montoAplicado = (float)($vinculo['monto_aplicado'] ?? 0);
            $descuentoAplicado = (float)($vinculo['descuento_aplicado'] ?? 0);
            if ($cotizacionId <= 0) {
                continue;
            }

            // Regla de integridad: al revertir un cobro, el vinculo monetario debe
            // quedar anulado siempre, incluso si la cotizacion completa ya estaba anulada.
            if ($stmtCC2) {
                $stmtCC2->bind_param('ii', $cobroId, $cotizacionId);
                $stmtCC2->execute();
            }

            $stmtCot = $conn->prepare("SELECT total, total_pagado, estado FROM cotizaciones WHERE id = ? FOR UPDATE");
            if (!$stmtCot) {
                continue;
            }
            $stmtCot->bind_param('i', $cotizacionId);
            $stmtCot->execute();
            $cot = $stmtCot->get_result()->fetch_assoc();
            if (!$cot) {
                continue;
            }
            if (strtolower(trim((string)($cot['estado'] ?? ''))) === 'anulada') {
                // La cotización completa ya está anulada por otro flujo; no la resucitamos.
                // El bridge ya fue marcado como anulado arriba para evitar descuadres.
                $afectadas++;
                continue;
            }

            $totalActual = (float)$cot['total'];
            $pagadoActual = (float)$cot['total_pagado'];
            $saldoAntes = max(0.0, round($totalActual - $pagadoActual, 2));

            $totalNuevo = round($totalActual + $descuentoAplicado, 2);
            $pagadoNuevo = max(0.0, round($pagadoActual - $montoAplicado, 2));
            $saldoNuevo = max(0.0, round($totalNuevo - $pagadoNuevo, 2));
            $estadoNuevo = ($totalNuevo > 0 && $saldoNuevo <= 0.009)
                ? 'pagado'
                : ($pagadoNuevo > 0 ? 'parcial' : 'pendiente');

            $stmtUpd = $conn->prepare("UPDATE cotizaciones SET total = ?, total_pagado = ?, saldo_pendiente = ?, estado = ? WHERE id = ?");
            if ($stmtUpd) {
                $stmtUpd->bind_param('dddsi', $totalNuevo, $pagadoNuevo, $saldoNuevo, $estadoNuevo, $cotizacionId);
                $stmtUpd->execute();
            }

            if (self::tableExists($conn, 'cotizacion_movimientos') && ($montoAplicado > 0 || $descuentoAplicado > 0)) {
                $montoMov = round($montoAplicado + $descuentoAplicado, 2);
                $tipoMov = 'devolucion';
                $descripcion = 'Reversa por anulación de cobro #' . $cobroId . '. Motivo: ' . $motivo;
                $stmtMov = $conn->prepare("INSERT INTO cotizacion_movimientos (cotizacion_id, cobro_id, tipo_movimiento, monto, saldo_anterior, saldo_nuevo, descripcion, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                if ($stmtMov) {
                    $stmtMov->bind_param('iisdddsi', $cotizacionId, $cobroId, $tipoMov, $montoMov, $saldoAntes, $saldoNuevo, $descripcion, $usuarioId);
                    $stmtMov->execute();
                }
            }

            $afectadas++;
        }

        return $afectadas;
    }

    /**
     * Igual que reversarCobroCompletoPorCotizacion pero para un cobro puntual,
     * sin depender de que exista una cotización vinculada (p. ej. al anular un
     * honorario mal registrado). Anula el cobro (nunca lo borra), revierte sus
     * ingresos de caja con un asiento negativo, repone stock de farmacia y
     * revierte lo que ese cobro le hubiera abonado a cotizaciones vinculadas.
     */
    public static function reversarCobroPorId($conn, $cobroId, $usuarioId, $motivo, $honorarioMovimientoId = null)
    {
        $cobroId = (int)$cobroId;
        if ($cobroId <= 0) {
            return ['cobro_afectado' => false, 'reversas_ingreso' => 0, 'stock_restaurado' => 0, 'cotizaciones_afectadas' => 0];
        }

        $stmtEstado = $conn->prepare("UPDATE cobros SET estado = 'anulado', observaciones = CONCAT(COALESCE(observaciones, ''), ' | ANULADO: ', ?) WHERE id = ? AND estado <> 'anulado'");
        $cobroAfectado = false;
        if ($stmtEstado) {
            $stmtEstado->bind_param('si', $motivo, $cobroId);
            $stmtEstado->execute();
            $cobroAfectado = $stmtEstado->affected_rows > 0;
        }

        $totalReversas = 0;
        $honorarioMovimientoId = (int)$honorarioMovimientoId;
        $sqlIng = "SELECT * FROM ingresos_diarios WHERE monto > 0 AND (
            (referencia_id = ? AND referencia_tabla = 'cobros')"
            . ($honorarioMovimientoId > 0 ? " OR honorario_movimiento_id = ?" : "")
            . ") ORDER BY id ASC";
        $stmtIng = $conn->prepare($sqlIng);
        if ($stmtIng) {
            if ($honorarioMovimientoId > 0) {
                $stmtIng->bind_param('ii', $cobroId, $honorarioMovimientoId);
            } else {
                $stmtIng->bind_param('i', $cobroId);
            }
            $stmtIng->execute();
            $resIng = $stmtIng->get_result();
            $vistos = [];
            while ($ing = $resIng->fetch_assoc()) {
                $idIng = (int)($ing['id'] ?? 0);
                if (isset($vistos[$idIng])) {
                    continue;
                }
                $vistos[$idIng] = true;
                if (self::insertarReversaDesdeIngreso($conn, $ing, $usuarioId, $motivo)) {
                    $totalReversas++;
                }
            }
        }

        $stockRestaurado = self::restaurarStockFarmaciaPorCobro($conn, 0, $cobroId, $usuarioId, $motivo);
        $cotizacionesAfectadas = self::reversarVinculosCotizacionPorCobro($conn, $cobroId, $usuarioId, $motivo);

        return [
            'cobro_afectado' => $cobroAfectado,
            'reversas_ingreso' => $totalReversas,
            'stock_restaurado' => $stockRestaurado,
            'cotizaciones_afectadas' => $cotizacionesAfectadas,
        ];
    }

    public static function reversarCobroCompletoPorCotizacion($conn, $cotizacionId, $usuarioId, $motivo)
    {
        $cobroIds = self::obtenerCobroIdsPorCotizacion($conn, $cotizacionId);
        if (empty($cobroIds)) {
            return ['cobros_afectados' => 0, 'reversas_ingreso' => 0, 'stock_restaurado' => 0, 'cotizaciones_afectadas' => 0];
        }

        $totalReversas = 0;
        $cobrosAfectados = 0;
        $stockRestaurado = 0;
        $cotizacionesAfectadas = 0;

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

            // Mantener alineado el bridge cobro-cotizacion aun si la cotizacion padre
            // ya fue marcada anulada antes en el flujo que invoca este metodo.
            $cotizacionesAfectadas += self::reversarVinculosCotizacionPorCobro($conn, $cobroId, $usuarioId, $motivo);

            $stockRestaurado += self::restaurarStockFarmaciaPorCobro($conn, $cotizacionId, $cobroId, $usuarioId, $motivo);
        }

        return [
            'cobros_afectados' => $cobrosAfectados,
            'reversas_ingreso' => $totalReversas,
            'stock_restaurado' => $stockRestaurado,
            'cotizaciones_afectadas' => $cotizacionesAfectadas,
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
