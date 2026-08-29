<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/modules/CorrelativoOperativoModule.php';

function mp_table_exists(mysqli $conn, string $table): bool
{
    static $cache = [];
    if (array_key_exists($table, $cache)) {
        return $cache[$table];
    }

    $stmt = $conn->prepare('SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1');
    if (!$stmt) {
        $cache[$table] = false;
        return false;
    }
    $stmt->bind_param('s', $table);
    $stmt->execute();
    $res = $stmt->get_result();
    $exists = $res && $res->num_rows > 0;
    $stmt->close();

    $cache[$table] = $exists;
    return $exists;
}

function mp_column_exists(mysqli $conn, string $table, string $column): bool
{
    static $cache = [];
    $key = $table . '.' . $column;
    if (array_key_exists($key, $cache)) {
        return $cache[$key];
    }

    $stmt = $conn->prepare('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1');
    if (!$stmt) {
        $cache[$key] = false;
        return false;
    }
    $stmt->bind_param('ss', $table, $column);
    $stmt->execute();
    $res = $stmt->get_result();
    $exists = $res && $res->num_rows > 0;
    $stmt->close();

    $cache[$key] = $exists;
    return $exists;
}

function mp_ensure_schema(mysqli $conn): void
{
    if (!mp_table_exists($conn, 'procedimientos_atenciones')) {
        $conn->query("CREATE TABLE procedimientos_atenciones (
            id INT NOT NULL AUTO_INCREMENT,
            cotizacion_detalle_id INT NOT NULL,
            estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
            atendido_en DATETIME NULL,
            atendido_por INT NULL,
            observacion VARCHAR(500) NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_pa_detalle (cotizacion_detalle_id),
            KEY idx_pa_estado (estado),
            KEY idx_pa_atendido_en (atendido_en)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci");
    }
}

function mp_bool_param($raw, bool $default = false): bool
{
    if ($raw === null) return $default;
    $v = strtolower(trim((string)$raw));
    return in_array($v, ['1', 'true', 'yes', 'si', 'sí'], true);
}

function mp_normalize_estado_atencion(string $raw): string
{
    $v = strtolower(trim($raw));
    if (in_array($v, ['atendido', 'atendida', 'completado', 'completada'], true)) return 'atendido';
    if (in_array($v, ['en_proceso', 'proceso', 'iniciado'], true)) return 'en_proceso';
    if (in_array($v, ['no_realizado', 'no realizado', 'omitido'], true)) return 'no_realizado';
    return 'pendiente';
}

function mp_sync_agenda_estado_desde_atencion(mysqli $conn, int $detalleId, string $estadoAtencion, int $usuarioId): void
{
    if ($detalleId <= 0) return;
    if (!mp_table_exists($conn, 'agenda_servicios_cotizacion')) return;
    if (!mp_column_exists($conn, 'agenda_servicios_cotizacion', 'estado_evento')) return;

    $hasAgendaDetalleId = mp_column_exists($conn, 'agenda_servicios_cotizacion', 'cotizacion_detalle_id');
    $hasAgendaCotizacion = mp_column_exists($conn, 'agenda_servicios_cotizacion', 'cotizacion_id');
    $hasAgendaServicioId = mp_column_exists($conn, 'agenda_servicios_cotizacion', 'servicio_id');
    $hasAgendaServicioTipo = mp_column_exists($conn, 'agenda_servicios_cotizacion', 'servicio_tipo');
    $hasAgendaUpdatedBy = mp_column_exists($conn, 'agenda_servicios_cotizacion', 'updated_by');

    $stmtDet = $conn->prepare('SELECT cotizacion_id, servicio_id FROM cotizaciones_detalle WHERE id = ? LIMIT 1');
    if (!$stmtDet) return;
    $stmtDet->bind_param('i', $detalleId);
    $stmtDet->execute();
    $det = $stmtDet->get_result()->fetch_assoc();
    $stmtDet->close();
    if (!$det) return;

    $cotizacionId = (int)($det['cotizacion_id'] ?? 0);
    $servicioId = (int)($det['servicio_id'] ?? 0);
    if ($cotizacionId <= 0) return;

    $nuevoEstadoAgenda = $estadoAtencion === 'atendido' ? 'atendido' : 'confirmado';

    $sets = ['estado_evento = ?'];
    $types = 's';
    $params = [$nuevoEstadoAgenda];
    if ($hasAgendaUpdatedBy && $usuarioId > 0) {
        $sets[] = 'updated_by = ?';
        $types .= 'i';
        $params[] = $usuarioId;
    }

    $where = [];
    if ($hasAgendaDetalleId) {
        $where[] = '(cotizacion_detalle_id = ?)';
        $types .= 'i';
        $params[] = $detalleId;
    }

    if ($hasAgendaCotizacion) {
        $fallback = '(cotizacion_id = ?';
        $types .= 'i';
        $params[] = $cotizacionId;
        if ($hasAgendaServicioId && $servicioId > 0) {
            $fallback .= ' AND servicio_id = ?';
            $types .= 'i';
            $params[] = $servicioId;
        }
        if ($hasAgendaServicioTipo) {
            $fallback .= ' AND LOWER(TRIM(COALESCE(servicio_tipo, ""))) IN ("procedimiento", "procedimientos")';
        }
        $fallback .= ')';
        $where[] = $fallback;
    }

    if (empty($where)) return;

    $sql = 'UPDATE agenda_servicios_cotizacion SET ' . implode(', ', $sets)
        . ' WHERE (' . implode(' OR ', $where) . ')'
        . ' AND LOWER(TRIM(COALESCE(estado_evento, ""))) IN ("pendiente", "confirmado", "atendido")';

    $stmtUp = $conn->prepare($sql);
    if (!$stmtUp) return;
    $stmtUp->bind_param($types, ...$params);
    $stmtUp->execute();
    $stmtUp->close();
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if (!in_array($method, ['GET', 'PUT'], true)) {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Metodo no permitido']);
    exit;
}

$sessionUsuario = $_SESSION['usuario'] ?? null;
$rolSesion = strtolower(trim((string)($sessionUsuario['rol'] ?? '')));
$medicoSesionId = (int)($_SESSION['medico_id'] ?? ($sessionUsuario['medico_id'] ?? ($sessionUsuario['id'] ?? 0)));
$esSesionMedico = ($medicoSesionId > 0) && (
    $rolSesion === 'medico'
    || isset($_SESSION['medico_id'])
);

if (!isset($_SESSION['usuario']) && !isset($_SESSION['medico_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'No autenticado']);
    exit;
}

if (!$esSesionMedico) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'No autorizado']);
    exit;
}

mp_ensure_schema($conn);

if ($method === 'PUT') {
    $raw = json_decode(file_get_contents('php://input'), true);
    $detalleId = (int)($raw['detalle_id'] ?? 0);
    $estadoAtencion = mp_normalize_estado_atencion((string)($raw['estado_atencion'] ?? ''));
    $observacion = trim((string)($raw['observacion'] ?? ''));
    if ($detalleId <= 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'detalle_id requerido']);
        exit;
    }

    $hasCdEstadoItem = mp_column_exists($conn, 'cotizaciones_detalle', 'estado_item');
    $hasCdMedicoId = mp_column_exists($conn, 'cotizaciones_detalle', 'medico_id');
    $hasCdConsultaId = mp_column_exists($conn, 'cotizaciones_detalle', 'consulta_id');

    $sqlAcceso = 'SELECT cd.id'
        . ' FROM cotizaciones_detalle cd'
        . ' INNER JOIN cotizaciones ct ON ct.id = cd.cotizacion_id'
        . ' LEFT JOIN consultas c ON c.id = ' . ($hasCdConsultaId ? 'cd.consulta_id' : 'NULL')
        . ' WHERE cd.id = ?'
        . '   AND LOWER(TRIM(COALESCE(cd.servicio_tipo, ""))) IN ("procedimiento", "procedimientos")'
        . '   AND LOWER(TRIM(COALESCE(ct.estado, ""))) NOT IN ("anulado", "anulada")';
    if ($hasCdEstadoItem) {
        $sqlAcceso .= ' AND LOWER(TRIM(COALESCE(cd.estado_item, "activo"))) <> "eliminado"';
    }
    if ($hasCdMedicoId) {
        $sqlAcceso .= ' AND (COALESCE(cd.medico_id, 0) = ? OR COALESCE(c.medico_id, 0) = ?)';
    } else {
        $sqlAcceso .= ' AND COALESCE(c.medico_id, 0) = ?';
    }
    $sqlAcceso .= ' LIMIT 1';

    $stmtAcceso = $conn->prepare($sqlAcceso);
    if (!$stmtAcceso) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'No se pudo validar acceso']);
        exit;
    }
    if ($hasCdMedicoId) {
        $stmtAcceso->bind_param('iii', $detalleId, $medicoSesionId, $medicoSesionId);
    } else {
        $stmtAcceso->bind_param('ii', $detalleId, $medicoSesionId);
    }
    $stmtAcceso->execute();
    $okRow = $stmtAcceso->get_result()->fetch_assoc();
    $stmtAcceso->close();

    if (!$okRow) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'No autorizado para actualizar este procedimiento']);
        exit;
    }

    if ($observacion === '') {
        $observacion = null;
    } else {
        $observacion = function_exists('mb_substr') ? mb_substr($observacion, 0, 500) : substr($observacion, 0, 500);
    }
    $atendidoEn = $estadoAtencion === 'atendido' ? date('Y-m-d H:i:s') : null;
    $atendidoPor = $estadoAtencion === 'atendido' ? $medicoSesionId : null;

    $sqlUp = 'INSERT INTO procedimientos_atenciones (cotizacion_detalle_id, estado, atendido_en, atendido_por, observacion, updated_at)'
        . ' VALUES (?, ?, ?, ?, ?, NOW())'
        . ' ON DUPLICATE KEY UPDATE'
        . ' estado = VALUES(estado),'
        . ' atendido_en = VALUES(atendido_en),'
        . ' atendido_por = VALUES(atendido_por),'
        . ' observacion = VALUES(observacion),'
        . ' updated_at = NOW()';

    $stmtUp = $conn->prepare($sqlUp);
    if (!$stmtUp) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'No se pudo actualizar estado']);
        exit;
    }
    $stmtUp->bind_param('issis', $detalleId, $estadoAtencion, $atendidoEn, $atendidoPor, $observacion);
    $stmtUp->execute();
    $stmtUp->close();

    mp_sync_agenda_estado_desde_atencion($conn, $detalleId, $estadoAtencion, $medicoSesionId);

    echo json_encode([
        'success' => true,
        'detalle_id' => $detalleId,
        'estado_atencion' => $estadoAtencion,
        'atendido_en' => $atendidoEn,
    ]);
    exit;
}

$page = max(1, (int)($_GET['page'] ?? 1));
$limit = max(1, min(100, (int)($_GET['limit'] ?? 20)));
$offset = ($page - 1) * $limit;
$search = trim((string)($_GET['search'] ?? ''));
$filtroPago = strtolower(trim((string)($_GET['filtro_pago'] ?? 'pagadas')));
$vista = strtolower(trim((string)($_GET['vista'] ?? '')));
$soloHoy = mp_bool_param($_GET['solo_hoy'] ?? null, false);
if ($vista === '') {
    $vista = $soloHoy ? 'hoy' : 'pendientes';
}
$fechaRef = trim((string)($_GET['fecha_ref'] ?? date('Y-m-d')));
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fechaRef)) {
    $fechaRef = date('Y-m-d');
}

$hasCdEstadoItem = mp_column_exists($conn, 'cotizaciones_detalle', 'estado_item');
$hasCdMedicoId = mp_column_exists($conn, 'cotizaciones_detalle', 'medico_id');
$hasCdConsultaId = mp_column_exists($conn, 'cotizaciones_detalle', 'consulta_id');

$where = [];
$params = [];
$types = '';

$where[] = "LOWER(TRIM(COALESCE(cd.servicio_tipo, ''))) IN ('procedimiento', 'procedimientos')";
$where[] = "LOWER(TRIM(COALESCE(ct.estado, ''))) NOT IN ('anulado', 'anulada')";
if ($hasCdEstadoItem) {
    $where[] = "LOWER(TRIM(COALESCE(cd.estado_item, 'activo'))) <> 'eliminado'";
}
$where[] = "LOWER(TRIM(COALESCE(pa.estado, 'pendiente'))) <> 'cancelado'";

if ($hasCdMedicoId) {
    $where[] = '(COALESCE(cd.medico_id, 0) = ? OR COALESCE(c.medico_id, 0) = ?)';
    $params[] = $medicoSesionId;
    $params[] = $medicoSesionId;
    $types .= 'ii';
} else {
    $where[] = 'COALESCE(c.medico_id, 0) = ?';
    $params[] = $medicoSesionId;
    $types .= 'i';
}

if ($filtroPago === 'pagadas') {
    $where[] = "LOWER(TRIM(COALESCE(ct.estado, ''))) IN ('pagado', 'pagada', 'control')";
} elseif ($filtroPago === 'no_pagadas') {
    $where[] = "LOWER(TRIM(COALESCE(ct.estado, ''))) NOT IN ('pagado', 'pagada', 'control')";
}

if ($vista === 'hoy') {
    $where[] = '(COALESCE(c.fecha, DATE(ct.fecha)) = ? OR DATE(ct.fecha) = ?)';
    $params[] = $fechaRef;
    $params[] = $fechaRef;
    $types .= 'ss';
} elseif ($vista === 'atendidos') {
    $where[] = "LOWER(TRIM(COALESCE(pa.estado, 'pendiente'))) = 'atendido'";
} elseif ($vista === 'pendientes') {
    $where[] = "LOWER(TRIM(COALESCE(pa.estado, 'pendiente'))) IN ('pendiente', 'en_proceso')";
}

if ($search !== '') {
    $like = '%' . $search . '%';
    $where[] = '(p.nombre LIKE ? OR p.apellido LIKE ? OR p.dni LIKE ? OR p.historia_clinica LIKE ? OR cd.descripcion LIKE ? OR CAST(ct.id AS CHAR) LIKE ?)';
    $params[] = $like;
    $params[] = $like;
    $params[] = $like;
    $params[] = $like;
    $params[] = $like;
    $params[] = $like;
    $types .= 'ssssss';
}

$whereSql = empty($where) ? '' : (' WHERE ' . implode(' AND ', $where));

$fromSql = ' FROM cotizaciones_detalle cd '
    . 'INNER JOIN cotizaciones ct ON ct.id = cd.cotizacion_id '
    . 'LEFT JOIN procedimientos_atenciones pa ON pa.cotizacion_detalle_id = cd.id '
    . 'LEFT JOIN consultas c ON c.id = cd.consulta_id '
    . 'LEFT JOIN pacientes p ON p.id = COALESCE(c.paciente_id, ct.paciente_id)';

$countSql = 'SELECT COUNT(*) AS total' . $fromSql . $whereSql;
$stmtCount = $conn->prepare($countSql);
if (!$stmtCount) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'No se pudo preparar conteo']);
    exit;
}
if ($types !== '') {
    $stmtCount->bind_param($types, ...$params);
}
$stmtCount->execute();
$total = (int)(($stmtCount->get_result()->fetch_assoc()['total'] ?? 0));
$stmtCount->close();

$selectSql = 'SELECT '
    . 'cd.id AS detalle_id, '
    . 'cd.cotizacion_id, '
    . 'cd.servicio_id, '
    . 'cd.descripcion AS procedimiento_nombre, '
    . 'cd.cantidad, '
    . 'cd.precio_unitario, '
    . 'cd.subtotal, '
    . ($hasCdConsultaId ? 'cd.consulta_id' : 'NULL AS consulta_id') . ', '
    . ($hasCdMedicoId ? 'COALESCE(cd.medico_id, c.medico_id, 0) AS medico_id' : 'COALESCE(c.medico_id, 0) AS medico_id') . ', '
    . ($hasCdEstadoItem ? 'COALESCE(cd.estado_item, "activo") AS estado_item' : '"activo" AS estado_item') . ', '
    . 'COALESCE(pa.estado, "pendiente") AS estado_atencion, '
    . 'pa.atendido_en AS atendido_en, '
    . 'pa.atendido_por AS atendido_por, '
    . 'pa.observacion AS atencion_observacion, '
    . 'ct.estado AS cotizacion_estado, '
    . 'COALESCE(ct.saldo_pendiente, 0) AS saldo_pendiente, '
    . 'ct.fecha AS fecha_cotizacion, '
    . 'c.fecha AS fecha_consulta, '
    . 'c.hora AS hora_consulta, '
    . 'COALESCE(c.estado, "") AS estado_consulta, '
    . 'p.id AS paciente_id, p.nombre AS paciente_nombre, p.apellido AS paciente_apellido, p.dni, p.historia_clinica '
    . $fromSql
    . $whereSql
    . ' ORDER BY COALESCE(c.fecha, DATE(ct.fecha)) DESC, COALESCE(c.hora, TIME(ct.fecha)) DESC, cd.id DESC '
    . ' LIMIT ? OFFSET ?';

$stmt = $conn->prepare($selectSql);
if (!$stmt) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'No se pudo preparar listado']);
    exit;
}

$paramsQuery = $params;
$typesQuery = $types . 'ii';
$paramsQuery[] = $limit;
$paramsQuery[] = $offset;
$stmt->bind_param($typesQuery, ...$paramsQuery);
$stmt->execute();
$res = $stmt->get_result();

$items = [];
while ($row = $res->fetch_assoc()) {
    $items[] = [
        'detalle_id' => (int)($row['detalle_id'] ?? 0),
        'correlativo_atencion' => 0,
        'cotizacion_id' => (int)($row['cotizacion_id'] ?? 0),
        'servicio_id' => (int)($row['servicio_id'] ?? 0),
        'procedimiento_nombre' => (string)($row['procedimiento_nombre'] ?? ''),
        'cantidad' => (int)($row['cantidad'] ?? 0),
        'precio_unitario' => round((float)($row['precio_unitario'] ?? 0), 2),
        'subtotal' => round((float)($row['subtotal'] ?? 0), 2),
        'consulta_id' => (int)($row['consulta_id'] ?? 0),
        'medico_id' => (int)($row['medico_id'] ?? 0),
        'estado_item' => (string)($row['estado_item'] ?? 'activo'),
        'estado_atencion' => mp_normalize_estado_atencion((string)($row['estado_atencion'] ?? 'pendiente')),
        'atendido_en' => (string)($row['atendido_en'] ?? ''),
        'atendido_por' => (int)($row['atendido_por'] ?? 0),
        'atencion_observacion' => (string)($row['atencion_observacion'] ?? ''),
        'cotizacion_estado' => (string)($row['cotizacion_estado'] ?? ''),
        'saldo_pendiente' => round((float)($row['saldo_pendiente'] ?? 0), 2),
        'fecha_cotizacion' => (string)($row['fecha_cotizacion'] ?? ''),
        'fecha_consulta' => (string)($row['fecha_consulta'] ?? ''),
        'hora_consulta' => (string)($row['hora_consulta'] ?? ''),
        'estado_consulta' => (string)($row['estado_consulta'] ?? ''),
        'paciente_id' => (int)($row['paciente_id'] ?? 0),
        'paciente_nombre' => (string)($row['paciente_nombre'] ?? ''),
        'paciente_apellido' => (string)($row['paciente_apellido'] ?? ''),
        'dni' => (string)($row['dni'] ?? ''),
        'historia_clinica' => (string)($row['historia_clinica'] ?? ''),
    ];
}
$stmt->close();

// Paridad con Atenciones: correlativo operativo por agenda (mismo modulo compartido).
if (!empty($items)
    && mp_table_exists($conn, 'agenda_servicios_cotizacion')
    && mp_column_exists($conn, 'agenda_servicios_cotizacion', 'cotizacion_id')
    && mp_column_exists($conn, 'agenda_servicios_cotizacion', 'medico_id')
    && mp_column_exists($conn, 'agenda_servicios_cotizacion', 'fecha_programada')
) {
    $cotizacionIds = [];
    foreach ($items as $it) {
        $cid = (int)($it['cotizacion_id'] ?? 0);
        if ($cid > 0) $cotizacionIds[$cid] = $cid;
    }

    if (!empty($cotizacionIds)) {
        $ids = array_values($cotizacionIds);
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $sqlAgenda = 'SELECT id, cotizacion_id, medico_id, fecha_programada'
            . ' FROM agenda_servicios_cotizacion'
            . ' WHERE cotizacion_id IN (' . $placeholders . ')';
        $stmtAgenda = $conn->prepare($sqlAgenda);
        if ($stmtAgenda) {
            $stmtAgenda->bind_param(str_repeat('i', count($ids)), ...$ids);
            $stmtAgenda->execute();
            $rsAgenda = $stmtAgenda->get_result();

            $agendaRows = [];
            $pairs = [];
            while ($ag = $rsAgenda->fetch_assoc()) {
                $agendaRows[] = $ag;
                $medId = (int)($ag['medico_id'] ?? 0);
                $fechaYmd = trim((string)($ag['fecha_programada'] ?? ''));
                if ($medId > 0 && preg_match('/^\d{4}-\d{2}-\d{2}$/', $fechaYmd)) {
                    $pairs[$medId . '|' . $fechaYmd] = [
                        'medico_id' => $medId,
                        'fecha' => $fechaYmd,
                    ];
                }
            }
            $stmtAgenda->close();

            if (!empty($pairs)) {
                $maps = correlativo_operativo_rank_maps($conn, array_values($pairs));
                $agendaByCotizacion = [];
                foreach ($agendaRows as $ag) {
                    $cotId = (int)($ag['cotizacion_id'] ?? 0);
                    $agendaId = (int)($ag['id'] ?? 0);
                    if ($cotId <= 0 || $agendaId <= 0) continue;
                    $corr = (int)($maps['agenda'][$agendaId] ?? 0);
                    if ($corr <= 0) continue;
                    if (!isset($agendaByCotizacion[$cotId]) || $corr < (int)$agendaByCotizacion[$cotId]) {
                        $agendaByCotizacion[$cotId] = $corr;
                    }
                }

                foreach ($items as &$it) {
                    $cotId = (int)($it['cotizacion_id'] ?? 0);
                    $it['correlativo_atencion'] = (int)($agendaByCotizacion[$cotId] ?? 0);
                }
                unset($it);
            }
        }
    }
}

$statsPagadas = 0;
$statsNoPagadas = 0;
$statsSinConsulta = 0;
$statsPendientes = 0;
$statsAtendidos = 0;
foreach ($items as $it) {
    $estadoCot = strtolower(trim((string)($it['cotizacion_estado'] ?? '')));
    if (in_array($estadoCot, ['pagado', 'pagada', 'control'], true)) {
        $statsPagadas++;
    } else {
        $statsNoPagadas++;
    }
    $estadoAt = mp_normalize_estado_atencion((string)($it['estado_atencion'] ?? 'pendiente'));
    if ($estadoAt === 'atendido') {
        $statsAtendidos++;
    } else {
        $statsPendientes++;
    }
    if ((int)($it['consulta_id'] ?? 0) <= 0) {
        $statsSinConsulta++;
    }
}

echo json_encode([
    'success' => true,
    'items' => $items,
    'pagination' => [
        'page' => $page,
        'limit' => $limit,
        'total' => $total,
        'total_pages' => max(1, (int)ceil($total / max(1, $limit))),
    ],
    'stats' => [
        'pagadas' => $statsPagadas,
        'no_pagadas' => $statsNoPagadas,
        'sin_consulta_asociada' => $statsSinConsulta,
        'pendientes' => $statsPendientes,
        'atendidos' => $statsAtendidos,
    ],
    'filtros' => [
        'vista' => $vista,
        'fecha_ref' => $fechaRef,
    ],
]);
