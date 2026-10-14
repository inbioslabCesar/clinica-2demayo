<?php
// Rentabilidad de la clínica (solo lectura): ingresos cobrados, honorarios, gastos,
// aporte por médico, alertas de calidad de datos y proyecciones por escenarios.
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

if (!isset($_SESSION['usuario']) || strtolower(trim((string)($_SESSION['usuario']['rol'] ?? ''))) !== 'administrador') {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'No autorizado']);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Método no permitido']);
    exit;
}

if (!($pdo instanceof PDO)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Sin conexión a la base de datos']);
    exit;
}

function rent_table_exists(PDO $pdo, string $table): bool
{
    static $cache = [];
    if (!array_key_exists($table, $cache)) {
        $stmt = $pdo->prepare('SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1');
        $stmt->execute([$table]);
        $cache[$table] = (bool)$stmt->fetchColumn();
    }
    return $cache[$table];
}

function rent_col_exists(PDO $pdo, string $table, string $col): bool
{
    static $cache = [];
    $key = $table . '.' . $col;
    if (!array_key_exists($key, $cache)) {
        $stmt = $pdo->prepare('SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1');
        $stmt->execute([$table, $col]);
        $cache[$key] = (bool)$stmt->fetchColumn();
    }
    return $cache[$key];
}

function rent_fecha_valida($value): ?string
{
    $value = trim((string)$value);
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $value, $m)) {
        return null;
    }
    return checkdate((int)$m[2], (int)$m[3], (int)$m[1]) ? $value : null;
}

function rent_round($value): float
{
    return round((float)$value, 2);
}

function rent_pct($num, $den): ?float
{
    $den = (float)$den;
    if (abs($den) < 0.00001) {
        return null;
    }
    return round(((float)$num / $den) * 100, 1);
}

// Expresión de fecha de egresos según el esquema disponible en la instancia.
function rent_egresos_fecha_expr(PDO $pdo): string
{
    foreach (['fecha' => 'e.fecha', 'fecha_hora' => 'DATE(e.fecha_hora)', 'created_at' => 'DATE(e.created_at)'] as $col => $expr) {
        if (rent_col_exists($pdo, 'egresos', $col)) {
            return $expr;
        }
    }
    return 'CURDATE()';
}

function rent_egresos_filtro_estado(PDO $pdo): string
{
    if (!rent_col_exists($pdo, 'egresos', 'estado')) {
        return '';
    }
    return " AND LOWER(TRIM(COALESCE(e.estado, ''))) NOT IN ('anulado', 'anulada', 'cancelado', 'cancelada', 'eliminado')";
}

function rent_ingresos_por_servicio(PDO $pdo, string $desde, string $hasta): array
{
    $ini = $desde . ' 00:00:00';
    $fin = date('Y-m-d', strtotime($hasta . ' +1 day')) . ' 00:00:00';
    $out = ['total' => 0.0, 'cobros' => 0, 'dias_activos' => 0, 'servicios' => []];

    $stmt = $pdo->prepare("SELECT COALESCE(SUM(c.total), 0) AS total, COUNT(*) AS cobros, COUNT(DISTINCT DATE(c.fecha_cobro)) AS dias
        FROM cobros c WHERE c.estado = 'pagado' AND c.fecha_cobro >= ? AND c.fecha_cobro < ?");
    $stmt->execute([$ini, $fin]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
    $totalCobros = (float)($row['total'] ?? 0);
    $out['cobros'] = (int)($row['cobros'] ?? 0);
    $out['dias_activos'] = (int)($row['dias'] ?? 0);

    $detalleTotal = 0.0;
    $servicios = [];
    $fuenteServicios = 'cobros_detalle';

    // Desglose itemizado: cobros_detalle guarda una sola fila por cobro (los cobros con varios
    // servicios caen en "mixto"), por eso se prefiere el espejo itemizado de producción médica.
    if (rent_table_exists($pdo, 'produccion_medica_detalle')) {
        $stmt = $pdo->prepare("SELECT LOWER(TRIM(COALESCE(NULLIF(p.servicio_tipo, ''), 'otros'))) AS servicio_norm,
                COALESCE(SUM(c.total * p.monto_neto_item / NULLIF(t.suma_cobro, 0)), 0) AS total
            FROM produccion_medica_detalle p
            INNER JOIN cobros c ON c.id = p.cobro_id
            INNER JOIN (
                SELECT p2.cobro_id, SUM(p2.monto_neto_item) AS suma_cobro
                FROM produccion_medica_detalle p2 INNER JOIN cobros c2 ON c2.id = p2.cobro_id
                WHERE c2.estado = 'pagado' AND c2.fecha_cobro >= ? AND c2.fecha_cobro < ?
                GROUP BY p2.cobro_id
            ) t ON t.cobro_id = p.cobro_id
            WHERE c.estado = 'pagado' AND c.fecha_cobro >= ? AND c.fecha_cobro < ?
            GROUP BY servicio_norm");
        $stmt->execute([$ini, $fin, $ini, $fin]);
        $itemizado = [];
        $sumaItemizado = 0.0;
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $tipo = $r['servicio_norm'];
            if ($tipo === 'rayos_x' || $tipo === 'rx') {
                $tipo = 'rayosx';
            } elseif ($tipo === 'procedimientos') {
                $tipo = 'procedimiento';
            }
            $itemizado[$tipo] = ($itemizado[$tipo] ?? 0.0) + (float)$r['total'];
            $sumaItemizado += (float)$r['total'];
        }
        if ($totalCobros > 0 && ($sumaItemizado / $totalCobros) >= 0.8) {
            arsort($itemizado);
            foreach ($itemizado as $tipo => $monto) {
                $servicios[] = ['servicio' => $tipo, 'total' => rent_round($monto)];
            }
            $sinDetalle = $totalCobros - $sumaItemizado;
            if (abs($sinDetalle) > 0.01) {
                $servicios[] = ['servicio' => 'sin_detalle', 'total' => rent_round($sinDetalle)];
            }
            $detalleTotal = $sumaItemizado;
            $fuenteServicios = 'produccion_medica';
        }
    }

    if ($fuenteServicios === 'cobros_detalle' && rent_table_exists($pdo, 'cobros_detalle')) {
        $stmt = $pdo->prepare("SELECT LOWER(TRIM(COALESCE(NULLIF(cd.servicio_tipo, ''), 'otros'))) AS servicio_norm, COALESCE(SUM(cd.subtotal), 0) AS total
            FROM cobros_detalle cd INNER JOIN cobros c ON c.id = cd.cobro_id
            WHERE c.estado = 'pagado' AND c.fecha_cobro >= ? AND c.fecha_cobro < ?
            GROUP BY servicio_norm ORDER BY total DESC");
        $stmt->execute([$ini, $fin]);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $monto = (float)$r['total'];
            $detalleTotal += $monto;
            $servicios[] = ['servicio' => $r['servicio_norm'], 'total' => rent_round($monto)];
        }
        // Diferencia entre el total cobrado y el detalle (descuentos, ajustes de cobro).
        $ajuste = $totalCobros - $detalleTotal;
        if (!empty($servicios) && abs($ajuste) > 0.01) {
            $servicios[] = ['servicio' => 'descuentos_ajustes', 'total' => rent_round($ajuste)];
        }
    }
    $out['servicios'] = $servicios;
    $out['fuente_servicios'] = $fuenteServicios;
    $out['detalle_total'] = rent_round($detalleTotal);

    $contratos = 0.0;
    if (rent_table_exists($pdo, 'ingresos_diarios')) {
        $stmt = $pdo->prepare("SELECT COALESCE(SUM(monto), 0) FROM ingresos_diarios
            WHERE (tipo_ingreso = 'contrato_abono' OR referencia_tabla = 'paciente_seguimiento_pagos')
              AND fecha_hora >= ? AND fecha_hora < ?");
        $stmt->execute([$ini, $fin]);
        $contratos = (float)$stmt->fetchColumn();
        if ($contratos > 0.009) {
            $out['servicios'][] = ['servicio' => 'contrato_abono', 'total' => rent_round($contratos)];
        }
    }

    $out['cobros_total'] = rent_round($totalCobros);
    $out['total'] = rent_round($totalCobros + $contratos);
    return $out;
}

function rent_honorarios(PDO $pdo, string $desde, string $hasta): array
{
    $stmt = $pdo->prepare("SELECT COALESCE(SUM(monto_medico), 0) AS honorarios, COALESCE(SUM(monto_clinica), 0) AS clinica_registrada, COUNT(*) AS items
        FROM honorarios_medicos_movimientos
        WHERE LOWER(TRIM(COALESCE(estado_pago_medico, ''))) <> 'cancelado' AND fecha BETWEEN ? AND ?");
    $stmt->execute([$desde, $hasta]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
    return [
        'total' => rent_round($row['honorarios'] ?? 0),
        'clinica_registrada' => rent_round($row['clinica_registrada'] ?? 0),
        'items' => (int)($row['items'] ?? 0),
    ];
}

function rent_gastos(PDO $pdo, string $desde, string $hasta): array
{
    $out = ['total' => 0.0, 'categorias' => []];
    if (!rent_table_exists($pdo, 'egresos')) {
        return $out;
    }
    $fechaExpr = rent_egresos_fecha_expr($pdo);
    $filtroEstado = rent_egresos_filtro_estado($pdo);
    $tieneTipo = rent_col_exists($pdo, 'egresos', 'tipo_egreso');
    $tieneCategoria = rent_col_exists($pdo, 'egresos', 'categoria');
    $excluirHonorarios = $tieneTipo ? " AND LOWER(TRIM(COALESCE(e.tipo_egreso, ''))) <> 'honorario_medico'" : '';
    $tipoExpr = $tieneTipo ? "LOWER(TRIM(COALESCE(e.tipo_egreso, '')))" : "''";
    $catExpr = $tieneCategoria ? "TRIM(COALESCE(e.categoria, ''))" : "''";

    $stmt = $pdo->prepare("SELECT {$tipoExpr} AS tipo_norm, {$catExpr} AS categoria_norm, COALESCE(SUM(e.monto), 0) AS total
        FROM egresos e
        WHERE {$fechaExpr} BETWEEN ? AND ? {$excluirHonorarios} {$filtroEstado}
        GROUP BY tipo_norm, categoria_norm ORDER BY total DESC");
    $stmt->execute([$desde, $hasta]);
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $monto = (float)$r['total'];
        $out['total'] += $monto;
        $etiqueta = $r['categoria_norm'] !== '' ? $r['categoria_norm'] : ($r['tipo_norm'] !== '' ? $r['tipo_norm'] : 'Sin categoría');
        $out['categorias'][] = ['tipo' => $r['tipo_norm'], 'categoria' => $etiqueta, 'total' => rent_round($monto)];
    }
    $out['total'] = rent_round($out['total']);
    return $out;
}

function rent_resumen_periodo(PDO $pdo, string $desde, string $hasta): array
{
    $ing = rent_ingresos_por_servicio($pdo, $desde, $hasta);
    $hon = rent_honorarios($pdo, $desde, $hasta);
    $gas = rent_gastos($pdo, $desde, $hasta);
    $contribucion = $ing['total'] - $hon['total'] - $gas['total'];
    return [
        'ingresos' => $ing['total'],
        'honorarios' => $hon['total'],
        'gastos' => $gas['total'],
        'contribucion' => rent_round($contribucion),
        'margen_pct' => rent_pct($contribucion, $ing['total']),
        'honorarios_pct' => rent_pct($hon['total'], $ing['total']),
        'cobros' => $ing['cobros'],
        'dias_activos' => $ing['dias_activos'],
        'ingreso_por_dia' => $ing['dias_activos'] > 0 ? rent_round($ing['total'] / $ing['dias_activos']) : null,
        'contribucion_por_dia' => $ing['dias_activos'] > 0 ? rent_round($contribucion / $ing['dias_activos']) : null,
        'servicios' => $ing['servicios'],
        'detalle_total' => $ing['detalle_total'] ?? 0.0,
        'fuente_servicios' => $ing['fuente_servicios'] ?? 'cobros_detalle',
        'cobros_total' => $ing['cobros_total'] ?? 0.0,
        'gastos_categorias' => $gas['categorias'],
        'honorarios_items' => $hon['items'],
    ];
}

// Ingresos atribuibles a cada médico y honorarios pagados en el período.
function rent_por_medico_mapa(PDO $pdo, string $desde, string $hasta, bool $usarTarifaHonorarios): array
{
    $ini = $desde . ' 00:00:00';
    $fin = date('Y-m-d', strtotime($hasta . ' +1 day')) . ' 00:00:00';
    $mapa = [];
    $pmdTotal = 0.0;

    if (!$usarTarifaHonorarios && rent_table_exists($pdo, 'produccion_medica_detalle')) {
        // El cobro puede ser parcial: se reparte lo realmente cobrado en proporción al monto de cada ítem.
        $stmt = $pdo->prepare("SELECT COALESCE(p.medico_id, 0) AS medico_id,
                COALESCE(SUM(c.total * p.monto_neto_item / NULLIF(t.suma_cobro, 0)), 0) AS ingresos,
                COUNT(DISTINCT p.cobro_id) AS atenciones
            FROM produccion_medica_detalle p
            INNER JOIN cobros c ON c.id = p.cobro_id
            INNER JOIN (
                SELECT p2.cobro_id, SUM(p2.monto_neto_item) AS suma_cobro
                FROM produccion_medica_detalle p2 INNER JOIN cobros c2 ON c2.id = p2.cobro_id
                WHERE c2.estado = 'pagado' AND c2.fecha_cobro >= ? AND c2.fecha_cobro < ?
                GROUP BY p2.cobro_id
            ) t ON t.cobro_id = p.cobro_id
            WHERE c.estado = 'pagado' AND c.fecha_cobro >= ? AND c.fecha_cobro < ?
            GROUP BY COALESCE(p.medico_id, 0)");
        $stmt->execute([$ini, $fin, $ini, $fin]);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $id = (int)$r['medico_id'];
            $mapa[$id] = ['ingresos' => (float)$r['ingresos'], 'atenciones' => (int)$r['atenciones'], 'honorarios' => 0.0];
            $pmdTotal += (float)$r['ingresos'];
        }
    }

    $stmt = $pdo->prepare("SELECT medico_id, COALESCE(SUM(monto_medico), 0) AS honorarios, COALESCE(SUM(tarifa_total), 0) AS tarifa, COUNT(*) AS items
        FROM honorarios_medicos_movimientos
        WHERE LOWER(TRIM(COALESCE(estado_pago_medico, ''))) <> 'cancelado' AND fecha BETWEEN ? AND ?
        GROUP BY medico_id");
    $stmt->execute([$desde, $hasta]);
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $id = (int)$r['medico_id'];
        if (!isset($mapa[$id])) {
            $mapa[$id] = ['ingresos' => 0.0, 'atenciones' => 0, 'honorarios' => 0.0];
        }
        $mapa[$id]['honorarios'] = (float)$r['honorarios'];
        if ($usarTarifaHonorarios) {
            $mapa[$id]['ingresos'] = (float)$r['tarifa'];
            $mapa[$id]['atenciones'] = (int)$r['items'];
        }
    }

    return ['mapa' => $mapa, 'pmd_total' => $pmdTotal];
}

function rent_nombres_medicos(PDO $pdo): array
{
    $nombres = [];
    $stmt = $pdo->query('SELECT id, nombre, apellido FROM medicos');
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $nombres[(int)$r['id']] = trim($r['nombre'] . ' ' . ($r['apellido'] ?? ''));
    }
    return $nombres;
}

// Qué servicios componen lo cobrado sin médico asignado en producción médica.
function rent_sin_medico_detalle(PDO $pdo, string $desde, string $hasta): array
{
    if (!rent_table_exists($pdo, 'produccion_medica_detalle')) {
        return [];
    }
    $ini = $desde . ' 00:00:00';
    $fin = date('Y-m-d', strtotime($hasta . ' +1 day')) . ' 00:00:00';
    $stmt = $pdo->prepare("SELECT LOWER(TRIM(COALESCE(NULLIF(p.servicio_tipo, ''), 'otros'))) AS servicio_norm,
            COALESCE(NULLIF(TRIM(p.servicio_nombre), ''), 'Servicio') AS nombre_norm,
            COALESCE(SUM(c.total * p.monto_neto_item / NULLIF(t.suma_cobro, 0)), 0) AS total,
            COUNT(DISTINCT p.cobro_id) AS cobros
        FROM produccion_medica_detalle p
        INNER JOIN cobros c ON c.id = p.cobro_id
        INNER JOIN (
            SELECT p2.cobro_id, SUM(p2.monto_neto_item) AS suma_cobro
            FROM produccion_medica_detalle p2 INNER JOIN cobros c2 ON c2.id = p2.cobro_id
            WHERE c2.estado = 'pagado' AND c2.fecha_cobro >= ? AND c2.fecha_cobro < ?
            GROUP BY p2.cobro_id
        ) t ON t.cobro_id = p.cobro_id
        WHERE c.estado = 'pagado' AND c.fecha_cobro >= ? AND c.fecha_cobro < ? AND COALESCE(p.medico_id, 0) = 0
        GROUP BY servicio_norm, nombre_norm
        ORDER BY total DESC
        LIMIT 12");
    $stmt->execute([$ini, $fin, $ini, $fin]);
    $out = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $out[] = [
            'servicio' => $r['servicio_norm'],
            'nombre' => $r['nombre_norm'],
            'cobros' => (int)$r['cobros'],
            'total' => rent_round($r['total']),
        ];
    }
    return $out;
}

function rent_dias_no_domingo(DateTimeImmutable $desde, DateTimeImmutable $hasta): int
{
    $n = 0;
    for ($d = $desde; $d <= $hasta; $d = $d->modify('+1 day')) {
        if ((int)$d->format('w') !== 0) {
            $n++;
        }
    }
    return $n;
}

function rent_serie_mensual(PDO $pdo, DateTimeImmutable $mesActual, int $meses): array
{
    $inicio = $mesActual->modify('first day of this month')->modify('-' . ($meses - 1) . ' months');
    $fin = $mesActual->modify('last day of this month');
    $desde = $inicio->format('Y-m-d');
    $hasta = $fin->format('Y-m-d');
    $ini = $desde . ' 00:00:00';
    $finExcl = $fin->modify('+1 day')->format('Y-m-d') . ' 00:00:00';

    $serie = [];
    for ($i = 0; $i < $meses; $i++) {
        $k = $inicio->modify('+' . $i . ' months')->format('Y-m');
        $serie[$k] = ['mes' => $k, 'ingresos' => 0.0, 'honorarios' => 0.0, 'gastos' => 0.0, 'cobros' => 0, 'dias_activos' => 0];
    }

    $stmt = $pdo->prepare("SELECT DATE_FORMAT(fecha_cobro, '%Y-%m') AS mes, COALESCE(SUM(total), 0) AS total, COUNT(*) AS cobros, COUNT(DISTINCT DATE(fecha_cobro)) AS dias
        FROM cobros WHERE estado = 'pagado' AND fecha_cobro >= ? AND fecha_cobro < ? GROUP BY mes");
    $stmt->execute([$ini, $finExcl]);
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
        if (isset($serie[$r['mes']])) {
            $serie[$r['mes']]['ingresos'] += (float)$r['total'];
            $serie[$r['mes']]['cobros'] = (int)$r['cobros'];
            $serie[$r['mes']]['dias_activos'] = (int)$r['dias'];
        }
    }

    if (rent_table_exists($pdo, 'ingresos_diarios')) {
        $stmt = $pdo->prepare("SELECT DATE_FORMAT(fecha_hora, '%Y-%m') AS mes, COALESCE(SUM(monto), 0) AS total FROM ingresos_diarios
            WHERE (tipo_ingreso = 'contrato_abono' OR referencia_tabla = 'paciente_seguimiento_pagos') AND fecha_hora >= ? AND fecha_hora < ? GROUP BY mes");
        $stmt->execute([$ini, $finExcl]);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
            if (isset($serie[$r['mes']])) {
                $serie[$r['mes']]['ingresos'] += (float)$r['total'];
            }
        }
    }

    $stmt = $pdo->prepare("SELECT DATE_FORMAT(fecha, '%Y-%m') AS mes, COALESCE(SUM(monto_medico), 0) AS total
        FROM honorarios_medicos_movimientos
        WHERE LOWER(TRIM(COALESCE(estado_pago_medico, ''))) <> 'cancelado' AND fecha BETWEEN ? AND ? GROUP BY mes");
    $stmt->execute([$desde, $hasta]);
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
        if (isset($serie[$r['mes']])) {
            $serie[$r['mes']]['honorarios'] = (float)$r['total'];
        }
    }

    if (rent_table_exists($pdo, 'egresos')) {
        $fechaExpr = rent_egresos_fecha_expr($pdo);
        $filtroEstado = rent_egresos_filtro_estado($pdo);
        $excluir = rent_col_exists($pdo, 'egresos', 'tipo_egreso') ? " AND LOWER(TRIM(COALESCE(e.tipo_egreso, ''))) <> 'honorario_medico'" : '';
        $stmt = $pdo->prepare("SELECT DATE_FORMAT({$fechaExpr}, '%Y-%m') AS mes, COALESCE(SUM(e.monto), 0) AS total
            FROM egresos e WHERE {$fechaExpr} BETWEEN ? AND ? {$excluir} {$filtroEstado} GROUP BY mes");
        $stmt->execute([$desde, $hasta]);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
            if (isset($serie[$r['mes']])) {
                $serie[$r['mes']]['gastos'] = (float)$r['total'];
            }
        }
    }

    $out = [];
    foreach ($serie as $fila) {
        $contribucion = $fila['ingresos'] - $fila['honorarios'] - $fila['gastos'];
        $out[] = [
            'mes' => $fila['mes'],
            'ingresos' => rent_round($fila['ingresos']),
            'honorarios' => rent_round($fila['honorarios']),
            'gastos' => rent_round($fila['gastos']),
            'contribucion' => rent_round($contribucion),
            'margen_pct' => rent_pct($contribucion, $fila['ingresos']),
            'cobros' => $fila['cobros'],
            'dias_activos' => $fila['dias_activos'],
            'ingreso_por_dia' => $fila['dias_activos'] > 0 ? rent_round($fila['ingresos'] / $fila['dias_activos']) : null,
        ];
    }
    return $out;
}

function rent_proyeccion(array $serie, DateTimeImmutable $hoy): array
{
    $mesActualKey = $hoy->format('Y-m');
    $actual = null;
    $cerrados = [];
    foreach ($serie as $fila) {
        if ($fila['mes'] === $mesActualKey) {
            $actual = $fila;
        } elseif ($fila['ingresos'] > 0 && $fila['dias_activos'] > 0) {
            $cerrados[] = $fila;
        }
    }
    $mesesConHistoria = count($cerrados) + (($actual && $actual['ingresos'] > 0) ? 1 : 0);
    $confianza = $mesesConHistoria >= 6 ? 'alta' : ($mesesConHistoria >= 3 ? 'media' : 'baja');

    $base = [
        'confianza' => $confianza,
        'meses_con_historia' => $mesesConHistoria,
        'disponible' => false,
        'supuestos' => [],
    ];
    if ($mesesConHistoria === 0 || !$actual) {
        return $base;
    }

    $recientes = array_slice($cerrados, -3);
    $tasasHist = [];
    $diasHist = [];
    $honorariosPct = [];
    $gastosMensuales = [];
    foreach ($recientes as $f) {
        $tasasHist[] = $f['ingresos'] / $f['dias_activos'];
        $diasHist[] = $f['dias_activos'];
        $honorariosPct[] = $f['ingresos'] > 0 ? $f['honorarios'] / $f['ingresos'] : 0;
        $gastosMensuales[] = $f['gastos'];
    }
    $tasaHist = !empty($tasasHist) ? array_sum($tasasHist) / count($tasasHist) : null;
    $diasEsperados = !empty($diasHist) ? array_sum($diasHist) / count($diasHist) : 26.0;
    $tasaActual = $actual['dias_activos'] >= 5 ? $actual['ingresos'] / $actual['dias_activos'] : null;
    if ($actual['ingresos'] > 0) {
        $honorariosPct[] = $actual['ingresos'] > 0 ? $actual['honorarios'] / $actual['ingresos'] : 0;
    }
    $ratioHonorarios = !empty($honorariosPct) ? array_sum($honorariosPct) / count($honorariosPct) : 0.0;
    $gastoMensual = !empty($gastosMensuales) ? array_sum($gastosMensuales) / count($gastosMensuales) : $actual['gastos'];

    if ($tasaHist !== null && $tasaActual !== null) {
        $tasas = [
            'conservador' => min($tasaHist, $tasaActual),
            'base' => ($tasaHist + $tasaActual) / 2,
            'optimista' => max($tasaHist, $tasaActual),
        ];
    } elseif ($tasaHist !== null) {
        $tasas = ['conservador' => $tasaHist * 0.9, 'base' => $tasaHist, 'optimista' => $tasaHist * 1.1];
    } elseif ($tasaActual !== null) {
        $tasas = ['conservador' => $tasaActual * 0.9, 'base' => $tasaActual, 'optimista' => $tasaActual * 1.1];
    } else {
        $base['motivo'] = 'Se necesitan al menos 5 días de actividad en el mes o un mes cerrado para proyectar.';
        return $base;
    }

    $manana = $hoy->modify('+1 day');
    $finMes = $hoy->modify('last day of this month');
    $diasRestantes = $manana <= $finMes ? rent_dias_no_domingo($manana, $finMes) : 0;
    $inicioProx = $hoy->modify('first day of next month');
    $diasProxMes = min($diasEsperados, rent_dias_no_domingo($inicioProx, $inicioProx->modify('last day of this month')));

    $escenarios = [];
    foreach ($tasas as $nombre => $tasa) {
        $ingMesActual = $actual['ingresos'] + $diasRestantes * $tasa;
        $contMesActual = $ingMesActual * (1 - $ratioHonorarios) - max($actual['gastos'], $gastoMensual);
        $ingProx = $diasProxMes * $tasa;
        $contProx = $ingProx * (1 - $ratioHonorarios) - $gastoMensual;
        $escenarios[$nombre] = [
            'mes_en_curso' => ['ingresos' => rent_round($ingMesActual), 'contribucion' => rent_round($contMesActual)],
            'proximo_mes' => ['ingresos' => rent_round($ingProx), 'contribucion' => rent_round($contProx)],
            'proximo_trimestre' => ['ingresos' => rent_round($ingProx * 3), 'contribucion' => rent_round($contProx * 3)],
            'proximos_12_meses' => ['ingresos' => rent_round($ingProx * 12), 'contribucion' => rent_round($contProx * 12)],
        ];
    }

    $base['disponible'] = true;
    $base['mes_en_curso'] = $mesActualKey;
    $base['dias_restantes_mes'] = $diasRestantes;
    $base['dias_activos_esperados_mes'] = round($diasProxMes, 1);
    $base['tasas_por_dia'] = array_map('rent_round', $tasas);
    $base['honorarios_pct_supuesto'] = round($ratioHonorarios * 100, 1);
    $base['gasto_mensual_supuesto'] = rent_round($gastoMensual);
    $base['escenarios'] = $escenarios;
    $base['supuestos'] = [
        'El ingreso por día activo se mantiene entre el ritmo del mes en curso y el promedio de los últimos meses cerrados.',
        'Los honorarios mantienen la proporción histórica sobre el ingreso.',
        'Los gastos registrados se repiten como promedio mensual (puede faltar registrar costos fijos).',
        'Trimestre y 12 meses son un run-rate lineal: no consideran estacionalidad ni crecimiento.',
    ];
    return $base;
}

try {
    $hoy = new DateTimeImmutable('now', new DateTimeZone('America/Lima'));
    $desde = rent_fecha_valida($_GET['desde'] ?? '') ?: $hoy->format('Y-m-01');
    $hasta = rent_fecha_valida($_GET['hasta'] ?? '') ?: $hoy->format('Y-m-d');
    if ($desde > $hasta) {
        $tmp = $desde;
        $desde = $hasta;
        $hasta = $tmp;
    }

    $dDesde = new DateTimeImmutable($desde);
    $dHasta = new DateTimeImmutable($hasta);
    $largo = (int)$dDesde->diff($dHasta)->days + 1;
    if ($largo > 800) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'El rango máximo es de 800 días']);
        exit;
    }
    $prevHasta = $dDesde->modify('-1 day');
    $prevDesde = $prevHasta->modify('-' . ($largo - 1) . ' days');

    $actual = rent_resumen_periodo($pdo, $desde, $hasta);
    $anterior = rent_resumen_periodo($pdo, $prevDesde->format('Y-m-d'), $prevHasta->format('Y-m-d'));

    $variacion = [
        'ingresos_pct' => $anterior['ingresos'] > 0 ? rent_pct($actual['ingresos'] - $anterior['ingresos'], $anterior['ingresos']) : null,
        'contribucion_pct' => abs($anterior['contribucion']) > 0.009 ? rent_pct($actual['contribucion'] - $anterior['contribucion'], abs($anterior['contribucion'])) : null,
        'margen_pp' => ($actual['margen_pct'] !== null && $anterior['margen_pct'] !== null) ? round($actual['margen_pct'] - $anterior['margen_pct'], 1) : null,
    ];

    // ── Por médico ──────────────────────────────────────────────────────────────
    $nombres = rent_nombres_medicos($pdo);
    $mapaActual = rent_por_medico_mapa($pdo, $desde, $hasta, false);
    $cobrosTotal = (float)$actual['cobros_total'];
    $cobertura = $cobrosTotal > 0 ? round(($mapaActual['pmd_total'] / $cobrosTotal) * 100, 1) : null;
    $usarTarifa = ($cobertura === null || $cobertura < 80);
    if ($usarTarifa) {
        $mapaActual = rent_por_medico_mapa($pdo, $desde, $hasta, true);
    } else {
        // Lo cobrado sin detalle de producción queda como ingreso propio para que la tabla cuadre con el total.
        $sinAtribuir = $cobrosTotal - $mapaActual['pmd_total'];
        if ($sinAtribuir > 0.009) {
            if (!isset($mapaActual['mapa'][0])) {
                $mapaActual['mapa'][0] = ['ingresos' => 0.0, 'atenciones' => 0, 'honorarios' => 0.0];
            }
            $mapaActual['mapa'][0]['ingresos'] += $sinAtribuir;
        }
    }
    $mapaPrevio = rent_por_medico_mapa($pdo, $prevDesde->format('Y-m-d'), $prevHasta->format('Y-m-d'), $usarTarifa)['mapa'];

    $porMedico = [];
    $ids = array_unique(array_merge(array_keys($mapaActual['mapa']), array_keys($mapaPrevio)));
    foreach ($ids as $id) {
        $m = $mapaActual['mapa'][$id] ?? ['ingresos' => 0.0, 'honorarios' => 0.0, 'atenciones' => 0];
        $p = $mapaPrevio[$id] ?? ['ingresos' => 0.0, 'honorarios' => 0.0, 'atenciones' => 0];
        if ($m['ingresos'] <= 0 && $m['honorarios'] <= 0) {
            continue;
        }
        $aporte = $m['ingresos'] - $m['honorarios'];
        $aportePrev = $p['ingresos'] - $p['honorarios'];
        $margen = rent_pct($aporte, $m['ingresos']);
        $margenPrev = $p['ingresos'] > 0 ? rent_pct($aportePrev, $p['ingresos']) : null;
        $porMedico[] = [
            'medico_id' => (int)$id,
            'medico' => $id > 0 ? ($nombres[$id] ?? ('Médico #' . $id)) : 'Sin médico (ingresos propios)',
            'atenciones' => (int)$m['atenciones'],
            'ingresos' => rent_round($m['ingresos']),
            'honorarios' => rent_round($m['honorarios']),
            'aporte_clinica' => rent_round($aporte),
            'margen_pct' => $margen,
            'margen_anterior_pct' => $margenPrev,
            'variacion_pp' => ($margen !== null && $margenPrev !== null) ? round($margen - $margenPrev, 1) : null,
            'aporte_por_dia' => $actual['dias_activos'] > 0 ? rent_round($aporte / $actual['dias_activos']) : null,
            'ingresos_anterior' => rent_round($p['ingresos']),
        ];
    }
    usort($porMedico, function ($a, $b) {
        return $b['aporte_clinica'] <=> $a['aporte_clinica'];
    });

    // Médicos registrados sin movimientos en el período: se listan para que se vea quién falta.
    $presentes = [];
    foreach ($porMedico as $f) {
        $presentes[$f['medico_id']] = true;
    }
    $sinActividad = [];
    foreach ($nombres as $id => $nombre) {
        if (isset($presentes[$id])) {
            continue;
        }
        $p = $mapaPrevio[$id] ?? ['ingresos' => 0.0, 'honorarios' => 0.0];
        $sinActividad[] = [
            'medico_id' => (int)$id,
            'medico' => $nombre,
            'atenciones' => 0,
            'ingresos' => 0.0,
            'honorarios' => 0.0,
            'aporte_clinica' => 0.0,
            'margen_pct' => null,
            'margen_anterior_pct' => $p['ingresos'] > 0 ? rent_pct($p['ingresos'] - $p['honorarios'], $p['ingresos']) : null,
            'variacion_pp' => null,
            'aporte_por_dia' => null,
            'ingresos_anterior' => rent_round($p['ingresos']),
            'sin_actividad' => true,
        ];
    }
    usort($sinActividad, function ($a, $b) {
        return strcasecmp($a['medico'], $b['medico']);
    });
    $porMedico = array_merge($porMedico, $sinActividad);
    $sinMedicoDetalle = $usarTarifa ? [] : rent_sin_medico_detalle($pdo, $desde, $hasta);

    // ── Alertas y calidad de datos ──────────────────────────────────────────────
    $alertas = [];

    $stmt = $pdo->prepare("SELECT h.id, h.fecha, h.medico_id, h.tipo_servicio, h.monto_medico, h.cobro_id, c.estado AS cobro_estado
        FROM honorarios_medicos_movimientos h INNER JOIN cobros c ON c.id = h.cobro_id
        WHERE LOWER(TRIM(COALESCE(h.estado_pago_medico, ''))) = 'pagado' AND LOWER(TRIM(COALESCE(c.estado, ''))) <> 'pagado'
        ORDER BY h.fecha DESC, h.id DESC");
    $stmt->execute();
    $sobreAnulados = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $montoSobreAnulados = 0.0;
    $detalleAnulados = [];
    foreach ($sobreAnulados as $r) {
        $montoSobreAnulados += (float)$r['monto_medico'];
        if (count($detalleAnulados) < 15) {
            $detalleAnulados[] = [
                'id' => (int)$r['id'],
                'fecha' => $r['fecha'],
                'medico' => $nombres[(int)$r['medico_id']] ?? ('Médico #' . (int)$r['medico_id']),
                'tipo_servicio' => $r['tipo_servicio'],
                'monto_medico' => rent_round($r['monto_medico']),
                'cobro_id' => (int)$r['cobro_id'],
                'cobro_estado' => $r['cobro_estado'],
            ];
        }
    }
    if (!empty($sobreAnulados)) {
        $alertas[] = [
            'codigo' => 'honorarios_sobre_cobro_no_pagado',
            'nivel' => 'alto',
            'titulo' => 'Honorarios pagados sobre cobros anulados',
            'mensaje' => count($sobreAnulados) . ' honorarios ya pagados cuyo cobro no está pagado. Costo absorbido por la clínica (histórico).',
            'monto' => rent_round($montoSobreAnulados),
            'cantidad' => count($sobreAnulados),
            'detalle' => $detalleAnulados,
        ];
    }

    $stmt = $pdo->prepare("SELECT COUNT(*) AS n, COALESCE(SUM(tarifa_total - monto_clinica - monto_medico), 0) AS dif
        FROM honorarios_medicos_movimientos
        WHERE LOWER(TRIM(COALESCE(estado_pago_medico, ''))) <> 'cancelado' AND fecha BETWEEN ? AND ?
          AND ABS(tarifa_total - monto_clinica - monto_medico) > 0.01");
    $stmt->execute([$desde, $hasta]);
    $dif = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
    if ((int)($dif['n'] ?? 0) > 0) {
        $alertas[] = [
            'codigo' => 'tarifa_no_asignada',
            'nivel' => 'medio',
            'titulo' => 'Tarifa mayor que clínica + médico',
            'mensaje' => 'Atenciones donde la parte de la clínica no está registrada. Para el reporte se asume que esa diferencia es de la clínica.',
            'monto' => rent_round($dif['dif'] ?? 0),
            'cantidad' => (int)$dif['n'],
        ];
    }

    $stmt = $pdo->prepare("SELECT COUNT(*) AS n, COALESCE(SUM(tarifa_total), 0) AS tarifa FROM honorarios_medicos_movimientos
        WHERE LOWER(TRIM(COALESCE(estado_pago_medico, ''))) <> 'cancelado' AND fecha BETWEEN ? AND ?
          AND monto_clinica = 0 AND monto_medico > 0");
    $stmt->execute([$desde, $hasta]);
    $cero = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
    if ((int)($cero['n'] ?? 0) > 0) {
        $alertas[] = [
            'codigo' => 'clinica_en_cero',
            'nivel' => 'info',
            'titulo' => 'Atenciones con clínica registrada en 0',
            'mensaje' => 'Revisar si el reparto 100% médico es intencional.',
            'monto' => rent_round($cero['tarifa'] ?? 0),
            'cantidad' => (int)$cero['n'],
        ];
    }

    if ($cobertura !== null && $cobertura < 80) {
        $alertas[] = [
            'codigo' => 'atribucion_incompleta',
            'nivel' => 'medio',
            'titulo' => 'Atribución por médico incompleta',
            'mensaje' => 'Solo ' . $cobertura . '% de lo cobrado tiene médico asignado en producción médica; el aporte por médico usa la tarifa de honorarios como estimación.',
            'monto' => null,
            'cantidad' => null,
        ];
    }

    $caidas = [];
    foreach ($porMedico as $f) {
        if ($f['medico_id'] > 0 && $f['variacion_pp'] !== null && $f['variacion_pp'] <= -10 && $f['ingresos'] >= 300 && $f['ingresos_anterior'] >= 300) {
            $caidas[] = ['medico' => $f['medico'], 'margen_pct' => $f['margen_pct'], 'margen_anterior_pct' => $f['margen_anterior_pct']];
        }
    }
    if (!empty($caidas)) {
        $alertas[] = [
            'codigo' => 'margen_en_caida',
            'nivel' => 'medio',
            'titulo' => 'Médicos con margen en caída',
            'mensaje' => 'El margen bajó 10 puntos o más frente al período anterior.',
            'monto' => null,
            'cantidad' => count($caidas),
            'detalle' => $caidas,
        ];
    }

    if ($actual['ingresos'] > 0 && $actual['gastos'] < $actual['ingresos'] * 0.05) {
        $alertas[] = [
            'codigo' => 'gastos_bajos',
            'nivel' => 'info',
            'titulo' => 'Gastos registrados muy bajos',
            'mensaje' => 'Los gastos son menos del 5% del ingreso: pueden faltar costos fijos (alquiler, planilla). Es margen de contribución, no utilidad neta.',
            'monto' => $actual['gastos'],
            'cantidad' => null,
        ];
    }

    $stmt = $pdo->prepare("SELECT COUNT(*) AS n, COALESCE(SUM(tarifa_total), 0) AS tarifa FROM honorarios_medicos_movimientos
        WHERE LOWER(TRIM(COALESCE(estado_pago_medico, ''))) = 'cancelado' AND fecha BETWEEN ? AND ?");
    $stmt->execute([$desde, $hasta]);
    $canc = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];

    // ── Serie mensual y proyección (independientes del rango elegido) ───────────
    $serie = rent_serie_mensual($pdo, $hoy, 12);
    $proyeccion = rent_proyeccion($serie, $hoy);

    echo json_encode([
        'success' => true,
        'periodo' => [
            'desde' => $desde,
            'hasta' => $hasta,
            'anterior_desde' => $prevDesde->format('Y-m-d'),
            'anterior_hasta' => $prevHasta->format('Y-m-d'),
            'dias' => $largo,
        ],
        'resumen' => $actual,
        'resumen_anterior' => $anterior,
        'variacion' => $variacion,
        'por_medico' => $porMedico,
        'sin_medico_detalle' => $sinMedicoDetalle,
        'atribucion' => [
            'cobertura_pct' => $cobertura,
            'fuente' => $usarTarifa ? 'honorarios_tarifa' : 'produccion_medica',
        ],
        'alertas' => $alertas,
        'cancelados_periodo' => ['cantidad' => (int)($canc['n'] ?? 0), 'monto' => rent_round($canc['tarifa'] ?? 0)],
        'mensual' => $serie,
        'proyeccion' => $proyeccion,
    ], JSON_UNESCAPED_UNICODE);
} catch (Throwable $e) {
    error_log('api_rentabilidad_clinica error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'No se pudo calcular la rentabilidad']);
}
