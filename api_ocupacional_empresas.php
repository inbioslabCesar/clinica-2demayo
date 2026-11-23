<?php

require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/db_ocupacional.php';
require_once __DIR__ . '/modules/OcupacionalSecretos.php';

function out($code, $payload)
{
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload);
    exit;
}

function bindParamsDynamic($stmt, $types, $params)
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

function parseSessionPermisos()
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

function requireOcupPermiso($permiso)
{
    $usuario = $_SESSION['usuario'] ?? null;
    if (!is_array($usuario)) {
        out(401, ['success' => false, 'error' => 'No autenticado']);
    }
    $rol = strtolower(trim((string) ($usuario['rol'] ?? '')));
    if ($rol === 'administrador') {
        return;
    }
    $permisos = parseSessionPermisos();
    if (!in_array('access_salud_ocupacional', $permisos, true) || !in_array($permiso, $permisos, true)) {
        out(403, ['success' => false, 'error' => 'No autorizado para esta accion']);
    }
}

function parseBoolValue($value)
{
    if (is_bool($value)) {
        return $value;
    }
    $normalized = strtolower(trim((string) $value));
    return in_array($normalized, ['1', 'true', 'si', 'yes', 'on'], true);
}

function obtenerDependenciasEmpresaActivas($conn, $empresaId)
{
    $counts = [
        'trabajadores_activos' => 0,
        'protocolos_activos' => 0,
        'ordenes_emitidas_o_en_proceso' => 0,
    ];

    $stmtTrab = $conn->prepare('SELECT COUNT(*) AS total FROM pacientes_ocupacionales WHERE empresa_id = ? AND estado_laboral = "activo"');
    if (!$stmtTrab) {
        out(500, ['success' => false, 'error' => 'No se pudo validar dependencias de trabajadores']);
    }
    $stmtTrab->bind_param('i', $empresaId);
    $stmtTrab->execute();
    $rowTrab = $stmtTrab->get_result()->fetch_assoc();
    $counts['trabajadores_activos'] = (int) ($rowTrab['total'] ?? 0);
    $stmtTrab->close();

    $stmtProt = $conn->prepare('SELECT COUNT(*) AS total FROM ocupacional_protocolos_empresa WHERE empresa_id = ? AND estado = "activo"');
    if (!$stmtProt) {
        out(500, ['success' => false, 'error' => 'No se pudo validar dependencias de protocolos']);
    }
    $stmtProt->bind_param('i', $empresaId);
    $stmtProt->execute();
    $rowProt = $stmtProt->get_result()->fetch_assoc();
    $counts['protocolos_activos'] = (int) ($rowProt['total'] ?? 0);
    $stmtProt->close();

    $stmtOrd = $conn->prepare('SELECT COUNT(*) AS total FROM ocupacional_ordenes WHERE empresa_id = ? AND estado IN ("emitida", "en_proceso")');
    if (!$stmtOrd) {
        out(500, ['success' => false, 'error' => 'No se pudo validar dependencias de ordenes']);
    }
    $stmtOrd->bind_param('i', $empresaId);
    $stmtOrd->execute();
    $rowOrd = $stmtOrd->get_result()->fetch_assoc();
    $counts['ordenes_emitidas_o_en_proceso'] = (int) ($rowOrd['total'] ?? 0);
    $stmtOrd->close();

    return $counts;
}

function construirDiagnosticoInactivacion($estadoActual, $dependencias)
{
    $bloqueos = [
        'trabajadores_activos' => (int) ($dependencias['trabajadores_activos'] ?? 0),
        'protocolos_activos' => (int) ($dependencias['protocolos_activos'] ?? 0),
        'ordenes_emitidas_o_en_proceso' => (int) ($dependencias['ordenes_emitidas_o_en_proceso'] ?? 0),
    ];

    $puedeInactivar = array_sum($bloqueos) === 0;
    $recomendacion = $puedeInactivar
        ? 'Puede inactivar la empresa sin riesgo operativo inmediato.'
        : 'Primero cierre dependencias activas (trabajadores/protocolos/ordenes) o use force con aprobacion operativa.';

    return [
        'estado_actual' => (string) $estadoActual,
        'puede_inactivar' => $puedeInactivar,
        'bloqueos' => $bloqueos,
        'recomendacion' => $recomendacion,
    ];
}

function empresaColumnExists($conn, $columnName)
{
    static $cache = [];
    if (array_key_exists($columnName, $cache)) {
        return $cache[$columnName];
    }

    $stmt = $conn->prepare('SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = "empresas_ocupacionales" AND column_name = ? LIMIT 1');
    if (!$stmt) {
        $cache[$columnName] = false;
        return false;
    }
    $stmt->bind_param('s', $columnName);
    $stmt->execute();
    $exists = $stmt->get_result()->fetch_assoc() ? true : false;
    $stmt->close();
    $cache[$columnName] = $exists;
    return $exists;
}

function buildEmpresaOptionalSelectColumns($conn)
{
    $optional = [
        'nombre_comercial',
        'actividad',
        'departamento',
        'provincia',
        'distrito',
        'telefono_1',
        'telefono_2',
        'contacto_1',
        'contacto_2',
        'correo_1',
        'correo_2',
        'rrhh_usuario',
        'rrhh_password',
        'doctor_usuario',
        'doctor_password',
        'formato_principal',
        'formato_certificado',
        'observacion',
    ];

    $available = [];
    foreach ($optional as $col) {
        if (empresaColumnExists($conn, $col)) {
            $available[] = $col;
        }
    }

    return $available;
}

function requireEmpresaLegacySchema($conn)
{
    $required = [
        'nombre_comercial',
        'actividad',
        'departamento',
        'provincia',
        'distrito',
        'telefono_1',
        'telefono_2',
        'contacto_1',
        'contacto_2',
        'correo_1',
        'correo_2',
        'rrhh_usuario',
        'rrhh_password',
        'doctor_usuario',
        'doctor_password',
        'formato_principal',
        'formato_certificado',
        'observacion',
    ];

    $missing = [];
    foreach ($required as $col) {
        if (!empresaColumnExists($conn, $col)) {
            $missing[] = $col;
        }
    }

    if (!empty($missing)) {
        out(500, [
            'success' => false,
            'error' => 'Faltan columnas de paridad legacy en empresas_ocupacionales. Ejecute migracion 20260723_0005_salud_ocupacional_empresa_campos_legacy.sql',
            'data' => [
                'missing_columns' => $missing,
            ],
        ]);
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    requireOcupPermiso('gestionar_empresas_ocupacional');

    $accion = trim((string) ($_GET['accion'] ?? 'listar'));
    $estado = trim((string) ($_GET['estado'] ?? 'activo'));
    if ($accion === 'catalogo') {
        if ($estado !== 'activo' && $estado !== 'inactivo' && $estado !== 'todos') {
            out(422, ['success' => false, 'error' => 'Filtro estado invalido']);
        }

        $whereCatalogo = $estado === 'todos' ? '' : ' WHERE estado = ?';
        $stmtCatalogo = $mysqliOcup->prepare(
            'SELECT id, ruc, razon_social, estado FROM empresas_ocupacionales'
            . $whereCatalogo
            . ' ORDER BY razon_social ASC, id DESC'
        );
        if (!$stmtCatalogo) {
            out(500, ['success' => false, 'error' => 'No se pudo preparar catalogo de empresas']);
        }
        if ($estado !== 'todos') {
            $stmtCatalogo->bind_param('s', $estado);
        }
        $stmtCatalogo->execute();
        $resCatalogo = $stmtCatalogo->get_result();
        $rowsCatalogo = [];
        while ($row = $resCatalogo->fetch_assoc()) {
            $rowsCatalogo[] = [
                'id' => (int) $row['id'],
                'ruc' => (string) $row['ruc'],
                'razon_social' => (string) $row['razon_social'],
                'estado' => (string) $row['estado'],
            ];
        }
        $stmtCatalogo->close();
        out(200, ['success' => true, 'data' => $rowsCatalogo]);
    }

    $q = trim((string) ($_GET['q'] ?? ''));
    $page = (int) ($_GET['page'] ?? 1);
    $perPage = (int) ($_GET['per_page'] ?? 20);
    $sortByRaw = trim((string) ($_GET['sort_by'] ?? 'razon_social'));
    $sortDirRaw = strtolower(trim((string) ($_GET['sort_dir'] ?? 'asc')));
    $page = max(1, $page);
    $perPage = max(1, min($perPage, 500));
    $offset = ($page - 1) * $perPage;

    $sortMap = [
        'razon_social' => 'razon_social',
        'ruc' => 'ruc',
        'estado' => 'estado',
        'actividad' => 'actividad',
        'created_at' => 'created_at',
    ];
    $sortBy = $sortMap[$sortByRaw] ?? 'razon_social';
    if ($sortBy === 'actividad' && !empresaColumnExists($mysqliOcup, 'actividad')) {
        $sortBy = 'razon_social';
    }
    $sortDir = $sortDirRaw === 'desc' ? 'DESC' : 'ASC';

    if ($estado !== 'activo' && $estado !== 'inactivo' && $estado !== 'todos') {
        out(422, ['success' => false, 'error' => 'Filtro estado invalido']);
    }

    $where = [];
    $types = '';
    $params = [];

    if ($estado !== 'todos') {
        $where[] = 'estado = ?';
        $types .= 's';
        $params[] = $estado;
    }

    if ($q !== '') {
        $term = '%' . $q . '%';
        $searchColumns = ['ruc', 'razon_social'];
        $optionalSearchColumns = ['nombre_comercial', 'actividad', 'contacto_1', 'contacto_2', 'correo_1', 'correo_2', 'correo'];

        foreach ($optionalSearchColumns as $col) {
            if (empresaColumnExists($mysqliOcup, $col)) {
                $searchColumns[] = $col;
            }
        }

        $searchParts = [];
        foreach ($searchColumns as $col) {
            $searchParts[] = $col . ' LIKE ?';
            $types .= 's';
            $params[] = $term;
        }

        $where[] = '(' . implode(' OR ', $searchParts) . ')';
    }

    $whereSql = empty($where) ? '' : (' WHERE ' . implode(' AND ', $where));

    $sqlCount = 'SELECT COUNT(*) AS total FROM empresas_ocupacionales' . $whereSql;
    $stmtCount = $mysqliOcup->prepare($sqlCount);
    if (!$stmtCount) {
        out(500, ['success' => false, 'error' => 'No se pudo preparar conteo']);
    }
    bindParamsDynamic($stmtCount, $types, $params);
    $stmtCount->execute();
    $resCount = $stmtCount->get_result();
    $rowCount = $resCount ? $resCount->fetch_assoc() : ['total' => 0];
    $total = (int) ($rowCount['total'] ?? 0);
    $stmtCount->close();

    $selectColumns = [
        'id',
        'ruc',
        'razon_social',
        'direccion',
        'telefono',
        'correo',
        'estado',
        'created_at',
        'updated_at',
        'created_by',
        'updated_by',
    ];
    $selectColumns = array_merge($selectColumns, buildEmpresaOptionalSelectColumns($mysqliOcup));
    $sql = 'SELECT ' . implode(', ', $selectColumns) . ' FROM empresas_ocupacionales' . $whereSql . ' ORDER BY ' . $sortBy . ' ' . $sortDir . ', id DESC LIMIT ? OFFSET ?';
    $stmt = $mysqliOcup->prepare($sql);
    if (!$stmt) {
        out(500, ['success' => false, 'error' => 'No se pudo preparar listado']);
    }

    $typesData = $types . 'ii';
    $paramsData = $params;
    $paramsData[] = $perPage;
    $paramsData[] = $offset;
    bindParamsDynamic($stmt, $typesData, $paramsData);
    $stmt->execute();
    $res = $stmt->get_result();
    $rows = [];
    while ($row = $res->fetch_assoc()) {
        $rows[] = [
            'id' => (int) $row['id'],
            'ruc' => (string) $row['ruc'],
            'razon_social' => (string) $row['razon_social'],
            'nombre_comercial' => (string) ($row['nombre_comercial'] ?? ''),
            'actividad' => (string) ($row['actividad'] ?? ''),
            'direccion' => (string) ($row['direccion'] ?? ''),
            'departamento' => (string) ($row['departamento'] ?? ''),
            'provincia' => (string) ($row['provincia'] ?? ''),
            'distrito' => (string) ($row['distrito'] ?? ''),
            'telefono' => (string) ($row['telefono'] ?? ''),
            'telefono_1' => (string) ($row['telefono_1'] ?? ''),
            'telefono_2' => (string) ($row['telefono_2'] ?? ''),
            'contacto_1' => (string) ($row['contacto_1'] ?? ''),
            'contacto_2' => (string) ($row['contacto_2'] ?? ''),
            'correo' => (string) ($row['correo'] ?? ''),
            'correo_1' => (string) ($row['correo_1'] ?? ''),
            'correo_2' => (string) ($row['correo_2'] ?? ''),
            'rrhh_usuario' => (string) ($row['rrhh_usuario'] ?? ''),
            // Las contraseñas nunca salen del servidor: solo se informa si hay una definida.
            'rrhh_password_definida' => ((string) ($row['rrhh_password'] ?? '')) !== '',
            'doctor_usuario' => (string) ($row['doctor_usuario'] ?? ''),
            'doctor_password_definida' => ((string) ($row['doctor_password'] ?? '')) !== '',
            'formato_principal' => (string) ($row['formato_principal'] ?? ''),
            'formato_certificado' => (string) ($row['formato_certificado'] ?? ''),
            'observacion' => (string) ($row['observacion'] ?? ''),
            'estado' => (string) $row['estado'],
            'created_at' => (string) ($row['created_at'] ?? ''),
            'updated_at' => (string) ($row['updated_at'] ?? ''),
            'created_by' => isset($row['created_by']) ? (int) $row['created_by'] : null,
            'updated_by' => isset($row['updated_by']) ? (int) $row['updated_by'] : null,
        ];
    }
    $stmt->close();

    out(200, [
        'success' => true,
        'data' => $rows,
        'meta' => [
            'page' => $page,
            'per_page' => $perPage,
            'total' => $total,
            'total_pages' => $total > 0 ? (int) ceil($total / $perPage) : 0,
            'sort_by' => $sortByRaw,
            'sort_dir' => strtolower($sortDir),
        ],
    ]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    out(405, ['success' => false, 'error' => 'Metodo no permitido']);
}

requireOcupPermiso('gestionar_empresas_ocupacional');

$raw = file_get_contents('php://input');
$payload = json_decode($raw, true);
if (!is_array($payload)) {
    $payload = $_POST;
}

$accion = trim((string) ($payload['accion'] ?? 'crear'));

if ($accion === 'inactivar') {
    $id = (int) ($payload['id'] ?? 0);
    if ($id <= 0) {
        out(422, ['success' => false, 'error' => 'id es obligatorio para inactivar']);
    }

    $usuarioId = isset($_SESSION['usuario']['id']) ? (int) $_SESSION['usuario']['id'] : null;
    $stmtInactivar = $mysqliOcup->prepare('UPDATE empresas_ocupacionales SET estado = "inactivo", updated_by = ?, updated_at = NOW() WHERE id = ? AND estado <> "inactivo" LIMIT 1');
    if (!$stmtInactivar) {
        out(500, ['success' => false, 'error' => 'No se pudo preparar la inactivacion']);
    }
    $stmtInactivar->bind_param('ii', $usuarioId, $id);
    $stmtInactivar->execute();
    $affected = (int) $stmtInactivar->affected_rows;
    $stmtInactivar->close();

    if ($affected <= 0) {
        out(404, ['success' => false, 'error' => 'Empresa no encontrada o ya inactiva']);
    }

    out(200, ['success' => true, 'message' => 'Empresa inactivada']);
}

if ($accion === 'inactivar_seguro') {
    $id = (int) ($payload['id'] ?? 0);
    $modo = strtolower(trim((string) ($payload['modo'] ?? 'prevalidar')));
    $force = parseBoolValue($payload['force'] ?? false);

    if ($id <= 0) {
        out(422, ['success' => false, 'error' => 'id es obligatorio para inactivar_seguro']);
    }

    if (!in_array($modo, ['prevalidar', 'aplicar'], true)) {
        out(422, ['success' => false, 'error' => 'modo invalido. Use prevalidar o aplicar']);
    }

    $stmtEmpresa = $mysqliOcup->prepare('SELECT id, estado, razon_social FROM empresas_ocupacionales WHERE id = ? LIMIT 1');
    if (!$stmtEmpresa) {
        out(500, ['success' => false, 'error' => 'No se pudo validar la empresa']);
    }
    $stmtEmpresa->bind_param('i', $id);
    $stmtEmpresa->execute();
    $empresa = $stmtEmpresa->get_result()->fetch_assoc();
    $stmtEmpresa->close();

    if (!$empresa) {
        out(404, ['success' => false, 'error' => 'Empresa no encontrada']);
    }

    $dependencias = obtenerDependenciasEmpresaActivas($mysqliOcup, $id);
    $diagnostico = construirDiagnosticoInactivacion($empresa['estado'] ?? '', $dependencias);

    if ($modo === 'prevalidar') {
        out(200, [
            'success' => true,
            'data' => [
                'id' => (int) $empresa['id'],
                'razon_social' => (string) ($empresa['razon_social'] ?? ''),
                'modo' => 'prevalidar',
                'force' => $force,
                'diagnostico' => $diagnostico,
            ],
        ]);
    }

    if (!$diagnostico['puede_inactivar'] && !$force) {
        out(409, [
            'success' => false,
            'error' => 'No se puede inactivar: existen dependencias activas',
            'data' => [
                'id' => (int) $empresa['id'],
                'razon_social' => (string) ($empresa['razon_social'] ?? ''),
                'modo' => 'aplicar',
                'force' => false,
                'diagnostico' => $diagnostico,
            ],
        ]);
    }

    $usuarioId = isset($_SESSION['usuario']['id']) ? (int) $_SESSION['usuario']['id'] : null;

    if ((string) ($empresa['estado'] ?? '') === 'inactivo') {
        out(200, [
            'success' => true,
            'message' => 'Empresa ya se encuentra inactiva',
            'data' => [
                'id' => (int) $empresa['id'],
                'razon_social' => (string) ($empresa['razon_social'] ?? ''),
                'modo' => 'aplicar',
                'force' => $force,
                'aplicado' => false,
                'diagnostico' => $diagnostico,
            ],
        ]);
    }

    $stmtAplicar = $mysqliOcup->prepare('UPDATE empresas_ocupacionales SET estado = "inactivo", updated_by = ?, updated_at = NOW() WHERE id = ? LIMIT 1');
    if (!$stmtAplicar) {
        out(500, ['success' => false, 'error' => 'No se pudo aplicar inactivacion segura']);
    }
    $stmtAplicar->bind_param('ii', $usuarioId, $id);
    $stmtAplicar->execute();
    $stmtAplicar->close();

    out(200, [
        'success' => true,
        'message' => $force ? 'Empresa inactivada con force' : 'Empresa inactivada de forma segura',
        'data' => [
            'id' => (int) $empresa['id'],
            'razon_social' => (string) ($empresa['razon_social'] ?? ''),
            'modo' => 'aplicar',
            'force' => $force,
            'aplicado' => true,
            'diagnostico' => $diagnostico,
        ],
    ]);
}

if ($accion === 'reactivar_seguro') {
    $id = (int) ($payload['id'] ?? 0);
    $modo = strtolower(trim((string) ($payload['modo'] ?? 'aplicar')));

    if ($id <= 0) {
        out(422, ['success' => false, 'error' => 'id es obligatorio para reactivar_seguro']);
    }

    if (!in_array($modo, ['prevalidar', 'aplicar'], true)) {
        out(422, ['success' => false, 'error' => 'modo invalido. Use prevalidar o aplicar']);
    }

    $stmtEmpresa = $mysqliOcup->prepare('SELECT id, estado, razon_social FROM empresas_ocupacionales WHERE id = ? LIMIT 1');
    if (!$stmtEmpresa) {
        out(500, ['success' => false, 'error' => 'No se pudo validar la empresa']);
    }
    $stmtEmpresa->bind_param('i', $id);
    $stmtEmpresa->execute();
    $empresa = $stmtEmpresa->get_result()->fetch_assoc();
    $stmtEmpresa->close();

    if (!$empresa) {
        out(404, ['success' => false, 'error' => 'Empresa no encontrada']);
    }

    if ($modo === 'prevalidar') {
        out(200, [
            'success' => true,
            'data' => [
                'id' => (int) $empresa['id'],
                'razon_social' => (string) ($empresa['razon_social'] ?? ''),
                'estado_actual' => (string) ($empresa['estado'] ?? ''),
                'puede_reactivar' => (string) ($empresa['estado'] ?? '') !== 'activo',
            ],
        ]);
    }

    if ((string) ($empresa['estado'] ?? '') === 'activo') {
        out(200, [
            'success' => true,
            'message' => 'Empresa ya se encuentra activa',
            'data' => [
                'id' => (int) $empresa['id'],
                'razon_social' => (string) ($empresa['razon_social'] ?? ''),
                'estado' => 'activo',
                'aplicado' => false,
            ],
        ]);
    }

    $usuarioId = isset($_SESSION['usuario']['id']) ? (int) $_SESSION['usuario']['id'] : null;
    $stmtAplicar = $mysqliOcup->prepare('UPDATE empresas_ocupacionales SET estado = "activo", updated_by = ?, updated_at = NOW() WHERE id = ? LIMIT 1');
    if (!$stmtAplicar) {
        out(500, ['success' => false, 'error' => 'No se pudo aplicar reactivacion segura']);
    }
    $stmtAplicar->bind_param('ii', $usuarioId, $id);
    $stmtAplicar->execute();
    $stmtAplicar->close();

    out(200, [
        'success' => true,
        'message' => 'Empresa reactivada de forma segura',
        'data' => [
            'id' => (int) $empresa['id'],
            'razon_social' => (string) ($empresa['razon_social'] ?? ''),
            'estado' => 'activo',
            'aplicado' => true,
        ],
    ]);
}

if ($accion === 'actualizar') {
    requireEmpresaLegacySchema($mysqliOcup);

    $id = (int) ($payload['id'] ?? 0);
    $ruc = trim((string) ($payload['ruc'] ?? ''));
    $razonSocial = trim((string) ($payload['razon_social'] ?? ''));
    $nombreComercial = trim((string) ($payload['nombre_comercial'] ?? ''));
    $actividad = trim((string) ($payload['actividad'] ?? ''));
    $direccion = trim((string) ($payload['direccion'] ?? ''));
    $departamento = trim((string) ($payload['departamento'] ?? ''));
    $provincia = trim((string) ($payload['provincia'] ?? ''));
    $distrito = trim((string) ($payload['distrito'] ?? ''));
    $telefono1 = trim((string) ($payload['telefono_1'] ?? $payload['telefono'] ?? ''));
    $telefono2 = trim((string) ($payload['telefono_2'] ?? ''));
    $contacto1 = trim((string) ($payload['contacto_1'] ?? ''));
    $contacto2 = trim((string) ($payload['contacto_2'] ?? ''));
    $correo1 = trim((string) ($payload['correo_1'] ?? $payload['correo'] ?? ''));
    $correo2 = trim((string) ($payload['correo_2'] ?? ''));
    $rrhhUsuario = trim((string) ($payload['rrhh_usuario'] ?? ''));
    $rrhhPassword = trim((string) ($payload['rrhh_password'] ?? ''));
    $doctorUsuario = trim((string) ($payload['doctor_usuario'] ?? ''));
    $doctorPassword = trim((string) ($payload['doctor_password'] ?? ''));
    $formatoPrincipal = trim((string) ($payload['formato_principal'] ?? ''));
    $formatoCertificado = trim((string) ($payload['formato_certificado'] ?? ''));
    $observacion = trim((string) ($payload['observacion'] ?? ''));

    $telefono = $telefono1;
    $correo = $correo1;

    if ($id <= 0) {
        out(422, ['success' => false, 'error' => 'id es obligatorio para actualizar']);
    }

    if (!preg_match('/^[0-9]{11}$/', $ruc)) {
        out(422, ['success' => false, 'error' => 'RUC invalido. Debe tener 11 digitos']);
    }

    if ($razonSocial === '') {
        out(422, ['success' => false, 'error' => 'Razon social es obligatoria']);
    }

    if ($actividad === '') {
        out(422, ['success' => false, 'error' => 'Actividad es obligatoria']);
    }

    if ($direccion === '') {
        out(422, ['success' => false, 'error' => 'Direccion es obligatoria']);
    }

    if ($departamento === '' || $provincia === '' || $distrito === '') {
        out(422, ['success' => false, 'error' => 'Departamento, provincia y distrito son obligatorios']);
    }

    if ($contacto1 === '') {
        out(422, ['success' => false, 'error' => 'Contacto 1 es obligatorio']);
    }

    if ($correo1 !== '' && !filter_var($correo1, FILTER_VALIDATE_EMAIL)) {
        out(422, ['success' => false, 'error' => 'Correo invalido']);
    }

    if ($correo2 !== '' && !filter_var($correo2, FILTER_VALIDATE_EMAIL)) {
        out(422, ['success' => false, 'error' => 'Correo 2 invalido']);
    }

    $stmtEmpresa = $mysqliOcup->prepare('SELECT id, estado, rrhh_password, doctor_password FROM empresas_ocupacionales WHERE id = ? LIMIT 1');
    if (!$stmtEmpresa) {
        out(500, ['success' => false, 'error' => 'No se pudo validar la empresa']);
    }
    $stmtEmpresa->bind_param('i', $id);
    $stmtEmpresa->execute();
    $empresa = $stmtEmpresa->get_result()->fetch_assoc();
    $stmtEmpresa->close();

    if (!$empresa) {
        out(404, ['success' => false, 'error' => 'Empresa no encontrada']);
    }

    // Contraseña vacía = no cambiar; si viene una nueva se guarda con hash.
    $rrhhPassword = OcupacionalSecretos::valorParaGuardar($rrhhPassword, (string) ($empresa['rrhh_password'] ?? ''));
    $doctorPassword = OcupacionalSecretos::valorParaGuardar($doctorPassword, (string) ($empresa['doctor_password'] ?? ''));

    $stmtDup = $mysqliOcup->prepare('SELECT id FROM empresas_ocupacionales WHERE ruc = ? AND id <> ? LIMIT 1');
    if (!$stmtDup) {
        out(500, ['success' => false, 'error' => 'No se pudo validar duplicidad de RUC']);
    }
    $stmtDup->bind_param('si', $ruc, $id);
    $stmtDup->execute();
    $dup = $stmtDup->get_result()->fetch_assoc();
    $stmtDup->close();

    if ($dup) {
        out(409, ['success' => false, 'error' => 'Ya existe una empresa con este RUC']);
    }

    $usuarioId = isset($_SESSION['usuario']['id']) ? (int) $_SESSION['usuario']['id'] : null;

    $stmtUp = $mysqliOcup->prepare('UPDATE empresas_ocupacionales
                                    SET ruc = ?, razon_social = ?, nombre_comercial = ?, actividad = ?, direccion = ?, departamento = ?, provincia = ?, distrito = ?, telefono = ?, telefono_1 = ?, telefono_2 = ?, contacto_1 = ?, contacto_2 = ?, correo = ?, correo_1 = ?, correo_2 = ?, rrhh_usuario = ?, rrhh_password = ?, doctor_usuario = ?, doctor_password = ?, formato_principal = ?, formato_certificado = ?, observacion = ?, updated_by = ?, updated_at = NOW()
                                    WHERE id = ? LIMIT 1');
    if (!$stmtUp) {
        out(500, ['success' => false, 'error' => 'No se pudo actualizar la empresa']);
    }
    $stmtUp->bind_param('sssssssssssssssssssssssii', $ruc, $razonSocial, $nombreComercial, $actividad, $direccion, $departamento, $provincia, $distrito, $telefono, $telefono1, $telefono2, $contacto1, $contacto2, $correo, $correo1, $correo2, $rrhhUsuario, $rrhhPassword, $doctorUsuario, $doctorPassword, $formatoPrincipal, $formatoCertificado, $observacion, $usuarioId, $id);
    $stmtUp->execute();
    $stmtUp->close();

    out(200, [
        'success' => true,
        'data' => [
            'id' => $id,
            'ruc' => $ruc,
            'razon_social' => $razonSocial,
            'nombre_comercial' => $nombreComercial,
            'actividad' => $actividad,
            'direccion' => $direccion,
            'departamento' => $departamento,
            'provincia' => $provincia,
            'distrito' => $distrito,
            'telefono' => $telefono,
            'telefono_1' => $telefono1,
            'telefono_2' => $telefono2,
            'contacto_1' => $contacto1,
            'contacto_2' => $contacto2,
            'correo' => $correo,
            'correo_1' => $correo1,
            'correo_2' => $correo2,
            'rrhh_usuario' => $rrhhUsuario,
            'doctor_usuario' => $doctorUsuario,
            'formato_principal' => $formatoPrincipal,
            'formato_certificado' => $formatoCertificado,
            'observacion' => $observacion,
            'estado' => (string) ($empresa['estado'] ?? ''),
        ],
    ]);
}

if ($accion !== 'crear' && $accion !== '') {
    out(422, ['success' => false, 'error' => 'accion POST no soportada']);
}

$ruc = trim((string) ($payload['ruc'] ?? ''));
$razonSocial = trim((string) ($payload['razon_social'] ?? ''));
requireEmpresaLegacySchema($mysqliOcup);
$nombreComercial = trim((string) ($payload['nombre_comercial'] ?? ''));
$actividad = trim((string) ($payload['actividad'] ?? ''));
$direccion = trim((string) ($payload['direccion'] ?? ''));
$departamento = trim((string) ($payload['departamento'] ?? ''));
$provincia = trim((string) ($payload['provincia'] ?? ''));
$distrito = trim((string) ($payload['distrito'] ?? ''));
$telefono1 = trim((string) ($payload['telefono_1'] ?? $payload['telefono'] ?? ''));
$telefono2 = trim((string) ($payload['telefono_2'] ?? ''));
$contacto1 = trim((string) ($payload['contacto_1'] ?? ''));
$contacto2 = trim((string) ($payload['contacto_2'] ?? ''));
$correo1 = trim((string) ($payload['correo_1'] ?? $payload['correo'] ?? ''));
$correo2 = trim((string) ($payload['correo_2'] ?? ''));
$rrhhUsuario = trim((string) ($payload['rrhh_usuario'] ?? ''));
$rrhhPassword = trim((string) ($payload['rrhh_password'] ?? ''));
$doctorUsuario = trim((string) ($payload['doctor_usuario'] ?? ''));
$doctorPassword = trim((string) ($payload['doctor_password'] ?? ''));
$formatoPrincipal = trim((string) ($payload['formato_principal'] ?? ''));
$formatoCertificado = trim((string) ($payload['formato_certificado'] ?? ''));
$observacion = trim((string) ($payload['observacion'] ?? ''));

$telefono = $telefono1;
$correo = $correo1;

if (!preg_match('/^[0-9]{11}$/', $ruc)) {
    out(422, ['success' => false, 'error' => 'RUC invalido. Debe tener 11 digitos']);
}

if ($razonSocial === '') {
    out(422, ['success' => false, 'error' => 'Razon social es obligatoria']);
}

if ($actividad === '') {
    out(422, ['success' => false, 'error' => 'Actividad es obligatoria']);
}

if ($direccion === '') {
    out(422, ['success' => false, 'error' => 'Direccion es obligatoria']);
}

if ($departamento === '' || $provincia === '' || $distrito === '') {
    out(422, ['success' => false, 'error' => 'Departamento, provincia y distrito son obligatorios']);
}

if ($contacto1 === '') {
    out(422, ['success' => false, 'error' => 'Contacto 1 es obligatorio']);
}

if ($correo1 !== '' && !filter_var($correo1, FILTER_VALIDATE_EMAIL)) {
    out(422, ['success' => false, 'error' => 'Correo invalido']);
}

if ($correo2 !== '' && !filter_var($correo2, FILTER_VALIDATE_EMAIL)) {
    out(422, ['success' => false, 'error' => 'Correo 2 invalido']);
}

$usuarioId = isset($_SESSION['usuario']['id']) ? (int) $_SESSION['usuario']['id'] : null;

// Las contraseñas de acceso de la empresa se guardan siempre con hash.
$rrhhPassword = OcupacionalSecretos::valorParaGuardar($rrhhPassword, '');
$doctorPassword = OcupacionalSecretos::valorParaGuardar($doctorPassword, '');

$stmt = $mysqliOcup->prepare('INSERT INTO empresas_ocupacionales (ruc, razon_social, nombre_comercial, actividad, direccion, departamento, provincia, distrito, telefono, telefono_1, telefono_2, contacto_1, contacto_2, correo, correo_1, correo_2, rrhh_usuario, rrhh_password, doctor_usuario, doctor_password, formato_principal, formato_certificado, observacion, estado, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "activo", ?, ?)');
if (!$stmt) {
    out(500, ['success' => false, 'error' => 'No se pudo preparar la insercion']);
}

$stmt->bind_param('sssssssssssssssssssssssii', $ruc, $razonSocial, $nombreComercial, $actividad, $direccion, $departamento, $provincia, $distrito, $telefono, $telefono1, $telefono2, $contacto1, $contacto2, $correo, $correo1, $correo2, $rrhhUsuario, $rrhhPassword, $doctorUsuario, $doctorPassword, $formatoPrincipal, $formatoCertificado, $observacion, $usuarioId, $usuarioId);
if (!$stmt->execute()) {
    $errno = (int) $stmt->errno;
    $stmt->close();
    if ($errno === 1062) {
        out(409, ['success' => false, 'error' => 'Ya existe una empresa con este RUC']);
    }
    out(500, ['success' => false, 'error' => 'No se pudo registrar la empresa']);
}

$id = (int) $stmt->insert_id;
$stmt->close();

out(201, [
    'success' => true,
    'data' => [
        'id' => $id,
        'ruc' => $ruc,
        'razon_social' => $razonSocial,
        'nombre_comercial' => $nombreComercial,
        'actividad' => $actividad,
        'direccion' => $direccion,
        'departamento' => $departamento,
        'provincia' => $provincia,
        'distrito' => $distrito,
        'telefono' => $telefono,
        'telefono_1' => $telefono1,
        'telefono_2' => $telefono2,
        'contacto_1' => $contacto1,
        'contacto_2' => $contacto2,
        'correo' => $correo,
        'correo_1' => $correo1,
        'correo_2' => $correo2,
        'rrhh_usuario' => $rrhhUsuario,
        'doctor_usuario' => $doctorUsuario,
        'formato_principal' => $formatoPrincipal,
        'formato_certificado' => $formatoCertificado,
        'observacion' => $observacion,
        'estado' => 'activo'
    ]
]);
