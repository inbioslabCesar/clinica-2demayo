
<?php
require_once __DIR__ . '/init_api.php';
require_once "db.php";

function resumir_descripcion_honorario(string $descripcion): string
{
    $raw = trim($descripcion);
    if ($raw === '') {
        return '';
    }

    if (stripos($raw, ' | CAMPANA ') !== false) {
        $segmentos = array_map('trim', explode('|', $raw));
        $base = trim((string)($segmentos[0] ?? ''));
        if ($base !== '') {
            return $base;
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
            return trim(substr($raw, 0, $pos));
        }
    }

    return $raw;
}

function extraer_codigo_campana_paquete(string $texto): string
{
    $raw = trim($texto);
    if ($raw === '') {
        return '';
    }
    if (!preg_match('/\|\s*CAMPANA\s+([^|]+)/i', $raw, $m)) {
        return '';
    }
    $segmento = trim((string)($m[1] ?? ''));
    if ($segmento === '') {
        return '';
    }
    $partes = preg_split('/\s*-\s*/', $segmento);
    $codigo = trim((string)($partes[0] ?? ''));
    if ($codigo === '') {
        return '';
    }
    return strtoupper($codigo);
}

function tabla_tiene_columna(PDO $pdo, string $tabla, string $columna): bool
{
    try {
        $stmt = $pdo->prepare("
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = :tabla
              AND column_name = :columna
            LIMIT 1
        ");
        $stmt->execute([
            ':tabla' => $tabla,
            ':columna' => $columna,
        ]);
        return (bool)$stmt->fetchColumn();
    } catch (Throwable $e) {
        return false;
    }
}

$hasHonorariosPorCobrar = false;
try {
    $stmtTbl = $pdo->prepare("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'honorarios_por_cobrar' LIMIT 1");
    $stmtTbl->execute();
    $hasHonorariosPorCobrar = (bool)$stmtTbl->fetchColumn();
} catch (Throwable $e) {
    $hasHonorariosPorCobrar = false;
}

$hasCotizacionMovimientos = false;
try {
    $stmtTblMov = $pdo->prepare("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'cotizacion_movimientos' LIMIT 1");
    $stmtTblMov->execute();
    $hasCotizacionMovimientos = (bool)$stmtTblMov->fetchColumn();
} catch (Throwable $e) {
    $hasCotizacionMovimientos = false;
}

$hasRecuperos = tabla_tiene_columna($pdo, 'honorarios_recuperos', 'id');

$medico_id = isset($_GET['medico_id']) ? intval($_GET['medico_id']) : null;
$turno = isset($_GET['turno']) ? $_GET['turno'] : null;
$estado = isset($_GET['estado']) ? $_GET['estado'] : 'pendiente';
$page = max(1, intval($_GET['page'] ?? 1));
$limit = max(1, min(100, intval($_GET['limit'] ?? 10)));
$offset = ($page - 1) * $limit;
$fecha_desde = isset($_GET['fecha_desde']) ? trim((string)$_GET['fecha_desde']) : '';
$fecha_hasta = isset($_GET['fecha_hasta']) ? trim((string)$_GET['fecha_hasta']) : '';
$rango = isset($_GET['rango']) ? strtolower(trim((string)$_GET['rango'])) : '';
$incluirAnuladas = isset($_GET['incluir_anuladas']) && intval($_GET['incluir_anuladas']) === 1;
$tipoFecha = isset($_GET['tipo_fecha']) ? strtolower(trim((string)$_GET['tipo_fecha'])) : 'movimiento';
if (!in_array($tipoFecha, ['movimiento', 'atencion'], true)) {
    $tipoFecha = 'movimiento';
}

$whereBase = "WHERE 1=1";
$paramsBase = [];

$estadoNormalizado = strtolower(trim((string)$estado));
$usarFechaPagoComoFiltro = ($estadoNormalizado === 'pagado');
$fechaAtencionExpr = "DATE(COALESCE(
    (
        SELECT cns_ref.fecha
        FROM consultas cns_ref
        WHERE cns_ref.id = h.consulta_id
        LIMIT 1
    ),
    (
        SELECT c_ref_hpc.fecha
        FROM honorarios_por_cobrar hpc_ref
        INNER JOIN cotizaciones c_ref_hpc ON c_ref_hpc.id = hpc_ref.cotizacion_id
        WHERE hpc_ref.honorario_movimiento_id_final = h.id
        ORDER BY hpc_ref.id DESC
        LIMIT 1
    ),
    h.fecha
))";
if ($hasCotizacionMovimientos) {
    $fechaAtencionExpr = "DATE(COALESCE(
        (
            SELECT cns_ref.fecha
            FROM consultas cns_ref
            WHERE cns_ref.id = h.consulta_id
            LIMIT 1
        ),
        (
            SELECT c_ref_hpc.fecha
            FROM honorarios_por_cobrar hpc_ref
            INNER JOIN cotizaciones c_ref_hpc ON c_ref_hpc.id = hpc_ref.cotizacion_id
            WHERE hpc_ref.honorario_movimiento_id_final = h.id
            ORDER BY hpc_ref.id DESC
            LIMIT 1
        ),
        (
            SELECT c_ref.fecha
            FROM cotizacion_movimientos cm_ref
            INNER JOIN cotizaciones c_ref ON c_ref.id = cm_ref.cotizacion_id
            WHERE cm_ref.cobro_id = h.cobro_id
              AND cm_ref.tipo_movimiento = 'abono'
              AND cm_ref.cotizacion_id IS NOT NULL
            ORDER BY cm_ref.id DESC
            LIMIT 1
        ),
        h.fecha
    ))";
}
$fechaMovimientoExpr = $usarFechaPagoComoFiltro
    ? "DATE(COALESCE(h.fecha_pago_medico, h.fecha))"
    : "DATE(h.fecha)";
$fechaFiltroExpr = $tipoFecha === 'atencion' ? $fechaAtencionExpr : $fechaMovimientoExpr;

if ($fecha_desde === '' && $fecha_hasta === '' && in_array($rango, ['hoy', 'semana', 'mes'], true)) {
    $hoy = date('Y-m-d');
    if ($rango === 'hoy') {
        $fecha_desde = $hoy;
        $fecha_hasta = $hoy;
    } elseif ($rango === 'semana') {
        $fecha_desde = date('Y-m-d', strtotime('monday this week'));
        $fecha_hasta = date('Y-m-d', strtotime('sunday this week'));
    } elseif ($rango === 'mes') {
        $fecha_desde = date('Y-m-01');
        $fecha_hasta = date('Y-m-t');
    }
}

if ($fecha_desde !== '') {
    $whereBase .= " AND {$fechaFiltroExpr} >= :fecha_desde";
    $paramsBase[':fecha_desde'] = $fecha_desde;
}
if ($fecha_hasta !== '') {
    $whereBase .= " AND {$fechaFiltroExpr} <= :fecha_hasta";
    $paramsBase[':fecha_hasta'] = $fecha_hasta;
}
if ($medico_id) {
    $whereBase .= " AND h.medico_id = :medico_id";
    $paramsBase[':medico_id'] = $medico_id;
}
if ($turno) {
    $whereBase .= " AND h.turno = :turno";
    $paramsBase[':turno'] = $turno;
}

// Un honorario ya pagado al médico nunca se oculta aunque su cobro se haya anulado:
// debe seguir visible (con aviso) porque queda un recupero pendiente por compensar.
if (!$incluirAnuladas) {
    if ($hasCotizacionMovimientos) {
        $whereBase .= " AND (h.estado_pago_medico = 'pagado' OR NOT EXISTS (
            SELECT 1
            FROM cotizacion_movimientos cmx
            INNER JOIN cotizaciones cx ON cx.id = cmx.cotizacion_id
            WHERE cmx.cobro_id = h.cobro_id
              AND LOWER(TRIM(COALESCE(cx.estado, ''))) = 'anulada'
        ))";
    }

    if ($hasHonorariosPorCobrar) {
        $whereBase .= " AND (h.estado_pago_medico = 'pagado' OR NOT EXISTS (
            SELECT 1
            FROM honorarios_por_cobrar hpcx
            INNER JOIN cotizaciones cx2 ON cx2.id = hpcx.cotizacion_id
            WHERE hpcx.honorario_movimiento_id_final = h.id
              AND LOWER(TRIM(COALESCE(cx2.estado, ''))) = 'anulada'
        ))";
    }
}

$hasHonorarioMetodoPago = tabla_tiene_columna($pdo, 'honorarios_medicos_movimientos', 'metodo_pago_medico');
$hasHonorarioFuentePago = tabla_tiene_columna($pdo, 'honorarios_medicos_movimientos', 'fuente_pago_medico');
$hasHonorarioRefPago = tabla_tiene_columna($pdo, 'honorarios_medicos_movimientos', 'referencia_pago_medico');
$hasEgresoMetodoPago = tabla_tiene_columna($pdo, 'egresos', 'metodo_pago');
$hasEgresoFuenteFondos = tabla_tiene_columna($pdo, 'egresos', 'fuente_fondos');
$hasEgresoRefPago = tabla_tiene_columna($pdo, 'egresos', 'referencia_pago');

$metodoPagoExpr = "NULL";
if ($hasHonorarioMetodoPago && $hasEgresoMetodoPago) {
    $metodoPagoExpr = "COALESCE(NULLIF(h.metodo_pago_medico, ''), NULLIF(e.metodo_pago, ''))";
} elseif ($hasHonorarioMetodoPago) {
    $metodoPagoExpr = "NULLIF(h.metodo_pago_medico, '')";
} elseif ($hasEgresoMetodoPago) {
    $metodoPagoExpr = "NULLIF(e.metodo_pago, '')";
}

$fuenteFondosExpr = "NULL";
if ($hasHonorarioFuentePago && $hasEgresoFuenteFondos) {
    $fuenteFondosExpr = "COALESCE(NULLIF(h.fuente_pago_medico, ''), NULLIF(e.fuente_fondos, ''))";
} elseif ($hasHonorarioFuentePago) {
    $fuenteFondosExpr = "NULLIF(h.fuente_pago_medico, '')";
} elseif ($hasEgresoFuenteFondos) {
    $fuenteFondosExpr = "NULLIF(e.fuente_fondos, '')";
}

$referenciaPagoExpr = "NULL";
if ($hasHonorarioRefPago && $hasEgresoRefPago) {
    $referenciaPagoExpr = "COALESCE(NULLIF(h.referencia_pago_medico, ''), NULLIF(e.referencia_pago, ''))";
} elseif ($hasHonorarioRefPago) {
    $referenciaPagoExpr = "NULLIF(h.referencia_pago_medico, '')";
} elseif ($hasEgresoRefPago) {
    $referenciaPagoExpr = "NULLIF(e.referencia_pago, '')";
}

$metodoPagoLiquidadoExpr = "CASE WHEN h.estado_pago_medico = 'pagado' THEN {$metodoPagoExpr} ELSE NULL END";
$fuenteFondosLiquidadoExpr = "CASE WHEN h.estado_pago_medico = 'pagado' THEN {$fuenteFondosExpr} ELSE NULL END";
$referenciaPagoLiquidadoExpr = "CASE WHEN h.estado_pago_medico = 'pagado' THEN {$referenciaPagoExpr} ELSE NULL END";

$where = $whereBase;
$params = $paramsBase;
if (in_array($estado, ['pendiente', 'pagado', 'cancelado'], true)) {
    $where .= " AND h.estado_pago_medico = :estado";
    $params[':estado'] = $estado;
}

$orderByExpr = $tipoFecha === 'atencion'
    ? $fechaAtencionExpr
    : ($usarFechaPagoComoFiltro ? "COALESCE(h.fecha_pago_medico, DATE(h.fecha))" : "h.fecha");

$joinHpc = '';
$cobradoPorExpr = 'i.usuario_id';
$cobradoPorNombreExpr = 'uc.nombre';
$cobradoPorRolExpr = 'uc.rol';
$hpcDescripcionExpr = "NULL";
$hpcObservacionesExpr = "NULL";
$hpcCotizacionRefExpr = "NULL";
$hpcPaqueteIdExpr = "NULL";
$origenExpr = "CASE WHEN LOWER(COALESCE(h.descripcion, '')) LIKE '%contrato%' THEN 'contrato' ELSE 'directo' END";
if ($hasHonorariosPorCobrar) {
    $joinHpc = " LEFT JOIN honorarios_por_cobrar hpc ON hpc.honorario_movimiento_id_final = h.id AND hpc.estado_consolidacion = 'consolidado'";
    $cobradoPorExpr = 'COALESCE(hpc.usuario_cobro_id, i.usuario_id)';
    $hpcDescripcionExpr = "hpc.descripcion";
    $hpcObservacionesExpr = "hpc.observaciones";
    if (tabla_tiene_columna($pdo, 'honorarios_por_cobrar', 'cotizacion_id')) {
        $hpcCotizacionRefExpr = "hpc.cotizacion_id";
    }

    if ($hasCotizacionMovimientos) {
        $cobradoPorNombreExpr = "COALESCE(
            NULLIF(
                (
                    SELECT GROUP_CONCAT(DISTINCT ucm.nombre ORDER BY ucm.nombre SEPARATOR ', ')
                    FROM cotizacion_movimientos cm
                    LEFT JOIN usuarios ucm ON ucm.id = cm.usuario_id
                    WHERE cm.cotizacion_id = hpc.cotizacion_id
                      AND cm.tipo_movimiento = 'abono'
                ),
                ''
            ),
            uc.nombre
        )";

        $cobradoPorRolExpr = "CASE
            WHEN (
                SELECT COUNT(DISTINCT cm2.usuario_id)
                FROM cotizacion_movimientos cm2
                WHERE cm2.cotizacion_id = hpc.cotizacion_id
                  AND cm2.tipo_movimiento = 'abono'
            ) > 1 THEN 'multiple'
            ELSE uc.rol
        END";
    }
}

$hasHonorarioCobroId = tabla_tiene_columna($pdo, 'honorarios_medicos_movimientos', 'cobro_id');
if ($hasCotizacionMovimientos && $hasHonorarioCobroId
    && tabla_tiene_columna($pdo, 'cotizacion_movimientos', 'cobro_id')
    && tabla_tiene_columna($pdo, 'cotizacion_movimientos', 'cotizacion_id')
    && tabla_tiene_columna($pdo, 'cotizacion_movimientos', 'tipo_movimiento')) {
    $cotizacionDesdeMovimientoExpr = "(
        SELECT cm_ref.cotizacion_id
        FROM cotizacion_movimientos cm_ref
        WHERE cm_ref.cobro_id = h.cobro_id
          AND cm_ref.cotizacion_id IS NOT NULL
          AND cm_ref.cotizacion_id > 0
          AND cm_ref.tipo_movimiento = 'abono'
        ORDER BY cm_ref.id DESC
        LIMIT 1
    )";
    $hpcCotizacionRefExpr = $hpcCotizacionRefExpr === "NULL"
        ? $cotizacionDesdeMovimientoExpr
        : "COALESCE($hpcCotizacionRefExpr, $cotizacionDesdeMovimientoExpr)";
}

$hasDetalleCotizacion = tabla_tiene_columna($pdo, 'cotizaciones_detalle', 'cotizacion_id')
    && tabla_tiene_columna($pdo, 'cotizaciones_detalle', 'paquete_id');
if ($hasDetalleCotizacion && $hpcCotizacionRefExpr !== "NULL") {
    $whereDetalleActivo = tabla_tiene_columna($pdo, 'cotizaciones_detalle', 'estado_item')
        ? " AND COALESCE(cd_ref.estado_item, 'activo') <> 'eliminado'"
        : '';
    $tipoServicioRefExpr = tabla_tiene_columna($pdo, 'honorarios_medicos_movimientos', 'tipo_servicio')
        ? "LOWER(TRIM(COALESCE(h.tipo_servicio, '')))"
        : "''";
    if ($hasHonorariosPorCobrar && tabla_tiene_columna($pdo, 'honorarios_por_cobrar', 'tipo_servicio')) {
        $tipoServicioRefExpr = "LOWER(TRIM(COALESCE(NULLIF(hpc.tipo_servicio, ''), h.tipo_servicio, '')))";
    }

    $filtroTipoServicio = '';
    if (tabla_tiene_columna($pdo, 'cotizaciones_detalle', 'servicio_tipo')) {
        $filtroTipoServicio = " AND LOWER(TRIM(COALESCE(cd_ref.servicio_tipo, ''))) = {$tipoServicioRefExpr}";
    }

    $filtroConsulta = '';
    if (tabla_tiene_columna($pdo, 'cotizaciones_detalle', 'consulta_id') && tabla_tiene_columna($pdo, 'honorarios_medicos_movimientos', 'consulta_id')) {
        $filtroConsulta = " AND (h.consulta_id IS NULL OR h.consulta_id <= 0 OR cd_ref.consulta_id = h.consulta_id)";
    }

    $sqlPaqueteRefEstricta = "(
        SELECT MAX(cd_ref.paquete_id)
        FROM cotizaciones_detalle cd_ref
        WHERE cd_ref.cotizacion_id = {$hpcCotizacionRefExpr}
          AND COALESCE(cd_ref.paquete_id, 0) > 0{$filtroTipoServicio}{$filtroConsulta}{$whereDetalleActivo}
    )";

    $sqlPaqueteRefAmplia = "(
        SELECT MAX(cd_ref.paquete_id)
        FROM cotizaciones_detalle cd_ref
        WHERE cd_ref.cotizacion_id = {$hpcCotizacionRefExpr}
          AND COALESCE(cd_ref.paquete_id, 0) > 0{$whereDetalleActivo}
    )";

    $hpcPaqueteIdExpr = "COALESCE($sqlPaqueteRefEstricta, $sqlPaqueteRefAmplia)";
}

if ($hpcCotizacionRefExpr !== "NULL") {
    $origenExpr = "CASE
        WHEN LOWER(COALESCE(h.descripcion, '')) LIKE '%contrato%' THEN 'contrato'
        WHEN COALESCE(($hpcCotizacionRefExpr), 0) > 0 THEN 'cotizacion'
        ELSE 'directo'
    END";
}

$countSql = "SELECT COUNT(*)
    FROM honorarios_medicos_movimientos h
    $where";
$stmtCount = $pdo->prepare($countSql);
$stmtCount->execute($params);
$totalRegistros = (int)$stmtCount->fetchColumn();
$totalPaginas = $limit > 0 ? (int)ceil($totalRegistros / $limit) : 1;

$cobroDevueltoPartes = [];
if ($hasCotizacionMovimientos) {
    $cobroDevueltoPartes[] = "EXISTS (SELECT 1 FROM cotizacion_movimientos cmd INNER JOIN cotizaciones cdv ON cdv.id = cmd.cotizacion_id WHERE cmd.cobro_id = h.cobro_id AND LOWER(TRIM(COALESCE(cdv.estado, ''))) = 'anulada')";
}
if ($hasHonorariosPorCobrar) {
    $cobroDevueltoPartes[] = "EXISTS (SELECT 1 FROM honorarios_por_cobrar hpd LEFT JOIN cotizaciones cdv2 ON cdv2.id = hpd.cotizacion_id WHERE hpd.honorario_movimiento_id_final = h.id AND (LOWER(TRIM(COALESCE(hpd.estado_consolidacion, ''))) = 'anulado' OR LOWER(TRIM(COALESCE(cdv2.estado, ''))) = 'anulada'))";
}
$recuperoMontoExpr = '0';
$recuperoCompensadoExpr = '0';
$medicoPorRecuperarExpr = '0';
if ($hasRecuperos) {
    $medicoPorRecuperarExpr = "(SELECT COALESCE(SUM(hr2.monto - hr2.monto_compensado), 0) FROM honorarios_recuperos hr2 WHERE hr2.medico_id = h.medico_id AND hr2.estado = 'pendiente')";
    $cobroDevueltoPartes[] = "EXISTS (SELECT 1 FROM honorarios_recuperos hrd WHERE hrd.honorario_movimiento_id = h.id)";
    $recuperoMontoExpr = "(SELECT COALESCE(SUM(hr.monto), 0) FROM honorarios_recuperos hr WHERE hr.honorario_movimiento_id = h.id)";
    $recuperoCompensadoExpr = "(SELECT COALESCE(SUM(hr.monto_compensado), 0) FROM honorarios_recuperos hr WHERE hr.honorario_movimiento_id = h.id)";
}
$cobroDevueltoExpr = empty($cobroDevueltoPartes)
    ? '0'
    : "CASE WHEN h.estado_pago_medico = 'pagado' AND (" . implode(' OR ', $cobroDevueltoPartes) . ") THEN 1 ELSE 0 END";

$sql = "SELECT h.id, h.medico_id, m.nombre AS medico_nombre, m.apellido AS medico_apellido, h.descripcion, h.tipo_servicio, h.paciente_id, p.nombre AS paciente_nombre, p.apellido AS paciente_apellido, h.fecha, h.turno, h.monto_medico, h.estado_pago_medico, h.observaciones,
    $cobroDevueltoExpr AS cobro_devuelto, $recuperoMontoExpr AS recupero_monto, $recuperoCompensadoExpr AS recupero_compensado, $medicoPorRecuperarExpr AS medico_por_recuperar,
    e.usuario_id AS liquidado_por_id, u.nombre AS liquidado_por_nombre, u.rol AS liquidado_por_rol, e.created_at AS fecha_liquidacion,
    $metodoPagoLiquidadoExpr AS metodo_pago_resumen, $fuenteFondosLiquidadoExpr AS fuente_fondos_resumen, $referenciaPagoLiquidadoExpr AS referencia_pago_resumen,
    $cobradoPorExpr AS cobrado_por_id, $cobradoPorNombreExpr AS cobrado_por_nombre, $cobradoPorRolExpr AS cobrado_por_rol,
    $hpcDescripcionExpr AS hpc_descripcion, $hpcObservacionesExpr AS hpc_observaciones, $hpcCotizacionRefExpr AS hpc_cotizacion_ref, $hpcPaqueteIdExpr AS hpc_paquete_id,
    $origenExpr AS origen_resumen,
    DATEDIFF(CURDATE(), {$fechaFiltroExpr}) AS antiguedad_dias
    FROM honorarios_medicos_movimientos h
    LEFT JOIN medicos m ON h.medico_id = m.id
    LEFT JOIN pacientes p ON h.paciente_id = p.id
    LEFT JOIN egresos e ON e.honorario_movimiento_id = h.id AND e.tipo_egreso = 'honorario_medico'
    LEFT JOIN usuarios u ON e.usuario_id = u.id
    LEFT JOIN ingresos_diarios i ON i.honorario_movimiento_id = h.id
    $joinHpc
    LEFT JOIN usuarios uc ON uc.id = $cobradoPorExpr
    $where
    ORDER BY {$orderByExpr} DESC, h.id DESC
    LIMIT :limit OFFSET :offset";

$stmt = $pdo->prepare($sql);
$bindParams = $params;
foreach ($bindParams as $k => $v) {
    $stmt->bindValue($k, $v);
}
$stmt->bindValue(':limit', (int)$limit, PDO::PARAM_INT);
$stmt->bindValue(':offset', (int)$offset, PDO::PARAM_INT);
$stmt->execute();
$honorarios = $stmt->fetchAll(PDO::FETCH_ASSOC);

$campanaPorLlaveClinica = [];
$codigosCampanaDetectados = [];
foreach ($honorarios as $rowCampana) {
    $consultaRef = (int)($rowCampana['consulta_id'] ?? 0);
    $medicoRef = (int)($rowCampana['medico_id'] ?? 0);
    $pacienteRef = (int)($rowCampana['paciente_id'] ?? 0);
    if ($consultaRef <= 0 || $medicoRef <= 0 || $pacienteRef <= 0) {
        continue;
    }
    $llaveClinica = $consultaRef . '|' . $medicoRef . '|' . $pacienteRef;
    $codigoCampana = '';
    foreach ([
        (string)($rowCampana['descripcion'] ?? ''),
        (string)($rowCampana['hpc_descripcion'] ?? ''),
        (string)($rowCampana['hpc_observaciones'] ?? ''),
    ] as $textoCampana) {
        $codigoCampana = extraer_codigo_campana_paquete($textoCampana);
        if ($codigoCampana !== '') {
            break;
        }
    }
    if ($codigoCampana === '') {
        continue;
    }
    $campanaPorLlaveClinica[$llaveClinica] = $codigoCampana;
    $codigosCampanaDetectados[$codigoCampana] = true;
}

$paqueteIdPorCodigoCampana = [];
if (!empty($codigosCampanaDetectados)
    && tabla_tiene_columna($pdo, 'paquetes_perfiles', 'id')
    && tabla_tiene_columna($pdo, 'paquetes_perfiles', 'codigo')) {
    $codigos = array_keys($codigosCampanaDetectados);
    $marcadores = [];
    $paramsCod = [];
    foreach ($codigos as $idx => $codigoCampana) {
        $k = ':cod' . $idx;
        $marcadores[] = $k;
        $paramsCod[$k] = strtoupper(trim((string)$codigoCampana));
    }
    if (!empty($marcadores)) {
        $sqlCamp = "SELECT id, UPPER(TRIM(codigo)) AS codigo_ref
                    FROM paquetes_perfiles
                    WHERE UPPER(TRIM(codigo)) IN (" . implode(',', $marcadores) . ")";
        $stmtCamp = $pdo->prepare($sqlCamp);
        if ($stmtCamp) {
            $stmtCamp->execute($paramsCod);
            $rowsCamp = $stmtCamp->fetchAll(PDO::FETCH_ASSOC) ?: [];
            foreach ($rowsCamp as $rowCamp) {
                $cod = strtoupper(trim((string)($rowCamp['codigo_ref'] ?? '')));
                $pid = (int)($rowCamp['id'] ?? 0);
                if ($cod !== '' && $pid > 0) {
                    $paqueteIdPorCodigoCampana[$cod] = $pid;
                }
            }
        }
    }
}

foreach ($honorarios as &$item) {
    $descripcionCompleta = (string)($item['descripcion'] ?? '');
    $descripcionHpc = (string)($item['hpc_descripcion'] ?? '');
    $observacionesHpc = (string)($item['hpc_observaciones'] ?? '');
    $observacionesMov = (string)($item['observaciones'] ?? '');
    $item['descripcion_completa'] = $descripcionCompleta;
    $item['descripcion'] = resumir_descripcion_honorario($descripcionCompleta);
    $origenResumen = strtolower(trim((string)($item['origen_resumen'] ?? '')));
    $tipoServicio = strtolower(trim((string)($item['tipo_servicio'] ?? '')));
    $paqueteIdDetectado = (int)($item['hpc_paquete_id'] ?? 0);
    $codigoCampana = '';

    $esHonorarioPaquete = $paqueteIdDetectado > 0
        || stripos($descripcionCompleta, '| CAMPANA ') !== false
        || stripos($descripcionHpc, '| CAMPANA ') !== false
        || stripos($observacionesHpc, '| CAMPANA ') !== false
        || stripos($observacionesMov, '| CAMPANA ') !== false;

    foreach ([$descripcionCompleta, $descripcionHpc, $observacionesHpc, $observacionesMov] as $fuenteCampana) {
        $codigoCampana = extraer_codigo_campana_paquete((string)$fuenteCampana);
        if ($codigoCampana !== '') {
            break;
        }
    }

    if ($paqueteIdDetectado <= 0) {
        foreach ([$descripcionCompleta, $descripcionHpc, $observacionesHpc] as $fuenteTexto) {
            if (preg_match('/\bPAQ\s*#\s*(\d+)/i', (string)$fuenteTexto, $mPaq)) {
                $paqueteIdDetectado = (int)($mPaq[1] ?? 0);
                if ($paqueteIdDetectado > 0) {
                    $esHonorarioPaquete = true;
                    break;
                }
            }
        }
    }

    $llaveClinica = ((int)($item['consulta_id'] ?? 0)) . '|' . ((int)($item['medico_id'] ?? 0)) . '|' . ((int)($item['paciente_id'] ?? 0));
    if ($codigoCampana === '' && isset($campanaPorLlaveClinica[$llaveClinica])) {
        $codigoCampana = (string)$campanaPorLlaveClinica[$llaveClinica];
    }
    if (!$esHonorarioPaquete && $codigoCampana !== '') {
        $esHonorarioPaquete = true;
    }
    if (!$esHonorarioPaquete && stripos($observacionesMov, 'AJUSTE_PAQUETE_ADENDA') !== false) {
        $esHonorarioPaquete = true;
    }
    if ($paqueteIdDetectado <= 0 && $codigoCampana !== '' && isset($paqueteIdPorCodigoCampana[$codigoCampana])) {
        $paqueteIdDetectado = (int)$paqueteIdPorCodigoCampana[$codigoCampana];
    }

    $origenDetalle = $origenResumen !== '' ? $origenResumen : 'directo';
    if ($origenResumen === 'cotizacion') {
        if ($tipoServicio === 'consulta') {
            $origenDetalle = $esHonorarioPaquete ? 'cotizacion_paquete' : 'cotizacion_consulta_sola';
        } elseif ($esHonorarioPaquete) {
            $origenDetalle = 'cotizacion_paquete';
        }
    }
    $item['origen_detalle'] = $origenDetalle;
    $item['paquete_id_referencia'] = $paqueteIdDetectado > 0 ? $paqueteIdDetectado : null;
    $item['paquete_codigo_referencia'] = $codigoCampana !== '' ? $codigoCampana : null;

    $item['motivo_anulacion'] = null;
    if (($item['estado_pago_medico'] ?? '') === 'cancelado') {
        $obs = (string)($item['observaciones'] ?? '');
        if (preg_match('/ANULADO:\s*(.+)$/u', $obs, $m)) {
            $item['motivo_anulacion'] = trim($m[1]);
        }
    }
    unset($item['observaciones']);
}
unset($item);

$resumenFechaPendienteExpr = $tipoFecha === 'atencion' ? $fechaAtencionExpr : "DATE(h.fecha)";
$resumenFechaPagadoExpr = $tipoFecha === 'atencion'
    ? $fechaAtencionExpr
    : "DATE(COALESCE(h.fecha_pago_medico, h.fecha))";

$sqlResumen = "SELECT
        COALESCE(SUM(CASE WHEN h.estado_pago_medico = 'pendiente' THEN h.monto_medico ELSE 0 END), 0) AS pendiente_total,
        COALESCE(SUM(CASE WHEN h.estado_pago_medico = 'pagado' THEN h.monto_medico ELSE 0 END), 0) AS liquidado_total,
        COALESCE(SUM(h.monto_medico), 0) AS monto_total,
        SUM(CASE WHEN h.estado_pago_medico = 'pendiente' THEN 1 ELSE 0 END) AS pendientes_count,
        SUM(CASE WHEN h.estado_pago_medico = 'pagado' THEN 1 ELSE 0 END) AS liquidados_count,
        COALESCE(SUM(CASE WHEN h.estado_pago_medico = 'pendiente' AND {$resumenFechaPendienteExpr} = CURDATE() THEN h.monto_medico ELSE 0 END), 0) AS pendiente_hoy,
        COALESCE(SUM(CASE WHEN h.estado_pago_medico = 'pendiente' AND {$resumenFechaPendienteExpr} >= DATE_FORMAT(CURDATE(), '%Y-%m-01') AND {$resumenFechaPendienteExpr} <= LAST_DAY(CURDATE()) THEN h.monto_medico ELSE 0 END), 0) AS pendiente_mes,
        COALESCE(SUM(CASE WHEN h.estado_pago_medico = 'pagado' AND {$resumenFechaPagadoExpr} >= DATE_FORMAT(CURDATE(), '%Y-%m-01') AND {$resumenFechaPagadoExpr} <= LAST_DAY(CURDATE()) THEN h.monto_medico ELSE 0 END), 0) AS liquidado_mes
    FROM honorarios_medicos_movimientos h
    $whereBase";
$stmtResumen = $pdo->prepare($sqlResumen);
$stmtResumen->execute($paramsBase);
$resumen = $stmtResumen->fetch(PDO::FETCH_ASSOC) ?: [];

$porRecuperar = 0.0;
if ($hasRecuperos) {
    $sqlRecuperar = "SELECT COALESCE(SUM(monto - monto_compensado), 0) FROM honorarios_recuperos WHERE estado = 'pendiente'";
    $paramsRecuperar = [];
    if ($medico_id) {
        $sqlRecuperar .= " AND medico_id = :medico_id";
        $paramsRecuperar[':medico_id'] = $medico_id;
    }
    $stmtRecuperar = $pdo->prepare($sqlRecuperar);
    $stmtRecuperar->execute($paramsRecuperar);
    $porRecuperar = (float)$stmtRecuperar->fetchColumn();
}

$sqlServicios = "SELECT h.tipo_servicio, COUNT(*) AS cantidad, COALESCE(SUM(h.monto_medico), 0) AS monto
    FROM honorarios_medicos_movimientos h
    $where
    GROUP BY h.tipo_servicio
    ORDER BY monto DESC";
$stmtServicios = $pdo->prepare($sqlServicios);
$stmtServicios->execute($params);
$porServicio = $stmtServicios->fetchAll(PDO::FETCH_ASSOC) ?: [];

$subtotalesPagina = [
    'pendiente' => 0.0,
    'pagado' => 0.0,
    'total' => 0.0,
    'items' => count($honorarios),
];
foreach ($honorarios as $item) {
    $montoItem = (float)($item['monto_medico'] ?? 0);
    $subtotalesPagina['total'] += $montoItem;
    if (strtolower((string)($item['estado_pago_medico'] ?? '')) === 'pendiente') {
        $subtotalesPagina['pendiente'] += $montoItem;
    } else {
        $subtotalesPagina['pagado'] += $montoItem;
    }
}

echo json_encode([
    "success" => true,
    "honorarios" => $honorarios,
    "page" => $page,
    "limit" => $limit,
    "total" => $totalRegistros,
    "total_pages" => $totalPaginas,
    "resumen" => [
        "pendiente_hoy" => (float)($resumen['pendiente_hoy'] ?? 0),
        "pendiente_mes" => (float)($resumen['pendiente_mes'] ?? 0),
        "liquidado_mes" => (float)($resumen['liquidado_mes'] ?? 0),
        "pendiente_total" => (float)($resumen['pendiente_total'] ?? 0),
        "liquidado_total" => (float)($resumen['liquidado_total'] ?? 0),
        "monto_total" => (float)($resumen['monto_total'] ?? 0),
        "deuda_neta" => (float)($resumen['pendiente_total'] ?? 0),
        "por_recuperar" => round($porRecuperar, 2),
        "pendientes_count" => (int)($resumen['pendientes_count'] ?? 0),
        "liquidados_count" => (int)($resumen['liquidados_count'] ?? 0),
        "por_servicio" => $porServicio,
        "subtotales_pagina" => $subtotalesPagina,
    ],
    "filtros" => [
        "estado" => $estado,
        "medico_id" => $medico_id,
        "turno" => $turno,
        "fecha_desde" => $fecha_desde,
        "fecha_hasta" => $fecha_hasta,
        "rango" => $rango,
        "tipo_fecha" => $tipoFecha,
    ],
]);
