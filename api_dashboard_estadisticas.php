
<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

if (!isset($_SESSION['usuario']) || !in_array($_SESSION['usuario']['rol'], ['administrador', 'recepcionista'])) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'No autorizado']);
    exit;
}

try {
    $tipoContratoAbono = 'contrato_abono';
    $refContratoAbono = 'paciente_seguimiento_pagos';

    // Rango de fechas para el mes actual
    $inicioMes = date('Y-m-01');
    $inicioMesSiguiente = date('Y-m-01', strtotime('+1 month'));
    $hoy = date('Y-m-d');
    $inicioTrimestre = date('Y-m-01', strtotime('-2 month'));
    $inicioAnio = date('Y-01-01');

    // Resumen diario, mensual, trimestral y anual en tiempo real usando cobros pagados.
    $sqlResumen = "SELECT 
        SUM(CASE WHEN DATE(fecha_cobro) = ? THEN total ELSE 0 END) AS gananciaDia,
        SUM(CASE WHEN fecha_cobro >= ? AND fecha_cobro < ? THEN total ELSE 0 END) AS gananciaMes,
        SUM(CASE WHEN fecha_cobro >= ? AND fecha_cobro < ? THEN total ELSE 0 END) AS gananciaTrimestre,
        SUM(CASE WHEN fecha_cobro >= ? AND fecha_cobro < ? THEN total ELSE 0 END) AS gananciaAnio
    FROM cobros
    WHERE estado = 'pagado';";
    $stmtResumen = $pdo->prepare($sqlResumen);
    $stmtResumen->execute([
        $hoy,
        $inicioMes, $inicioMesSiguiente,
        $inicioTrimestre, $inicioMesSiguiente,
        $inicioAnio, $inicioMesSiguiente
    ]);
    $res = $stmtResumen->fetch(PDO::FETCH_ASSOC);

    $sqlResumenContratos = "SELECT 
        SUM(CASE WHEN DATE(fecha_hora) = ? THEN monto ELSE 0 END) AS gananciaDiaContrato,
        SUM(CASE WHEN fecha_hora >= ? AND fecha_hora < ? THEN monto ELSE 0 END) AS gananciaMesContrato,
        SUM(CASE WHEN fecha_hora >= ? AND fecha_hora < ? THEN monto ELSE 0 END) AS gananciaTrimestreContrato,
        SUM(CASE WHEN fecha_hora >= ? AND fecha_hora < ? THEN monto ELSE 0 END) AS gananciaAnioContrato
    FROM ingresos_diarios
    WHERE tipo_ingreso = ? OR referencia_tabla = ?";
    $stmtResumenContratos = $pdo->prepare($sqlResumenContratos);
    $stmtResumenContratos->execute([
        $hoy,
        $inicioMes, $inicioMesSiguiente,
        $inicioTrimestre, $inicioMesSiguiente,
        $inicioAnio, $inicioMesSiguiente,
        $tipoContratoAbono,
        $refContratoAbono,
    ]);
    $resContratos = $stmtResumenContratos->fetch(PDO::FETCH_ASSOC) ?: [];

    $res['gananciaDia'] = floatval($res['gananciaDia'] ?? 0) + floatval($resContratos['gananciaDiaContrato'] ?? 0);
    $res['gananciaMes'] = floatval($res['gananciaMes'] ?? 0) + floatval($resContratos['gananciaMesContrato'] ?? 0);
    $res['gananciaTrimestre'] = floatval($res['gananciaTrimestre'] ?? 0) + floatval($resContratos['gananciaTrimestreContrato'] ?? 0);
    $res['gananciaAnio'] = floatval($res['gananciaAnio'] ?? 0) + floatval($resContratos['gananciaAnioContrato'] ?? 0);

    // Calcular crecimiento mensual (%) comparando con el mes anterior (tiempo real)
    $inicioMesPrev = date('Y-m-01', strtotime('-1 month'));
    $inicioMesActual = $inicioMes;
    $sqlPrevMonth = "SELECT SUM(total) AS gananciaMesPrev
        FROM cobros
        WHERE estado = 'pagado' AND fecha_cobro >= :inicioMesPrev AND fecha_cobro < :inicioMesActual";
    $stmtPrevMonth = $pdo->prepare($sqlPrevMonth);
    $stmtPrevMonth->execute([
        ':inicioMesPrev' => $inicioMesPrev,
        ':inicioMesActual' => $inicioMesActual
    ]);
    $resPrev = $stmtPrevMonth->fetch(PDO::FETCH_ASSOC);

    $sqlPrevMonthContratos = "SELECT SUM(monto) AS gananciaMesPrevContrato
        FROM ingresos_diarios
        WHERE fecha_hora >= :inicioMesPrev AND fecha_hora < :inicioMesActual
          AND (tipo_ingreso = :tipoContratoAbono OR referencia_tabla = :refContratoAbono)";
    $stmtPrevMonthContratos = $pdo->prepare($sqlPrevMonthContratos);
    $stmtPrevMonthContratos->execute([
        ':inicioMesPrev' => $inicioMesPrev,
        ':inicioMesActual' => $inicioMesActual,
        ':tipoContratoAbono' => $tipoContratoAbono,
        ':refContratoAbono' => $refContratoAbono,
    ]);
    $resPrevContratos = $stmtPrevMonthContratos->fetch(PDO::FETCH_ASSOC);
    $gananciaMes = floatval($res['gananciaMes'] ?? 0);
    $gananciaPrev = floatval($resPrev['gananciaMesPrev'] ?? 0) + floatval($resPrevContratos['gananciaMesPrevContrato'] ?? 0);
    if ($gananciaPrev > 0) {
        $crecimiento = (($gananciaMes - $gananciaPrev) / $gananciaPrev) * 100;
    } else {
        $crecimiento = null;
    }

    // Pacientes atendidos en el mes actual usando rangos
    $pacientesMes = 0;
    try {
        $stmtPacientesMes = $pdo->prepare("SELECT COUNT(DISTINCT paciente_id) as total FROM atenciones WHERE fecha >= :inicioMes AND fecha < :inicioMesSiguiente");
        $stmtPacientesMes->execute([
            ':inicioMes' => $inicioMes,
            ':inicioMesSiguiente' => $inicioMesSiguiente
        ]);
        $rowPacientesMes = $stmtPacientesMes->fetch();
        $pacientesMes = $rowPacientesMes ? intval($rowPacientesMes['total']) : 0;
    } catch (PDOException $e) {
        // Si no existe la tabla atenciones, intentar con consultas
        try {
            $stmtPacientesMes = $pdo->prepare("SELECT COUNT(DISTINCT paciente_id) as total FROM consultas WHERE fecha >= :inicioMes AND fecha < :inicioMesSiguiente");
            $stmtPacientesMes->execute([
                ':inicioMes' => $inicioMes,
                ':inicioMesSiguiente' => $inicioMesSiguiente
            ]);
            $rowPacientesMes = $stmtPacientesMes->fetch();
            $pacientesMes = $rowPacientesMes ? intval($rowPacientesMes['total']) : 0;
        } catch (PDOException $e2) {
            $pacientesMes = 0;
        }
    }

                // Ganancia por usuario por día (solo recepcionista y administrador) en tiempo real.
                $sqlGananciaUsuarios = "SELECT 
                        DATE(c.fecha_cobro) as fecha,
                        u.id as usuario_id,
                        u.nombre as usuario_nombre,
                        u.rol,
                        SUM(c.total) as ganancia
                FROM cobros c
                LEFT JOIN usuarios u ON c.usuario_id = u.id
                WHERE c.estado = 'pagado'
                    AND u.rol IN ('administrador','recepcionista')
                    AND c.fecha_cobro >= :inicioMes AND c.fecha_cobro < :inicioMesSiguiente
                GROUP BY DATE(c.fecha_cobro), u.id, u.nombre, u.rol
                ORDER BY fecha DESC, ganancia DESC";
                $stmtGananciaUsuarios = $pdo->prepare($sqlGananciaUsuarios);
                $stmtGananciaUsuarios->execute([
                        ':inicioMes' => $inicioMes,
                        ':inicioMesSiguiente' => $inicioMesSiguiente,
                ]);
                $gananciaUsuarios = $stmtGananciaUsuarios->fetchAll(PDO::FETCH_ASSOC);

                $sqlGananciaUsuariosContratos = "SELECT 
                        DATE(i.fecha_hora) as fecha,
                        u.id as usuario_id,
                        u.nombre as usuario_nombre,
                        u.rol,
                        SUM(i.monto) as ganancia
                FROM ingresos_diarios i
                LEFT JOIN usuarios u ON i.usuario_id = u.id
                WHERE (i.tipo_ingreso = :tipoContratoAbono OR i.referencia_tabla = :refContratoAbono)
                    AND u.rol IN ('administrador','recepcionista')
                    AND i.fecha_hora >= :inicioMes AND i.fecha_hora < :inicioMesSiguiente
                GROUP BY DATE(i.fecha_hora), u.id, u.nombre, u.rol";
                $stmtGananciaUsuariosContratos = $pdo->prepare($sqlGananciaUsuariosContratos);
                $stmtGananciaUsuariosContratos->execute([
                        ':tipoContratoAbono' => $tipoContratoAbono,
                        ':refContratoAbono' => $refContratoAbono,
                        ':inicioMes' => $inicioMes,
                        ':inicioMesSiguiente' => $inicioMesSiguiente,
                ]);
                $gananciaUsuariosContratos = $stmtGananciaUsuariosContratos->fetchAll(PDO::FETCH_ASSOC);

                $gananciaUsuariosMap = [];
                foreach ($gananciaUsuarios as $row) {
                    $key = ($row['fecha'] ?? '') . '|' . ($row['usuario_id'] ?? 0);
                    $gananciaUsuariosMap[$key] = [
                        'fecha' => $row['fecha'] ?? null,
                        'usuario_id' => intval($row['usuario_id'] ?? 0),
                        'usuario_nombre' => $row['usuario_nombre'] ?? 'Sin usuario',
                        'rol' => $row['rol'] ?? '',
                        'ganancia' => floatval($row['ganancia'] ?? 0),
                    ];
                }
                foreach ($gananciaUsuariosContratos as $row) {
                    $key = ($row['fecha'] ?? '') . '|' . ($row['usuario_id'] ?? 0);
                    if (!isset($gananciaUsuariosMap[$key])) {
                        $gananciaUsuariosMap[$key] = [
                            'fecha' => $row['fecha'] ?? null,
                            'usuario_id' => intval($row['usuario_id'] ?? 0),
                            'usuario_nombre' => $row['usuario_nombre'] ?? 'Sin usuario',
                            'rol' => $row['rol'] ?? '',
                            'ganancia' => 0.0,
                        ];
                    }
                    $gananciaUsuariosMap[$key]['ganancia'] += floatval($row['ganancia'] ?? 0);
                }
                $gananciaUsuarios = array_values($gananciaUsuariosMap);
                usort($gananciaUsuarios, function($a, $b) {
                    if (($a['fecha'] ?? '') === ($b['fecha'] ?? '')) {
                        return floatval($b['ganancia'] ?? 0) <=> floatval($a['ganancia'] ?? 0);
                    }
                    return strcmp((string)($b['fecha'] ?? ''), (string)($a['fecha'] ?? ''));
                });

        // Ranking de usuarios (admin y recepcionistas) en tiempo real.
        $sqlRanking = "SELECT u.nombre, u.rol, SUM(c.total) AS ingresos
                FROM cobros c
                LEFT JOIN usuarios u ON c.usuario_id = u.id
                WHERE c.estado = 'pagado' AND u.rol IN ('administrador','recepcionista')
                    AND c.fecha_cobro >= :inicioMes AND c.fecha_cobro < :inicioMesSiguiente
                GROUP BY c.usuario_id, u.nombre, u.rol
        ORDER BY ingresos DESC";
    $stmtRanking = $pdo->prepare($sqlRanking);
    $stmtRanking->execute([
        ':inicioMes' => $inicioMes,
        ':inicioMesSiguiente' => $inicioMesSiguiente,
    ]);
    $ranking = $stmtRanking->fetchAll(PDO::FETCH_ASSOC);

    $sqlRankingContratos = "SELECT u.nombre, u.rol, SUM(i.monto) AS ingresos
            FROM ingresos_diarios i
            LEFT JOIN usuarios u ON i.usuario_id = u.id
            WHERE (i.tipo_ingreso = :tipoContratoAbono OR i.referencia_tabla = :refContratoAbono)
              AND u.rol IN ('administrador','recepcionista')
              AND i.fecha_hora >= :inicioMes AND i.fecha_hora < :inicioMesSiguiente
            GROUP BY i.usuario_id, u.nombre, u.rol";
    $stmtRankingContratos = $pdo->prepare($sqlRankingContratos);
    $stmtRankingContratos->execute([
        ':tipoContratoAbono' => $tipoContratoAbono,
        ':refContratoAbono' => $refContratoAbono,
        ':inicioMes' => $inicioMes,
        ':inicioMesSiguiente' => $inicioMesSiguiente,
    ]);
    $rankingContratos = $stmtRankingContratos->fetchAll(PDO::FETCH_ASSOC);

    $rankingMap = [];
    foreach ($ranking as $row) {
        $key = mb_strtolower(trim((string)($row['nombre'] ?? 'sin usuario')), 'UTF-8');
        $rankingMap[$key] = [
            'nombre' => $row['nombre'] ?? 'Sin usuario',
            'rol' => $row['rol'] ?? '',
            'ingresos' => floatval($row['ingresos'] ?? 0),
        ];
    }
    foreach ($rankingContratos as $row) {
        $key = mb_strtolower(trim((string)($row['nombre'] ?? 'sin usuario')), 'UTF-8');
        if (!isset($rankingMap[$key])) {
            $rankingMap[$key] = [
                'nombre' => $row['nombre'] ?? 'Sin usuario',
                'rol' => $row['rol'] ?? '',
                'ingresos' => 0.0,
            ];
        }
        $rankingMap[$key]['ingresos'] += floatval($row['ingresos'] ?? 0);
    }
    $ranking = array_values($rankingMap);
    usort($ranking, function($a, $b) {
        return floatval($b['ingresos'] ?? 0) <=> floatval($a['ingresos'] ?? 0);
    });

    // Servicios más vendidos usando monto neto cobrado.
    // Si hubo descuento a nivel cobro, se prorratea proporcionalmente a cada detalle.
    $sqlServicios = "SELECT 
        c.id AS cobro_id,
        c.total AS cobro_total,
        cd.servicio_tipo,
        cd.servicio_id,
        cd.descripcion,
        cd.cantidad,
        cd.subtotal
    FROM cobros_detalle cd
    INNER JOIN cobros c ON cd.cobro_id = c.id
    WHERE c.fecha_cobro >= :inicioMes AND c.fecha_cobro < :inicioMesSiguiente AND c.estado = 'pagado'";
    $stmtServicios = $pdo->prepare($sqlServicios);
    $stmtServicios->execute([
        ':inicioMes' => $inicioMes,
        ':inicioMesSiguiente' => $inicioMesSiguiente,
    ]);
    $serviciosRaw = $stmtServicios->fetchAll(PDO::FETCH_ASSOC);

    $sumaBrutaPorCobro = [];
    foreach ($serviciosRaw as $row) {
        $cobroId = intval($row['cobro_id'] ?? 0);
        if ($cobroId <= 0) continue;
        $subtotalBruto = floatval($row['subtotal'] ?? 0);
        if (!isset($sumaBrutaPorCobro[$cobroId])) {
            $sumaBrutaPorCobro[$cobroId] = 0.0;
        }
        $sumaBrutaPorCobro[$cobroId] += $subtotalBruto;
    }

    // Consolidar descripciones equivalentes después del parseo de JSON.
    $serviciosAgrupados = [];
    foreach ($serviciosRaw as $s) {
        $cobroId = intval($s['cobro_id'] ?? 0);
        $subtotalBruto = floatval($s['subtotal'] ?? 0);
        $cobroTotalNeto = floatval($s['cobro_total'] ?? 0);
        $sumaBrutaCobro = floatval($sumaBrutaPorCobro[$cobroId] ?? 0);

        $subtotalNeto = $subtotalBruto;
        if ($sumaBrutaCobro > 0) {
            $factorProrrateo = $cobroTotalNeto / $sumaBrutaCobro;
            $subtotalNeto = $subtotalBruto * $factorProrrateo;
        }

        $desc = json_decode($s['descripcion'], true);
        if (is_array($desc) && isset($desc[0]['descripcion'])) {
            $nombre_servicio = $desc[0]['descripcion'];
        } else if (is_array($desc) && isset($desc['descripcion'])) {
            $nombre_servicio = $desc['descripcion'];
        } else {
            $nombre_servicio = null;
        }
        $key = $s['servicio_tipo'] . '|' . $nombre_servicio;
        if (!isset($serviciosAgrupados[$key])) {
            $serviciosAgrupados[$key] = [
                'tipo_servicio' => $s['servicio_tipo'],
                'servicio_id' => $s['servicio_id'],
                'nombre_servicio' => $nombre_servicio,
                'cantidad_total' => 0,
                'monto_total' => 0
            ];
        }
        $serviciosAgrupados[$key]['cantidad_total'] += floatval($s['cantidad'] ?? 0);
        $serviciosAgrupados[$key]['monto_total'] += $subtotalNeto;
    }
    // Convertir a array y ordenar por monto_total DESC, cantidad_total DESC
    $servicios = array_values($serviciosAgrupados);

    $sqlServiciosContratos = "SELECT 
        COUNT(*) AS cantidad_total,
        COALESCE(SUM(monto), 0) AS monto_total
    FROM ingresos_diarios
    WHERE fecha_hora >= :inicioMes AND fecha_hora < :inicioMesSiguiente
      AND (tipo_ingreso = :tipoContratoAbono OR referencia_tabla = :refContratoAbono)";
    $stmtServiciosContratos = $pdo->prepare($sqlServiciosContratos);
    $stmtServiciosContratos->execute([
        ':inicioMes' => $inicioMes,
        ':inicioMesSiguiente' => $inicioMesSiguiente,
        ':tipoContratoAbono' => $tipoContratoAbono,
        ':refContratoAbono' => $refContratoAbono,
    ]);
    $serviciosContratos = $stmtServiciosContratos->fetch(PDO::FETCH_ASSOC);
    if (floatval($serviciosContratos['monto_total'] ?? 0) > 0) {
        $servicios[] = [
            'tipo_servicio' => $tipoContratoAbono,
            'servicio_id' => 0,
            'nombre_servicio' => 'ABONOS DE CONTRATO',
            'cantidad_total' => intval($serviciosContratos['cantidad_total'] ?? 0),
            'monto_total' => floatval($serviciosContratos['monto_total'] ?? 0),
        ];
    }
    usort($servicios, function($a, $b) {
        if ($a['monto_total'] == $b['monto_total']) {
            return $b['cantidad_total'] <=> $a['cantidad_total'];
        }
        return $b['monto_total'] <=> $a['monto_total'];
    });

    // Tendencias de ingresos (por día del mes):
    // - tiempoReal: cobros pagados (operativo)
    // - consolidado: cajas cerradas (contable)
    $sqlTendenciasTiempoReal = "SELECT DATE(fecha_cobro) as fecha, SUM(total) as total
        FROM cobros
        WHERE estado = 'pagado' AND fecha_cobro >= :inicioMes AND fecha_cobro < :inicioMesSiguiente
        GROUP BY DATE(fecha_cobro)
        ORDER BY fecha ASC";
    $stmtTendenciasTiempoReal = $pdo->prepare($sqlTendenciasTiempoReal);
    $stmtTendenciasTiempoReal->execute([
        ':inicioMes' => $inicioMes,
        ':inicioMesSiguiente' => $inicioMesSiguiente,
    ]);
    $tendenciasTiempoReal = $stmtTendenciasTiempoReal->fetchAll(PDO::FETCH_ASSOC);

    $sqlTendenciasContrato = "SELECT DATE(fecha_hora) as fecha, SUM(monto) as total
        FROM ingresos_diarios
        WHERE fecha_hora >= :inicioMes AND fecha_hora < :inicioMesSiguiente
          AND (tipo_ingreso = :tipoContratoAbono OR referencia_tabla = :refContratoAbono)
        GROUP BY DATE(fecha_hora)
        ORDER BY fecha ASC";
    $stmtTendenciasContrato = $pdo->prepare($sqlTendenciasContrato);
    $stmtTendenciasContrato->execute([
        ':inicioMes' => $inicioMes,
        ':inicioMesSiguiente' => $inicioMesSiguiente,
        ':tipoContratoAbono' => $tipoContratoAbono,
        ':refContratoAbono' => $refContratoAbono,
    ]);
    $tendenciasContrato = $stmtTendenciasContrato->fetchAll(PDO::FETCH_ASSOC);

    $sqlTendenciasConsolidado = "SELECT DATE(fecha) as fecha, SUM(ganancia_dia) as total
        FROM cajas
        WHERE estado = 'cerrada' AND fecha >= :inicioMes AND fecha < :inicioMesSiguiente
        GROUP BY DATE(fecha)
        ORDER BY fecha ASC";
    $stmtTendenciasConsolidado = $pdo->prepare($sqlTendenciasConsolidado);
    $stmtTendenciasConsolidado->execute([
        ':inicioMes' => $inicioMes,
        ':inicioMesSiguiente' => $inicioMesSiguiente,
    ]);
    $tendenciasConsolidado = $stmtTendenciasConsolidado->fetchAll(PDO::FETCH_ASSOC);

    $tendenciasMap = [];

    foreach ($tendenciasTiempoReal as $row) {
        $fecha = $row['fecha'] ?? null;
        if (!$fecha) continue;
        if (!isset($tendenciasMap[$fecha])) {
            $tendenciasMap[$fecha] = [
                'fecha' => $fecha,
                'tiempoReal' => 0.0,
                'consolidado' => 0.0,
                // Compatibilidad con frontend anterior
                'total' => 0.0,
            ];
        }
        $tendenciasMap[$fecha]['tiempoReal'] = floatval($row['total'] ?? 0);
        $tendenciasMap[$fecha]['total'] = $tendenciasMap[$fecha]['tiempoReal'];
    }

    foreach ($tendenciasContrato as $row) {
        $fecha = $row['fecha'] ?? null;
        if (!$fecha) continue;
        if (!isset($tendenciasMap[$fecha])) {
            $tendenciasMap[$fecha] = [
                'fecha' => $fecha,
                'tiempoReal' => 0.0,
                'consolidado' => 0.0,
                'total' => 0.0,
            ];
        }
        $tendenciasMap[$fecha]['tiempoReal'] += floatval($row['total'] ?? 0);
        $tendenciasMap[$fecha]['total'] = $tendenciasMap[$fecha]['tiempoReal'];
    }

    foreach ($tendenciasConsolidado as $row) {
        $fecha = $row['fecha'] ?? null;
        if (!$fecha) continue;
        if (!isset($tendenciasMap[$fecha])) {
            $tendenciasMap[$fecha] = [
                'fecha' => $fecha,
                'tiempoReal' => 0.0,
                'consolidado' => 0.0,
                'total' => 0.0,
            ];
        }
        $tendenciasMap[$fecha]['consolidado'] = floatval($row['total'] ?? 0);
    }

    ksort($tendenciasMap);
    $tendencias = array_values($tendenciasMap);

    echo json_encode([
        'success' => true,
        'resumen' => [
            'gananciaDia' => floatval($res['gananciaDia'] ?? 0),
            'gananciaMes' => floatval($res['gananciaMes'] ?? 0),
            'gananciaTrimestre' => floatval($res['gananciaTrimestre'] ?? 0),
            'gananciaAnio' => floatval($res['gananciaAnio'] ?? 0),
            'pacientes' => $pacientesMes,
            'gananciaUsuarios' => $gananciaUsuarios,
            'crecimiento' => is_null($crecimiento) ? null : round($crecimiento, 2)
        ],
        'ranking' => $ranking,
        'servicios' => $servicios,
        'tendencias' => $tendencias
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
