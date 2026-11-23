<?php

require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/db_ocupacional.php';

function out_catalogo_laboral($code, $payload)
{
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload);
    exit;
}

function require_catalogo_laboral_permiso($soloLectura = false)
{
    $usuario = $_SESSION['usuario'] ?? null;
    if (!is_array($usuario)) {
        out_catalogo_laboral(401, ['success' => false, 'error' => 'No autenticado']);
    }

    if (strtolower(trim((string)($usuario['rol'] ?? ''))) === 'administrador') {
        return;
    }

    $permisos = $usuario['permisos'] ?? [];
    if (is_string($permisos)) {
        $decoded = json_decode($permisos, true);
        $permisos = is_array($decoded) ? $decoded : [];
    }
    $puedeGestionar = is_array($permisos) && in_array('gestionar_empresas_ocupacional', $permisos, true);
    $puedeRegistrar = is_array($permisos) && in_array('registrar_trabajadores_ocupacional', $permisos, true);
    if (!is_array($permisos)
        || !in_array('access_salud_ocupacional', $permisos, true)
        || (!$puedeGestionar && !($soloLectura && $puedeRegistrar))) {
        out_catalogo_laboral(403, ['success' => false, 'error' => 'No autorizado para esta accion']);
    }
}

function validar_tipo_catalogo_laboral($tipo)
{
    $tipo = strtolower(trim((string)$tipo));
    if (!in_array($tipo, ['area', 'puesto'], true)) {
        out_catalogo_laboral(422, ['success' => false, 'error' => 'tipo debe ser area o puesto']);
    }
    return $tipo;
}

function normalizar_nombre_catalogo_laboral($nombre)
{
    return preg_replace('/\s+/', ' ', trim((string)$nombre));
}

function get_catalogo_laboral($conn, $id)
{
    $stmt = $conn->prepare('SELECT id, empresa_id, tipo, nombre, estado, created_at, updated_at
                            FROM ocupacional_catalogos_laborales_empresa WHERE id = ? LIMIT 1');
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$row) {
        return null;
    }
    $row['id'] = (int)$row['id'];
    $row['empresa_id'] = (int)$row['empresa_id'];
    return $row;
}

require_catalogo_laboral_permiso($_SERVER['REQUEST_METHOD'] === 'GET');

$tableExists = $mysqliOcup->query("SHOW TABLES LIKE 'ocupacional_catalogos_laborales_empresa'");
if (!$tableExists || !$tableExists->fetch_row()) {
    out_catalogo_laboral(500, [
        'success' => false,
        'error' => 'Falta aplicar migraciones/20260724_0016_ocupacional_catalogos_laborales_empresa.sql',
    ]);
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $empresaId = (int)($_GET['empresa_id'] ?? 0);
    $tipo = validar_tipo_catalogo_laboral($_GET['tipo'] ?? '');
    $estado = strtolower(trim((string)($_GET['estado'] ?? 'activo')));
    if ($empresaId <= 0 || !in_array($estado, ['activo', 'inactivo', 'todos'], true)) {
        out_catalogo_laboral(422, ['success' => false, 'error' => 'empresa_id y estado valido son obligatorios']);
    }

    $sql = 'SELECT id, empresa_id, tipo, nombre, estado, created_at, updated_at
            FROM ocupacional_catalogos_laborales_empresa
            WHERE empresa_id = ? AND tipo = ?';
    if ($estado !== 'todos') {
        $sql .= ' AND estado = ?';
    }
    $sql .= ' ORDER BY nombre ASC, id ASC';

    $stmt = $mysqliOcup->prepare($sql);
    if ($estado === 'todos') {
        $stmt->bind_param('is', $empresaId, $tipo);
    } else {
        $stmt->bind_param('iss', $empresaId, $tipo, $estado);
    }
    $stmt->execute();
    $res = $stmt->get_result();
    $rows = [];
    while ($row = $res->fetch_assoc()) {
        $row['id'] = (int)$row['id'];
        $row['empresa_id'] = (int)$row['empresa_id'];
        $rows[] = $row;
    }
    $stmt->close();
    out_catalogo_laboral(200, ['success' => true, 'data' => $rows]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    out_catalogo_laboral(405, ['success' => false, 'error' => 'Metodo no permitido']);
}

$payload = json_decode(file_get_contents('php://input'), true);
if (!is_array($payload)) {
    $payload = $_POST;
}

$accion = strtolower(trim((string)($payload['accion'] ?? 'guardar')));
$usuarioId = isset($_SESSION['usuario']['id']) ? (int)$_SESSION['usuario']['id'] : null;

if ($accion === 'guardar') {
    $id = (int)($payload['id'] ?? 0);
    $empresaId = (int)($payload['empresa_id'] ?? 0);
    $tipo = validar_tipo_catalogo_laboral($payload['tipo'] ?? '');
    $nombre = normalizar_nombre_catalogo_laboral($payload['nombre'] ?? '');
    if ($empresaId <= 0 || $nombre === '' || strlen($nombre) > 180) {
        out_catalogo_laboral(422, ['success' => false, 'error' => 'empresa_id y nombre (maximo 180) son obligatorios']);
    }

    $stmtEmpresa = $mysqliOcup->prepare('SELECT id FROM empresas_ocupacionales WHERE id = ? LIMIT 1');
    $stmtEmpresa->bind_param('i', $empresaId);
    $stmtEmpresa->execute();
    $empresa = $stmtEmpresa->get_result()->fetch_assoc();
    $stmtEmpresa->close();
    if (!$empresa) {
        out_catalogo_laboral(404, ['success' => false, 'error' => 'Empresa no encontrada']);
    }

    if ($id > 0) {
        $actual = get_catalogo_laboral($mysqliOcup, $id);
        if (!$actual || (int)$actual['empresa_id'] !== $empresaId || $actual['tipo'] !== $tipo) {
            out_catalogo_laboral(404, ['success' => false, 'error' => 'Registro no encontrado para la empresa']);
        }
        $stmt = $mysqliOcup->prepare('UPDATE ocupacional_catalogos_laborales_empresa
                                     SET nombre = ?, updated_by = ?, updated_at = NOW()
                                     WHERE id = ? LIMIT 1');
        $stmt->bind_param('sii', $nombre, $usuarioId, $id);
    } else {
        $stmt = $mysqliOcup->prepare('INSERT INTO ocupacional_catalogos_laborales_empresa
                                     (empresa_id, tipo, nombre, estado, created_by, updated_by)
                                     VALUES (?, ?, ?, "activo", ?, ?)');
        $stmt->bind_param('issii', $empresaId, $tipo, $nombre, $usuarioId, $usuarioId);
    }

    if (!$stmt->execute()) {
        $errno = (int)$stmt->errno;
        $stmt->close();
        if ($errno === 1062) {
            out_catalogo_laboral(409, ['success' => false, 'error' => 'Ya existe ese nombre en la empresa']);
        }
        out_catalogo_laboral(500, ['success' => false, 'error' => 'No se pudo guardar el registro']);
    }
    if ($id <= 0) {
        $id = (int)$stmt->insert_id;
    }
    $stmt->close();
    out_catalogo_laboral($id > 0 ? 200 : 201, ['success' => true, 'data' => get_catalogo_laboral($mysqliOcup, $id)]);
}

if ($accion === 'cambiar_estado') {
    $id = (int)($payload['id'] ?? 0);
    $estado = strtolower(trim((string)($payload['estado'] ?? '')));
    if ($id <= 0 || !in_array($estado, ['activo', 'inactivo'], true)) {
        out_catalogo_laboral(422, ['success' => false, 'error' => 'id y estado valido son obligatorios']);
    }
    if (!get_catalogo_laboral($mysqliOcup, $id)) {
        out_catalogo_laboral(404, ['success' => false, 'error' => 'Registro no encontrado']);
    }
    $stmt = $mysqliOcup->prepare('UPDATE ocupacional_catalogos_laborales_empresa
                                 SET estado = ?, updated_by = ?, updated_at = NOW() WHERE id = ? LIMIT 1');
    $stmt->bind_param('sii', $estado, $usuarioId, $id);
    $stmt->execute();
    $stmt->close();
    out_catalogo_laboral(200, ['success' => true, 'data' => get_catalogo_laboral($mysqliOcup, $id)]);
}

out_catalogo_laboral(422, ['success' => false, 'error' => 'Accion no soportada']);