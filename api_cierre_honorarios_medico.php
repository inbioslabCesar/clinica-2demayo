<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

function cierre_bool_param($v) {
    return in_array(strtolower(trim((string)$v)), ['1', 'true', 'yes', 'si', 'sí'], true);
}

function cierre_normalizar_fecha($raw) {
    $raw = trim((string)$raw);
    if ($raw === '') {
        return date('Y-m-d');
    }
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $raw)) {
        return $raw;
    }
    $ts = strtotime($raw);
    if ($ts === false) {
        return date('Y-m-d');
    }
    return date('Y-m-d', $ts);
}

function cierre_es_sesion_medico() {
    $usuario = $_SESSION['usuario'] ?? null;
    $rol = is_array($usuario) ? trim((string)($usuario['rol'] ?? '')) : '';
    if ($rol === 'medico') {
        return true;
    }
    if (!isset($_SESSION['usuario']) && isset($_SESSION['medico_id'])) {
        return true;
    }
    return false;
}

function cierre_medico_sesion_id() {
    $usuario = $_SESSION['usuario'] ?? null;
    if (isset($_SESSION['medico_id'])) {
        return (int)$_SESSION['medico_id'];
    }
    if (is_array($usuario) && isset($usuario['medico_id'])) {
        return (int)$usuario['medico_id'];
    }
    if (is_array($usuario) && trim((string)($usuario['rol'] ?? '')) === 'medico') {
        return (int)($usuario['id'] ?? 0);
    }
    return 0;
}

function cierre_obtener_monto_fijo_consulta($conn, $medicoId, $fechaRef) {
    $medicoId = (int)$medicoId;
    $fechaRef = trim((string)$fechaRef);
    if ($medicoId <= 0) {
        return null;
    }

    $sql = 'SELECT monto_fijo_medico '
        . 'FROM configuracion_honorarios_medicos '
        . 'WHERE medico_id = ? '
        . '  AND activo = 1 '
        . '  AND LOWER(TRIM(COALESCE(tipo_servicio, ""))) = "consulta" '
        . '  AND (vigencia_desde IS NULL OR vigencia_desde <= ?) '
        . '  AND (vigencia_hasta IS NULL OR vigencia_hasta >= ?) '
        . 'ORDER BY vigencia_desde DESC, id DESC LIMIT 1';

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        return null;
    }

    $stmt->bind_param('iss', $medicoId, $fechaRef, $fechaRef);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$row || !isset($row['monto_fijo_medico'])) {
        return null;
    }

    $monto = $row['monto_fijo_medico'];
    return ($monto === null || $monto === '') ? null : (float)$monto;
}

function cierre_estado_cotizacion_pagada($estado) {
    $st = strtolower(trim((string)$estado));
    return in_array($st, ['pagado', 'pagada', 'completado', 'completada', 'control', 'contrato'], true);
}

function cierre_columna_existe($conn, $tabla, $columna) {
    static $cache = [];
    $key = $tabla . '.' . $columna;
    if (array_key_exists($key, $cache)) {
        return $cache[$key];
    }
    $stmt = $conn->prepare('SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1');
    if (!$stmt) {
        $cache[$key] = false;
        return false;
    }
    $stmt->bind_param('ss', $tabla, $columna);
    $stmt->execute();
    $res = $stmt->get_result();
    $exists = $res && $res->num_rows > 0;
    $stmt->close();
    $cache[$key] = $exists;
    return $exists;
}

function cierre_resolver_cadena_cotizacion_ids($conn, $cotizacionId) {
    $cotizacionId = (int)$cotizacionId;
    if ($cotizacionId <= 0) {
        return [];
    }
    if (!cierre_columna_existe($conn, 'cotizaciones', 'cotizacion_padre_id')) {
        return [$cotizacionId];
    }

    $rootId = $cotizacionId;
    $vistos = [];
    while ($rootId > 0) {
        if (isset($vistos[$rootId])) break;
        $vistos[$rootId] = true;
        $stmtRoot = $conn->prepare('SELECT cotizacion_padre_id FROM cotizaciones WHERE id = ? LIMIT 1');
        if (!$stmtRoot) break;
        $stmtRoot->bind_param('i', $rootId);
        $stmtRoot->execute();
        $rowRoot = $stmtRoot->get_result()->fetch_assoc();
        $stmtRoot->close();
        $parentId = (int)($rowRoot['cotizacion_padre_id'] ?? 0);
        if ($parentId <= 0 || $parentId === $rootId) break;
        $rootId = $parentId;
    }

    $ids = [$rootId => true];
    $queue = [$rootId];
    while (!empty($queue)) {
        $current = (int)array_shift($queue);
        $stmtChildren = $conn->prepare('SELECT id FROM cotizaciones WHERE cotizacion_padre_id = ?');
        if (!$stmtChildren) continue;
        $stmtChildren->bind_param('i', $current);
        $stmtChildren->execute();
        $children = $stmtChildren->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmtChildren->close();
        foreach ($children as $child) {
            $childId = (int)($child['id'] ?? 0);
            if ($childId <= 0 || isset($ids[$childId])) continue;
            $ids[$childId] = true;
            $queue[] = $childId;
        }
    }

    $out = array_values(array_map('intval', array_keys($ids)));
    sort($out);
    return $out;
}

function cierre_resolver_pago_comercial($conn, $cotizacionId) {
    static $cache = [];
    $cotizacionId = (int)$cotizacionId;
    if ($cotizacionId <= 0) return null;
    if (array_key_exists($cotizacionId, $cache)) {
        return $cache[$cotizacionId];
    }

    $ids = cierre_resolver_cadena_cotizacion_ids($conn, $cotizacionId);
    if (empty($ids)) {
        $ids = [$cotizacionId];
    }

    $ph = implode(',', array_fill(0, count($ids), '?'));
    $stmt = $conn->prepare("SELECT id, estado, COALESCE(saldo_pendiente, 0) AS saldo_pendiente FROM cotizaciones WHERE id IN ({$ph})");
    if (!$stmt) {
        $cache[$cotizacionId] = null;
        return null;
    }
    $stmt->bind_param(str_repeat('i', count($ids)), ...$ids);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();
    if (empty($rows)) {
        $cache[$cotizacionId] = null;
        return null;
    }

    $byId = [];
    $paidIds = [];
    foreach ($rows as $row) {
        $rid = (int)($row['id'] ?? 0);
        if ($rid <= 0) continue;
        $byId[$rid] = $row;
        if (cierre_estado_cotizacion_pagada((string)($row['estado'] ?? ''))) {
            $paidIds[] = $rid;
        }
    }
    if (empty($byId)) {
        $cache[$cotizacionId] = null;
        return null;
    }

    if (!empty($paidIds)) {
        sort($paidIds, SORT_NUMERIC);
        $selectedId = (int)$paidIds[0];
    } elseif (isset($byId[$cotizacionId])) {
        $selectedId = $cotizacionId;
    } else {
        $keys = array_keys($byId);
        sort($keys, SORT_NUMERIC);
        $selectedId = (int)$keys[0];
    }

    $selected = $byId[$selectedId] ?? null;
    if (!is_array($selected)) {
        $cache[$cotizacionId] = null;
        return null;
    }

    $resolved = [
        'id' => (int)($selected['id'] ?? 0),
        'estado' => (string)($selected['estado'] ?? ''),
        'saldo_pendiente' => round((float)($selected['saldo_pendiente'] ?? 0), 2),
    ];
    $cache[$cotizacionId] = $resolved;
    return $resolved;
}

function cierre_obtener_detalle($conn, $medicoId, $fechaRef) {
    $hasEstadoItem = false;
    $stmtCol = $conn->prepare('SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1');
    if ($stmtCol) {
        $table = 'cotizaciones_detalle';
        $col = 'estado_item';
        $stmtCol->bind_param('ss', $table, $col);
        $stmtCol->execute();
        $resCol = $stmtCol->get_result();
        $hasEstadoItem = $resCol && $resCol->num_rows > 0;
        $stmtCol->close();
    }

    $estadoItemExpr = $hasEstadoItem
        ? 'SUBSTRING_INDEX(GROUP_CONCAT(COALESCE(cd.estado_item, "activo") ORDER BY cd.id DESC SEPARATOR ","), ",", 1) AS estado_item'
        : '"activo" AS estado_item';

    $sql = 'SELECT '
        . 'c.id AS consulta_id, c.fecha, c.hora, COALESCE(c.estado, "") AS estado_consulta, '
        . 'p.nombre AS paciente_nombre, p.apellido AS paciente_apellido, '
        . 'd.detalle_id, d.cotizacion_id, COALESCE(d.estado_item, "activo") AS estado_item, '
        . 'COALESCE(ct.estado, "") AS estado_cotizacion, COALESCE(ct.saldo_pendiente, 0) AS saldo_pendiente '
        . 'FROM consultas c '
        . 'INNER JOIN pacientes p ON p.id = c.paciente_id '
        . 'LEFT JOIN ('
        . '  SELECT cd.consulta_id, MAX(cd.id) AS detalle_id, MAX(cd.cotizacion_id) AS cotizacion_id, '
        .        $estadoItemExpr
        . '  FROM cotizaciones_detalle cd '
        . '  WHERE cd.consulta_id IS NOT NULL '
        . '    AND cd.consulta_id > 0 '
        . '    AND LOWER(TRIM(COALESCE(cd.servicio_tipo, ""))) = "consulta" '
        . '  GROUP BY cd.consulta_id'
        . ') d ON d.consulta_id = c.id '
        . 'LEFT JOIN cotizaciones ct ON ct.id = d.cotizacion_id '
        . 'WHERE c.medico_id = ? AND c.fecha = ? '
        . 'ORDER BY c.hora ASC, c.id ASC';

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        return [];
    }

    $stmt->bind_param('is', $medicoId, $fechaRef);
    $stmt->execute();
    $res = $stmt->get_result();

    $rows = [];
    while ($row = $res->fetch_assoc()) {
        $estadoConsulta = strtolower(trim((string)($row['estado_consulta'] ?? '')));
        $estadoItem = strtolower(trim((string)($row['estado_item'] ?? 'activo')));
        $estadoCot = strtolower(trim((string)($row['estado_cotizacion'] ?? '')));
        $saldoPendiente = round((float)($row['saldo_pendiente'] ?? 0), 2);
        $cotizacionId = (int)($row['cotizacion_id'] ?? 0);
        if ($cotizacionId > 0) {
            $pagoComercial = cierre_resolver_pago_comercial($conn, $cotizacionId);
            if (is_array($pagoComercial)) {
                $estadoCot = strtolower(trim((string)($pagoComercial['estado'] ?? $estadoCot)));
                $saldoPendiente = round((float)($pagoComercial['saldo_pendiente'] ?? $saldoPendiente), 2);
            }
        }

        $categoria = 'pendiente_cobro';
        $motivo = 'cotizacion_no_pagada';

        if (in_array($estadoConsulta, ['cancelada', 'cancelado', 'anulada', 'anulado'], true)) {
            $categoria = 'excluida';
            $motivo = 'consulta_cancelada';
        } elseif ($estadoItem === 'eliminado') {
            $categoria = 'excluida';
            $motivo = 'detalle_consulta_eliminado';
        } elseif ($cotizacionId <= 0) {
            $categoria = 'pendiente_cobro';
            $motivo = 'sin_cotizacion_consulta';
        } elseif (in_array($estadoConsulta, ['completada', 'completado'], true) && cierre_estado_cotizacion_pagada($estadoCot)) {
            $categoria = 'pagable';
            $motivo = 'ok_pagable';
        }

        $rows[] = [
            'consulta_id' => (int)($row['consulta_id'] ?? 0),
            'fecha' => (string)($row['fecha'] ?? ''),
            'hora' => (string)($row['hora'] ?? ''),
            'estado_consulta' => (string)($row['estado_consulta'] ?? ''),
            'paciente_nombre' => trim((string)($row['paciente_nombre'] ?? '')),
            'paciente_apellido' => trim((string)($row['paciente_apellido'] ?? '')),
            'detalle_id' => (int)($row['detalle_id'] ?? 0),
            'cotizacion_id' => $cotizacionId,
            'estado_item' => (string)($row['estado_item'] ?? 'activo'),
            'estado_cotizacion' => $estadoCot,
            'saldo_pendiente' => $saldoPendiente,
            'categoria_cierre' => $categoria,
            'motivo' => $motivo,
        ];
    }

    $stmt->close();
    return $rows;
}

if (!isset($_SESSION['usuario']) && !isset($_SESSION['medico_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'No autenticado']);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Metodo no permitido']);
    exit;
}

$medicoId = isset($_GET['medico_id']) ? (int)$_GET['medico_id'] : 0;
$fechaRef = cierre_normalizar_fecha($_GET['fecha'] ?? '');
$incluirDetalle = cierre_bool_param($_GET['incluir_detalle'] ?? '1');

if (cierre_es_sesion_medico()) {
    $medicoSesion = cierre_medico_sesion_id();
    if ($medicoSesion > 0) {
        if ($medicoId > 0 && $medicoId !== $medicoSesion) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'No autorizado para consultar otro medico']);
            exit;
        }
        $medicoId = $medicoSesion;
    }
}

if ($medicoId <= 0) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'medico_id requerido']);
    exit;
}

$stmtMed = $conn->prepare('SELECT id, nombre, apellido, especialidad FROM medicos WHERE id = ? LIMIT 1');
if (!$stmtMed) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'No se pudo preparar medico']);
    exit;
}
$stmtMed->bind_param('i', $medicoId);
$stmtMed->execute();
$medico = $stmtMed->get_result()->fetch_assoc();
$stmtMed->close();

if (!$medico) {
    http_response_code(404);
    echo json_encode(['success' => false, 'error' => 'Medico no encontrado']);
    exit;
}

$detalle = cierre_obtener_detalle($conn, $medicoId, $fechaRef);

$pagables = 0;
$pendientesCobro = 0;
$excluidas = 0;

foreach ($detalle as $item) {
    $cat = $item['categoria_cierre'] ?? '';
    if ($cat === 'pagable') {
        $pagables++;
    } elseif ($cat === 'excluida') {
        $excluidas++;
    } else {
        $pendientesCobro++;
    }
}

$montoFijoConsulta = cierre_obtener_monto_fijo_consulta($conn, $medicoId, $fechaRef);
$montoPagableEstimado = null;
if ($montoFijoConsulta !== null) {
    $montoPagableEstimado = round($montoFijoConsulta * $pagables, 2);
}

$response = [
    'success' => true,
    'fecha_referencia' => $fechaRef,
    'medico' => [
        'id' => (int)$medico['id'],
        'nombre' => trim((string)($medico['nombre'] ?? '')),
        'apellido' => trim((string)($medico['apellido'] ?? '')),
        'especialidad' => (string)($medico['especialidad'] ?? ''),
    ],
    'resumen' => [
        'pagables_hoy' => $pagables,
        'pendientes_cobro_hoy' => $pendientesCobro,
        'excluidas_hoy' => $excluidas,
        'total_consultas_hoy' => count($detalle),
        'monto_fijo_consulta' => $montoFijoConsulta !== null ? round((float)$montoFijoConsulta, 2) : null,
        'monto_pagable_estimado' => $montoPagableEstimado,
    ],
];

if ($incluirDetalle) {
    $response['detalle'] = $detalle;
}

echo json_encode($response);
