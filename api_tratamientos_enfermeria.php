<?php
header('Content-Type: application/json; charset=utf-8');

register_shutdown_function(function () {
    $err = error_get_last();
    if (!$err) {
        return;
    }
    $fatalTypes = [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR];
    if (!in_array((int)$err['type'], $fatalTypes, true)) {
        return;
    }
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
    }
    echo json_encode([
        'success' => false,
        'error' => 'Fatal error en api_tratamientos_enfermeria',
        'detail' => (string)($err['message'] ?? ''),
        'file' => basename((string)($err['file'] ?? '')),
        'line' => (int)($err['line'] ?? 0),
    ]);
});

require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/auth_check.php';
require_once __DIR__ . '/config.php';
$tphPath = __DIR__ . '/tratamientos_programacion_helper.php';
if (!is_file($tphPath)) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Falta archivo requerido: tratamientos_programacion_helper.php',
        'detail' => 'Despliegue incompleto en servidor. Subir tratamientos_programacion_helper.php al directorio /sistema/.',
    ]);
    exit;
}
require_once $tphPath;

if (!isset($_SESSION['usuario']) && !isset($_SESSION['medico_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'No autenticado']);
    exit;
}

// ---------------------------------------------------------------------------
// Transiciones de estado permitidas
// ---------------------------------------------------------------------------
const TE_TRANSICIONES = [
    'pendiente'    => ['en_ejecucion', 'suspendido'],
    'en_ejecucion' => ['completado',   'suspendido'],
    'completado'   => [],
    'suspendido'   => ['pendiente'],
];

function te_tabla_existe($conn) {
    $r = $conn->query("SHOW TABLES LIKE 'tratamientos_enfermeria'");
    return $r && $r->num_rows > 0;
}

function te_multidia_disponible($conn) {
    $tItems = $conn->query("SHOW TABLES LIKE 'tratamientos_enfermeria_items'");
    $tDias = $conn->query("SHOW TABLES LIKE 'tratamientos_ejecucion_diaria'");
    return ($tItems && $tItems->num_rows > 0) && ($tDias && $tDias->num_rows > 0);
}

function te_column_exists($conn, $table, $column) {
    $table = trim((string)$table);
    $column = trim((string)$column);
    if ($table === '' || $column === '') return false;
    $sql = "SHOW COLUMNS FROM `" . $conn->real_escape_string($table) . "` LIKE '" . $conn->real_escape_string($column) . "'";
    $r = $conn->query($sql);
    return $r && $r->num_rows > 0;
}

function te_reconciliar_desde_hc($conn) {
    // Fallback de consistencia: si por algún motivo no se creó el registro
    // en el guardado de HC, se reconstruye aquí desde historia_clinica.
    $sql = "INSERT INTO tratamientos_enfermeria
                (consulta_id, paciente_id, receta_snapshot, tratamiento_texto, estado, version_num, creado_en)
            SELECT
                c.id AS consulta_id,
                c.paciente_id,
                COALESCE(JSON_EXTRACT(h.datos, '$.receta'), JSON_ARRAY()) AS receta_snapshot,
                COALESCE(JSON_UNQUOTE(JSON_EXTRACT(h.datos, '$.tratamiento')), '') AS tratamiento_texto,
                'pendiente' AS estado,
                1 AS version_num,
                CURRENT_TIMESTAMP AS creado_en
            FROM consultas c
            INNER JOIN historia_clinica h ON h.consulta_id = c.id
            LEFT JOIN tratamientos_enfermeria te ON te.consulta_id = c.id
            WHERE te.id IS NULL
              AND c.estado <> 'cancelada'
              AND (
                    COALESCE(JSON_LENGTH(JSON_EXTRACT(h.datos, '$.receta')), 0) > 0
                    OR TRIM(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(h.datos, '$.tratamiento')), '')) <> ''
                  )";

    $conn->query($sql);
}

function te_stmt_bind_params($stmt, $types, $params) {
    if (!$stmt) return false;
    if ($types === '' || empty($params)) {
        return true;
    }

    $bind = [$types];
    foreach ($params as $i => $value) {
        $bind[] = &$params[$i];
    }

    return call_user_func_array([$stmt, 'bind_param'], $bind);
}

// ---------------------------------------------------------------------------
$method = $_SERVER['REQUEST_METHOD'];

$debugMode = isset($_GET['debug']) && (string)$_GET['debug'] === '1';

if ($debugMode && $method === 'GET') {
    try {
        $diag = [];
        $diag['php_version'] = PHP_VERSION;
        $diag['has_mbstring'] = function_exists('mb_strtolower');
        $diag['db'] = null;
        $diag['tablas'] = [
            'tratamientos_enfermeria' => te_tabla_existe($conn),
            'multidia_disponible' => te_multidia_disponible($conn),
        ];
        $diag['columnas'] = [
            'te_items.iniciado_en' => te_column_exists($conn, 'tratamientos_enfermeria_items', 'iniciado_en'),
            'te_items.completado_en' => te_column_exists($conn, 'tratamientos_enfermeria_items', 'completado_en'),
        ];

        $rDb = $conn->query('SELECT DATABASE() AS db');
        if ($rDb && $rDb->num_rows > 0) {
            $diag['db'] = $rDb->fetch_assoc()['db'] ?? null;
        }

        $diag['test_query'] = null;
        $testSql = "SELECT te.id
                    FROM tratamientos_enfermeria te
                    INNER JOIN consultas c ON c.id = te.consulta_id
                    INNER JOIN pacientes p ON p.id = te.paciente_id
                    LEFT JOIN medicos m ON m.id = c.medico_id
                    WHERE te.estado IN ('pendiente','en_ejecucion','completado','suspendido')
                    LIMIT 1";
        $stmtTest = $conn->prepare($testSql);
        if ($stmtTest) {
            $okTest = $stmtTest->execute();
            $diag['test_query'] = $okTest ? 'ok' : 'fail_execute';
            $stmtTest->close();
        } else {
            $diag['test_query'] = 'fail_prepare';
            $diag['test_query_error'] = $conn->error;
        }

        echo json_encode(['success' => true, 'debug' => $diag]);
    } catch (Throwable $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Error en debug de api_tratamientos_enfermeria',
            'detail' => $e->getMessage(),
        ]);
    }
    exit;
}

try {

switch ($method) {

    // -----------------------------------------------------------------------
    // GET  — Listar tratamientos
    //
    // Params opcionales:
    //   ?estado=pendiente|en_ejecucion|completado|suspendido   (default: pendiente,en_ejecucion)
    //   ?id=X              — detalle de un registro específico
    //   ?consulta_id=X     — filtrar por consulta
    //   ?paciente_id=X     — filtrar por paciente
    // -----------------------------------------------------------------------
    case 'GET':
        if (!te_tabla_existe($conn)) {
            echo json_encode(['success' => true, 'data' => []]);
            exit;
        }

        tph_ensure_multidia_tables($conn);
        te_reconciliar_desde_hc($conn);
        $hasMultidia = te_multidia_disponible($conn);

        $id          = isset($_GET['id'])          ? (int)$_GET['id']          : 0;
        $consultaId  = isset($_GET['consulta_id']) ? (int)$_GET['consulta_id'] : 0;
        $pacienteId  = isset($_GET['paciente_id']) ? (int)$_GET['paciente_id'] : 0;
        $estadoParam = isset($_GET['estado'])      ? trim($_GET['estado'])      : '';
        $queryParam  = isset($_GET['q'])           ? trim((string)$_GET['q'])   : '';
        $paginate    = isset($_GET['paginate'])    ? ((int)$_GET['paginate'] === 1) : false;
        $page        = isset($_GET['page'])        ? max(1, (int)$_GET['page']) : 1;
        $perPage     = isset($_GET['per_page'])    ? (int)$_GET['per_page'] : 20;
        $perPage     = max(5, min(100, $perPage));
        $offset      = ($page - 1) * $perPage;

        // Construir filtro de estado
        $estadosValidos = ['pendiente', 'en_ejecucion', 'completado', 'suspendido'];
        $estadosFiltro  = [];
        if ($estadoParam !== '') {
            foreach (explode(',', $estadoParam) as $e) {
                $e = trim($e);
                if (in_array($e, $estadosValidos, true)) {
                    $estadosFiltro[] = $e;
                }
            }
        }
        if (empty($estadosFiltro)) {
            $estadosFiltro = ['pendiente', 'en_ejecucion'];
        }

        $placeholders = implode(',', array_fill(0, count($estadosFiltro), '?'));
        $types  = str_repeat('s', count($estadosFiltro));
        $params = $estadosFiltro;

        $where = ["te.estado IN ($placeholders)"];

        if ($id > 0) {
            $where[]  = 'te.id = ?';
            $params[] = $id;
            $types   .= 'i';
        }
        if ($consultaId > 0) {
            $where[]  = 'te.consulta_id = ?';
            $params[] = $consultaId;
            $types   .= 'i';
        }
        if ($pacienteId > 0) {
            $where[]  = 'te.paciente_id = ?';
            $params[] = $pacienteId;
            $types   .= 'i';
        }
        if ($queryParam !== '') {
            $queryLower = function_exists('mb_strtolower')
                ? mb_strtolower($queryParam, 'UTF-8')
                : strtolower($queryParam);
            $q = '%' . $queryLower . '%';
            $where[] = "(
                LOWER(CONCAT_WS(' ',
                    COALESCE(p.nombre, ''),
                    COALESCE(p.apellido, ''),
                    COALESCE(m.nombre, ''),
                    COALESCE(m.apellido, ''),
                    COALESCE(p.historia_clinica, ''),
                    COALESCE(p.dni, ''),
                    COALESCE(te.tratamiento_texto, '')
                )) LIKE ?
            )";
            $params[] = $q;
            $types   .= 's';
        }

        $whereClause = implode(' AND ', $where);

        $extraSelect = '';
        $extraJoin = '';
        if ($hasMultidia) {
                        $extraSelect = ",
                                        COALESCE(md.total_dias, 0) AS total_dias
                                    , COALESCE(md.dias_cerrados, 0) AS dias_cerrados
                                    , COALESCE(md.pendientes_hoy, 0) AS pendientes_hoy
                                    , COALESCE(md.dia_actual, 0) AS dia_actual
                                    , CASE WHEN COALESCE(md.total_dosis_planificadas, 0) > 0
                                                 THEN ROUND((COALESCE(md.total_dosis_resueltas, 0) * 100.0) / md.total_dosis_planificadas, 2)
                                             WHEN COALESCE(md.total_dias, 0) > 0
                                                 THEN ROUND((COALESCE(md.dias_cerrados, 0) * 100.0) / md.total_dias, 2)
                                                 ELSE 0 END AS progreso_pct";
            $extraJoin = "\n                LEFT JOIN (\n                    SELECT\n                        d.tratamiento_id,\n                        COUNT(*) AS total_dias,\n                        SUM(CASE WHEN d.estado_dia IN ('completo','omitido') THEN 1 ELSE 0 END) AS dias_cerrados,\n                        SUM(COALESCE(d.dosis_planificadas, 0)) AS total_dosis_planificadas,\n                        SUM(CASE\n                                WHEN d.estado_dia IN ('completo','omitido')\n                                THEN COALESCE(d.dosis_planificadas, 0)\n                                ELSE LEAST(COALESCE(d.dosis_administradas, 0), COALESCE(d.dosis_planificadas, 0))\n                            END) AS total_dosis_resueltas,\n                        SUM(CASE\n                                WHEN d.fecha_programada = CURDATE() AND d.estado_dia IN ('pendiente','parcial')\n                                THEN GREATEST(COALESCE(d.dosis_planificadas, 0) - COALESCE(d.dosis_administradas, 0), 0)\n                                ELSE 0\n                            END) AS pendientes_hoy,\n                        MIN(CASE WHEN d.estado_dia IN ('pendiente','parcial') THEN d.dia_nro ELSE NULL END) AS dia_actual\n                    FROM tratamientos_ejecucion_diaria d\n                    INNER JOIN tratamientos_enfermeria_items ti ON ti.id = d.tratamiento_item_id\n                    WHERE ti.iniciado_en IS NOT NULL\n                    GROUP BY d.tratamiento_id\n                ) md ON md.tratamiento_id = te.id";
        }

        $sql = "SELECT
                    te.id,
                    te.consulta_id,
                    te.paciente_id,
                    te.receta_snapshot,
                    te.tratamiento_texto,
                    te.estado,
                    te.version_num,
                    te.origen_tratamiento_id,
                    te.creado_en,
                    te.iniciado_en,
                    te.completado_en,
                    te.notas_enfermeria,
                    c.fecha          AS consulta_fecha,
                    c.hora           AS consulta_hora,
                    c.tipo_consulta,
                    c.triaje_realizado,
                    c.clasificacion  AS triaje_clasificacion,
                    p.nombre         AS paciente_nombre,
                    p.apellido       AS paciente_apellido,
                    p.historia_clinica AS paciente_hc,
                    p.dni            AS paciente_dni,
                    m.nombre         AS medico_nombre,
                    m.apellido       AS medico_apellido
                    $extraSelect
                FROM  tratamientos_enfermeria te
                INNER JOIN consultas c  ON c.id  = te.consulta_id
                INNER JOIN pacientes p  ON p.id  = te.paciente_id
                LEFT  JOIN medicos   m  ON m.id  = c.medico_id
                $extraJoin
                WHERE $whereClause
                  AND c.estado <> 'cancelada'
                ORDER BY te.version_num DESC, te.creado_en DESC";

        $totalRows = 0;
        if ($paginate) {
            $sqlCount = "SELECT COUNT(*) AS total
                         FROM tratamientos_enfermeria te
                         INNER JOIN consultas c ON c.id = te.consulta_id
                         INNER JOIN pacientes p ON p.id = te.paciente_id
                         LEFT JOIN medicos m ON m.id = c.medico_id
                         WHERE $whereClause
                           AND c.estado <> 'cancelada'";
            $stmtCount = $conn->prepare($sqlCount);
            if (!$stmtCount) {
                http_response_code(500);
                echo json_encode(['success' => false, 'error' => 'Error al preparar conteo']);
                exit;
            }
            if (!te_stmt_bind_params($stmtCount, $types, $params)) {
                $stmtCount->close();
                http_response_code(500);
                echo json_encode(['success' => false, 'error' => 'Error al bindear parámetros de conteo']);
                exit;
            }
            $stmtCount->execute();
            $totalRows = (int)($stmtCount->get_result()->fetch_assoc()['total'] ?? 0);
            $stmtCount->close();

            $sql .= " LIMIT ? OFFSET ?";
        }

        $stmt = $conn->prepare($sql);
        if (!$stmt) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Error al preparar consulta']);
            exit;
        }

        if ($paginate) {
            $typesExec = $types . 'ii';
            $paramsExec = array_merge($params, [$perPage, $offset]);
            if (!te_stmt_bind_params($stmt, $typesExec, $paramsExec)) {
                $stmt->close();
                http_response_code(500);
                echo json_encode(['success' => false, 'error' => 'Error al bindear parámetros de listado']);
                exit;
            }
        } else {
            if (!te_stmt_bind_params($stmt, $types, $params)) {
                $stmt->close();
                http_response_code(500);
                echo json_encode(['success' => false, 'error' => 'Error al bindear parámetros']);
                exit;
            }
        }
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();

        $totales = [
            'pendiente' => 0,
            'en_ejecucion' => 0,
            'completado' => 0,
            'suspendido' => 0,
            'total' => 0,
        ];

        $sqlTot = "SELECT
                        SUM(CASE WHEN te.estado = 'pendiente' THEN 1 ELSE 0 END) AS pendiente,
                        SUM(CASE WHEN te.estado = 'en_ejecucion' THEN 1 ELSE 0 END) AS en_ejecucion,
                        SUM(CASE WHEN te.estado = 'completado' THEN 1 ELSE 0 END) AS completado,
                        SUM(CASE WHEN te.estado = 'suspendido' THEN 1 ELSE 0 END) AS suspendido,
                        COUNT(*) AS total
                   FROM tratamientos_enfermeria te
                   INNER JOIN consultas c ON c.id = te.consulta_id
                   INNER JOIN pacientes p ON p.id = te.paciente_id
                   LEFT JOIN medicos m ON m.id = c.medico_id
                   WHERE $whereClause
                     AND c.estado <> 'cancelada'";
        $stmtTot = $conn->prepare($sqlTot);
        if ($stmtTot) {
            if (!te_stmt_bind_params($stmtTot, $types, $params)) {
                $stmtTot->close();
                http_response_code(500);
                echo json_encode(['success' => false, 'error' => 'Error al bindear parámetros de totales']);
                exit;
            }
            $stmtTot->execute();
            $tot = $stmtTot->get_result()->fetch_assoc();
            $stmtTot->close();
            if ($tot) {
                $totales = [
                    'pendiente' => (int)($tot['pendiente'] ?? 0),
                    'en_ejecucion' => (int)($tot['en_ejecucion'] ?? 0),
                    'completado' => (int)($tot['completado'] ?? 0),
                    'suspendido' => (int)($tot['suspendido'] ?? 0),
                    'total' => (int)($tot['total'] ?? 0),
                ];
            }
        }

        // Decodificar receta_snapshot de JSON string a array
        foreach ($rows as &$row) {
            if (isset($row['receta_snapshot']) && is_string($row['receta_snapshot'])) {
                $decoded = json_decode($row['receta_snapshot'], true);
                $row['receta_snapshot'] = is_array($decoded) ? $decoded : [];
            } else {
                $row['receta_snapshot'] = [];
            }
            $row['id']           = (int)$row['id'];
            $row['consulta_id']  = (int)$row['consulta_id'];
            $row['paciente_id']  = (int)$row['paciente_id'];
            $row['version_num']  = (int)($row['version_num'] ?? 1);
            $row['origen_tratamiento_id'] = isset($row['origen_tratamiento_id']) ? (int)$row['origen_tratamiento_id'] : null;
            $row['triaje_realizado'] = (bool)($row['triaje_realizado'] ?? false);
            $row['total_dias'] = (int)($row['total_dias'] ?? 0);
            $row['dias_cerrados'] = (int)($row['dias_cerrados'] ?? 0);
            $row['pendientes_hoy'] = (int)($row['pendientes_hoy'] ?? 0);
            $row['dia_actual'] = (int)($row['dia_actual'] ?? 0);
            $row['progreso_pct'] = (float)($row['progreso_pct'] ?? 0);
        }
        unset($row);

        $pagination = [
            'page' => $page,
            'per_page' => $perPage,
            'total' => $paginate ? $totalRows : count($rows),
            'total_pages' => $paginate ? max(1, (int)ceil($totalRows / max(1, $perPage))) : 1,
        ];

        echo json_encode([
            'success' => true,
            'data' => $rows,
            'totales' => $totales,
            'pagination' => $pagination,
        ]);
        break;

    // -----------------------------------------------------------------------
    // PATCH  — Actualizar estado de un tratamiento
    //
    // Body JSON:
    //   { "id": X, "estado": "en_ejecucion|completado|suspendido|pendiente",
    //     "notas_enfermeria": "..." }
    // -----------------------------------------------------------------------
    case 'PATCH':
        if (!te_tabla_existe($conn)) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Módulo no inicializado']);
            exit;
        }

        tph_ensure_multidia_tables($conn);

        $body = json_decode(file_get_contents('php://input'), true);
        $id          = isset($body['id'])     ? (int)$body['id']               : 0;
        $nuevoEstado = isset($body['estado']) ? trim((string)$body['estado'])   : '';
        $notas       = isset($body['notas_enfermeria']) ? trim((string)$body['notas_enfermeria']) : null;

        if ($id <= 0 || $nuevoEstado === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Faltan parámetros: id, estado']);
            exit;
        }

        $estadosValidos = ['pendiente', 'en_ejecucion', 'completado', 'suspendido'];
        if (!in_array($nuevoEstado, $estadosValidos, true)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Estado inválido: ' . $nuevoEstado]);
            exit;
        }

        // Leer estado actual
        $stmtGet = $conn->prepare('SELECT id, estado FROM tratamientos_enfermeria WHERE id = ? LIMIT 1');
        if (!$stmtGet) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Error al leer registro']);
            exit;
        }
        $stmtGet->bind_param('i', $id);
        $stmtGet->execute();
        $current = $stmtGet->get_result()->fetch_assoc();
        $stmtGet->close();

        if (!$current) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Registro no encontrado']);
            exit;
        }

        $estadoActual  = $current['estado'];
        $transPermitidas = TE_TRANSICIONES[$estadoActual] ?? [];
        if (!in_array($nuevoEstado, $transPermitidas, true)) {
            http_response_code(422);
            echo json_encode([
                'success' => false,
                'error'   => "Transición no permitida: $estadoActual → $nuevoEstado",
            ]);
            exit;
        }

        // Determinar timestamps a actualizar
        $iniciadoEn   = null;
        $completadoEn = null;
        $ahora = date('Y-m-d H:i:s');

        if ($nuevoEstado === 'en_ejecucion') {
            http_response_code(422);
            echo json_encode([
                'success' => false,
                'error' => 'Inicie cada medicamento desde el detalle del tratamiento.',
            ]);
            exit;
        } elseif ($nuevoEstado === 'completado') {
            $completadoEn = $ahora;
        }

        // Construir UPDATE dinámico
        $setParts = ['estado = ?'];
        $updTypes = 's';
        $updParams = [$nuevoEstado];

        if ($iniciadoEn !== null) {
            $setParts[]  = 'iniciado_en = ?';
            $updTypes   .= 's';
            $updParams[] = $iniciadoEn;
        }
        if ($completadoEn !== null) {
            $setParts[]  = 'completado_en = ?';
            $updTypes   .= 's';
            $updParams[] = $completadoEn;
        }
        if ($notas !== null && $notas !== '') {
            $setParts[]  = 'notas_enfermeria = ?';
            $updTypes   .= 's';
            $updParams[] = $notas;
        }

        $updTypes   .= 'is';
        $updParams[] = $id;
        $updParams[] = $estadoActual;

        // Concurrencia segura: el cambio solo aplica si el estado actual en DB
        // coincide con el estado leído previamente.
        $sqlUpd = 'UPDATE tratamientos_enfermeria SET ' . implode(', ', $setParts) . ' WHERE id = ? AND estado = ? LIMIT 1';
        $stmtUpd = $conn->prepare($sqlUpd);
        if (!$stmtUpd) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Error al preparar actualización']);
            exit;
        }
        $stmtUpd->bind_param($updTypes, ...$updParams);
        $ok = $stmtUpd->execute();
        $rowsAfectadas = $stmtUpd->affected_rows;
        $stmtUpd->close();

        if (!$ok) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'No se pudo actualizar el registro']);
            exit;
        }

        if ($rowsAfectadas === 0) {
            http_response_code(409);
            echo json_encode([
                'success' => false,
                'error' => 'El estado fue actualizado por otro usuario. Recarga la lista e inténtalo nuevamente.',
            ]);
            exit;
        }

        echo json_encode([
            'success' => true,
            'id'      => $id,
            'estado_anterior' => $estadoActual,
            'estado'  => $nuevoEstado,
        ]);
        break;

    default:
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
}

} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Error interno en api_tratamientos_enfermeria',
        'detail' => $e->getMessage(),
    ]);
}
