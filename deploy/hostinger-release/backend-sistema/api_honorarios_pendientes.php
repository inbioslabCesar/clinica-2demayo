
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

$whereBase = "WHERE 1=1";
$paramsBase = [];

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
    $whereBase .= " AND DATE(h.fecha) >= :fecha_desde";
    $paramsBase[':fecha_desde'] = $fecha_desde;
}
if ($fecha_hasta !== '') {
    $whereBase .= " AND DATE(h.fecha) <= :fecha_hasta";
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

if (!$incluirAnuladas) {
    if ($hasCotizacionMovimientos) {
        $whereBase .= " AND NOT EXISTS (
            SELECT 1
            FROM cotizacion_movimientos cmx
            INNER JOIN cotizaciones cx ON cx.id = cmx.cotizacion_id
            WHERE cmx.cobro_id = h.cobro_id
              AND LOWER(TRIM(COALESCE(cx.estado, ''))) = 'anulada'
        )";
    }

    if ($hasHonorariosPorCobrar) {
        $whereBase .= " AND NOT EXISTS (
            SELECT 1
            FROM honorarios_por_cobrar hpcx
            INNER JOIN cotizaciones cx2 ON cx2.id = hpcx.cotizacion_id
            WHERE hpcx.honorario_movimiento_id_final = h.id
              AND LOWER(TRIM(COALESCE(cx2.estado, ''))) = 'anulada'
        )";
    }
}

$where = $whereBase;
$params = $paramsBase;
if ($estado === 'pendiente' || $estado === 'pagado') {
    $where .= " AND h.estado_pago_medico = :estado";
    $params[':estado'] = $estado;
}

$joinHpc = '';
$cobradoPorExpr = 'i.usuario_id';
$cobradoPorNombreExpr = 'uc.nombre';
$cobradoPorRolExpr = 'uc.rol';
$origenExpr = "CASE WHEN LOWER(COALESCE(h.descripcion, '')) LIKE '%contrato%' THEN 'contrato' ELSE 'directo' END";
if ($hasHonorariosPorCobrar) {
    $joinHpc = " LEFT JOIN honorarios_por_cobrar hpc ON hpc.honorario_movimiento_id_final = h.id AND hpc.estado_consolidacion = 'consolidado'";
    $cobradoPorExpr = 'COALESCE(hpc.usuario_cobro_id, i.usuario_id)';
    $origenExpr = "CASE
        WHEN LOWER(COALESCE(h.descripcion, '')) LIKE '%contrato%' THEN 'contrato'
        WHEN hpc.id IS NOT NULL THEN 'cotizacion'
        ELSE 'directo'
    END";

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

$countSql = "SELECT COUNT(*)
    FROM honorarios_medicos_movimientos h
    $where";
$stmtCount = $pdo->prepare($countSql);
$stmtCount->execute($params);
$totalRegistros = (int)$stmtCount->fetchColumn();
$totalPaginas = $limit > 0 ? (int)ceil($totalRegistros / $limit) : 1;

$sql = "SELECT h.id, h.medico_id, m.nombre AS medico_nombre, m.apellido AS medico_apellido, h.descripcion, h.tipo_servicio, h.paciente_id, p.nombre AS paciente_nombre, p.apellido AS paciente_apellido, h.fecha, h.turno, h.monto_medico, h.estado_pago_medico,
    e.usuario_id AS liquidado_por_id, u.nombre AS liquidado_por_nombre, u.rol AS liquidado_por_rol, e.created_at AS fecha_liquidacion,
    $cobradoPorExpr AS cobrado_por_id, $cobradoPorNombreExpr AS cobrado_por_nombre, $cobradoPorRolExpr AS cobrado_por_rol,
    $origenExpr AS origen_resumen,
    DATEDIFF(CURDATE(), DATE(h.fecha)) AS antiguedad_dias
    FROM honorarios_medicos_movimientos h
    LEFT JOIN medicos m ON h.medico_id = m.id
    LEFT JOIN pacientes p ON h.paciente_id = p.id
    LEFT JOIN egresos e ON e.honorario_movimiento_id = h.id AND e.tipo_egreso = 'honorario_medico'
    LEFT JOIN usuarios u ON e.usuario_id = u.id
    LEFT JOIN ingresos_diarios i ON i.honorario_movimiento_id = h.id
    $joinHpc
    LEFT JOIN usuarios uc ON uc.id = $cobradoPorExpr
    $where
    ORDER BY h.fecha DESC, h.id DESC
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
foreach ($honorarios as &$item) {
    $descripcionCompleta = (string)($item['descripcion'] ?? '');
    $item['descripcion_completa'] = $descripcionCompleta;
    $item['descripcion'] = resumir_descripcion_honorario($descripcionCompleta);
}
unset($item);

$sqlResumen = "SELECT
        COALESCE(SUM(CASE WHEN h.estado_pago_medico = 'pendiente' THEN h.monto_medico ELSE 0 END), 0) AS pendiente_total,
        COALESCE(SUM(CASE WHEN h.estado_pago_medico = 'pagado' THEN h.monto_medico ELSE 0 END), 0) AS liquidado_total,
        COALESCE(SUM(h.monto_medico), 0) AS monto_total,
        SUM(CASE WHEN h.estado_pago_medico = 'pendiente' THEN 1 ELSE 0 END) AS pendientes_count,
        SUM(CASE WHEN h.estado_pago_medico = 'pagado' THEN 1 ELSE 0 END) AS liquidados_count,
        COALESCE(SUM(CASE WHEN h.estado_pago_medico = 'pendiente' AND DATE(h.fecha) = CURDATE() THEN h.monto_medico ELSE 0 END), 0) AS pendiente_hoy,
        COALESCE(SUM(CASE WHEN h.estado_pago_medico = 'pendiente' AND DATE(h.fecha) >= DATE_FORMAT(CURDATE(), '%Y-%m-01') AND DATE(h.fecha) <= LAST_DAY(CURDATE()) THEN h.monto_medico ELSE 0 END), 0) AS pendiente_mes,
        COALESCE(SUM(CASE WHEN h.estado_pago_medico = 'pagado' AND DATE(h.fecha_pago_medico) >= DATE_FORMAT(CURDATE(), '%Y-%m-01') AND DATE(h.fecha_pago_medico) <= LAST_DAY(CURDATE()) THEN h.monto_medico ELSE 0 END), 0) AS liquidado_mes
    FROM honorarios_medicos_movimientos h
    $whereBase";
$stmtResumen = $pdo->prepare($sqlResumen);
$stmtResumen->execute($paramsBase);
$resumen = $stmtResumen->fetch(PDO::FETCH_ASSOC) ?: [];

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
    ],
]);
