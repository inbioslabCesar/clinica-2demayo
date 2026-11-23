<?php

require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/db_ocupacional.php';

function out_catalog($code, $payload)
{
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload);
    exit;
}

function bind_params_dynamic_catalog($stmt, $types, $params)
{
    if ($types === '' || empty($params)) {
        return;
    }
    $refs = [];
    foreach ($params as $k => $v) {
        $refs[$k] = &$params[$k];
    }
    array_unshift($refs, $types);
    call_user_func_array([$stmt, 'bind_param'], $refs);
}

function parse_session_permisos_catalog()
{
    $raw = $_SESSION['usuario']['permisos'] ?? [];
    if (is_string($raw)) {
        $decoded = json_decode($raw, true);
        $raw = is_array($decoded) ? $decoded : [];
    }
    if (!is_array($raw)) {
        return [];
    }
    return array_values(array_filter(array_map('strval', $raw), fn($v) => trim($v) !== ''));
}

function require_ocup_permiso_catalog($permiso)
{
    $usuario = $_SESSION['usuario'] ?? null;
    if (!is_array($usuario)) {
        out_catalog(401, ['success' => false, 'error' => 'No autenticado']);
    }

    $rol = strtolower(trim((string)($usuario['rol'] ?? '')));
    if ($rol === 'administrador') {
        return;
    }

    $permisos = parse_session_permisos_catalog();
    if (!in_array('access_salud_ocupacional', $permisos, true) || !in_array($permiso, $permisos, true)) {
        out_catalog(403, ['success' => false, 'error' => 'No autorizado para esta accion']);
    }
}

function table_exists_catalog($conn, $table)
{
    $stmt = $conn->prepare('SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1');
    if (!$stmt) {
        return false;
    }
    $stmt->bind_param('s', $table);
    $stmt->execute();
    $exists = (bool)$stmt->get_result()->fetch_row();
    $stmt->close();
    return $exists;
}

function entity_exists_active_catalog($conn, $table, $id)
{
    $allowed = ['empresas_ocupacionales', 'ocupacional_examenes_generales'];
    if (!in_array($table, $allowed, true)) {
        return false;
    }
    $stmt = $conn->prepare("SELECT 1 FROM {$table} WHERE id = ? AND estado = \"activo\" LIMIT 1");
    if (!$stmt) {
        return false;
    }
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $exists = (bool)$stmt->get_result()->fetch_row();
    $stmt->close();
    return $exists;
}

if (!table_exists_catalog($mysqliOcup, 'ocupacional_catalogo_empresas')) {
    out_catalog(500, [
        'success' => false,
        'error' => 'Falta la tabla ocupacional_catalogo_empresas. Aplicar sql/2026-06-15_ocupacional_fase2_catalogo_empresa_examenes.sql en la base ocupacional.',
    ]);
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    require_ocup_permiso_catalog('gestionar_empresas_ocupacional');

    $accion = trim((string)($_GET['accion'] ?? 'listar'));
    $empresaId = (int)($_GET['empresa_id'] ?? 0);
    $estadoCatalogo = trim((string)($_GET['estado_catalogo'] ?? 'todos'));
    $q = trim((string)($_GET['q'] ?? ''));
    $page = (int)($_GET['page'] ?? 1);
    $perPage = (int)($_GET['per_page'] ?? 50);

    if ($empresaId <= 0) {
        out_catalog(422, ['success' => false, 'error' => 'empresa_id es obligatorio']);
    }
    if (!entity_exists_active_catalog($mysqliOcup, 'empresas_ocupacionales', $empresaId)) {
        out_catalog(404, ['success' => false, 'error' => 'Empresa no encontrada o inactiva']);
    }

    if ($accion === 'impacto') {
        $examenId = (int)($_GET['examen_id'] ?? 0);
        if ($examenId <= 0) {
            out_catalog(422, ['success' => false, 'error' => 'examen_id es obligatorio']);
        }
        if (!entity_exists_active_catalog($mysqliOcup, 'ocupacional_examenes_generales', $examenId)) {
            out_catalog(404, ['success' => false, 'error' => 'Examen no encontrado o inactivo']);
        }

        $stmtImpacto = $mysqliOcup->prepare('SELECT
                                                c.id AS catalogo_id,
                                                c.estado,
                                                (SELECT COUNT(DISTINCT d.protocolo_id)
                                                 FROM ocupacional_protocolo_detalle d
                                                 WHERE d.catalogo_id = c.id) AS protocolos_configurados,
                                                (SELECT COUNT(*)
                                                 FROM ocupacional_protocolo_detalle d
                                                 WHERE d.catalogo_id = c.id) AS montos_configurados,
                                                (SELECT COUNT(*)
                                                 FROM ocupacional_protocolo_condiciones pc
                                                 WHERE pc.catalogo_id = c.id) AS condiciones_configuradas
                                             FROM ocupacional_catalogo_empresas c
                                             WHERE c.empresa_id = ? AND c.examen_id = ?
                                             LIMIT 1');
        if (!$stmtImpacto) {
            out_catalog(500, ['success' => false, 'error' => 'No se pudo consultar impacto del catalogo']);
        }
        $stmtImpacto->bind_param('ii', $empresaId, $examenId);
        $stmtImpacto->execute();
        $impacto = $stmtImpacto->get_result()->fetch_assoc();
        $stmtImpacto->close();

        out_catalog(200, [
            'success' => true,
            'data' => [
                'catalogo_id' => isset($impacto['catalogo_id']) ? (int)$impacto['catalogo_id'] : null,
                'estado' => (string)($impacto['estado'] ?? 'inactivo'),
                'protocolos_configurados' => (int)($impacto['protocolos_configurados'] ?? 0),
                'montos_configurados' => (int)($impacto['montos_configurados'] ?? 0),
                'condiciones_configuradas' => (int)($impacto['condiciones_configuradas'] ?? 0),
            ],
        ]);
    }

    if ($accion !== 'listar') {
        out_catalog(422, ['success' => false, 'error' => 'accion GET no soportada']);
    }

    if (!in_array($estadoCatalogo, ['todos', 'activo', 'inactivo'], true)) {
        out_catalog(422, ['success' => false, 'error' => 'estado_catalogo invalido']);
    }

    $page = max(1, $page);
    $perPage = max(1, min($perPage, 500));
    $offset = ($page - 1) * $perPage;

    $where = [
        'e.estado = "activo"',
    ];
    $types = 'i';
    $params = [$empresaId];

    if ($estadoCatalogo === 'activo') {
        $where[] = 'c.estado = "activo"';
    } elseif ($estadoCatalogo === 'inactivo') {
        $where[] = '(c.id IS NULL OR c.estado = "inactivo")';
    }

    if ($q !== '') {
        $where[] = '(e.codigo LIKE ? OR e.descripcion LIKE ? OR e.grupo LIKE ? OR e.subgrupo LIKE ?)';
        $term = '%' . $q . '%';
        $types .= 'ssss';
        $params[] = $term;
        $params[] = $term;
        $params[] = $term;
        $params[] = $term;
    }

    $whereSql = ' WHERE ' . implode(' AND ', $where);

    $sqlCount = 'SELECT COUNT(*) AS total
                 FROM ocupacional_examenes_generales e
                 LEFT JOIN ocupacional_catalogo_empresas c
                   ON c.examen_id = e.id AND c.empresa_id = ?'
        . $whereSql;

    $stmtCount = $mysqliOcup->prepare($sqlCount);
    if (!$stmtCount) {
        out_catalog(500, ['success' => false, 'error' => 'No se pudo preparar conteo']);
    }
    bind_params_dynamic_catalog($stmtCount, $types, $params);
    $stmtCount->execute();
    $resCount = $stmtCount->get_result();
    $rowCount = $resCount ? $resCount->fetch_assoc() : ['total' => 0];
    $total = (int)($rowCount['total'] ?? 0);
    $stmtCount->close();

    $sql = 'SELECT
              e.id AS examen_id,
              e.codigo,
              e.descripcion,
              e.grupo,
              e.subgrupo,
              e.precio,
              e.estado AS examen_estado,
              c.id AS catalogo_id,
              c.estado AS catalogo_estado,
              c.updated_at AS catalogo_updated_at
            FROM ocupacional_examenes_generales e
            LEFT JOIN ocupacional_catalogo_empresas c
              ON c.examen_id = e.id AND c.empresa_id = ?'
          . $whereSql
          . ' ORDER BY e.grupo ASC, e.subgrupo ASC, e.descripcion ASC, e.id DESC LIMIT ? OFFSET ?';

    $stmt = $mysqliOcup->prepare($sql);
    if (!$stmt) {
        out_catalog(500, ['success' => false, 'error' => 'No se pudo preparar listado']);
    }

    $typesData = $types . 'ii';
    $paramsData = $params;
    $paramsData[] = $perPage;
    $paramsData[] = $offset;

    bind_params_dynamic_catalog($stmt, $typesData, $paramsData);
    $stmt->execute();
    $res = $stmt->get_result();

    $rows = [];
    while ($row = $res->fetch_assoc()) {
        $catalogoEstado = (string)($row['catalogo_estado'] ?? 'inactivo');
        $habilitado = $catalogoEstado === 'activo';
        $rows[] = [
            'examen_id' => (int)$row['examen_id'],
            'codigo' => (string)($row['codigo'] ?? ''),
            'descripcion' => (string)($row['descripcion'] ?? ''),
            'grupo' => (string)($row['grupo'] ?? ''),
            'subgrupo' => (string)($row['subgrupo'] ?? ''),
            'precio' => (float)($row['precio'] ?? 0),
            'examen_estado' => (string)($row['examen_estado'] ?? 'activo'),
            'catalogo_id' => isset($row['catalogo_id']) ? (int)$row['catalogo_id'] : null,
            'catalogo_estado' => $catalogoEstado,
            'habilitado' => $habilitado,
            'catalogo_updated_at' => (string)($row['catalogo_updated_at'] ?? ''),
        ];
    }
    $stmt->close();

    out_catalog(200, [
        'success' => true,
        'data' => $rows,
        'meta' => [
            'page' => $page,
            'per_page' => $perPage,
            'total' => $total,
            'total_pages' => $total > 0 ? (int)ceil($total / $perPage) : 0,
        ],
    ]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    out_catalog(405, ['success' => false, 'error' => 'Metodo no permitido']);
}

require_ocup_permiso_catalog('gestionar_empresas_ocupacional');

$raw = file_get_contents('php://input');
$payload = json_decode($raw, true);
if (!is_array($payload)) {
    $payload = $_POST;
}

$empresaId = (int)($payload['empresa_id'] ?? 0);
$examenId = (int)($payload['examen_id'] ?? 0);
$habilitadoRaw = $payload['habilitado'] ?? null;
$habilitadoValido = is_bool($habilitadoRaw)
    || $habilitadoRaw === 0
    || $habilitadoRaw === 1
    || $habilitadoRaw === '0'
    || $habilitadoRaw === '1'
    || $habilitadoRaw === 'true'
    || $habilitadoRaw === 'false';
$habilitado = $habilitadoRaw === true || $habilitadoRaw === 1 || $habilitadoRaw === '1' || $habilitadoRaw === 'true';
$estado = $habilitado ? 'activo' : 'inactivo';
$usuarioId = isset($_SESSION['usuario']['id']) ? (int)$_SESSION['usuario']['id'] : null;

if ($empresaId <= 0 || $examenId <= 0) {
    out_catalog(422, ['success' => false, 'error' => 'empresa_id y examen_id son obligatorios']);
}
if (!$habilitadoValido) {
    out_catalog(422, ['success' => false, 'error' => 'habilitado debe ser booleano']);
}
if (!entity_exists_active_catalog($mysqliOcup, 'empresas_ocupacionales', $empresaId)) {
    out_catalog(404, ['success' => false, 'error' => 'Empresa no encontrada o inactiva']);
}
if (!entity_exists_active_catalog($mysqliOcup, 'ocupacional_examenes_generales', $examenId)) {
    out_catalog(404, ['success' => false, 'error' => 'Examen no encontrado o inactivo']);
}

$stmtUpsert = $mysqliOcup->prepare('INSERT INTO ocupacional_catalogo_empresas
                                      (empresa_id, examen_id, estado, created_by, updated_by)
                                    VALUES (?, ?, ?, ?, ?)
                                    ON DUPLICATE KEY UPDATE
                                      id = LAST_INSERT_ID(id),
                                      estado = VALUES(estado),
                                      updated_by = VALUES(updated_by),
                                      updated_at = NOW()');
if (!$stmtUpsert) {
    out_catalog(500, ['success' => false, 'error' => 'No se pudo preparar actualizacion del catalogo']);
}
$stmtUpsert->bind_param('iisii', $empresaId, $examenId, $estado, $usuarioId, $usuarioId);
$stmtUpsert->execute();
$catalogoId = (int)$stmtUpsert->insert_id;
$stmtUpsert->close();

out_catalog(200, [
    'success' => true,
    'data' => [
        'catalogo_id' => $catalogoId,
        'empresa_id' => $empresaId,
        'examen_id' => $examenId,
        'estado' => $estado,
        'habilitado' => $habilitado,
    ],
]);
