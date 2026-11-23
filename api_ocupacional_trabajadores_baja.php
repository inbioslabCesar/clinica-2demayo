<?php

require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/db_ocupacional.php';

function outJson($code, $payload)
{
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload);
    exit;
}

function userPermisosFromSession()
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
        outJson(401, ['success' => false, 'error' => 'No autenticado']);
    }

    $rol = strtolower(trim((string) ($usuario['rol'] ?? '')));
    if ($rol === 'administrador') {
        return;
    }

    $permisos = userPermisosFromSession();
    if (!in_array('access_salud_ocupacional', $permisos, true) || !in_array($permiso, $permisos, true)) {
        outJson(403, ['success' => false, 'error' => 'No autorizado para esta accion']);
    }
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST' && $_SERVER['REQUEST_METHOD'] !== 'PATCH') {
    outJson(405, ['success' => false, 'error' => 'Metodo no permitido']);
}

requireOcupPermiso('baja_trabajadores_ocupacional');

$raw = file_get_contents('php://input');
$payload = json_decode($raw, true);
if (!is_array($payload)) {
    $payload = $_POST;
}

$id = (int) ($payload['id'] ?? 0);
if ($id <= 0) {
    outJson(422, ['success' => false, 'error' => 'id es obligatorio']);
}

$usuarioId = isset($_SESSION['usuario']['id']) ? (int) $_SESSION['usuario']['id'] : null;

$stmt = $mysqliOcup->prepare('UPDATE pacientes_ocupacionales SET estado_laboral = "retirado", updated_by = ?, updated_at = NOW() WHERE id = ? LIMIT 1');
if (!$stmt) {
    outJson(500, ['success' => false, 'error' => 'No se pudo preparar la operacion']);
}

$stmt->bind_param('ii', $usuarioId, $id);
$stmt->execute();
$affected = (int) $stmt->affected_rows;
$stmt->close();

if ($affected <= 0) {
    outJson(404, ['success' => false, 'error' => 'Trabajador no encontrado o sin cambios']);
}

outJson(200, ['success' => true, 'message' => 'Trabajador marcado como retirado']);
