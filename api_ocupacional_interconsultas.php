<?php

require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db_ocupacional.php';

function out_interconsulta($code, $payload)
{
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload);
    exit;
}

function parse_permisos_interconsulta()
{
    $raw = $_SESSION['usuario']['permisos'] ?? [];
    if (is_string($raw)) {
        $decoded = json_decode($raw, true);
        $raw = is_array($decoded) ? $decoded : [];
    }
    return is_array($raw) ? array_values(array_filter(array_map('strval', $raw))) : [];
}

function require_permiso_interconsulta($permisosValidos)
{
    $usuario = $_SESSION['usuario'] ?? null;
    if (!is_array($usuario)) {
        out_interconsulta(401, ['success' => false, 'error' => 'No autenticado']);
    }
    if (strtolower(trim((string)($usuario['rol'] ?? ''))) === 'administrador') {
        return;
    }
    $permisos = parse_permisos_interconsulta();
    if (!in_array('access_salud_ocupacional', $permisos, true)) {
        out_interconsulta(403, ['success' => false, 'error' => 'No autorizado para salud ocupacional']);
    }
    foreach ((array)$permisosValidos as $permiso) {
        if (in_array($permiso, $permisos, true)) {
            return;
        }
    }
    out_interconsulta(403, ['success' => false, 'error' => 'No autorizado para esta accion']);
}

function table_exists_interconsulta($conn, $table)
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

function registrar_evento_interconsulta($conn, $ordenId, $tipo, $descripcion, $usuarioId, $payload = [])
{
    $payloadJson = !empty($payload) ? json_encode($payload, JSON_UNESCAPED_UNICODE) : null;
    $stmt = $conn->prepare('INSERT INTO ocupacional_orden_eventos
                            (orden_id, tipo_evento, descripcion, payload_json, created_by)
                            VALUES (?, ?, ?, ?, ?)');
    if (!$stmt) {
        throw new Exception('No se pudo registrar auditoria de interconsulta');
    }
    $stmt->bind_param('isssi', $ordenId, $tipo, $descripcion, $payloadJson, $usuarioId);
    $stmt->execute();
    $stmt->close();
}

function require_medico_levantamiento($mysqliCore, $medicoId)
{
    $id = (int)$medicoId;
    if ($id <= 0) {
        out_interconsulta(422, ['success' => false, 'error' => 'medico_id es obligatorio para el levantamiento']);
    }
    $stmt = $mysqliCore->prepare('SELECT id, nombre, apellido, cmp, nro_colegiatura, firma, tipo_profesional, abreviatura_profesional
                                  FROM medicos WHERE id = ? LIMIT 1');
    if (!$stmt) {
        out_interconsulta(500, ['success' => false, 'error' => 'No se pudo validar medico del levantamiento']);
    }
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$row || strtolower(trim((string)($row['tipo_profesional'] ?? 'medico'))) !== 'medico') {
        out_interconsulta(422, ['success' => false, 'error' => 'Medico de levantamiento invalido']);
    }
    $cmp = trim((string)($row['cmp'] ?? ''));
    if ($cmp === '') {
        $cmp = trim((string)($row['nro_colegiatura'] ?? ''));
    }
    if ($cmp === '' || trim((string)($row['firma'] ?? '')) === '') {
        out_interconsulta(422, ['success' => false, 'error' => 'El medico del levantamiento debe tener CMP y firma']);
    }
    $nombre = trim((string)($row['abreviatura_profesional'] ?? '') . ' '
        . trim((string)($row['nombre'] ?? '') . ' ' . (string)($row['apellido'] ?? '')));
    return ['id' => (int)$row['id'], 'nombre' => $nombre, 'cmp' => $cmp];
}

function save_respuesta_pdf_interconsulta($interconsultaId)
{
    if (!isset($_FILES['respuesta_archivo']) || !is_array($_FILES['respuesta_archivo'])) {
        return null;
    }
    $file = $_FILES['respuesta_archivo'];
    if ((int)($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
        return null;
    }
    if ((int)($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        out_interconsulta(422, ['success' => false, 'error' => 'No se pudo recibir el PDF de respuesta']);
    }
    if ((int)($file['size'] ?? 0) <= 0 || (int)$file['size'] > 10 * 1024 * 1024) {
        out_interconsulta(422, ['success' => false, 'error' => 'El PDF de respuesta debe pesar como maximo 10 MB']);
    }
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    if ($finfo->file((string)$file['tmp_name']) !== 'application/pdf') {
        out_interconsulta(422, ['success' => false, 'error' => 'El documento de respuesta debe ser PDF']);
    }
    $relativeDir = 'uploads/ocupacional/interconsultas';
    $absoluteDir = __DIR__ . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relativeDir);
    if (!is_dir($absoluteDir) && !mkdir($absoluteDir, 0775, true) && !is_dir($absoluteDir)) {
        out_interconsulta(500, ['success' => false, 'error' => 'No se pudo crear directorio de interconsultas']);
    }
    $fileName = 'interconsulta_' . (int)$interconsultaId . '_' . bin2hex(random_bytes(8)) . '.pdf';
    $absolutePath = $absoluteDir . DIRECTORY_SEPARATOR . $fileName;
    if (!move_uploaded_file((string)$file['tmp_name'], $absolutePath)) {
        out_interconsulta(500, ['success' => false, 'error' => 'No se pudo guardar el PDF de respuesta']);
    }
    return $relativeDir . '/' . $fileName;
}

if (!table_exists_interconsulta($mysqliOcup, 'ocupacional_interconsultas')) {
    out_interconsulta(500, ['success' => false, 'error' => 'Falta aplicar migracion 20260725_0021 de interconsultas']);
}

$usuarioId = isset($_SESSION['usuario']['id']) ? (int)$_SESSION['usuario']['id'] : null;

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    require_permiso_interconsulta(['ver_ordenes_ocupacional', 'ejecutar_ordenes_ocupacional']);
    $ordenId = (int)($_GET['orden_id'] ?? 0);
    if ($ordenId <= 0) {
        out_interconsulta(422, ['success' => false, 'error' => 'orden_id es obligatorio']);
    }
    $stmt = $mysqliOcup->prepare('SELECT i.*, d.examen_codigo, d.examen_descripcion
                                  FROM ocupacional_interconsultas i
                                  INNER JOIN ocupacional_orden_detalle d ON d.id = i.orden_detalle_id
                                  WHERE i.orden_id = ?
                                  ORDER BY i.id DESC');
    if (!$stmt) {
        out_interconsulta(500, ['success' => false, 'error' => 'No se pudo consultar interconsultas']);
    }
    $stmt->bind_param('i', $ordenId);
    $stmt->execute();
    $result = $stmt->get_result();
    $rows = [];
    while ($row = $result->fetch_assoc()) {
        $row['id'] = (int)$row['id'];
        $row['orden_id'] = (int)$row['orden_id'];
        $row['orden_detalle_id'] = (int)$row['orden_detalle_id'];
        $row['medico_levantamiento_id'] = (int)($row['medico_levantamiento_id'] ?? 0);
        $rows[] = $row;
    }
    $stmt->close();
    out_interconsulta(200, ['success' => true, 'data' => $rows]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    out_interconsulta(405, ['success' => false, 'error' => 'Metodo no permitido']);
}

$contentType = strtolower((string)($_SERVER['CONTENT_TYPE'] ?? ''));
if (strpos($contentType, 'multipart/form-data') !== false) {
    $payload = $_POST;
} else {
    $payload = json_decode(file_get_contents('php://input'), true);
    $payload = is_array($payload) ? $payload : $_POST;
}
$accion = trim((string)($payload['accion'] ?? ''));

if ($accion === 'crear') {
    require_permiso_interconsulta(['ejecutar_ordenes_ocupacional']);
    $ordenId = (int)($payload['orden_id'] ?? 0);
    $detalleId = (int)($payload['orden_detalle_id'] ?? 0);
    $especialidad = trim((string)($payload['especialidad'] ?? ''));
    $motivo = trim((string)($payload['motivo'] ?? ''));
    $cie10 = trim((string)($payload['diagnostico_cie10'] ?? ''));
    $diagnostico = trim((string)($payload['diagnostico_descripcion'] ?? ''));
    $observaciones = trim((string)($payload['observaciones'] ?? ''));
    if ($ordenId <= 0 || $detalleId <= 0 || $especialidad === '' || $motivo === '') {
        out_interconsulta(422, ['success' => false, 'error' => 'orden, examen, especialidad y motivo son obligatorios']);
    }

    $mysqliOcup->begin_transaction();
    try {
        $stmtDet = $mysqliOcup->prepare('SELECT d.id, d.estado_ejecucion, o.estado AS estado_orden
                                         FROM ocupacional_orden_detalle d
                                         INNER JOIN ocupacional_ordenes o ON o.id = d.orden_id
                                         WHERE d.id = ? AND d.orden_id = ? FOR UPDATE');
        $stmtDet->bind_param('ii', $detalleId, $ordenId);
        $stmtDet->execute();
        $detalle = $stmtDet->get_result()->fetch_assoc();
        $stmtDet->close();
        if (!$detalle || in_array((string)$detalle['estado_orden'], ['cerrada', 'anulada'], true)) {
            throw new DomainException('Orden o examen no disponible para interconsulta');
        }
        if ((string)$detalle['estado_ejecucion'] !== 'observado') {
            throw new DomainException('El examen debe estar observado para crear interconsulta');
        }
        $stmtOpen = $mysqliOcup->prepare('SELECT id FROM ocupacional_interconsultas
                                          WHERE orden_detalle_id = ? AND estado IN ("solicitada", "respondida") LIMIT 1 FOR UPDATE');
        $stmtOpen->bind_param('i', $detalleId);
        $stmtOpen->execute();
        $open = $stmtOpen->get_result()->fetch_assoc();
        $stmtOpen->close();
        if ($open) {
            throw new DomainException('El examen ya tiene una interconsulta abierta');
        }
        $stmtIns = $mysqliOcup->prepare('INSERT INTO ocupacional_interconsultas
                                         (orden_id, orden_detalle_id, especialidad, motivo, diagnostico_cie10,
                                          diagnostico_descripcion, observaciones, created_by, updated_by)
                                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $stmtIns->bind_param('iisssssii', $ordenId, $detalleId, $especialidad, $motivo, $cie10, $diagnostico, $observaciones, $usuarioId, $usuarioId);
        $stmtIns->execute();
        $interconsultaId = (int)$stmtIns->insert_id;
        $stmtIns->close();
        registrar_evento_interconsulta($mysqliOcup, $ordenId, 'interconsulta_creada', 'Interconsulta ocupacional creada', $usuarioId, [
            'interconsulta_id' => $interconsultaId,
            'detalle_id' => $detalleId,
            'especialidad' => $especialidad,
        ]);
        $mysqliOcup->commit();
        out_interconsulta(201, ['success' => true, 'data' => ['id' => $interconsultaId, 'estado' => 'solicitada']]);
    } catch (DomainException $e) {
        $mysqliOcup->rollback();
        out_interconsulta(422, ['success' => false, 'error' => $e->getMessage()]);
    } catch (Throwable $e) {
        $mysqliOcup->rollback();
        out_interconsulta(500, ['success' => false, 'error' => 'No se pudo crear interconsulta']);
    }
}

if ($accion === 'responder') {
    require_permiso_interconsulta(['ejecutar_ordenes_ocupacional']);
    $id = (int)($payload['id'] ?? 0);
    $especialista = trim((string)($payload['especialista_nombre'] ?? ''));
    $respuesta = trim((string)($payload['respuesta'] ?? ''));
    if ($id <= 0 || $especialista === '' || $respuesta === '') {
        out_interconsulta(422, ['success' => false, 'error' => 'interconsulta, especialista y respuesta son obligatorios']);
    }
    $stmtFind = $mysqliOcup->prepare('SELECT id, orden_id, estado, respuesta_documento FROM ocupacional_interconsultas WHERE id = ? LIMIT 1');
    $stmtFind->bind_param('i', $id);
    $stmtFind->execute();
    $row = $stmtFind->get_result()->fetch_assoc();
    $stmtFind->close();
    if (!$row) {
        out_interconsulta(404, ['success' => false, 'error' => 'Interconsulta no encontrada']);
    }
    if (!in_array((string)$row['estado'], ['solicitada', 'respondida'], true)) {
        out_interconsulta(422, ['success' => false, 'error' => 'La interconsulta ya no admite respuesta']);
    }
    $newDocument = save_respuesta_pdf_interconsulta($id);
    $document = $newDocument !== null ? $newDocument : (string)($row['respuesta_documento'] ?? '');
    $mysqliOcup->begin_transaction();
    try {
        $stmtUp = $mysqliOcup->prepare('UPDATE ocupacional_interconsultas
                                        SET estado = "respondida", especialista_nombre = ?, respuesta = ?,
                                            respuesta_documento = ?, respuesta_at = CURRENT_TIMESTAMP,
                                            respondida_by = ?, updated_by = ?
                                        WHERE id = ? LIMIT 1');
        $stmtUp->bind_param('sssiii', $especialista, $respuesta, $document, $usuarioId, $usuarioId, $id);
        $stmtUp->execute();
        $stmtUp->close();
        registrar_evento_interconsulta($mysqliOcup, (int)$row['orden_id'], 'interconsulta_respondida', 'Respuesta de interconsulta registrada', $usuarioId, [
            'interconsulta_id' => $id,
            'especialista' => $especialista,
            'documento' => $document,
        ]);
        $mysqliOcup->commit();
        out_interconsulta(200, ['success' => true, 'data' => ['id' => $id, 'estado' => 'respondida', 'respuesta_documento' => $document]]);
    } catch (Throwable $e) {
        $mysqliOcup->rollback();
        if ($newDocument !== null) {
            $newAbsolutePath = __DIR__ . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $newDocument);
            if (is_file($newAbsolutePath)) {
                unlink($newAbsolutePath);
            }
        }
        out_interconsulta(500, ['success' => false, 'error' => 'No se pudo registrar respuesta de interconsulta']);
    }
}

if ($accion === 'levantar') {
    require_permiso_interconsulta(['cerrar_ordenes_ocupacional', 'ejecutar_ordenes_ocupacional']);
    $id = (int)($payload['id'] ?? 0);
    $levantamiento = trim((string)($payload['levantamiento'] ?? ''));
    $recomendacion = trim((string)($payload['recomendacion'] ?? ''));
    $resultado = strtoupper(trim((string)($payload['resultado_levantamiento'] ?? '')));
    $medico = require_medico_levantamiento($mysqli, (int)($payload['medico_id'] ?? 0));
    if ($id <= 0 || $levantamiento === '' || $recomendacion === '' || !in_array($resultado, ['FAVORABLE', 'NO_FAVORABLE'], true)) {
        out_interconsulta(422, ['success' => false, 'error' => 'levantamiento, recomendacion y resultado valido son obligatorios']);
    }
    $mysqliOcup->begin_transaction();
    try {
        $stmtFind = $mysqliOcup->prepare('SELECT i.id, i.orden_id, i.orden_detalle_id, i.estado,
                                                d.estado_ejecucion, o.estado AS estado_orden
                                         FROM ocupacional_interconsultas i
                                         INNER JOIN ocupacional_orden_detalle d ON d.id = i.orden_detalle_id
                                         INNER JOIN ocupacional_ordenes o ON o.id = i.orden_id
                                         WHERE i.id = ? FOR UPDATE');
        $stmtFind->bind_param('i', $id);
        $stmtFind->execute();
        $row = $stmtFind->get_result()->fetch_assoc();
        $stmtFind->close();
        if (!$row || (string)$row['estado'] !== 'respondida') {
            throw new DomainException('La interconsulta debe estar respondida antes del levantamiento');
        }
        if ((string)$row['estado_ejecucion'] !== 'observado' || in_array((string)$row['estado_orden'], ['cerrada', 'anulada'], true)) {
            throw new DomainException('El examen observado ya no esta disponible para levantamiento');
        }
        $stmtUp = $mysqliOcup->prepare('UPDATE ocupacional_interconsultas
                                        SET estado = "levantada", levantamiento = ?, recomendacion = ?,
                                            resultado_levantamiento = ?, medico_levantamiento_id = ?,
                                            medico_levantamiento_nombre_snapshot = ?, medico_levantamiento_cmp_snapshot = ?,
                                            levantamiento_at = CURRENT_TIMESTAMP, levantada_by = ?, updated_by = ?
                                        WHERE id = ? LIMIT 1');
        $stmtUp->bind_param('sssissiii', $levantamiento, $recomendacion, $resultado, $medico['id'], $medico['nombre'], $medico['cmp'], $usuarioId, $usuarioId, $id);
        $stmtUp->execute();
        $stmtUp->close();
        $detalleId = (int)$row['orden_detalle_id'];
        $stmtDet = $mysqliOcup->prepare('UPDATE ocupacional_orden_detalle
                                         SET estado_ejecucion = "en_proceso", fecha_ejecucion = NULL,
                                             observacion_ejecucion = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
                                         WHERE id = ? LIMIT 1');
        $detalleObservacion = 'Observacion levantada. Debe finalizar nuevamente el resultado clinico.';
        $stmtDet->bind_param('sii', $detalleObservacion, $usuarioId, $detalleId);
        $stmtDet->execute();
        $stmtDet->close();
        $ordenId = (int)$row['orden_id'];
        $stmtOrden = $mysqliOcup->prepare('UPDATE ocupacional_ordenes
                                           SET estado = "en_proceso", updated_by = ?, updated_at = CURRENT_TIMESTAMP
                                           WHERE id = ? AND estado NOT IN ("cerrada", "anulada") LIMIT 1');
        $stmtOrden->bind_param('ii', $usuarioId, $ordenId);
        $stmtOrden->execute();
        $stmtOrden->close();
        registrar_evento_interconsulta($mysqliOcup, $ordenId, 'observacion_levantada', 'Observacion clinica levantada', $usuarioId, [
            'interconsulta_id' => $id,
            'detalle_id' => $detalleId,
            'resultado' => $resultado,
            'medico_id' => $medico['id'],
            'medico_cmp' => $medico['cmp'],
        ]);
        $mysqliOcup->commit();
        out_interconsulta(200, ['success' => true, 'data' => ['id' => $id, 'estado' => 'levantada', 'detalle_estado' => 'en_proceso']]);
    } catch (DomainException $e) {
        $mysqliOcup->rollback();
        out_interconsulta(422, ['success' => false, 'error' => $e->getMessage()]);
    } catch (Throwable $e) {
        $mysqliOcup->rollback();
        out_interconsulta(500, ['success' => false, 'error' => 'No se pudo registrar levantamiento']);
    }
}

if ($accion === 'anular') {
    require_permiso_interconsulta(['ejecutar_ordenes_ocupacional']);
    $id = (int)($payload['id'] ?? 0);
    $motivo = trim((string)($payload['motivo'] ?? ''));
    if ($id <= 0 || $motivo === '') {
        out_interconsulta(422, ['success' => false, 'error' => 'id y motivo son obligatorios']);
    }
    $mysqliOcup->begin_transaction();
    try {
        $stmtFind = $mysqliOcup->prepare('SELECT id, orden_id, orden_detalle_id, estado FROM ocupacional_interconsultas WHERE id = ? FOR UPDATE');
        $stmtFind->bind_param('i', $id);
        $stmtFind->execute();
        $row = $stmtFind->get_result()->fetch_assoc();
        $stmtFind->close();
        if (!$row || !in_array((string)$row['estado'], ['solicitada', 'respondida'], true)) {
            throw new DomainException('La interconsulta no se puede anular');
        }
        $stmtUp = $mysqliOcup->prepare('UPDATE ocupacional_interconsultas
                                        SET estado = "anulada", anulacion_motivo = ?, anulada_at = CURRENT_TIMESTAMP,
                                            anulada_by = ?, updated_by = ? WHERE id = ? LIMIT 1');
        $stmtUp->bind_param('siii', $motivo, $usuarioId, $usuarioId, $id);
        $stmtUp->execute();
        $stmtUp->close();
        $detalleId = (int)$row['orden_detalle_id'];
        $stmtDet = $mysqliOcup->prepare('UPDATE ocupacional_orden_detalle
                                         SET estado_ejecucion = "en_proceso", fecha_ejecucion = NULL,
                                             observacion_ejecucion = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
                                         WHERE id = ? AND estado_ejecucion = "observado" LIMIT 1');
        $detalleObservacion = 'Interconsulta anulada: ' . $motivo . '. Debe finalizar nuevamente el resultado clinico.';
        $stmtDet->bind_param('sii', $detalleObservacion, $usuarioId, $detalleId);
        $stmtDet->execute();
        $stmtDet->close();
        $ordenId = (int)$row['orden_id'];
        registrar_evento_interconsulta($mysqliOcup, $ordenId, 'interconsulta_anulada', 'Interconsulta ocupacional anulada', $usuarioId, [
            'interconsulta_id' => $id,
            'detalle_id' => $detalleId,
            'motivo' => $motivo,
        ]);
        $mysqliOcup->commit();
        out_interconsulta(200, ['success' => true, 'data' => ['id' => $id, 'estado' => 'anulada']]);
    } catch (DomainException $e) {
        $mysqliOcup->rollback();
        out_interconsulta(422, ['success' => false, 'error' => $e->getMessage()]);
    } catch (Throwable $e) {
        $mysqliOcup->rollback();
        out_interconsulta(500, ['success' => false, 'error' => 'No se pudo anular interconsulta']);
    }
}

out_interconsulta(422, ['success' => false, 'error' => 'accion no soportada']);