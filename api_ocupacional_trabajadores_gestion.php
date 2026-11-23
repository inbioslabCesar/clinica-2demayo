<?php

require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/db_ocupacional.php';

function out_trab_gestion($code, $payload)
{
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload);
    exit;
}

function require_trab_gestion_permiso($permiso)
{
    $usuario = $_SESSION['usuario'] ?? null;
    if (!is_array($usuario)) {
        out_trab_gestion(401, ['success' => false, 'error' => 'No autenticado']);
    }
    if (strtolower(trim((string)($usuario['rol'] ?? ''))) === 'administrador') {
        return;
    }
    $permisos = $usuario['permisos'] ?? [];
    if (is_string($permisos)) {
        $decoded = json_decode($permisos, true);
        $permisos = is_array($decoded) ? $decoded : [];
    }
    if (!is_array($permisos)
        || !in_array('access_salud_ocupacional', $permisos, true)
        || !in_array($permiso, $permisos, true)) {
        out_trab_gestion(403, ['success' => false, 'error' => 'No autorizado para esta accion']);
    }
}

function get_trabajador_gestion($conn, $id)
{
    $stmt = $conn->prepare('SELECT id, empresa_id, external_patient_id, documento_numero, puesto_trabajo,
                                   area_riesgo, tipo_contrato, estado_laboral, fecha_ingreso
                            FROM pacientes_ocupacionales WHERE id = ? LIMIT 1');
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row ?: null;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST' && $_SERVER['REQUEST_METHOD'] !== 'PATCH') {
    out_trab_gestion(405, ['success' => false, 'error' => 'Metodo no permitido']);
}

$payload = json_decode(file_get_contents('php://input'), true);
if (!is_array($payload)) {
    $payload = $_POST;
}

$accion = strtolower(trim((string)($payload['accion'] ?? '')));
require_trab_gestion_permiso($accion === 'anular' ? 'baja_trabajadores_ocupacional' : 'registrar_trabajadores_ocupacional');
$id = (int)($payload['id'] ?? 0);
$usuarioId = isset($_SESSION['usuario']['id']) ? (int)$_SESSION['usuario']['id'] : null;
if ($id <= 0) {
    out_trab_gestion(422, ['success' => false, 'error' => 'id es obligatorio']);
}

$trabajador = get_trabajador_gestion($mysqliOcup, $id);
if (!$trabajador) {
    out_trab_gestion(404, ['success' => false, 'error' => 'Trabajador no encontrado']);
}

if ($accion === 'actualizar') {
    if ((string)$trabajador['estado_laboral'] === 'anulado') {
        out_trab_gestion(409, ['success' => false, 'error' => 'No se puede editar un registro anulado']);
    }

    $puesto = preg_replace('/\s+/', ' ', trim((string)($payload['puesto_trabajo'] ?? '')));
    $area = preg_replace('/\s+/', ' ', trim((string)($payload['area_riesgo'] ?? '')));
    $tipoContrato = trim((string)($payload['tipo_contrato'] ?? ''));
    $fechaIngreso = trim((string)($payload['fecha_ingreso'] ?? ''));
    if ($puesto === '' || strlen($puesto) > 180) {
        out_trab_gestion(422, ['success' => false, 'error' => 'Puesto obligatorio (maximo 180 caracteres)']);
    }
    $fechaObj = DateTime::createFromFormat('Y-m-d', $fechaIngreso);
    if (!$fechaObj || $fechaObj->format('Y-m-d') !== $fechaIngreso) {
        out_trab_gestion(422, ['success' => false, 'error' => 'Fecha de ingreso invalida']);
    }
    $hoy = new DateTime('now', new DateTimeZone('America/Lima'));
    if ($fechaObj > $hoy) {
        out_trab_gestion(422, ['success' => false, 'error' => 'Fecha de ingreso no puede ser futura']);
    }

    $stmt = $mysqliOcup->prepare('UPDATE pacientes_ocupacionales
                                 SET puesto_trabajo = ?, area_riesgo = ?, tipo_contrato = ?, fecha_ingreso = ?,
                                     updated_by = ?, updated_at = NOW()
                                 WHERE id = ? LIMIT 1');
    $stmt->bind_param('ssssii', $puesto, $area, $tipoContrato, $fechaIngreso, $usuarioId, $id);
    $stmt->execute();
    $stmt->close();
    out_trab_gestion(200, ['success' => true, 'message' => 'Datos laborales actualizados']);
}

if ($accion === 'anular') {
    $motivo = preg_replace('/\s+/', ' ', trim((string)($payload['motivo'] ?? '')));
    if (strlen($motivo) < 5 || strlen($motivo) > 255) {
        out_trab_gestion(422, ['success' => false, 'error' => 'Ingrese motivo de anulacion (5 a 255 caracteres)']);
    }
    if ((string)$trabajador['estado_laboral'] === 'anulado') {
        out_trab_gestion(409, ['success' => false, 'error' => 'El registro ya esta anulado']);
    }

    $stmtOrdenes = $mysqliOcup->prepare('SELECT COUNT(id) AS total FROM ocupacional_ordenes WHERE trabajador_id = ?');
    $stmtOrdenes->bind_param('i', $id);
    $stmtOrdenes->execute();
    $ordenes = (int)($stmtOrdenes->get_result()->fetch_assoc()['total'] ?? 0);
    $stmtOrdenes->close();
    if ($ordenes > 0) {
        out_trab_gestion(409, [
            'success' => false,
            'error' => 'No se puede anular: el trabajador tiene ordenes ocupacionales. Use Dar baja para conservar trazabilidad.',
            'data' => ['ordenes' => $ordenes],
        ]);
    }

    $stmt = $mysqliOcup->prepare('UPDATE pacientes_ocupacionales
                                 SET estado_laboral = "anulado", anulacion_motivo = ?, anulado_at = NOW(),
                                     anulado_by = ?, updated_by = ?, updated_at = NOW()
                                 WHERE id = ? LIMIT 1');
    $stmt->bind_param('siii', $motivo, $usuarioId, $usuarioId, $id);
    $stmt->execute();
    $stmt->close();
    out_trab_gestion(200, ['success' => true, 'message' => 'Registro anulado correctamente']);
}

out_trab_gestion(422, ['success' => false, 'error' => 'Accion no soportada']);