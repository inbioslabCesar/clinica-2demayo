<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

function rc_require_session_roles(array $rolesPermitidos) {
    if (!isset($_SESSION['usuario']) || !is_array($_SESSION['usuario'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'No autenticado']);
        exit;
    }

    $rol = trim((string)($_SESSION['usuario']['rol'] ?? ''));
    if (!in_array($rol, $rolesPermitidos, true)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'No autorizado']);
        exit;
    }
}

function rc_column_exists($conn, $table, $column) {
    $stmt = $conn->prepare('SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1');
    if (!$stmt) {
        return false;
    }
    $stmt->bind_param('ss', $table, $column);
    $stmt->execute();
    $res = $stmt->get_result();
    return $res && $res->num_rows > 0;
}

function rc_table_exists($conn, $table) {
    $stmt = $conn->prepare('SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1');
    if (!$stmt) {
        return false;
    }
    $stmt->bind_param('s', $table);
    $stmt->execute();
    $res = $stmt->get_result();
    return $res && $res->num_rows > 0;
}

function rc_require_schema($conn) {
    $missing = [];

    if (!rc_table_exists($conn, 'recordatorios_consultas')) {
        $missing[] = 'recordatorios_consultas';
    }

    $requiredCols = [
        'consultas' => ['origen_creacion', 'es_control', 'hc_origen_id'],
    ];
    foreach ($requiredCols as $table => $columns) {
        foreach ($columns as $column) {
            if (!rc_column_exists($conn, $table, $column)) {
                $missing[] = $table . '.' . $column;
            }
        }
    }

    if (!empty($missing)) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Esquema incompleto para api_recordatorios_citas.php. Ejecuta la migracion de despliegue: sql/2026-04-05_consultas_recordatorios_schema_idempotente.sql',
            'missing_schema' => $missing,
        ]);
        exit;
    }
}

function rc_parse_positive_int($value, $fallback) {
    $v = (int)$value;
    return $v > 0 ? $v : $fallback;
}

function rc_parse_tipo_recordatorio($value) {
    $tipo = strtolower(trim((string)$value));
    if ($tipo === 'falta_cancelar') {
        return 'falta_cancelar';
    }
    return 'citas';
}

function rc_servicio_label($value) {
    $tipo = strtolower(trim((string)$value));
    if ($tipo === 'rayos x' || $tipo === 'rayos_x' || $tipo === 'rx') return 'rayosx';
    if ($tipo === 'operaciones' || $tipo === 'cirugias' || $tipo === 'cirugia') return 'operacion';
    if ($tipo === 'procedimientos') return 'procedimiento';
    return $tipo !== '' ? $tipo : 'otros';
}

function rc_servicios_label($serviciosTipados, $fallback = '') {
    $raw = trim((string)$serviciosTipados);
    if ($raw !== '') {
        $parts = array_values(array_filter(array_map('trim', explode(',', $raw)), static function ($part) {
            return $part !== '';
        }));
        if (!empty($parts)) {
            $labels = [];
            foreach ($parts as $part) {
                $labels[] = rc_servicio_pretty_label($part);
            }
            $labels = array_values(array_unique($labels));
            if (count($labels) === 1) {
                return $labels[0];
            }
            return implode(' + ', $labels);
        }
    }

    return rc_servicio_pretty_label($fallback);
}

function rc_servicio_pretty_label($value) {
    $tipo = rc_servicio_label($value);
    if ($tipo === 'rayosx') return 'Rayos X';
    if ($tipo === 'ecografia') return 'Ecografía';
    if ($tipo === 'laboratorio') return 'Laboratorio';
    if ($tipo === 'farmacia') return 'Farmacia';
    if ($tipo === 'consulta') return 'Consulta';
    if ($tipo === 'procedimiento') return 'Procedimiento';
    if ($tipo === 'operacion') return 'Operación';
    if ($tipo === 'hospitalizacion') return 'Hospitalización';
    return $tipo !== '' ? ucfirst($tipo) : 'Servicio';
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    rc_require_session_roles(['administrador', 'recepcionista']);

    $dias = rc_parse_positive_int($_GET['dias'] ?? 30, 30);
    if ($dias > 365) $dias = 365;
    $page = rc_parse_positive_int($_GET['page'] ?? 0, 0);
    $perPage = rc_parse_positive_int($_GET['per_page'] ?? 0, 0);
    $usarPaginacion = ($page > 0 && $perPage > 0);
    if ($usarPaginacion && $perPage > 100) $perPage = 100;

    $estadoGestion = trim((string)($_GET['estado_gestion'] ?? ''));
    $busqueda = trim((string)($_GET['busqueda'] ?? ''));
    $soloSinGestion = ((string)($_GET['solo_sin_gestion'] ?? '0') === '1');
    $origenConsulta = trim((string)($_GET['origen_consulta'] ?? ''));
    $tipoRecordatorio = rc_parse_tipo_recordatorio($_GET['tipo_recordatorio'] ?? 'citas');

    if ($tipoRecordatorio === 'falta_cancelar') {
        if (!rc_table_exists($conn, 'cotizaciones') || !rc_table_exists($conn, 'pacientes') || !rc_table_exists($conn, 'cotizaciones_detalle')) {
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'error' => 'Esquema incompleto para recordatorios de faltas de pago (cotizaciones/pacientes/detalle).',
            ]);
            exit;
        }

        $hasAtenciones = rc_table_exists($conn, 'atenciones');

        $whereDetalleActivo = rc_column_exists($conn, 'cotizaciones_detalle', 'estado_item')
            ? " AND cd.estado_item <> 'eliminado'"
            : '';

        $where = [
            "LOWER(TRIM(COALESCE(c.estado, ''))) IN ('pendiente', 'parcial')",
            'COALESCE(c.saldo_pendiente, 0) > 0',
            'DATE(c.fecha) >= DATE_SUB(CURDATE(), INTERVAL ? DAY)'
        ];
                if ($hasAtenciones) {
                    $where[] = 'COALESCE(atn.total_pendientes, 0) > 0';
                }

        $types = 'i';
        $params = [$dias];

        if ($busqueda !== '') {
            $where[] = "(
                CONCAT_WS(' ', p.nombre, p.apellido) LIKE ?
                OR p.dni LIKE ?
                OR p.telefono LIKE ?
                OR CAST(c.id AS CHAR) LIKE ?
                OR LOWER(TRIM(COALESCE(srv.servicios_tipos, ''))) LIKE ?
            )";
            $like = '%' . $busqueda . '%';
            $types .= 'sssss';
            $params[] = $like;
            $params[] = $like;
            $params[] = $like;
            $params[] = $like;
            $params[] = $like;
        }

        $whereSql = ' WHERE ' . implode(' AND ', $where);

        $from = " FROM cotizaciones c
                INNER JOIN pacientes p ON p.id = c.paciente_id
                LEFT JOIN (
                    SELECT
                        cd.cotizacion_id,
                        GROUP_CONCAT(DISTINCT LOWER(TRIM(COALESCE(cd.servicio_tipo, ''))) ORDER BY cd.servicio_tipo SEPARATOR ',') AS servicios_tipos
                    FROM cotizaciones_detalle cd
                    WHERE 1=1 {$whereDetalleActivo}
                    GROUP BY cd.cotizacion_id
                ) srv ON srv.cotizacion_id = c.id";

        if ($hasAtenciones) {
            $from .= "
                LEFT JOIN (
                    SELECT a.paciente_id, COUNT(*) AS total_pendientes
                    FROM atenciones a
                    WHERE LOWER(TRIM(COALESCE(a.estado, ''))) = 'pendiente'
                    GROUP BY a.paciente_id
                ) atn ON atn.paciente_id = c.paciente_id";
        }

        $countSql = 'SELECT COUNT(*) AS total' . $from . $whereSql;
        $stmtCount = $conn->prepare($countSql);
        if (!$stmtCount) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'No se pudo preparar conteo de faltas por cancelar']);
            exit;
        }
        $stmtCount->bind_param($types, ...$params);
        $stmtCount->execute();
        $countRow = $stmtCount->get_result()->fetch_assoc() ?: [];
        $stmtCount->close();
        $totalItems = (int)($countRow['total'] ?? 0);

        $sql = "SELECT
                c.id,
                c.paciente_id,
                DATE(c.fecha) AS fecha,
                TIME(c.fecha) AS hora,
                    p.nombre AS paciente_nombre,
                    p.apellido AS paciente_apellido,
                    p.dni AS paciente_dni,
                    p.telefono AS paciente_telefono,
                COALESCE(srv.servicios_tipos, '') AS servicios_tipos,
                c.id AS cotizacion_id,
                c.estado AS cotizacion_estado,
                COALESCE(c.saldo_pendiente, 0) AS saldo_pendiente"
            . $from
            . $whereSql
            . ' ORDER BY c.fecha ASC, c.id ASC';

        $paramsList = $params;
        $typesList = $types;
        if ($usarPaginacion) {
            $offset = ($page - 1) * $perPage;
            $sql .= ' LIMIT ? OFFSET ?';
            $typesList .= 'ii';
            $paramsList[] = $perPage;
            $paramsList[] = $offset;
        }

        $stmt = $conn->prepare($sql);
        if (!$stmt) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'No se pudo preparar listado de faltas por cancelar']);
            exit;
        }
        $stmt->bind_param($typesList, ...$paramsList);
        $stmt->execute();
        $res = $stmt->get_result();

        $items = [];
        while ($row = $res->fetch_assoc()) {
            $items[] = [
                'id' => (int)($row['id'] ?? 0),
                'paciente_id' => (int)($row['paciente_id'] ?? 0),
                'medico_id' => 0,
                'fecha' => (string)($row['fecha'] ?? ''),
                'hora' => (string)($row['hora'] ?? ''),
                'estado_consulta' => 'falta_cancelar',
                'es_control' => 0,
                'hc_origen_id' => 0,
                'tipo_consulta' => 'programada',
                'origen_consulta' => 'cotizacion_saldo_pendiente',
                'recordatorio_tipo' => 'falta_cancelar',
                'servicio_tipo' => rc_servicio_label(explode(',', (string)($row['servicios_tipos'] ?? ''))[0] ?? ''),
                'hc_tiene_registro' => 0,
                'hc_ultima_actualizacion' => null,
                'paciente_nombre' => (string)($row['paciente_nombre'] ?? ''),
                'paciente_apellido' => (string)($row['paciente_apellido'] ?? ''),
                'paciente_dni' => (string)($row['paciente_dni'] ?? ''),
                'paciente_telefono' => (string)($row['paciente_telefono'] ?? ''),
                'medico_nombre' => '',
                'medico_apellido' => '',
                'estado_gestion' => 'pendiente',
                'observacion' => 'Cotización con saldo pendiente por cobrar',
                'fecha_proximo_contacto' => null,
                'fecha_ultimo_contacto' => null,
                'intentos' => 0,
                'gestion_updated_at' => null,
                'cotizacion_id' => (int)($row['cotizacion_id'] ?? 0) > 0 ? (int)$row['cotizacion_id'] : null,
                'cotizacion_estado' => !empty($row['cotizacion_estado']) ? (string)$row['cotizacion_estado'] : null,
                'saldo_pendiente' => round((float)($row['saldo_pendiente'] ?? 0), 2),
            ];
        }
        $stmt->close();

        $response = [
            'success' => true,
            'dias' => $dias,
            'tipo_recordatorio' => $tipoRecordatorio,
            'count' => count($items),
            'total' => $totalItems,
            'stats' => [
                'urgentes' => 0,
                'hoy' => 0,
                'sin_telefono' => 0,
                'confirmadas' => 0,
                'atendidas' => 0,
            ],
            'prioridad' => [
                'critico' => 0,
                'alto' => 0,
                'normal' => (int)$totalItems,
                'bajo' => 0,
                'atendido' => 0,
                'resuelto' => 0,
            ],
            'items' => $items,
        ];
        if ($usarPaginacion) {
            $response['pagination'] = [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $totalItems,
                'total_pages' => max(1, (int)ceil($totalItems / $perPage)),
            ];
        }

        echo json_encode($response);
        exit;
    }

    rc_require_schema($conn);
    $aplicarPaginacionEnMemoria = $usarPaginacion;
    $usarPaginacion = false;

    $from = " FROM consultas c
            INNER JOIN pacientes p ON p.id = c.paciente_id
            INNER JOIN medicos m ON m.id = c.medico_id
            LEFT JOIN recordatorios_consultas rc ON rc.consulta_id = c.id
            LEFT JOIN (
                SELECT h.consulta_id, MAX(h.fecha_registro) AS hc_ultima_actualizacion, 1 AS hc_tiene_registro
                FROM historia_clinica h
                GROUP BY h.consulta_id
            ) hc ON hc.consulta_id = c.id
            LEFT JOIN (
                SELECT cd.consulta_id, MAX(cd.cotizacion_id) AS cotizacion_id
                FROM cotizaciones_detalle cd
                INNER JOIN cotizaciones ct ON ct.id = cd.cotizacion_id
                WHERE cd.consulta_id IS NOT NULL
                  AND cd.consulta_id > 0
                  AND ct.estado NOT IN ('anulado', 'anulada')
                GROUP BY cd.consulta_id
            ) cot_ref ON cot_ref.consulta_id = c.id
            LEFT JOIN cotizaciones cot ON cot.id = cot_ref.cotizacion_id";

    $where = [
        "c.estado IN ('pendiente', 'falta_cancelar', 'completada')",
        'c.fecha >= CURDATE()',
        'c.fecha <= DATE_ADD(CURDATE(), INTERVAL ? DAY)'
    ];
    $types = 'i';
    $params = [$dias];

    if ($estadoGestion !== '') {
        $where[] = 'COALESCE(rc.estado, \'pendiente\') = ?';
        $types .= 's';
        $params[] = $estadoGestion;
    }

    if (in_array($origenConsulta, ['agendada', 'cotizador', 'hc_proxima', 'reservada_sin_turno'], true)) {
        $where[] = 'COALESCE(NULLIF(TRIM(c.origen_creacion), ""), CASE'
              . ' WHEN c.hc_origen_id IS NOT NULL AND c.hc_origen_id > 0 THEN "hc_proxima"'
              . ' WHEN cot_ref.cotizacion_id IS NOT NULL THEN "cotizador"'
              . ' ELSE "agendada"'
              . ' END) = ?';
        $types .= 's';
        $params[] = $origenConsulta;
    }

    if ($soloSinGestion) {
        $where[] = "(rc.id IS NULL OR rc.estado IN ('pendiente', 'no_contesta'))";
    }

    if ($busqueda !== '') {
        $where[] = "(
            CONCAT_WS(' ', p.nombre, p.apellido) LIKE ?
            OR CONCAT_WS(' ', m.nombre, m.apellido) LIKE ?
            OR p.dni LIKE ?
            OR p.telefono LIKE ?
            OR CAST(c.id AS CHAR) LIKE ?
        )";
        $like = '%' . $busqueda . '%';
        $types .= 'sssss';
        $params[] = $like;
        $params[] = $like;
        $params[] = $like;
        $params[] = $like;
        $params[] = $like;
    }

    $whereSql = ' WHERE ' . implode(' AND ', $where);

    $countSql = 'SELECT COUNT(*) AS total' . $from . $whereSql;
    $stmtCount = $conn->prepare($countSql);
    if (!$stmtCount) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'No se pudo preparar conteo de recordatorios']);
        exit;
    }
    $stmtCount->bind_param($types, ...$params);
    $stmtCount->execute();
    $countRow = $stmtCount->get_result()->fetch_assoc() ?: [];
    $stmtCount->close();
    $totalItems = (int)($countRow['total'] ?? 0);

    $statsSql = "SELECT
                SUM(CASE
                    WHEN DATEDIFF(c.fecha, CURDATE()) <= 1
                     AND COALESCE(rc.estado, 'pendiente') IN ('pendiente', 'no_contesta')
                     AND COALESCE(hc.hc_tiene_registro, 0) = 0
                    THEN 1 ELSE 0 END) AS urgentes,
                SUM(CASE
                    WHEN DATEDIFF(c.fecha, CURDATE()) = 0
                    THEN 1 ELSE 0 END) AS hoy,
                SUM(CASE
                    WHEN COALESCE(NULLIF(TRIM(p.telefono), ''), '') = ''
                    THEN 1 ELSE 0 END) AS sin_telefono,
                SUM(CASE
                    WHEN COALESCE(rc.estado, 'pendiente') = 'confirmado'
                    THEN 1 ELSE 0 END) AS confirmadas,
                SUM(CASE
                    WHEN COALESCE(hc.hc_tiene_registro, 0) = 1
                    THEN 1 ELSE 0 END) AS atendidas,
                SUM(CASE
                    WHEN COALESCE(hc.hc_tiene_registro, 0) = 1
                    THEN 1 ELSE 0 END) AS pr_atendido,
                SUM(CASE
                    WHEN COALESCE(hc.hc_tiene_registro, 0) = 0
                     AND COALESCE(rc.estado, 'pendiente') IN ('confirmado', 'cancelado')
                    THEN 1 ELSE 0 END) AS pr_resuelto,
                SUM(CASE
                    WHEN COALESCE(hc.hc_tiene_registro, 0) = 0
                     AND COALESCE(rc.estado, 'pendiente') NOT IN ('confirmado', 'cancelado')
                     AND DATEDIFF(c.fecha, CURDATE()) = 0
                     AND COALESCE(rc.estado, 'pendiente') IN ('pendiente', 'no_contesta')
                    THEN 1 ELSE 0 END) AS pr_critico,
                SUM(CASE
                    WHEN COALESCE(hc.hc_tiene_registro, 0) = 0
                     AND COALESCE(rc.estado, 'pendiente') NOT IN ('confirmado', 'cancelado')
                     AND NOT (
                        DATEDIFF(c.fecha, CURDATE()) = 0
                        AND COALESCE(rc.estado, 'pendiente') IN ('pendiente', 'no_contesta')
                     )
                     AND (
                        (DATEDIFF(c.fecha, CURDATE()) = 1 AND COALESCE(rc.estado, 'pendiente') IN ('pendiente', 'no_contesta'))
                        OR (COALESCE(NULLIF(TRIM(p.telefono), ''), '') = '' AND COALESCE(rc.estado, 'pendiente') <> 'confirmado')
                     )
                    THEN 1 ELSE 0 END) AS pr_alto,
                SUM(CASE
                    WHEN COALESCE(hc.hc_tiene_registro, 0) = 0
                     AND COALESCE(rc.estado, 'pendiente') IN ('pendiente', 'contactado', 'no_contesta', 'reprogramar')
                     AND NOT (
                        DATEDIFF(c.fecha, CURDATE()) = 0
                        AND COALESCE(rc.estado, 'pendiente') IN ('pendiente', 'no_contesta')
                     )
                     AND NOT (
                        (DATEDIFF(c.fecha, CURDATE()) = 1 AND COALESCE(rc.estado, 'pendiente') IN ('pendiente', 'no_contesta'))
                        OR (COALESCE(NULLIF(TRIM(p.telefono), ''), '') = '' AND COALESCE(rc.estado, 'pendiente') <> 'confirmado')
                     )
                    THEN 1 ELSE 0 END) AS pr_normal
            "
        . $from
        . $whereSql;

    $stmtStats = $conn->prepare($statsSql);
    if (!$stmtStats) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'No se pudo preparar estadísticas de recordatorios']);
        exit;
    }
    $stmtStats->bind_param($types, ...$params);
    $stmtStats->execute();
    $statsRow = $stmtStats->get_result()->fetch_assoc() ?: [];
    $stmtStats->close();

    $prAtendido = (int)($statsRow['pr_atendido'] ?? 0);
    $prResuelto = (int)($statsRow['pr_resuelto'] ?? 0);
    $prCritico = (int)($statsRow['pr_critico'] ?? 0);
    $prAlto = (int)($statsRow['pr_alto'] ?? 0);
    $prNormal = (int)($statsRow['pr_normal'] ?? 0);
    $prBajo = max(0, $totalItems - ($prAtendido + $prResuelto + $prCritico + $prAlto + $prNormal));

    $sql = "SELECT
                c.id,
                c.paciente_id,
                c.medico_id,
                c.fecha,
                c.hora,
                c.estado AS estado_consulta,
                c.es_control,
                c.hc_origen_id,
                c.tipo_consulta,
                COALESCE(NULLIF(TRIM(c.origen_creacion), ''), CASE
                    WHEN c.hc_origen_id IS NOT NULL AND c.hc_origen_id > 0 THEN 'hc_proxima'
                    WHEN cot_ref.cotizacion_id IS NOT NULL THEN 'cotizador'
                    ELSE 'agendada'
                END) AS origen_consulta,
                COALESCE(hc.hc_tiene_registro, 0) AS hc_tiene_registro,
                hc.hc_ultima_actualizacion,
                p.nombre AS paciente_nombre,
                p.apellido AS paciente_apellido,
                p.dni AS paciente_dni,
                p.telefono AS paciente_telefono,
                m.nombre AS medico_nombre,
                m.apellido AS medico_apellido,
                COALESCE(rc.estado, 'pendiente') AS estado_gestion,
                COALESCE(rc.observacion, '') AS observacion,
                rc.fecha_proximo_contacto,
                rc.fecha_ultimo_contacto,
                COALESCE(rc.intentos, 0) AS intentos,
                rc.updated_at AS gestion_updated_at,
                CASE
                    WHEN cot_ref.cotizacion_id IS NOT NULL THEN cot_ref.cotizacion_id
                    WHEN c.estado = 'falta_cancelar' OR (c.hc_origen_id IS NOT NULL AND c.hc_origen_id > 0) THEN cot_ref.cotizacion_id
                    ELSE NULL
                END AS cotizacion_id,
                CASE
                    WHEN cot_ref.cotizacion_id IS NOT NULL THEN cot.estado
                    WHEN c.estado = 'falta_cancelar' OR (c.hc_origen_id IS NOT NULL AND c.hc_origen_id > 0) THEN cot.estado
                    ELSE NULL
                END AS cotizacion_estado,
                CASE
                    WHEN cot_ref.cotizacion_id IS NOT NULL THEN COALESCE(cot.saldo_pendiente, 0)
                    WHEN c.estado = 'falta_cancelar' OR (c.hc_origen_id IS NOT NULL AND c.hc_origen_id > 0) THEN COALESCE(cot.saldo_pendiente, 0)
                    ELSE NULL
                END AS saldo_pendiente"
            . $from
            . $whereSql
            . ' ORDER BY c.fecha ASC, c.hora ASC, c.id ASC';

    $paramsList = $params;
    $typesList = $types;
    if ($usarPaginacion) {
        $offset = ($page - 1) * $perPage;
        $sql .= ' LIMIT ? OFFSET ?';
        $typesList .= 'ii';
        $paramsList[] = $perPage;
        $paramsList[] = $offset;
    }

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'No se pudo preparar consulta de recordatorios']);
        exit;
    }

    $stmt->bind_param($typesList, ...$paramsList);
    $stmt->execute();
    $res = $stmt->get_result();

    $items = [];
    while ($row = $res->fetch_assoc()) {
        $items[] = [
            'id' => (int)($row['id'] ?? 0),
            'paciente_id' => (int)($row['paciente_id'] ?? 0),
            'medico_id' => (int)($row['medico_id'] ?? 0),
            'fecha' => (string)($row['fecha'] ?? ''),
            'hora' => (string)($row['hora'] ?? ''),
            'estado_consulta' => (string)($row['estado_consulta'] ?? ''),
            'es_control' => (int)($row['es_control'] ?? 0),
            'hc_origen_id' => (int)($row['hc_origen_id'] ?? 0),
            'tipo_consulta' => (string)($row['tipo_consulta'] ?? ''),
            'origen_consulta' => (string)($row['origen_consulta'] ?? 'agendada'),
            'recordatorio_tipo' => 'cita',
            'servicio_tipo' => 'consulta',
            'hc_tiene_registro' => (int)($row['hc_tiene_registro'] ?? 0),
            'hc_ultima_actualizacion' => $row['hc_ultima_actualizacion'],
            'paciente_nombre' => (string)($row['paciente_nombre'] ?? ''),
            'paciente_apellido' => (string)($row['paciente_apellido'] ?? ''),
            'paciente_dni' => (string)($row['paciente_dni'] ?? ''),
            'paciente_telefono' => (string)($row['paciente_telefono'] ?? ''),
            'medico_nombre' => (string)($row['medico_nombre'] ?? ''),
            'medico_apellido' => (string)($row['medico_apellido'] ?? ''),
            'estado_gestion' => (string)($row['estado_gestion'] ?? 'pendiente'),
            'observacion' => (string)($row['observacion'] ?? ''),
            'fecha_proximo_contacto' => $row['fecha_proximo_contacto'],
            'fecha_ultimo_contacto' => $row['fecha_ultimo_contacto'],
            'intentos' => (int)($row['intentos'] ?? 0),
            'gestion_updated_at' => $row['gestion_updated_at'],
            'cotizacion_id' => isset($row['cotizacion_id']) && (int)$row['cotizacion_id'] > 0 ? (int)$row['cotizacion_id'] : null,
            'cotizacion_estado' => !empty($row['cotizacion_estado']) ? (string)$row['cotizacion_estado'] : null,
            'saldo_pendiente' => isset($row['saldo_pendiente']) ? round((float)$row['saldo_pendiente'], 2) : null,
        ];
    }
    $stmt->close();

    $agendaRows = [];
    $hasAgendaServicios = rc_table_exists($conn, 'agenda_servicios_cotizacion');
    $permitirAgendaPorFiltro = ($origenConsulta === '' || $origenConsulta === 'agendada');
    if ($hasAgendaServicios && $permitirAgendaPorFiltro && ($estadoGestion === '' || $estadoGestion === 'pendiente')) {
        $agendaWhere = [
            "LOWER(TRIM(COALESCE(a.estado_evento, ''))) IN ('pendiente', 'confirmado')",
            'a.fecha_programada >= CURDATE()',
            'a.fecha_programada <= DATE_ADD(CURDATE(), INTERVAL ? DAY)',
        ];
        $agendaTypes = 'i';
        $agendaParams = [$dias];

        if ($busqueda !== '') {
            $agendaWhere[] = "(
                CONCAT_WS(' ', p.nombre, p.apellido) LIKE ?
                OR p.dni LIKE ?
                OR p.telefono LIKE ?
                OR CAST(a.id AS CHAR) LIKE ?
                OR LOWER(TRIM(COALESCE(a.servicio_tipo, ''))) LIKE ?
                OR LOWER(TRIM(COALESCE(a.titulo_evento, ''))) LIKE ?
            )";
            $like = '%' . $busqueda . '%';
            $agendaTypes .= 'ssssss';
            $agendaParams[] = $like;
            $agendaParams[] = $like;
            $agendaParams[] = $like;
            $agendaParams[] = $like;
            $agendaParams[] = $like;
            $agendaParams[] = $like;
        }

        $agendaSql = "SELECT
                a.id,
                a.paciente_id,
            COALESCE(a.medico_id, cd.medico_id, t.medico_id, 0) AS medico_id,
                a.fecha_programada,
                a.hora_programada,
                a.estado_evento,
                a.servicio_tipo,
                a.titulo_evento,
                a.observaciones,
                a.cotizacion_id,
                cot.estado AS cotizacion_estado,
                cot.saldo_pendiente AS saldo_pendiente,
                COALESCE(srv.servicios_tipos, '') AS servicios_tipos,
                p.nombre AS paciente_nombre,
                p.apellido AS paciente_apellido,
                p.dni AS paciente_dni,
                p.telefono AS paciente_telefono,
                COALESCE(m.nombre, md.nombre, mt.nombre, '') AS medico_nombre,
                COALESCE(m.apellido, md.apellido, mt.apellido, '') AS medico_apellido,
                ras.estado AS ras_estado,
                ras.observacion AS ras_observacion,
                ras.intentos AS ras_intentos,
                ras.fecha_ultimo_contacto AS ras_fecha_ultimo_contacto
            FROM agenda_servicios_cotizacion a
            INNER JOIN pacientes p ON p.id = a.paciente_id
            LEFT JOIN cotizaciones_detalle cd ON cd.id = a.cotizacion_detalle_id
            LEFT JOIN tarifas t ON t.id = COALESCE(cd.servicio_id, a.servicio_id)
            LEFT JOIN (
                SELECT
                    cd2.cotizacion_id,
                    GROUP_CONCAT(DISTINCT LOWER(TRIM(COALESCE(cd2.servicio_tipo, ''))) ORDER BY cd2.servicio_tipo SEPARATOR ',') AS servicios_tipos
                FROM cotizaciones_detalle cd2
                WHERE 1=1
                GROUP BY cd2.cotizacion_id
            ) srv ON srv.cotizacion_id = a.cotizacion_id
            LEFT JOIN medicos m ON m.id = a.medico_id
            LEFT JOIN medicos md ON md.id = cd.medico_id
            LEFT JOIN medicos mt ON mt.id = t.medico_id
            LEFT JOIN cotizaciones cot ON cot.id = a.cotizacion_id
            LEFT JOIN recordatorios_agenda_servicios ras ON ras.cotizacion_id = a.cotizacion_id
            WHERE " . implode(' AND ', $agendaWhere) . "
            ORDER BY a.fecha_programada ASC, a.hora_programada ASC, a.id ASC";

        $stmtAgenda = $conn->prepare($agendaSql);
        if ($stmtAgenda) {
            $stmtAgenda->bind_param($agendaTypes, ...$agendaParams);
            $stmtAgenda->execute();
            $resAgenda = $stmtAgenda->get_result();
            while ($row = $resAgenda->fetch_assoc()) {
                $agendaRows[] = [
                    'id' => (int)($row['id'] ?? 0),
                    'paciente_id' => (int)($row['paciente_id'] ?? 0),
                    'medico_id' => (int)($row['medico_id'] ?? 0),
                    'fecha' => (string)($row['fecha_programada'] ?? ''),
                    'hora' => (string)($row['hora_programada'] ?? ''),
                    'estado_consulta' => (string)($row['estado_evento'] ?? 'pendiente'),
                    'es_control' => 0,
                    'hc_origen_id' => 0,
                    'tipo_consulta' => 'programada',
                    'origen_consulta' => 'agenda_servicio',
                    'recordatorio_tipo' => 'cita',
                    'servicio_tipo' => rc_servicio_label((string)($row['servicio_tipo'] ?? 'otros')),
                    'servicios_label' => rc_servicios_label((string)($row['servicios_tipos'] ?? ''), (string)($row['servicio_tipo'] ?? 'otros')),
                    'hc_tiene_registro' => 0,
                    'hc_ultima_actualizacion' => null,
                    'paciente_nombre' => (string)($row['paciente_nombre'] ?? ''),
                    'paciente_apellido' => (string)($row['paciente_apellido'] ?? ''),
                    'paciente_dni' => (string)($row['paciente_dni'] ?? ''),
                    'paciente_telefono' => (string)($row['paciente_telefono'] ?? ''),
                    'medico_nombre' => (string)($row['medico_nombre'] ?? ''),
                    'medico_apellido' => (string)($row['medico_apellido'] ?? ''),
                    'estado_gestion' => (string)($row['ras_estado'] ?? 'pendiente'),
                    'observacion' => (string)($row['ras_observacion'] ?? $row['observaciones'] ?? $row['titulo_evento'] ?? ''),
                    'fecha_proximo_contacto' => null,
                    'fecha_ultimo_contacto' => $row['ras_fecha_ultimo_contacto'] ?? null,
                    'intentos' => (int)($row['ras_intentos'] ?? 0),
                    'gestion_updated_at' => null,
                    'cotizacion_id' => isset($row['cotizacion_id']) && (int)$row['cotizacion_id'] > 0 ? (int)$row['cotizacion_id'] : null,
                    'cotizacion_estado' => !empty($row['cotizacion_estado']) ? (string)$row['cotizacion_estado'] : null,
                    'saldo_pendiente' => isset($row['saldo_pendiente']) ? round((float)$row['saldo_pendiente'], 2) : null,
                ];
            }
            $stmtAgenda->close();
        }
    }

    if (!empty($agendaRows)) {
        $items = array_merge($items, $agendaRows);
        usort($items, function ($a, $b) {
            $fa = (string)($a['fecha'] ?? '');
            $fb = (string)($b['fecha'] ?? '');
            if ($fa !== $fb) return strcmp($fa, $fb);
            $ha = (string)($a['hora'] ?? '');
            $hb = (string)($b['hora'] ?? '');
            if ($ha !== $hb) return strcmp($ha, $hb);
            return ((int)($a['id'] ?? 0)) <=> ((int)($b['id'] ?? 0));
        });
    }

    $totalItems = count($items);
    if ($aplicarPaginacionEnMemoria) {
        $offset = max(0, ($page - 1) * $perPage);
        $items = array_slice($items, $offset, $perPage);
    }

    $response = [
        'success' => true,
        'dias' => $dias,
        'tipo_recordatorio' => $tipoRecordatorio,
        'count' => count($items),
        'total' => $totalItems,
        'stats' => [
            'urgentes' => (int)($statsRow['urgentes'] ?? 0),
            'hoy' => (int)($statsRow['hoy'] ?? 0),
            'sin_telefono' => (int)($statsRow['sin_telefono'] ?? 0),
            'confirmadas' => (int)($statsRow['confirmadas'] ?? 0),
            'atendidas' => (int)($statsRow['atendidas'] ?? 0),
        ],
        'prioridad' => [
            'critico' => $prCritico,
            'alto' => $prAlto,
            'normal' => $prNormal,
            'bajo' => $prBajo,
            'atendido' => $prAtendido,
            'resuelto' => $prResuelto,
        ],
        'items' => $items,
    ];
    if ($aplicarPaginacionEnMemoria) {
        $response['pagination'] = [
            'page' => $page,
            'per_page' => $perPage,
            'total' => $totalItems,
            'total_pages' => max(1, (int)ceil($totalItems / $perPage)),
        ];
    }

    echo json_encode($response);
    exit;
}

if ($method === 'POST' || $method === 'PUT') {
    rc_require_session_roles(['administrador', 'recepcionista']);
    rc_require_schema($conn);

    $payload = json_decode(file_get_contents('php://input'), true);
    if (!is_array($payload)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'JSON invalido']);
        exit;
    }

    // ── Acción especial: crear cotización para consulta falta_cancelar ──
    $accion = trim((string)($payload['action'] ?? ''));
    if ($accion === 'crear_cotizacion') {
        $consultaId = (int)($payload['consulta_id'] ?? 0);
        if ($consultaId <= 0) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'consulta_id requerido']);
            exit;
        }

        $stmtC = $conn->prepare('SELECT id, paciente_id, medico_id, es_control FROM consultas WHERE id = ? LIMIT 1');
        $stmtC->bind_param('i', $consultaId);
        $stmtC->execute();
        $consultaRow = $stmtC->get_result()->fetch_assoc();
        $stmtC->close();

        if (!$consultaRow) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Consulta no encontrada']);
            exit;
        }

        if ((int)($consultaRow['es_control'] ?? 0) === 1) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'La cita está marcada como control sin costo y no requiere cobro']);
            exit;
        }

        $pacienteId = (int)$consultaRow['paciente_id'];
        $medicoId   = (int)$consultaRow['medico_id'];

        // Verificar si ya existe cotización vinculada
        $stmtExist = $conn->prepare(
            'SELECT cd.cotizacion_id FROM cotizaciones_detalle cd'
            . ' INNER JOIN cotizaciones ct ON ct.id = cd.cotizacion_id'
            . ' WHERE cd.consulta_id = ? AND ct.estado NOT IN ("anulado")'
            . ' ORDER BY cd.cotizacion_id DESC LIMIT 1'
        );
        $stmtExist->bind_param('i', $consultaId);
        $stmtExist->execute();
        $existRow = $stmtExist->get_result()->fetch_assoc();
        $stmtExist->close();

        if ($existRow) {
            echo json_encode(['success' => true, 'cotizacion_id' => (int)$existRow['cotizacion_id'], 'ya_existia' => true]);
            exit;
        }

        // Buscar tarifa de consulta para el médico
        $tarifaId     = 0;
        $tarifaPrecio = 0.0;
        $tarifaDesc   = 'Consulta médica';

        $stmtTar = $conn->prepare('SELECT id, precio_particular, descripcion FROM tarifas WHERE servicio_tipo = "consulta" AND activo = 1 AND medico_id = ? ORDER BY id DESC LIMIT 1');
        if ($stmtTar) {
            $stmtTar->bind_param('i', $medicoId);
            $stmtTar->execute();
            $tarRow = $stmtTar->get_result()->fetch_assoc();
            $stmtTar->close();
            if ($tarRow) {
                $tarifaId     = (int)$tarRow['id'];
                $tarifaPrecio = round((float)$tarRow['precio_particular'], 2);
                $tarifaDesc   = trim((string)($tarRow['descripcion'] ?? 'Consulta médica'));
            }
        }
        if ($tarifaId <= 0) {
            $stmtTar2 = $conn->prepare('SELECT id, precio_particular, descripcion FROM tarifas WHERE servicio_tipo = "consulta" AND activo = 1 AND (medico_id IS NULL OR medico_id = 0) ORDER BY id DESC LIMIT 1');
            if ($stmtTar2) {
                $stmtTar2->execute();
                $tarRow2 = $stmtTar2->get_result()->fetch_assoc();
                $stmtTar2->close();
                if ($tarRow2) {
                    $tarifaId     = (int)$tarRow2['id'];
                    $tarifaPrecio = round((float)$tarRow2['precio_particular'], 2);
                    $tarifaDesc   = trim((string)($tarRow2['descripcion'] ?? 'Consulta médica'));
                }
            }
        }

        if ($tarifaId <= 0 || $tarifaPrecio <= 0) {
            http_response_code(422);
            echo json_encode(['success' => false, 'error' => 'No se encontró tarifa de consulta activa para este médico']);
            exit;
        }

        $usuarioId = (int)($_SESSION['usuario']['id'] ?? 1);
        $obs = 'Próxima cita desde Historia Clínica';
        $stmtCot = $conn->prepare('INSERT INTO cotizaciones (paciente_id, usuario_id, total, saldo_pendiente, estado, observaciones) VALUES (?, ?, ?, ?, "pendiente", ?)');
        if (!$stmtCot) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'No se pudo crear cotización']);
            exit;
        }
        $stmtCot->bind_param('iidds', $pacienteId, $usuarioId, $tarifaPrecio, $tarifaPrecio, $obs);
        $stmtCot->execute();
        $cotizacionId = (int)$stmtCot->insert_id;
        $stmtCot->close();

        if ($cotizacionId <= 0) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Error al insertar cotización']);
            exit;
        }

        $stmtDet = $conn->prepare('INSERT INTO cotizaciones_detalle (cotizacion_id, servicio_tipo, servicio_id, descripcion, cantidad, precio_unitario, subtotal, medico_id, consulta_id) VALUES (?, "consulta", ?, ?, 1, ?, ?, ?, ?)');
        if ($stmtDet) {
            $stmtDet->bind_param('iisddii', $cotizacionId, $tarifaId, $tarifaDesc, $tarifaPrecio, $tarifaPrecio, $medicoId, $consultaId);
            $stmtDet->execute();
            $stmtDet->close();
        }

        echo json_encode(['success' => true, 'cotizacion_id' => $cotizacionId, 'ya_existia' => false]);
        exit;
    }

    // ── Acción nueva: guardar gestión para servicios agendados (agenda_servicios_cotizacion) ──
    if ($accion === 'guardar_gestion_agenda') {
        $cotizacionId = (int)($payload['cotizacion_id'] ?? 0);
        $estado = trim((string)($payload['estado'] ?? ''));
        $observacion = trim((string)($payload['observacion'] ?? ''));
        $fechaProximoContacto = trim((string)($payload['fecha_proximo_contacto'] ?? ''));

        if ($cotizacionId <= 0 || $estado === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'cotizacion_id y estado son requeridos']);
            exit;
        }

        $estadosPermitidos = ['pendiente', 'contactado', 'confirmado', 'no_contesta', 'reprogramar', 'cancelado'];
        if (!in_array($estado, $estadosPermitidos, true)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Estado de gestion no permitido']);
            exit;
        }

        // Verificar que la cotización existe
        $stmtCot = $conn->prepare('SELECT id FROM cotizaciones WHERE id = ? LIMIT 1');
        $stmtCot->bind_param('i', $cotizacionId);
        $stmtCot->execute();
        $cotizacionExiste = $stmtCot->get_result()->fetch_assoc();
        $stmtCot->close();

        if (!$cotizacionExiste) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Cotización no encontrada']);
            exit;
        }

        // Verificar que existen items pendiente/confirmado de agenda para esa cotización
        $stmtAgenda = $conn->prepare('SELECT id FROM agenda_servicios_cotizacion WHERE cotizacion_id = ? AND estado_evento IN ("pendiente", "confirmado") LIMIT 1');
        $stmtAgenda->bind_param('i', $cotizacionId);
        $stmtAgenda->execute();
        $agendaExiste = $stmtAgenda->get_result()->fetch_assoc();
        $stmtAgenda->close();

        if (!$agendaExiste) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'No hay servicios agendados pendientes para esta cotización']);
            exit;
        }

        $usuarioId = (int)($_SESSION['usuario']['id'] ?? 0);
        $fechaProximoValue = null;
        if ($fechaProximoContacto !== '') {
            $ts = strtotime($fechaProximoContacto);
            if ($ts !== false) {
                $fechaProximoValue = date('Y-m-d H:i:s', $ts);
            }
        }

        $sumarIntento = in_array($estado, ['contactado', 'confirmado', 'no_contesta', 'reprogramar'], true) ? 1 : 0;

        $sql = 'INSERT INTO recordatorios_agenda_servicios (cotizacion_id, estado, observacion, fecha_proximo_contacto, fecha_ultimo_contacto, intentos, actualizado_por)
                VALUES (?, ?, ?, ?, NOW(), ?, ?)
                ON DUPLICATE KEY UPDATE
                  estado = VALUES(estado),
                  observacion = VALUES(observacion),
                  fecha_proximo_contacto = VALUES(fecha_proximo_contacto),
                  fecha_ultimo_contacto = NOW(),
                  intentos = intentos + VALUES(intentos),
                  actualizado_por = VALUES(actualizado_por),
                  updated_at = CURRENT_TIMESTAMP';

        $stmt = $conn->prepare($sql);
        if (!$stmt) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'No se pudo preparar actualizacion']);
            exit;
        }

        $stmt->bind_param('isssii', $cotizacionId, $estado, $observacion, $fechaProximoValue, $sumarIntento, $usuarioId);
        $ok = $stmt->execute();
        $stmt->close();

        if (!$ok) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'No se pudo guardar gestion']);
            exit;
        }

        echo json_encode([
            'success' => true,
            'saved' => [
                'cotizacion_id' => $cotizacionId,
                'estado' => $estado,
                'observacion' => $observacion,
                'fecha_proximo_contacto' => $fechaProximoValue,
                'sumar_intento' => $sumarIntento,
            ],
        ]);
        exit;
    }

    // ── Acción nueva: reprogramar servicios agendados a nueva fecha/hora ──
    if ($accion === 'reprogramar_agenda_servicio') {
        $cotizacionId = (int)($payload['cotizacion_id'] ?? 0);
        $nuevaFecha = trim((string)($payload['nueva_fecha'] ?? ''));
        $nuevaHora = trim((string)($payload['nueva_hora'] ?? ''));

        if ($cotizacionId <= 0 || $nuevaFecha === '' || $nuevaHora === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'cotizacion_id, nueva_fecha y nueva_hora son requeridos']);
            exit;
        }

        // Validar formato de fecha
        $dateCheck = \DateTime::createFromFormat('Y-m-d', $nuevaFecha);
        if (!$dateCheck || $dateCheck->format('Y-m-d') !== $nuevaFecha) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Formato de fecha inválido (esperado: YYYY-MM-DD)']);
            exit;
        }

        // Normalizar hora: si es "HH:MM", agregar ":00"
        if (strlen($nuevaHora) === 5 && substr_count($nuevaHora, ':') === 1) {
            $nuevaHora = $nuevaHora . ':00';
        }

        // Validar formato de hora
        $timeCheck = \DateTime::createFromFormat('H:i:s', $nuevaHora);
        if (!$timeCheck || $timeCheck->format('H:i:s') !== $nuevaHora) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Formato de hora inválido (esperado: HH:MM:SS)']);
            exit;
        }

        // Verificar que existen items pendiente/confirmado para esa cotización
        $stmtAgenda = $conn->prepare('SELECT DISTINCT medico_id FROM agenda_servicios_cotizacion WHERE cotizacion_id = ? AND estado_evento IN ("pendiente", "confirmado") LIMIT 1');
        $stmtAgenda->bind_param('i', $cotizacionId);
        $stmtAgenda->execute();
        $agendaRow = $stmtAgenda->get_result()->fetch_assoc();
        $stmtAgenda->close();

        if (!$agendaRow) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'No hay servicios agendados pendientes para esta cotización']);
            exit;
        }

        $medicoId = (int)($agendaRow['medico_id'] ?? 0);

        // Detectar conflicto: si hay médico asignado, verificar que no hay otra cita a esa hora
        if ($medicoId > 0) {
            $stmtConflicto = $conn->prepare(
                'SELECT id FROM agenda_servicios_cotizacion 
                 WHERE medico_id = ? 
                 AND fecha_programada = ? 
                 AND hora_programada = ? 
                 AND cotizacion_id <> ? 
                 AND estado_evento NOT IN ("cancelado", "no_asistio") 
                 LIMIT 1'
            );
            $stmtConflicto->bind_param('issi', $medicoId, $nuevaFecha, $nuevaHora, $cotizacionId);
            $stmtConflicto->execute();
            $conflicto = $stmtConflicto->get_result()->fetch_assoc();
            $stmtConflicto->close();

            if ($conflicto) {
                echo json_encode([
                    'success' => false,
                    'error' => 'El médico ya tiene una cita en ese horario',
                ]);
                exit;
            }
        }

        // Actualizar los items de agenda
        $stmtUpdate = $conn->prepare(
            'UPDATE agenda_servicios_cotizacion 
             SET fecha_programada = ?, hora_programada = ?, estado_evento = "pendiente", updated_by = ? 
             WHERE cotizacion_id = ? AND estado_evento IN ("pendiente", "confirmado")'
        );
        $usuarioId = (int)($_SESSION['usuario']['id'] ?? 0);
        $stmtUpdate->bind_param('ssii', $nuevaFecha, $nuevaHora, $usuarioId, $cotizacionId);
        $ok = $stmtUpdate->execute();
        $stmtUpdate->close();

        if (!$ok) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'No se pudo actualizar la programación']);
            exit;
        }

        // UPSERT en recordatorios_agenda_servicios
        $observacionReprog = sprintf('Cita reprogramada para %s a las %s', $nuevaFecha, substr($nuevaHora, 0, 5));
        $stmtRecordatorio = $conn->prepare(
            'INSERT INTO recordatorios_agenda_servicios (cotizacion_id, estado, observacion, fecha_ultimo_contacto, intentos, actualizado_por)
             VALUES (?, "pendiente", ?, NOW(), 1, ?)
             ON DUPLICATE KEY UPDATE
               estado = "pendiente",
               observacion = ?,
               fecha_ultimo_contacto = NOW(),
               actualizado_por = ?,
               updated_at = CURRENT_TIMESTAMP'
        );
        $stmtRecordatorio->bind_param('issi', $cotizacionId, $observacionReprog, $usuarioId, $observacionReprog, $usuarioId);
        $okRec = $stmtRecordatorio->execute();
        $stmtRecordatorio->close();

        if (!$okRec) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Se actualizó la programación pero no se pudo guardar el recordatorio']);
            exit;
        }

        echo json_encode([
            'success' => true,
            'reprogramada_fecha' => $nuevaFecha,
            'reprogramada_hora' => substr($nuevaHora, 0, 5),
            'observacion' => $observacionReprog,
        ]);
        exit;
    }

    // ── Flujo normal: guardar gestión de recordatorio para CONSULTAS ──
    $consultaId = (int)($payload['consulta_id'] ?? 0);
    $estado = trim((string)($payload['estado'] ?? ''));
    $observacion = trim((string)($payload['observacion'] ?? ''));
    $fechaProximoContacto = trim((string)($payload['fecha_proximo_contacto'] ?? ''));

    if ($consultaId <= 0 || $estado === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'consulta_id y estado son requeridos']);
        exit;
    }

    $estadosPermitidos = ['pendiente', 'contactado', 'confirmado', 'no_contesta', 'reprogramar', 'cancelado'];
    if (!in_array($estado, $estadosPermitidos, true)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Estado de gestion no permitido']);
        exit;
    }

    $stmtConsulta = $conn->prepare('SELECT id FROM consultas WHERE id = ? LIMIT 1');
    $stmtConsulta->bind_param('i', $consultaId);
    $stmtConsulta->execute();
    $consultaExiste = $stmtConsulta->get_result()->fetch_assoc();
    $stmtConsulta->close();

    if (!$consultaExiste) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Consulta no encontrada']);
        exit;
    }

    $usuarioId = (int)($_SESSION['usuario']['id'] ?? 0);
    $fechaProximoValue = null;
    if ($fechaProximoContacto !== '') {
        $ts = strtotime($fechaProximoContacto);
        if ($ts !== false) {
            $fechaProximoValue = date('Y-m-d H:i:s', $ts);
        }
    }

    $sumarIntento = in_array($estado, ['contactado', 'confirmado', 'no_contesta', 'reprogramar'], true) ? 1 : 0;

    $sql = 'INSERT INTO recordatorios_consultas (consulta_id, estado, observacion, fecha_proximo_contacto, fecha_ultimo_contacto, intentos, actualizado_por)
            VALUES (?, ?, ?, ?, NOW(), ?, ?)
            ON DUPLICATE KEY UPDATE
              estado = VALUES(estado),
              observacion = VALUES(observacion),
              fecha_proximo_contacto = VALUES(fecha_proximo_contacto),
              fecha_ultimo_contacto = NOW(),
              intentos = intentos + VALUES(intentos),
              actualizado_por = VALUES(actualizado_por),
              updated_at = CURRENT_TIMESTAMP';

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'No se pudo preparar actualizacion']);
        exit;
    }

    $stmt->bind_param('isssii', $consultaId, $estado, $observacion, $fechaProximoValue, $sumarIntento, $usuarioId);
    $ok = $stmt->execute();
    $stmt->close();

    if (!$ok) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'No se pudo guardar gestion']);
        exit;
    }

    echo json_encode([
        'success' => true,
        'saved' => [
            'consulta_id' => $consultaId,
            'estado' => $estado,
            'observacion' => $observacion,
            'fecha_proximo_contacto' => $fechaProximoValue,
            'sumar_intento' => $sumarIntento,
        ],
    ]);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'error' => 'Metodo no permitido']);
