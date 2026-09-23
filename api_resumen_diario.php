<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/caja_autocierre.php';

if (!isset($_SESSION['usuario'])) {
    error_log('No autenticado: sesión no iniciada');
    http_response_code(401);
    echo json_encode([
        'success' => false,
        'error' => 'No autenticado',
        'request_id' => function_exists('api_request_id') ? api_request_id() : null,
    ]);
    exit();
}

$usuario = $_SESSION['usuario'];
$fecha = isset($_GET['fecha']) ? $_GET['fecha'] : date('Y-m-d');

// Calcular rango de fecha para el día
$inicioDia = $fecha . ' 00:00:00';
$finDia = date('Y-m-d', strtotime($fecha . ' +1 day')) . ' 00:00:00';

// Egreso honorarios médicos
$egreso_honorarios = 0.0;
$egreso_honorarios_caja = 0.0;
$egreso_honorarios_dia_operativo = 0.0;
$egreso_honorarios_arrastre = 0.0;
$total_atenciones_dia = 0.0;
$cobrado_turno = 0.0;
$diferencia_conciliacion = 0.0;
$monto_sin_asiento_caja = 0.0;
$monto_cobros_inexistentes = 0.0;

try {
    caja_auto_cerrar_vencidas($pdo);

    // El encabezado resume exclusivamente la caja abierta actual. Las cajas cerradas
    // siguen disponibles en cajas_resumen, pero no se mezclan con una caja nueva.
    $stmtCaja = $pdo->prepare('SELECT id, fecha, turno, monto_apertura, estado, hora_apertura FROM cajas WHERE fecha >= ? AND fecha < ? AND usuario_id = ? AND estado = "abierta" ORDER BY created_at DESC LIMIT 1');
    $stmtCaja->execute([$inicioDia, $finDia, $usuario['id']]);
    $caja_row = $stmtCaja->fetch(PDO::FETCH_ASSOC) ?: null;
    $caja_id_actual = $caja_row ? (int)$caja_row['id'] : 0;

    $egreso_operativo = 0.0;
    $egreso_lab_ref = 0.0;
    $total = 0.0;
    $ingresos_por_servicio = [];
    $ingresos_por_area = [];
    $ingresos_por_pago = [];
    $egresos_por_metodo = ['efectivo' => 0.0, 'yape' => 0.0, 'plin' => 0.0, 'tarjeta' => 0.0, 'transferencia' => 0.0];
    $egresos_externos = 0.0;
    $total_contratos_abono = 0.0;

    $calcularHonorariosCaja = function (int $cajaId, string $fechaOperativa, ?string $turnoCaja = null) use ($pdo) {
        $fechaOperativa = trim($fechaOperativa);
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fechaOperativa)) {
            $fechaOperativa = date('Y-m-d');
        }

        $turnoNormalizado = strtolower(trim((string)$turnoCaja));
        if (!in_array($turnoNormalizado, ['mañana', 'tarde', 'noche'], true)) {
            $turnoNormalizado = null;
        }

        $sql = 'SELECT '
            . 'COALESCE(SUM(CASE WHEN LOWER(TRIM(COALESCE(h.estado_pago_medico, ""))) = "pagado" THEN h.monto_medico ELSE 0 END), 0) AS total_pagado, '
            . 'COALESCE(SUM(CASE WHEN LOWER(TRIM(COALESCE(h.estado_pago_medico, ""))) = "pagado" '
            . 'AND h.fecha = ? '
            . ($turnoNormalizado !== null ? 'AND LOWER(TRIM(COALESCE(h.turno, ""))) = ? ' : '')
            . 'THEN h.monto_medico ELSE 0 END), 0) AS total_dia_operativo '
            . 'FROM honorarios_medicos_movimientos h '
            . 'WHERE h.caja_id = ?';

        $stmt = $pdo->prepare($sql);
        if ($turnoNormalizado !== null) {
            $stmt->execute([$fechaOperativa, $turnoNormalizado, $cajaId]);
        } else {
            $stmt->execute([$fechaOperativa, $cajaId]);
        }

        $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
        $totalPagado = (float)($row['total_pagado'] ?? 0);
        $totalDiaOperativo = (float)($row['total_dia_operativo'] ?? 0);
        $totalArrastre = max(0, $totalPagado - $totalDiaOperativo);

        return [
            'total_pagado' => $totalPagado,
            'total_dia_operativo' => $totalDiaOperativo,
            'total_arrastre' => $totalArrastre,
        ];
    };

    $calcularConciliacionCaja = function (int $usuarioId, string $fechaOperativa, int $cajaId) use ($pdo) {
        $fechaOperativa = trim($fechaOperativa);
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fechaOperativa)) {
            $fechaOperativa = date('Y-m-d');
        }

        $totalAtencionesDia = 0.0;
        $cobradoTurno = 0.0;
        $montoSinAsientoCaja = 0.0;
        $montoCobrosInexistentes = 0.0;

        try {
            $stmtAtenciones = $pdo->prepare('SELECT COALESCE(SUM(total_pagado), 0), COUNT(*) FROM cotizaciones WHERE usuario_id = ? AND DATE(fecha) = ? AND COALESCE(total_pagado, 0) > 0 AND LOWER(TRIM(COALESCE(estado, ""))) IN ("pagado", "parcial")');
            $stmtAtenciones->execute([$usuarioId, $fechaOperativa]);
            $rowAtenciones = $stmtAtenciones->fetch(PDO::FETCH_NUM) ?: [0, 0];
            $totalAtencionesDia = (float)($rowAtenciones[0] ?? 0);
            $cantidadAtencionesDia = (int)($rowAtenciones[1] ?? 0);
        } catch (Throwable $e) {
            $totalAtencionesDia = 0.0;
            $cantidadAtencionesDia = 0;
        }

        try {
            $stmtCaja = $pdo->prepare('SELECT COALESCE(SUM(monto), 0) FROM ingresos_diarios WHERE caja_id = ?');
            $stmtCaja->execute([$cajaId]);
            $cobradoTurno = (float)$stmtCaja->fetchColumn();
        } catch (Throwable $e) {
            $cobradoTurno = 0.0;
        }

        try {
            $stmtSinAsiento = $pdo->prepare(
                'SELECT COALESCE(SUM(GREATEST(0, pagos.monto_abono - COALESCE(ing.monto_asentado, 0))), 0) '
                . 'FROM ('
                . '  SELECT cm.cobro_id, COALESCE(SUM(cm.monto), 0) AS monto_abono '
                . '  FROM cotizacion_movimientos cm '
                . '  INNER JOIN cotizaciones c ON c.id = cm.cotizacion_id '
                . '  WHERE c.usuario_id = ? '
                . '    AND DATE(c.fecha) = ? '
                . '    AND cm.cobro_id IS NOT NULL '
                . '    AND LOWER(TRIM(COALESCE(cm.tipo_movimiento, ""))) = "abono" '
                . '    AND COALESCE(cm.monto, 0) > 0 '
                . '  GROUP BY cm.cobro_id '
                . ') pagos '
                . 'LEFT JOIN ('
                . '  SELECT referencia_id AS cobro_id, COALESCE(SUM(monto), 0) AS monto_asentado '
                . '  FROM ingresos_diarios '
                . '  WHERE caja_id = ? '
                . '    AND LOWER(TRIM(COALESCE(referencia_tabla, ""))) = "cobros" '
                . '  GROUP BY referencia_id '
                . ') ing ON ing.cobro_id = pagos.cobro_id'
            );
            $stmtSinAsiento->execute([$usuarioId, $fechaOperativa, $cajaId]);
            $montoSinAsientoCaja = (float)$stmtSinAsiento->fetchColumn();
        } catch (Throwable $e) {
            $montoSinAsientoCaja = 0.0;
        }

        try {
            $stmtCobrosInexistentes = $pdo->prepare(
                'SELECT COALESCE(SUM(cm.monto), 0) '
                . 'FROM cotizacion_movimientos cm '
                . 'INNER JOIN cotizaciones c ON c.id = cm.cotizacion_id '
                . 'LEFT JOIN cobros cb ON cb.id = cm.cobro_id '
                . 'WHERE c.usuario_id = ? '
                . '  AND DATE(c.fecha) = ? '
                . '  AND cm.cobro_id IS NOT NULL '
                . '  AND cb.id IS NULL '
                . '  AND LOWER(TRIM(COALESCE(cm.tipo_movimiento, ""))) = "abono" '
                . '  AND COALESCE(cm.monto, 0) > 0'
            );
            $stmtCobrosInexistentes->execute([$usuarioId, $fechaOperativa]);
            $montoCobrosInexistentes = (float)$stmtCobrosInexistentes->fetchColumn();
        } catch (Throwable $e) {
            $montoCobrosInexistentes = 0.0;
        }

        $diferencia = round($totalAtencionesDia - $cobradoTurno, 2);

        return [
            'total_atenciones_dia' => round($totalAtencionesDia, 2),
            'cantidad_atenciones_dia' => $cantidadAtencionesDia,
            'cobrado_turno' => round($cobradoTurno, 2),
            'diferencia_conciliacion' => $diferencia,
            'monto_sin_asiento_caja' => round($montoSinAsientoCaja, 2),
            'monto_cobros_inexistentes' => round($montoCobrosInexistentes, 2),
        ];
    };

    $normalizarTipoIngresoServicio = function (string $tipoRaw): string {
        $tipo = strtolower(trim($tipoRaw));
        if ($tipo === '') {
            return 'otros';
        }

        $map = [
            'consulta' => 'consulta',
            'consulta_medica' => 'consulta',
            'medicina_estetica' => 'consulta',
            'laboratorio' => 'laboratorio',
            'farmacia' => 'farmacia',
            'ecografia' => 'ecografia',
            'rayosx' => 'rayosx',
            'rayos_x' => 'rayosx',
            'rayos x' => 'rayosx',
            'rx' => 'rayosx',
            'procedimiento' => 'procedimiento',
            'procedimientos' => 'procedimiento',
            'operacion' => 'operaciones',
            'operaciones' => 'operaciones',
            'cirugia' => 'operaciones',
            'cirugias' => 'operaciones',
            'cirugia_mayor' => 'operaciones',
        ];

        return $map[$tipo] ?? $tipo;
    };

    $calcularSinAsientoPorServicio = function (int $usuarioId, string $fechaOperativa, int $cajaId) use ($pdo, $normalizarTipoIngresoServicio) {
        $resultado = [];

        if ($usuarioId <= 0 || $cajaId <= 0) {
            return $resultado;
        }

        $fechaOperativa = trim($fechaOperativa);
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fechaOperativa)) {
            $fechaOperativa = date('Y-m-d');
        }

        $stmtPagos = $pdo->prepare(
            'SELECT cm.cobro_id, COALESCE(SUM(cm.monto), 0) AS monto_abono '
            . 'FROM cotizacion_movimientos cm '
            . 'INNER JOIN cotizaciones c ON c.id = cm.cotizacion_id '
            . 'WHERE c.usuario_id = ? '
            . '  AND DATE(c.fecha) = ? '
            . '  AND cm.cobro_id IS NOT NULL '
            . '  AND LOWER(TRIM(COALESCE(cm.tipo_movimiento, ""))) = "abono" '
            . '  AND COALESCE(cm.monto, 0) > 0 '
            . 'GROUP BY cm.cobro_id'
        );
        $stmtPagos->execute([$usuarioId, $fechaOperativa]);
        $pagosCobro = $stmtPagos->fetchAll(PDO::FETCH_ASSOC);
        if (!$pagosCobro) {
            return $resultado;
        }

        $stmtAsientos = $pdo->prepare(
            'SELECT referencia_id AS cobro_id, COALESCE(SUM(monto), 0) AS monto_asentado '
            . 'FROM ingresos_diarios '
            . 'WHERE caja_id = ? '
            . '  AND LOWER(TRIM(COALESCE(referencia_tabla, ""))) = "cobros" '
            . 'GROUP BY referencia_id'
        );
        $stmtAsientos->execute([$cajaId]);
        $asientosRows = $stmtAsientos->fetchAll(PDO::FETCH_ASSOC);
        $asientosPorCobro = [];
        foreach ($asientosRows as $rowAsiento) {
            $asientosPorCobro[(int)($rowAsiento['cobro_id'] ?? 0)] = (float)($rowAsiento['monto_asentado'] ?? 0);
        }

        $stmtDetalleServicio = $pdo->prepare(
            'SELECT LOWER(TRIM(COALESCE(servicio_tipo, ""))) AS servicio_tipo, COALESCE(SUM(subtotal), 0) AS monto_tipo '
            . 'FROM cobros_detalle '
            . 'WHERE cobro_id = ? '
            . 'GROUP BY LOWER(TRIM(COALESCE(servicio_tipo, "")))'
        );

        foreach ($pagosCobro as $rowPago) {
            $cobroId = (int)($rowPago['cobro_id'] ?? 0);
            $montoAbono = (float)($rowPago['monto_abono'] ?? 0);
            if ($cobroId <= 0 || $montoAbono <= 0) {
                continue;
            }

            $montoAsentado = (float)($asientosPorCobro[$cobroId] ?? 0);
            $faltante = round(max(0, $montoAbono - $montoAsentado), 2);
            if ($faltante <= 0) {
                continue;
            }

            $stmtDetalleServicio->execute([$cobroId]);
            $detalleTipos = $stmtDetalleServicio->fetchAll(PDO::FETCH_ASSOC);
            if (!$detalleTipos) {
                $resultado['otros'] = ($resultado['otros'] ?? 0) + $faltante;
                continue;
            }

            $totalDetalle = 0.0;
            foreach ($detalleTipos as $detTipo) {
                $totalDetalle += max(0, (float)($detTipo['monto_tipo'] ?? 0));
            }

            if ($totalDetalle <= 0) {
                $resultado['otros'] = ($resultado['otros'] ?? 0) + $faltante;
                continue;
            }

            $acumulado = 0.0;
            $lastIdx = count($detalleTipos) - 1;
            foreach ($detalleTipos as $idxTipo => $detTipo) {
                $pesoTipo = max(0, (float)($detTipo['monto_tipo'] ?? 0));
                if ($pesoTipo <= 0) {
                    continue;
                }
                if ($idxTipo === $lastIdx) {
                    $montoTipo = round(max(0, $faltante - $acumulado), 2);
                } else {
                    $montoTipo = round(($faltante * $pesoTipo) / $totalDetalle, 2);
                    $acumulado = round($acumulado + $montoTipo, 2);
                }

                if ($montoTipo <= 0) {
                    continue;
                }

                $tipoIngreso = $normalizarTipoIngresoServicio((string)($detTipo['servicio_tipo'] ?? ''));
                $resultado[$tipoIngreso] = ($resultado[$tipoIngreso] ?? 0) + $montoTipo;
            }
        }

        return $resultado;
    };

    $calcularIngresosPorServicioCaja = function (int $cajaId) use ($pdo, $normalizarTipoIngresoServicio) {
        $acumulado = [];
        if ($cajaId <= 0) {
            return [];
        }

        $stmtIngresos = $pdo->prepare(
            'SELECT tipo_ingreso, monto, referencia_tabla, referencia_id '
            . 'FROM ingresos_diarios '
            . 'WHERE caja_id = ?'
        );
        $stmtIngresos->execute([$cajaId]);
        $rowsIngresos = $stmtIngresos->fetchAll(PDO::FETCH_ASSOC);
        if (!$rowsIngresos) {
            return [];
        }

        $cobroIds = [];
        foreach ($rowsIngresos as $rowIngreso) {
            $tablaRef = strtolower(trim((string)($rowIngreso['referencia_tabla'] ?? '')));
            $refId = (int)($rowIngreso['referencia_id'] ?? 0);
            if ($tablaRef === 'cobros' && $refId > 0) {
                $cobroIds[$refId] = true;
            }
        }

        $cobroTipoUnico = [];
        $cacheDistribucionMixtaCobro = [];

        $obtenerDistribucionMixtaCobro = function (int $cobroId) use ($pdo, $normalizarTipoIngresoServicio, &$cacheDistribucionMixtaCobro) {
            if ($cobroId <= 0) {
                return [];
            }
            if (array_key_exists($cobroId, $cacheDistribucionMixtaCobro)) {
                return $cacheDistribucionMixtaCobro[$cobroId];
            }

            $stmtDetCobro = $pdo->prepare('SELECT servicio_tipo, subtotal, descripcion FROM cobros_detalle WHERE cobro_id = ?');
            $stmtDetCobro->execute([$cobroId]);
            $detalles = $stmtDetCobro->fetchAll(PDO::FETCH_ASSOC);

            $componentes = [];
            foreach ($detalles as $det) {
                $tipoFila = $normalizarTipoIngresoServicio((string)($det['servicio_tipo'] ?? ''));
                $subtotalFila = max(0, (float)($det['subtotal'] ?? 0));
                $descripcion = (string)($det['descripcion'] ?? '');
                $itemsJson = json_decode($descripcion, true);
                $jsonAportoItems = false;

                if (is_array($itemsJson)) {
                    foreach ($itemsJson as $item) {
                        if (!is_array($item)) {
                            continue;
                        }
                        $tipoItem = $normalizarTipoIngresoServicio((string)($item['servicio_tipo'] ?? ''));
                        $subtotalItem = 0.0;
                        if (isset($item['subtotal'])) {
                            $subtotalItem = (float)$item['subtotal'];
                        } else {
                            $cantidadItem = isset($item['cantidad']) ? (float)$item['cantidad'] : 1.0;
                            $precioItem = isset($item['precio_unitario']) ? (float)$item['precio_unitario'] : 0.0;
                            $subtotalItem = $cantidadItem * $precioItem;
                        }
                        $subtotalItem = max(0, $subtotalItem);
                        if ($tipoItem !== '' && $subtotalItem > 0) {
                            $componentes[] = ['tipo' => $tipoItem, 'monto_base' => $subtotalItem];
                            $jsonAportoItems = true;
                        }
                    }
                }

                if (!$jsonAportoItems && !in_array($tipoFila, ['mixto', 'otros', ''], true) && $subtotalFila > 0) {
                    $componentes[] = ['tipo' => $tipoFila, 'monto_base' => $subtotalFila];
                }
            }

            $agregado = [];
            foreach ($componentes as $comp) {
                $tipoComp = (string)($comp['tipo'] ?? '');
                $montoBase = max(0, (float)($comp['monto_base'] ?? 0));
                if ($tipoComp === '' || in_array($tipoComp, ['mixto', 'otros'], true) || $montoBase <= 0) {
                    continue;
                }
                $agregado[$tipoComp] = ($agregado[$tipoComp] ?? 0) + $montoBase;
            }

            $cacheDistribucionMixtaCobro[$cobroId] = $agregado;
            return $agregado;
        };

        if (!empty($cobroIds)) {
            $ids = array_keys($cobroIds);
            $placeholders = implode(',', array_fill(0, count($ids), '?'));

            // Fuente canónica 1: servicio real de la cotización vinculada al cobro.
            $stmtTiposCot = $pdo->prepare(
                'SELECT cm.cobro_id, '
                . 'COUNT(DISTINCT LOWER(TRIM(COALESCE(cd.servicio_tipo, "")))) AS tipos_cnt, '
                . 'MIN(LOWER(TRIM(COALESCE(cd.servicio_tipo, "")))) AS tipo_unico '
                . 'FROM cotizacion_movimientos cm '
                . 'INNER JOIN cotizaciones_detalle cd ON cd.cotizacion_id = cm.cotizacion_id '
                . "WHERE cm.cobro_id IN ($placeholders) "
                . '  AND LOWER(TRIM(COALESCE(cm.tipo_movimiento, ""))) = "abono" '
                . '  AND COALESCE(cm.monto, 0) > 0 '
                . 'GROUP BY cm.cobro_id'
            );
            $stmtTiposCot->execute($ids);
            foreach ($stmtTiposCot->fetchAll(PDO::FETCH_ASSOC) as $tipoCotRow) {
                $cobroId = (int)($tipoCotRow['cobro_id'] ?? 0);
                $tiposCnt = (int)($tipoCotRow['tipos_cnt'] ?? 0);
                $tipoUnico = (string)($tipoCotRow['tipo_unico'] ?? '');
                if ($cobroId > 0 && $tiposCnt === 1 && $tipoUnico !== '') {
                    $cobroTipoUnico[$cobroId] = $normalizarTipoIngresoServicio($tipoUnico);
                }
            }

            // Fuente canónica 2 (fallback): servicio del cobro si solo tiene un tipo.
            $stmtTipos = $pdo->prepare(
                'SELECT cobro_id, COUNT(DISTINCT LOWER(TRIM(COALESCE(servicio_tipo, "")))) AS tipos_cnt, '
                . 'MIN(LOWER(TRIM(COALESCE(servicio_tipo, "")))) AS tipo_unico '
                . 'FROM cobros_detalle '
                . "WHERE cobro_id IN ($placeholders) "
                . 'GROUP BY cobro_id'
            );
            $stmtTipos->execute($ids);
            foreach ($stmtTipos->fetchAll(PDO::FETCH_ASSOC) as $tipoRow) {
                $cobroId = (int)($tipoRow['cobro_id'] ?? 0);
                $tiposCnt = (int)($tipoRow['tipos_cnt'] ?? 0);
                $tipoUnico = (string)($tipoRow['tipo_unico'] ?? '');
                $tipoNormalizado = $normalizarTipoIngresoServicio($tipoUnico);
                if (
                    $cobroId > 0
                    && $tiposCnt === 1
                    && $tipoUnico !== ''
                    && !isset($cobroTipoUnico[$cobroId])
                    && !in_array($tipoNormalizado, ['mixto', 'otros'], true)
                ) {
                    $cobroTipoUnico[$cobroId] = $tipoNormalizado;
                }
            }
        }

        foreach ($rowsIngresos as $rowIngreso) {
            $monto = (float)($rowIngreso['monto'] ?? 0);
            if (abs($monto) < 0.01) {
                continue;
            }

            $tipoIngreso = $normalizarTipoIngresoServicio((string)($rowIngreso['tipo_ingreso'] ?? 'otros'));
            $tablaRef = strtolower(trim((string)($rowIngreso['referencia_tabla'] ?? '')));
            $refId = (int)($rowIngreso['referencia_id'] ?? 0);

            // Si el cobro asociado solo tiene un tipo de servicio, usar ese tipo como fuente canónica.
            if ($tablaRef === 'cobros' && $refId > 0 && isset($cobroTipoUnico[$refId])) {
                $tipoIngreso = (string)$cobroTipoUnico[$refId];
            }

            // Si llega como mixto/otros, intentar descomponerlo con el detalle real del cobro.
            if ($tablaRef === 'cobros' && $refId > 0 && in_array($tipoIngreso, ['mixto', 'otros'], true)) {
                $distribucion = $obtenerDistribucionMixtaCobro($refId);
                $sumaBase = 0.0;
                foreach ($distribucion as $montoBase) {
                    $sumaBase += max(0, (float)$montoBase);
                }

                if ($sumaBase > 0) {
                    $tipos = array_keys($distribucion);
                    $acumuladoParcial = 0.0;
                    $lastIdx = count($tipos) - 1;
                    foreach ($tipos as $idxTipo => $tipoDet) {
                        $baseTipo = max(0, (float)($distribucion[$tipoDet] ?? 0));
                        if ($baseTipo <= 0) {
                            continue;
                        }
                        if ($idxTipo === $lastIdx) {
                            $montoAsignado = round($monto - $acumuladoParcial, 2);
                        } else {
                            $montoAsignado = round(($monto * $baseTipo) / $sumaBase, 2);
                            $acumuladoParcial = round($acumuladoParcial + $montoAsignado, 2);
                        }

                        if (abs($montoAsignado) < 0.01) {
                            continue;
                        }
                        $acumulado[$tipoDet] = ($acumulado[$tipoDet] ?? 0) + $montoAsignado;
                    }
                    continue;
                }
            }

            $acumulado[$tipoIngreso] = ($acumulado[$tipoIngreso] ?? 0) + $monto;
        }

        $rows = [];
        foreach ($acumulado as $tipo => $monto) {
            if (abs($monto) < 0.01) {
                continue;
            }
            $rows[] = [
                'tipo_ingreso' => $tipo,
                'total_servicio' => round($monto, 2),
            ];
        }

        usort($rows, function ($a, $b) {
            return strcmp((string)$a['tipo_ingreso'], (string)$b['tipo_ingreso']);
        });

        return $rows;
    };

    $fusionarIngresosPorServicio = function (array $rowsPorServicio, array $sinAsientoPorServicio): array {
        $acumulado = [];
        foreach ($rowsPorServicio as $row) {
            $tipo = (string)($row['tipo_ingreso'] ?? 'otros');
            $acumulado[$tipo] = ($acumulado[$tipo] ?? 0) + (float)($row['total_servicio'] ?? 0);
        }

        foreach ($sinAsientoPorServicio as $tipo => $monto) {
            $monto = (float)$monto;
            if ($monto <= 0) {
                continue;
            }
            $acumulado[$tipo] = ($acumulado[$tipo] ?? 0) + $monto;
        }

        $rows = [];
        foreach ($acumulado as $tipo => $monto) {
            if (abs($monto) < 0.01) {
                continue;
            }
            $rows[] = [
                'tipo_ingreso' => $tipo,
                'total_servicio' => round($monto, 2),
            ];
        }

        usort($rows, function ($a, $b) {
            return strcmp((string)$a['tipo_ingreso'], (string)$b['tipo_ingreso']);
        });

        return $rows;
    };

    if ($caja_id_actual > 0) {
        $fechaCajaActual = isset($caja_row['fecha']) ? (string)$caja_row['fecha'] : $fecha;
        $turnoCajaActual = isset($caja_row['turno']) ? (string)$caja_row['turno'] : null;
        $resumenHonorarios = $calcularHonorariosCaja($caja_id_actual, $fechaCajaActual, $turnoCajaActual);
        $egreso_honorarios = (float)$resumenHonorarios['total_pagado'];
        $egreso_honorarios_caja = (float)$resumenHonorarios['total_pagado'];
        $egreso_honorarios_dia_operativo = (float)$resumenHonorarios['total_dia_operativo'];
        $egreso_honorarios_arrastre = (float)$resumenHonorarios['total_arrastre'];

        $conciliacionActual = $calcularConciliacionCaja((int)$usuario['id'], $fechaCajaActual, $caja_id_actual);
        $total_atenciones_dia = (float)($conciliacionActual['total_atenciones_dia'] ?? 0);
        $cobrado_turno = (float)($conciliacionActual['cobrado_turno'] ?? 0);
        $diferencia_conciliacion = (float)($conciliacionActual['diferencia_conciliacion'] ?? 0);
        $monto_sin_asiento_caja = (float)($conciliacionActual['monto_sin_asiento_caja'] ?? 0);
        $monto_cobros_inexistentes = (float)($conciliacionActual['monto_cobros_inexistentes'] ?? 0);

        $stmt = $pdo->prepare('SELECT COALESCE(SUM(monto), 0) FROM egresos WHERE caja_id = ? AND tipo_egreso NOT IN ("honorario_medico", "laboratorio")');
        $stmt->execute([$caja_id_actual]);
        $egreso_operativo = floatval($stmt->fetchColumn());

        $stmt = $pdo->prepare('SELECT COALESCE(SUM(monto), 0) FROM laboratorio_referencia_movimientos WHERE caja_id = ? AND estado = "pagado"');
        $stmt->execute([$caja_id_actual]);
        $egreso_lab_ref = floatval($stmt->fetchColumn());
        $stmt = $pdo->prepare('SELECT COALESCE(SUM(monto), 0) FROM ingresos_diarios WHERE caja_id = ?');
        $stmt->execute([$caja_id_actual]);
        $total = floatval($stmt->fetchColumn());

        $ingresos_por_servicio = $calcularIngresosPorServicioCaja($caja_id_actual);
        $sinAsientoServicioActual = $calcularSinAsientoPorServicio((int)$usuario['id'], $fecha, $caja_id_actual);
        $ingresos_por_servicio = $fusionarIngresosPorServicio($ingresos_por_servicio, $sinAsientoServicioActual);

        $stmt = $pdo->prepare('SELECT area, SUM(monto) as total_area FROM ingresos_diarios WHERE caja_id = ? GROUP BY area');
        $stmt->execute([$caja_id_actual]);
        $ingresos_por_area = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $stmt = $pdo->prepare('SELECT metodo_pago, SUM(monto) as total_pago FROM ingresos_diarios WHERE caja_id = ? GROUP BY metodo_pago');
        $stmt->execute([$caja_id_actual]);
        $ingresos_por_pago = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $stmt = $pdo->prepare('SELECT COALESCE(SUM(monto), 0) FROM ingresos_diarios WHERE caja_id = ? AND (tipo_ingreso = ? OR referencia_tabla = ?)');
        $stmt->execute([$caja_id_actual, 'contrato_abono', 'paciente_seguimiento_pagos']);
        $total_contratos_abono = floatval($stmt->fetchColumn());

        $stmtFuente = $pdo->query("SHOW COLUMNS FROM egresos LIKE 'fuente_fondos'");
        $usaFuenteFondos = $stmtFuente && $stmtFuente->fetch(PDO::FETCH_ASSOC);
        $sqlEgresoMetodo = $usaFuenteFondos
            ? "SELECT metodo_pago, COALESCE(fuente_fondos, 'clinica') AS fuente_fondos, COALESCE(SUM(monto), 0) AS total FROM egresos WHERE caja_id = ? GROUP BY metodo_pago, COALESCE(fuente_fondos, 'clinica')"
            : "SELECT metodo_pago, 'clinica' AS fuente_fondos, COALESCE(SUM(monto), 0) AS total FROM egresos WHERE caja_id = ? GROUP BY metodo_pago";
        $stmt = $pdo->prepare($sqlEgresoMetodo);
        $stmt->execute([$caja_id_actual]);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $egreso) {
            $metodo = strtolower(trim((string)($egreso['metodo_pago'] ?? 'efectivo')));
            $monto = (float)($egreso['total'] ?? 0);
            if (strtolower(trim((string)($egreso['fuente_fondos'] ?? 'clinica'))) !== 'clinica') {
                $egresos_externos += $monto;
            } elseif (array_key_exists($metodo, $egresos_por_metodo)) {
                $egresos_por_metodo[$metodo] += $monto;
            }
        }
    }

    $monto_apertura = ($caja_row && isset($caja_row['monto_apertura'])) ? $caja_row['monto_apertura'] : 0;
    $caja_abierta = $caja_row !== null;
    $totales_pago_metodo = ['efectivo' => 0.0, 'yape' => 0.0, 'plin' => 0.0, 'tarjeta' => 0.0, 'transferencia' => 0.0];
    foreach ($ingresos_por_pago as $pago) {
        $metodoPago = strtolower(trim((string)($pago['metodo_pago'] ?? '')));
        if (array_key_exists($metodoPago, $totales_pago_metodo)) {
            $totales_pago_metodo[$metodoPago] += (float)($pago['total_pago'] ?? 0);
        }
    }
    $virtual_cobrado = $totales_pago_metodo['yape'] + $totales_pago_metodo['plin'] + $totales_pago_metodo['tarjeta'] + $totales_pago_metodo['transferencia'];
    $egresos_virtuales_clinica = (float)$egresos_por_metodo['yape'] + (float)$egresos_por_metodo['plin'] + (float)$egresos_por_metodo['tarjeta'] + (float)$egresos_por_metodo['transferencia'];
    $virtual_esperado = $virtual_cobrado - $egresos_virtuales_clinica;
    // Asegurar que la hora de apertura esté en la zona horaria de Lima
    $hora_apertura = null;
    if ($caja_row && isset($caja_row['hora_apertura'])) {
        $fecha_hora = $fecha . ' ' . $caja_row['hora_apertura'];
        $dt = new DateTime($fecha_hora, new DateTimeZone('America/Lima'));
        $hora_apertura = $dt->format('g:i A');
    }

    $cajas_resumen = array();
    $columnaCajaExiste = function (string $columna) use ($pdo) {
        static $cacheColumnas = [];
        if (array_key_exists($columna, $cacheColumnas)) {
            return $cacheColumnas[$columna];
        }
        try {
            $stmtCol = $pdo->prepare("SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'cajas' AND column_name = ? LIMIT 1");
            $stmtCol->execute([$columna]);
            $exists = (bool)$stmtCol->fetchColumn();
            $cacheColumnas[$columna] = $exists;
            return $exists;
        } catch (Throwable $e) {
            $cacheColumnas[$columna] = false;
            return false;
        }
    };

    $hasVirtualContadoCol = $columnaCajaExiste('virtual_contado');
    $hasDiferenciaVirtualCol = $columnaCajaExiste('diferencia_virtual');
    $hasCierreAutomaticoCol = $columnaCajaExiste('cierre_automatico');
    $hasCierrePendienteCuadreCol = $columnaCajaExiste('cierre_pendiente_cuadre');
    $selectVirtualContadoExpr = $hasVirtualContadoCol ? 'c.virtual_contado AS virtual_contado' : 'NULL AS virtual_contado';
    $selectDiferenciaVirtualExpr = $hasDiferenciaVirtualCol ? 'c.diferencia_virtual AS diferencia_virtual' : 'NULL AS diferencia_virtual';
    $selectCierreAutomaticoExpr = $hasCierreAutomaticoCol ? 'c.cierre_automatico AS cierre_automatico' : '0 AS cierre_automatico';
    $selectCierrePendienteCuadreExpr = $hasCierrePendienteCuadreCol ? 'c.cierre_pendiente_cuadre AS cierre_pendiente_cuadre' : '0 AS cierre_pendiente_cuadre';
    $groupVirtualContadoExpr = $hasVirtualContadoCol ? ', c.virtual_contado' : '';
    $groupDiferenciaVirtualExpr = $hasDiferenciaVirtualCol ? ', c.diferencia_virtual' : '';
    $groupCierreAutomaticoExpr = $hasCierreAutomaticoCol ? ', c.cierre_automatico' : '';
    $groupCierrePendienteCuadreExpr = $hasCierrePendienteCuadreCol ? ', c.cierre_pendiente_cuadre' : '';

    $normalizarControlRealCaja = function (&$caja) {
        $estadoCaja = strtolower(trim((string)($caja['estado'] ?? '')));
        $montoContado = (isset($caja['monto_contado']) && $caja['monto_contado'] !== null && $caja['monto_contado'] !== '')
            ? (float)$caja['monto_contado']
            : null;
        $diferenciaCaja = (isset($caja['diferencia']) && $caja['diferencia'] !== null && $caja['diferencia'] !== '')
            ? (float)$caja['diferencia']
            : null;
        $virtualContadoCaja = (isset($caja['virtual_contado']) && $caja['virtual_contado'] !== null && $caja['virtual_contado'] !== '')
            ? (float)$caja['virtual_contado']
            : null;
        $diferenciaVirtualCaja = (isset($caja['diferencia_virtual']) && $caja['diferencia_virtual'] !== null && $caja['diferencia_virtual'] !== '')
            ? (float)$caja['diferencia_virtual']
            : null;
        $cierreAutomatico = (int)($caja['cierre_automatico'] ?? 0) === 1;
        $cierrePendienteCuadre = (int)($caja['cierre_pendiente_cuadre'] ?? 0) === 1;

        $caja['monto_apertura'] = isset($caja['monto_apertura']) ? (float)$caja['monto_apertura'] : 0.0;
        $caja['monto_cierre'] = isset($caja['monto_cierre']) ? (float)$caja['monto_cierre'] : 0.0;
        $caja['monto_contado'] = $montoContado;
        $caja['diferencia'] = $diferenciaCaja;
        $caja['total_efectivo'] = isset($caja['total_efectivo']) ? (float)$caja['total_efectivo'] : 0.0;
        $caja['total_yape'] = isset($caja['total_yape']) ? (float)$caja['total_yape'] : 0.0;
        $caja['total_plin'] = isset($caja['total_plin']) ? (float)$caja['total_plin'] : 0.0;
        $caja['total_tarjetas'] = isset($caja['total_tarjetas']) ? (float)$caja['total_tarjetas'] : 0.0;
        $caja['total_transferencias'] = isset($caja['total_transferencias']) ? (float)$caja['total_transferencias'] : 0.0;
        $caja['egreso_electronico'] = isset($caja['egreso_electronico']) ? (float)$caja['egreso_electronico'] : 0.0;

        $virtualCobradoCierre =
            $caja['total_yape'] +
            $caja['total_plin'] +
            $caja['total_tarjetas'] +
            $caja['total_transferencias'];

        $caja['cierre_automatico'] = $cierreAutomatico ? 1 : 0;
        $caja['cierre_pendiente_cuadre'] = $cierrePendienteCuadre ? 1 : 0;

        if ($estadoCaja === 'cerrada') {
            $caja['control_real_disponible'] = $cierrePendienteCuadre ? 0 : 1;
            $caja['efectivo_esperado_cierre'] = ($montoContado !== null && $diferenciaCaja !== null)
                ? ($montoContado - $diferenciaCaja)
                : null;
            $caja['virtual_cobrado_cierre'] = $virtualCobradoCierre;
            $caja['virtual_contado_cierre'] = $virtualContadoCaja;
            $caja['diferencia_virtual_cierre'] = $diferenciaVirtualCaja;
            $caja['cuadre_efectivo_ok'] = (!$cierrePendienteCuadre && $diferenciaCaja !== null && abs($diferenciaCaja) < 0.01) ? 1 : 0;
            $caja['cuadre_virtual_ok'] = (!$cierrePendienteCuadre && $diferenciaVirtualCaja !== null && abs($diferenciaVirtualCaja) < 0.01) ? 1 : 0;
            $caja['cierre_estado_control'] = $cierrePendienteCuadre
                ? 'pendiente_cuadre'
                : ($cierreAutomatico ? 'autocierre_regularizado' : 'manual_regularizado');
        } else {
            $caja['control_real_disponible'] = 0;
            $caja['efectivo_esperado_cierre'] = null;
            $caja['virtual_cobrado_cierre'] = $virtualCobradoCierre;
            $caja['virtual_contado_cierre'] = $virtualContadoCaja;
            $caja['diferencia_virtual_cierre'] = $diferenciaVirtualCaja;
            $caja['cuadre_efectivo_ok'] = 0;
            $caja['cuadre_virtual_ok'] = 0;
            $caja['cierre_estado_control'] = 'abierta';
        }
    };
    // Solo el administrador ve el resumen de todas las cajas, las recepcionistas solo ven su propia caja
        if ($usuario['rol'] === 'administrador') {
        $stmt = $pdo->prepare('SELECT c.id, c.fecha as fecha_operativa, c.usuario_id, u.nombre as usuario_nombre, u.rol as usuario_rol, c.turno, c.estado, c.monto_apertura, c.monto_cierre, c.monto_contado, c.diferencia, c.total_efectivo, c.total_yape, c.total_plin, c.total_tarjetas, c.total_transferencias, c.egreso_electronico, c.total_egresos, c.ganancia_dia, ' . $selectVirtualContadoExpr . ', ' . $selectDiferenciaVirtualExpr . ', ' . $selectCierreAutomaticoExpr . ', ' . $selectCierrePendienteCuadreExpr . ', SUM(i.monto) as total_caja FROM cajas c LEFT JOIN usuarios u ON c.usuario_id = u.id LEFT JOIN ingresos_diarios i ON i.caja_id = c.id WHERE c.fecha >= ? AND c.fecha < ? GROUP BY c.id, c.fecha, c.usuario_id, c.turno, c.estado, u.nombre, u.rol, c.monto_apertura, c.monto_cierre, c.monto_contado, c.diferencia, c.total_efectivo, c.total_yape, c.total_plin, c.total_tarjetas, c.total_transferencias, c.egreso_electronico, c.total_egresos, c.ganancia_dia' . $groupVirtualContadoExpr . $groupDiferenciaVirtualExpr . $groupCierreAutomaticoExpr . $groupCierrePendienteCuadreExpr . ' ORDER BY c.turno ASC, c.estado DESC');
        $stmt->execute([$inicioDia, $finDia]);
        $cajas_resumen = $stmt->fetchAll(PDO::FETCH_ASSOC);
        // Para cada caja, calcular egresos y ganancia propios
        foreach ($cajas_resumen as &$caja) {
            $totalCajaLegacy = isset($caja['total_caja']) ? (float)$caja['total_caja'] : 0.0;
            $totalCajaOperativo =
                (float)($caja['total_efectivo'] ?? 0)
                + (float)($caja['total_yape'] ?? 0)
                + (float)($caja['total_plin'] ?? 0)
                + (float)($caja['total_tarjetas'] ?? 0)
                + (float)($caja['total_transferencias'] ?? 0);
            $caja['total_caja'] = $totalCajaLegacy;
            $caja['total_caja_operativo'] = $totalCajaOperativo;

            // Egreso honorarios médicos por caja
            $resumenHonorariosCaja = $calcularHonorariosCaja((int)$caja['id'], (string)($caja['fecha_operativa'] ?? $fecha), (string)($caja['turno'] ?? ''));
            $caja['egreso_honorarios'] = (float)$resumenHonorariosCaja['total_pagado'];
            $caja['egreso_honorarios_caja'] = (float)$resumenHonorariosCaja['total_pagado'];
            $caja['egreso_honorarios_dia_operativo'] = (float)$resumenHonorariosCaja['total_dia_operativo'];
            $caja['egreso_honorarios_arrastre'] = (float)$resumenHonorariosCaja['total_arrastre'];
            // Egreso laboratorio de referencia por caja
            $stmtLabRef = $pdo->prepare('SELECT SUM(monto) as egreso_lab_ref FROM laboratorio_referencia_movimientos WHERE caja_id = ? AND estado = "pagado"');
            $stmtLabRef->execute([$caja['id']]);
            $egresoLabRef = $stmtLabRef->fetchColumn();
            $caja['egreso_lab_ref'] = $egresoLabRef ? floatval($egresoLabRef) : 0.0;
            // Egreso operativo por caja
            $stmtOperativo = $pdo->prepare('SELECT SUM(monto) as egreso_operativo FROM egresos WHERE caja_id = ? AND tipo_egreso NOT IN ("honorario_medico", "laboratorio")');
            $stmtOperativo->execute([$caja['id']]);
            $egresoOperativo = $stmtOperativo->fetchColumn();
            $caja['egreso_operativo'] = $egresoOperativo ? floatval($egresoOperativo) : 0.0;
            // Ganancia por caja
            $caja['ganancia_dia'] = $totalCajaOperativo - ($caja['egreso_honorarios'] + $caja['egreso_lab_ref'] + $caja['egreso_operativo']);

            $conciliacionCaja = $calcularConciliacionCaja((int)$caja['usuario_id'], (string)($caja['fecha_operativa'] ?? $fecha), (int)$caja['id']);
            $caja['total_atenciones_dia'] = (float)($conciliacionCaja['total_atenciones_dia'] ?? 0);
            $caja['cantidad_atenciones_dia'] = (int)($conciliacionCaja['cantidad_atenciones_dia'] ?? 0);
            $caja['cobrado_turno'] = (float)($conciliacionCaja['cobrado_turno'] ?? 0);
            $caja['diferencia_conciliacion'] = (float)($conciliacionCaja['diferencia_conciliacion'] ?? 0);
            $caja['monto_sin_asiento_caja'] = (float)($conciliacionCaja['monto_sin_asiento_caja'] ?? 0);
            $caja['monto_cobros_inexistentes'] = (float)($conciliacionCaja['monto_cobros_inexistentes'] ?? 0);
            // Ingresos por tipo de pago por caja
            $stmtPago = $pdo->prepare('SELECT metodo_pago, SUM(monto) as total_pago FROM ingresos_diarios WHERE caja_id = ? GROUP BY metodo_pago');
            $stmtPago->execute([$caja['id']]);
            $caja['por_pago'] = $stmtPago->fetchAll(PDO::FETCH_ASSOC);
            // Ingresos por tipo de servicio por caja
            $serviciosBase = $calcularIngresosPorServicioCaja((int)$caja['id']);
            $sinAsientoServicioCaja = $calcularSinAsientoPorServicio((int)$caja['usuario_id'], (string)($caja['fecha_operativa'] ?? $fecha), (int)$caja['id']);
            $caja['por_servicio'] = $fusionarIngresosPorServicio($serviciosBase, $sinAsientoServicioCaja);

            $normalizarControlRealCaja($caja);
        }
        unset($caja);
    } elseif ($usuario['rol'] === 'recepcionista') {
        // Solo mostrar la caja del usuario actual
        $stmt = $pdo->prepare('SELECT c.id, c.fecha as fecha_operativa, c.usuario_id, u.nombre as usuario_nombre, u.rol as usuario_rol, c.turno, c.estado, c.monto_apertura, c.monto_cierre, c.monto_contado, c.diferencia, c.total_efectivo, c.total_yape, c.total_plin, c.total_tarjetas, c.total_transferencias, c.egreso_electronico, c.total_egresos, c.ganancia_dia, ' . $selectVirtualContadoExpr . ', ' . $selectDiferenciaVirtualExpr . ', ' . $selectCierreAutomaticoExpr . ', ' . $selectCierrePendienteCuadreExpr . ', SUM(i.monto) as total_caja FROM cajas c LEFT JOIN usuarios u ON c.usuario_id = u.id LEFT JOIN ingresos_diarios i ON i.caja_id = c.id WHERE c.fecha >= ? AND c.fecha < ? AND c.usuario_id = ? GROUP BY c.id, c.fecha, c.usuario_id, c.turno, c.estado, u.nombre, u.rol, c.monto_apertura, c.monto_cierre, c.monto_contado, c.diferencia, c.total_efectivo, c.total_yape, c.total_plin, c.total_tarjetas, c.total_transferencias, c.egreso_electronico, c.total_egresos, c.ganancia_dia' . $groupVirtualContadoExpr . $groupDiferenciaVirtualExpr . $groupCierreAutomaticoExpr . $groupCierrePendienteCuadreExpr . ' ORDER BY c.turno ASC, c.estado DESC');
        $stmt->execute([$inicioDia, $finDia, $usuario['id']]);
        $cajas_resumen = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($cajas_resumen as &$caja) {
            $totalCajaLegacy = isset($caja['total_caja']) ? (float)$caja['total_caja'] : 0.0;
            $totalCajaOperativo =
                (float)($caja['total_efectivo'] ?? 0)
                + (float)($caja['total_yape'] ?? 0)
                + (float)($caja['total_plin'] ?? 0)
                + (float)($caja['total_tarjetas'] ?? 0)
                + (float)($caja['total_transferencias'] ?? 0);
            $caja['total_caja'] = $totalCajaLegacy;
            $caja['total_caja_operativo'] = $totalCajaOperativo;

            $resumenHonorariosCaja = $calcularHonorariosCaja((int)$caja['id'], (string)($caja['fecha_operativa'] ?? $fecha), (string)($caja['turno'] ?? ''));
            $caja['egreso_honorarios'] = (float)$resumenHonorariosCaja['total_pagado'];
            $caja['egreso_honorarios_caja'] = (float)$resumenHonorariosCaja['total_pagado'];
            $caja['egreso_honorarios_dia_operativo'] = (float)$resumenHonorariosCaja['total_dia_operativo'];
            $caja['egreso_honorarios_arrastre'] = (float)$resumenHonorariosCaja['total_arrastre'];
            $stmtLabRef = $pdo->prepare('SELECT SUM(monto) as egreso_lab_ref FROM laboratorio_referencia_movimientos WHERE caja_id = ? AND estado = "pagado"');
            $stmtLabRef->execute([$caja['id']]);
            $egresoLabRef = $stmtLabRef->fetchColumn();
            $caja['egreso_lab_ref'] = $egresoLabRef ? floatval($egresoLabRef) : 0.0;
            $stmtOperativo = $pdo->prepare('SELECT SUM(monto) as egreso_operativo FROM egresos WHERE caja_id = ? AND tipo_egreso NOT IN ("honorario_medico", "laboratorio")');
            $stmtOperativo->execute([$caja['id']]);
            $egresoOperativo = $stmtOperativo->fetchColumn();
            $caja['egreso_operativo'] = $egresoOperativo ? floatval($egresoOperativo) : 0.0;
            $caja['ganancia_dia'] = $totalCajaOperativo - ($caja['egreso_honorarios'] + $caja['egreso_lab_ref'] + $caja['egreso_operativo']);

            $conciliacionCaja = $calcularConciliacionCaja((int)$caja['usuario_id'], (string)($caja['fecha_operativa'] ?? $fecha), (int)$caja['id']);
            $caja['total_atenciones_dia'] = (float)($conciliacionCaja['total_atenciones_dia'] ?? 0);
            $caja['cantidad_atenciones_dia'] = (int)($conciliacionCaja['cantidad_atenciones_dia'] ?? 0);
            $caja['cobrado_turno'] = (float)($conciliacionCaja['cobrado_turno'] ?? 0);
            $caja['diferencia_conciliacion'] = (float)($conciliacionCaja['diferencia_conciliacion'] ?? 0);
            $caja['monto_sin_asiento_caja'] = (float)($conciliacionCaja['monto_sin_asiento_caja'] ?? 0);
            $caja['monto_cobros_inexistentes'] = (float)($conciliacionCaja['monto_cobros_inexistentes'] ?? 0);

            $stmtPago = $pdo->prepare('SELECT metodo_pago, SUM(monto) as total_pago FROM ingresos_diarios WHERE caja_id = ? GROUP BY metodo_pago');
            $stmtPago->execute([$caja['id']]);
            $caja['por_pago'] = $stmtPago->fetchAll(PDO::FETCH_ASSOC);

            $serviciosBase = $calcularIngresosPorServicioCaja((int)$caja['id']);
            $sinAsientoServicioCaja = $calcularSinAsientoPorServicio((int)$caja['usuario_id'], (string)($caja['fecha_operativa'] ?? $fecha), (int)$caja['id']);
            $caja['por_servicio'] = $fusionarIngresosPorServicio($serviciosBase, $sinAsientoServicioCaja);

            $normalizarControlRealCaja($caja);
        }
        unset($caja);
    }
  $ganancia_dia = floatval($total) - ($egreso_honorarios + $egreso_lab_ref + $egreso_operativo);

    echo json_encode(array(
        'success' => true,
        'fecha' => $fecha,
        'hora_apertura' => $hora_apertura,
        'total' => floatval($total),
        'monto_apertura' => floatval($monto_apertura),
        'por_servicio' => $ingresos_por_servicio,
        'por_area' => $ingresos_por_area,
        'por_pago' => $ingresos_por_pago,
        'egresos_por_metodo' => $egresos_por_metodo,
        'egresos_externos' => $egresos_externos,
        'virtual_cobrado' => $virtual_cobrado,
        'egresos_virtuales_clinica' => $egresos_virtuales_clinica,
        'virtual_esperado' => $virtual_esperado,
        'total_contratos_abono' => $total_contratos_abono,
        'egreso_honorarios' => $egreso_honorarios,
        'egreso_honorarios_caja' => $egreso_honorarios_caja,
        'egreso_honorarios_dia_operativo' => $egreso_honorarios_dia_operativo,
        'egreso_honorarios_arrastre' => $egreso_honorarios_arrastre,
        'total_atenciones_dia' => $total_atenciones_dia,
        'cobrado_turno' => $cobrado_turno,
        'diferencia_conciliacion' => $diferencia_conciliacion,
        'monto_sin_asiento_caja' => $monto_sin_asiento_caja,
        'monto_cobros_inexistentes' => $monto_cobros_inexistentes,
        'egreso_lab_ref' => $egreso_lab_ref,
        'egreso_operativo' => $egreso_operativo,
        'ganancia_dia' => $ganancia_dia,
        'cajas_resumen' => $cajas_resumen,
        'caja_abierta' => $caja_abierta
    ));
} catch (Throwable $e) {
    if (function_exists('api_log_server_error')) {
        api_log_server_error('api-resumen-diario', $e->getMessage(), $e->getFile(), (int)$e->getLine());
    } else {
        error_log('Error en api_resumen_diario.php: ' . $e->getMessage());
    }

    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Error interno del servidor',
        'request_id' => function_exists('api_request_id') ? api_request_id() : null,
    ]);
    exit();
}