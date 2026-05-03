
<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

if (!isset($_SESSION['usuario']) || !in_array($_SESSION['usuario']['rol'], ['administrador', 'recepcionista'])) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'No autorizado']);
    exit;
}

if (!function_exists('dashboard_table_exists')) {
    function dashboard_table_exists(PDO $pdo, string $table): bool {
        $stmt = $pdo->prepare("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = :table LIMIT 1");
        $stmt->execute([':table' => $table]);
        return (bool)$stmt->fetchColumn();
    }
}

try {
    $tipoContratoAbono = 'contrato_abono';
    $refContratoAbono = 'paciente_seguimiento_pagos';

    // Soporte de período seleccionado via GET (mes=1..12, anio=YYYY)
    $ahora = new DateTime('now', new DateTimeZone('America/Lima'));
    $mesParam  = isset($_GET['mes'])  ? intval($_GET['mes'])  : intval($ahora->format('n'));
    $anioParam = isset($_GET['anio']) ? intval($_GET['anio']) : intval($ahora->format('Y'));
    $mesParam  = max(1, min(12, $mesParam));
    $anioParam = max(2020, min(2100, $anioParam));

    $inicioMes        = sprintf('%04d-%02d-01', $anioParam, $mesParam);
    $inicioMesSiguiente = date('Y-m-d', strtotime($inicioMes . ' +1 month'));
    $hoy              = $ahora->format('Y-m-d');
    $inicioTrimestre  = date('Y-m-d', strtotime($inicioMes . ' -2 month'));
    $inicioAnio       = sprintf('%04d-01-01', $anioParam);

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

    // Servicios más vendidos a nivel item real.
    // Consolida analítica de cobro (produccion_medica_detalle) + analítica contractual
    // (produccion_contrato_detalle pendiente/liquidado) sin tocar la caja real.
    $hasProduccionMedicaDetalle = dashboard_table_exists($pdo, 'produccion_medica_detalle');
    $hasProduccionContratoDetalle = dashboard_table_exists($pdo, 'produccion_contrato_detalle');
    if ($hasProduccionMedicaDetalle || $hasProduccionContratoDetalle) {
        $fuentesServicios = [];
        $paramsServicios = [];

        if ($hasProduccionMedicaDetalle) {
            $fuentesServicios[] = "SELECT
                pmd.servicio_tipo AS tipo_servicio,
                pmd.servicio_id,
                COALESCE(NULLIF(TRIM(pmd.servicio_nombre), ''), 'Servicio') AS nombre_servicio,
                pmd.medico_id,
                pmd.clasificacion_origen,
                pmd.origen_operacion,
                pmd.cotizacion_id,
                COALESCE(SUM(pmd.cantidad), 0) AS cantidad_total,
                COALESCE(SUM(pmd.monto_neto_item), 0) AS monto_total
            FROM produccion_medica_detalle pmd
            WHERE pmd.fecha_cobro >= ? AND pmd.fecha_cobro < ?
            GROUP BY pmd.servicio_tipo, pmd.servicio_id, nombre_servicio, pmd.medico_id, pmd.clasificacion_origen, pmd.origen_operacion, pmd.cotizacion_id";
            $paramsServicios[] = $inicioMes;
            $paramsServicios[] = $inicioMesSiguiente;
        }

        if ($hasProduccionContratoDetalle) {
            $fuentesServicios[] = "SELECT
                pcd.servicio_tipo AS tipo_servicio,
                pcd.servicio_id,
                COALESCE(NULLIF(TRIM(pcd.servicio_nombre), ''), 'Servicio contrato') AS nombre_servicio,
                COALESCE(NULLIF(co.medico_id, 0), NULLIF(cps.medico_origen_id, 0), pcd.medico_id) AS medico_id,
                CASE
                    WHEN pcd.estado_financiero = 'liquidado' THEN 'contrato_liquidado'
                    ELSE 'contrato_pendiente'
                END AS clasificacion_origen,
                'contrato' AS origen_operacion,
                NULL AS cotizacion_id,
                COALESCE(SUM(pcd.cantidad), 0) AS cantidad_total,
                COALESCE(SUM(CASE WHEN pcd.estado_financiero = 'liquidado' THEN pcd.monto_reconocido ELSE 0 END), 0) AS monto_total
            FROM produccion_contrato_detalle pcd
            LEFT JOIN contratos_paciente_servicios cps ON cps.id = pcd.contrato_paciente_servicio_id
            LEFT JOIN consultas co ON co.id = pcd.consulta_origen_id
            WHERE pcd.fecha_atencion >= ? AND pcd.fecha_atencion < ?
              AND pcd.modo_cobertura = 'contrato'
              AND pcd.estado_financiero IN ('pendiente_liquidar', 'liquidado')
            GROUP BY pcd.servicio_tipo, pcd.servicio_id, nombre_servicio, COALESCE(NULLIF(co.medico_id, 0), NULLIF(cps.medico_origen_id, 0), pcd.medico_id), pcd.estado_financiero";
            $paramsServicios[] = $inicioMes;
            $paramsServicios[] = $inicioMesSiguiente;
        }

        $sqlServicios = "SELECT
            base.tipo_servicio,
            base.servicio_id,
            base.nombre_servicio,
            base.medico_id,
            base.clasificacion_origen,
            base.medico_solicitante,
            COALESCE(SUM(base.cantidad_total), 0) AS cantidad_total,
            COALESCE(SUM(base.monto_total), 0) AS monto_total
        FROM (
            SELECT
                src.tipo_servicio,
                src.servicio_id,
                src.nombre_servicio,
                COALESCE(src.medico_id, ctx.medico_id) AS medico_id,
                CASE
                    WHEN src.clasificacion_origen = 'venta_directa'
                         AND src.origen_operacion = 'cotizacion'
                         AND COALESCE(src.medico_id, ctx.medico_id) IS NOT NULL
                    THEN 'produccion_medica'
                    ELSE src.clasificacion_origen
                END AS clasificacion_origen,
                CASE
                    WHEN (
                        src.clasificacion_origen = 'produccion_medica'
                        OR (src.clasificacion_origen = 'venta_directa'
                            AND src.origen_operacion = 'cotizacion'
                            AND COALESCE(src.medico_id, ctx.medico_id) IS NOT NULL)
                    ) THEN COALESCE(
                        NULLIF(TRIM(CONCAT(COALESCE(m.nombre, ''), ' ', COALESCE(m.apellido, ''))), ''),
                        CONCAT('Médico #', COALESCE(src.medico_id, ctx.medico_id))
                    )
                    WHEN src.clasificacion_origen = 'contrato_pendiente' THEN COALESCE(
                        NULLIF(TRIM(CONCAT(COALESCE(m.nombre, ''), ' ', COALESCE(m.apellido, ''))), ''),
                        'Contrato pendiente'
                    )
                    WHEN src.clasificacion_origen = 'contrato_liquidado' THEN COALESCE(
                        NULLIF(TRIM(CONCAT(COALESCE(m.nombre, ''), ' ', COALESCE(m.apellido, ''))), ''),
                        'Contrato liquidado'
                    )
                    ELSE 'Venta directa'
                END AS medico_solicitante,
                src.cantidad_total,
                src.monto_total
            FROM (" . implode(" UNION ALL ", $fuentesServicios) . ") src
            LEFT JOIN (
                SELECT
                    cd.cotizacion_id,
                    MAX(COALESCE(NULLIF(cd.medico_id, 0), NULLIF(con.medico_id, 0))) AS medico_id
                FROM cotizaciones_detalle cd
                LEFT JOIN consultas con ON con.id = cd.consulta_id
                GROUP BY cd.cotizacion_id
            ) ctx ON ctx.cotizacion_id = src.cotizacion_id
            LEFT JOIN medicos m ON m.id = COALESCE(src.medico_id, ctx.medico_id)
        ) base
        GROUP BY base.tipo_servicio, base.servicio_id, base.nombre_servicio, base.medico_id, base.clasificacion_origen, base.medico_solicitante";
        $stmtServicios = $pdo->prepare($sqlServicios);
        $stmtServicios->execute($paramsServicios);
        $servicios = $stmtServicios->fetchAll(PDO::FETCH_ASSOC);
    } else {
        // Fallback legacy para entornos sin tabla analítica.
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
                    'medico_id' => null,
                    'medico_solicitante' => 'Sin trazabilidad',
                    'clasificacion_origen' => 'legacy',
                    'cantidad_total' => 0,
                    'monto_total' => 0,
                ];
            }
            $serviciosAgrupados[$key]['cantidad_total'] += floatval($s['cantidad'] ?? 0);
            $serviciosAgrupados[$key]['monto_total'] += $subtotalNeto;
        }
        $servicios = array_values($serviciosAgrupados);
    }

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
    if (floatval($serviciosContratos['monto_total'] ?? 0) > 0 && !$hasProduccionContratoDetalle) {
        $servicios[] = [
            'tipo_servicio' => $tipoContratoAbono,
            'servicio_id' => 0,
            'nombre_servicio' => 'ABONOS DE CONTRATO',
            'medico_id' => null,
            'medico_solicitante' => 'Contrato',
            'clasificacion_origen' => 'contrato',
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
    // - contratos: abonos de contrato
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
                'contratos' => 0.0,
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
                'contratos' => 0.0,
                'consolidado' => 0.0,
                'total' => 0.0,
            ];
        }
        $tendenciasMap[$fecha]['contratos'] = floatval($row['total'] ?? 0);
    }

    foreach ($tendenciasConsolidado as $row) {
        $fecha = $row['fecha'] ?? null;
        if (!$fecha) continue;
        if (!isset($tendenciasMap[$fecha])) {
            $tendenciasMap[$fecha] = [
                'fecha' => $fecha,
                'tiempoReal' => 0.0,
                'contratos' => 0.0,
                'consolidado' => 0.0,
                'total' => 0.0,
            ];
        }
        $tendenciasMap[$fecha]['consolidado'] = floatval($row['total'] ?? 0);
    }

    ksort($tendenciasMap);
    $tendencias = array_values($tendenciasMap);

    $modoProduccion = strtolower(trim((string)($_GET['modo_produccion'] ?? 'todos')));
    if (!in_array($modoProduccion, ['todos', 'produccion_medica', 'venta_directa'], true)) {
        $modoProduccion = 'todos';
    }

    $produccionMedicaDetalle = [
        'habilitado' => false,
        'modo' => $modoProduccion,
        'resumen' => [
            'monto_total' => 0.0,
            'monto_produccion_medica' => 0.0,
            'monto_venta_directa' => 0.0,
            'items_total' => 0,
            'items_produccion_medica' => 0,
            'items_venta_directa' => 0,
        ],
        'ranking_medicos' => [],
        'ranking_venta_directa' => [],
    ];

    $hasPmdAnalitica = dashboard_table_exists($pdo, 'produccion_medica_detalle');
    $hasPcdAnalitica = dashboard_table_exists($pdo, 'produccion_contrato_detalle');
    if ($hasPmdAnalitica || $hasPcdAnalitica) {
        $filtroModoSql = '';
        if ($modoProduccion === 'produccion_medica') {
            $filtroModoSql = " AND base.canal = 'produccion_medica'";
        } elseif ($modoProduccion === 'venta_directa') {
            $filtroModoSql = " AND base.canal = 'venta_directa'";
        }

        $fuentesProduccion = [];
        $paramsBase = [];

        if ($hasPmdAnalitica) {
            $fuentesProduccion[] = "SELECT
                pmd.medico_id,
                pmd.medico_id AS medico_origen_id,
                pmd.medico_id AS medico_ejecutor_id,
                pmd.servicio_tipo,
                COALESCE(NULLIF(TRIM(pmd.servicio_nombre), ''), 'Servicio') AS servicio_nombre,
                COALESCE(pmd.cantidad, 0) AS cantidad,
                COALESCE(pmd.monto_neto_item, 0) AS monto,
                'real' AS estado_produccion,
                CASE
                    WHEN pmd.clasificacion_origen = 'venta_directa' THEN 'venta_directa'
                    ELSE 'produccion_medica'
                END AS canal
            FROM produccion_medica_detalle pmd
            WHERE pmd.fecha_cobro >= :inicioMesPmd AND pmd.fecha_cobro < :inicioMesSiguientePmd";
            $paramsBase[':inicioMesPmd'] = $inicioMes;
            $paramsBase[':inicioMesSiguientePmd'] = $inicioMesSiguiente;
        }

        if ($hasPcdAnalitica) {
            $fuentesProduccion[] = "SELECT
                COALESCE(NULLIF(co.medico_id, 0), NULLIF(cps.medico_origen_id, 0), pcd.medico_id) AS medico_id,
                COALESCE(NULLIF(co.medico_id, 0), NULLIF(cps.medico_origen_id, 0), pcd.medico_origen_id, pcd.medico_id) AS medico_origen_id,
                pcd.medico_id AS medico_ejecutor_id,
                pcd.servicio_tipo,
                COALESCE(NULLIF(TRIM(pcd.servicio_nombre), ''), 'Servicio contrato') AS servicio_nombre,
                COALESCE(pcd.cantidad, 0) AS cantidad,
                COALESCE(
                    CASE
                        WHEN pcd.estado_financiero = 'liquidado' THEN pcd.monto_reconocido
                        ELSE pcd.monto_lista_referencial
                    END,
                    0
                ) AS monto,
                CASE
                    WHEN pcd.estado_financiero = 'liquidado' THEN 'real'
                    ELSE 'proyectada'
                END AS estado_produccion,
                'produccion_medica' AS canal
            FROM produccion_contrato_detalle pcd
            LEFT JOIN contratos_paciente_servicios cps ON cps.id = pcd.contrato_paciente_servicio_id
                        LEFT JOIN consultas co ON co.id = pcd.consulta_origen_id
            WHERE pcd.fecha_atencion >= :inicioMesPcd AND pcd.fecha_atencion < :inicioMesSiguientePcd
              AND pcd.modo_cobertura = 'contrato'
              AND pcd.estado_financiero IN ('pendiente_liquidar', 'liquidado')";
            $paramsBase[':inicioMesPcd'] = $inicioMes;
            $paramsBase[':inicioMesSiguientePcd'] = $inicioMesSiguiente;
        }

        $sqlFuenteBase = "FROM (" . implode(" UNION ALL ", $fuentesProduccion) . ") base WHERE 1 = 1{$filtroModoSql}";

        $sqlProduccionResumen = "SELECT
            COALESCE(SUM(base.monto), 0) AS monto_total,
            COALESCE(SUM(CASE WHEN base.canal = 'produccion_medica' THEN base.monto ELSE 0 END), 0) AS monto_produccion_medica,
            COALESCE(SUM(CASE WHEN base.canal = 'venta_directa' THEN base.monto ELSE 0 END), 0) AS monto_venta_directa,
            COALESCE(SUM(CASE WHEN base.canal = 'produccion_medica' AND base.estado_produccion = 'real' THEN base.monto ELSE 0 END), 0) AS monto_produccion_real,
            COALESCE(SUM(CASE WHEN base.canal = 'produccion_medica' AND base.estado_produccion = 'proyectada' THEN base.monto ELSE 0 END), 0) AS monto_produccion_proyectada,
            COUNT(*) AS items_total,
            SUM(CASE WHEN base.canal = 'produccion_medica' THEN 1 ELSE 0 END) AS items_produccion_medica,
            SUM(CASE WHEN base.canal = 'venta_directa' THEN 1 ELSE 0 END) AS items_venta_directa,
            SUM(CASE WHEN base.canal = 'produccion_medica' AND base.estado_produccion = 'real' THEN 1 ELSE 0 END) AS items_produccion_real,
            SUM(CASE WHEN base.canal = 'produccion_medica' AND base.estado_produccion = 'proyectada' THEN 1 ELSE 0 END) AS items_produccion_proyectada
            {$sqlFuenteBase}";

        $stmtProduccionResumen = $pdo->prepare($sqlProduccionResumen);
        $stmtProduccionResumen->execute($paramsBase);
        $resProd = $stmtProduccionResumen->fetch(PDO::FETCH_ASSOC) ?: [];

                $sqlRankingMedicosOrigen = "SELECT
                        base.medico_origen_id AS medico_id,
                        TRIM(CONCAT(COALESCE(m.nombre, ''), ' ', COALESCE(m.apellido, ''))) AS medico_nombre,
                        COALESCE(m.especialidad, 'Sin especialidad') AS especialidad,
                        COUNT(*) AS items,
                    COALESCE(SUM(base.monto), 0) AS monto_total,
                    COALESCE(SUM(CASE WHEN base.estado_produccion = 'real' THEN base.monto ELSE 0 END), 0) AS monto_real,
                    COALESCE(SUM(CASE WHEN base.estado_produccion = 'proyectada' THEN base.monto ELSE 0 END), 0) AS monto_proyectado
                FROM (" . implode(" UNION ALL ", $fuentesProduccion) . ") base
                LEFT JOIN medicos m ON m.id = base.medico_origen_id
                WHERE 1 = 1{$filtroModoSql}
                    AND base.canal = 'produccion_medica'
                    AND base.medico_origen_id IS NOT NULL
                    AND base.medico_origen_id > 0
                GROUP BY base.medico_origen_id, medico_nombre, especialidad
                ORDER BY monto_total DESC, items DESC
                LIMIT 20";
        $stmtRankingMedicosOrigen = $pdo->prepare($sqlRankingMedicosOrigen);
        $stmtRankingMedicosOrigen->execute($paramsBase);
        $rankingMedicosOrigen = $stmtRankingMedicosOrigen->fetchAll(PDO::FETCH_ASSOC);

        $sqlRankingMedicosEjecucion = "SELECT
                        base.medico_ejecutor_id AS medico_id,
                        TRIM(CONCAT(COALESCE(m.nombre, ''), ' ', COALESCE(m.apellido, ''))) AS medico_nombre,
                        COALESCE(m.especialidad, 'Sin especialidad') AS especialidad,
                        COUNT(*) AS items,
                    COALESCE(SUM(base.monto), 0) AS monto_total,
                    COALESCE(SUM(CASE WHEN base.estado_produccion = 'real' THEN base.monto ELSE 0 END), 0) AS monto_real,
                    COALESCE(SUM(CASE WHEN base.estado_produccion = 'proyectada' THEN base.monto ELSE 0 END), 0) AS monto_proyectado
                FROM (" . implode(" UNION ALL ", $fuentesProduccion) . ") base
                LEFT JOIN medicos m ON m.id = base.medico_ejecutor_id
                WHERE 1 = 1{$filtroModoSql}
                    AND base.canal = 'produccion_medica'
                    AND base.medico_ejecutor_id IS NOT NULL
                    AND base.medico_ejecutor_id > 0
                GROUP BY base.medico_ejecutor_id, medico_nombre, especialidad
                ORDER BY monto_total DESC, items DESC
                LIMIT 20";
        $stmtRankingMedicosEjecucion = $pdo->prepare($sqlRankingMedicosEjecucion);
        $stmtRankingMedicosEjecucion->execute($paramsBase);
        $rankingMedicosEjecucion = $stmtRankingMedicosEjecucion->fetchAll(PDO::FETCH_ASSOC);

        $sqlRankingVentaDirecta = "SELECT
            base.servicio_tipo,
            COALESCE(NULLIF(TRIM(base.servicio_nombre), ''), 'Venta directa') AS servicio_nombre,
            COALESCE(SUM(base.cantidad), 0) AS cantidad_total,
            COALESCE(SUM(base.monto), 0) AS monto_total
            {$sqlFuenteBase}
            AND base.canal = 'venta_directa'
        GROUP BY base.servicio_tipo, servicio_nombre
        ORDER BY monto_total DESC, cantidad_total DESC
        LIMIT 20";
        $stmtRankingDirecta = $pdo->prepare($sqlRankingVentaDirecta);
        $stmtRankingDirecta->execute($paramsBase);
        $rankingDirecta = $stmtRankingDirecta->fetchAll(PDO::FETCH_ASSOC);

        $produccionMedicaDetalle = [
            'habilitado' => true,
            'modo' => $modoProduccion,
            'resumen' => [
                'monto_total' => floatval($resProd['monto_total'] ?? 0),
                'monto_produccion_medica' => floatval($resProd['monto_produccion_medica'] ?? 0),
                'monto_venta_directa' => floatval($resProd['monto_venta_directa'] ?? 0),
                'monto_produccion_real' => floatval($resProd['monto_produccion_real'] ?? 0),
                'monto_produccion_proyectada' => floatval($resProd['monto_produccion_proyectada'] ?? 0),
                'items_total' => intval($resProd['items_total'] ?? 0),
                'items_produccion_medica' => intval($resProd['items_produccion_medica'] ?? 0),
                'items_venta_directa' => intval($resProd['items_venta_directa'] ?? 0),
                'items_produccion_real' => intval($resProd['items_produccion_real'] ?? 0),
                'items_produccion_proyectada' => intval($resProd['items_produccion_proyectada'] ?? 0),
            ],
            'ranking_medicos' => $rankingMedicosOrigen,
            'ranking_medicos_origen' => $rankingMedicosOrigen,
            'ranking_medicos_ejecucion' => $rankingMedicosEjecucion,
            'ranking_venta_directa' => $rankingDirecta,
        ];
    }

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
        'tendencias' => $tendencias,
        'produccion_medica_detalle' => $produccionMedicaDetalle
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
