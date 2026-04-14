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

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    rc_require_session_roles(['administrador', 'recepcionista']);
    rc_require_schema($conn);

    $dias = rc_parse_positive_int($_GET['dias'] ?? 30, 30);
    if ($dias > 90) $dias = 90;
    $page = rc_parse_positive_int($_GET['page'] ?? 0, 0);
    $perPage = rc_parse_positive_int($_GET['per_page'] ?? 0, 0);
    $usarPaginacion = ($page > 0 && $perPage > 0);
    if ($usarPaginacion && $perPage > 100) $perPage = 100;

    $estadoGestion = trim((string)($_GET['estado_gestion'] ?? ''));
    $busqueda = trim((string)($_GET['busqueda'] ?? ''));
    $soloSinGestion = ((string)($_GET['solo_sin_gestion'] ?? '0') === '1');
    $origenConsulta = trim((string)($_GET['origen_consulta'] ?? ''));

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

    if (in_array($origenConsulta, ['agendada', 'cotizador', 'hc_proxima'], true)) {
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
                    WHEN c.estado = 'falta_cancelar' OR (c.hc_origen_id IS NOT NULL AND c.hc_origen_id > 0) THEN cot_ref.cotizacion_id
                    ELSE NULL
                END AS cotizacion_id,
                CASE
                    WHEN c.estado = 'falta_cancelar' OR (c.hc_origen_id IS NOT NULL AND c.hc_origen_id > 0) THEN cot.estado
                    ELSE NULL
                END AS cotizacion_estado"
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
        ];
    }
    $stmt->close();

    $response = [
        'success' => true,
        'dias' => $dias,
        'count' => count($items),
        'total' => $totalItems,
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

    // ── Flujo normal: guardar gestión de recordatorio ──
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
