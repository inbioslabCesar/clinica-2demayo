<?php

require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/db_ocupacional.php';

function out_hist($code, $payload)
{
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload);
    exit;
}

function parse_session_permisos_hist()
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

function require_ocup_permiso_any_hist($permisosValidos, $fallback = 'registrar_ordenes_ocupacional')
{
    $usuario = $_SESSION['usuario'] ?? null;
    if (!is_array($usuario)) {
        out_hist(401, ['success' => false, 'error' => 'No autenticado']);
    }

    $rol = strtolower(trim((string)($usuario['rol'] ?? '')));
    if ($rol === 'administrador') {
        return;
    }

    $permisos = parse_session_permisos_hist();
    if (!in_array('access_salud_ocupacional', $permisos, true)) {
        out_hist(403, ['success' => false, 'error' => 'No autorizado para salud ocupacional']);
    }

    $lista = is_array($permisosValidos) ? $permisosValidos : [$permisosValidos];
    if ($fallback !== '') {
        $lista[] = $fallback;
    }

    foreach ($lista as $perm) {
        $p = trim((string)$perm);
        if ($p !== '' && in_array($p, $permisos, true)) {
            return;
        }
    }

    out_hist(403, ['success' => false, 'error' => 'No autorizado para esta accion']);
}

function table_exists_hist($conn, $table)
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

function obtener_orden_hist($conn, $ordenId)
{
    $stmt = $conn->prepare('SELECT id, empresa_id, trabajador_id, protocolo_id, tipo_evaluacion_id, estado, fecha_orden FROM ocupacional_ordenes WHERE id = ? LIMIT 1');
    if (!$stmt) {
        out_hist(500, ['success' => false, 'error' => 'No se pudo validar orden']);
    }
    $stmt->bind_param('i', $ordenId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$row) {
        out_hist(404, ['success' => false, 'error' => 'Orden ocupacional no encontrada']);
    }

    return $row;
}

function require_orden_editable_hist($conn, $ordenId)
{
    $orden = obtener_orden_hist($conn, $ordenId);
    $estado = (string)($orden['estado'] ?? '');
    if (in_array($estado, ['cerrada', 'anulada'], true)) {
        out_hist(422, ['success' => false, 'error' => 'La orden no permite editar historia ocupacional porque esta cerrada o anulada']);
    }
    return $orden;
}

function normalize_json_hist($value, $fieldName)
{
    if ($value === null || $value === '') {
        return null;
    }
    if (is_array($value)) {
        return json_encode($value, JSON_UNESCAPED_UNICODE);
    }
    if (is_object($value)) {
        return json_encode($value, JSON_UNESCAPED_UNICODE);
    }

    $text = trim((string)$value);
    if ($text === '') {
        return null;
    }

    json_decode($text, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        out_hist(422, ['success' => false, 'error' => $fieldName . ' debe ser JSON valido']);
    }
    return $text;
}

function format_historia_row($row)
{
    return [
        'id' => (int)$row['id'],
        'orden_id' => (int)$row['orden_id'],
        'empresa_id' => (int)$row['empresa_id'],
        'trabajador_id' => (int)$row['trabajador_id'],
        'protocolo_id' => isset($row['protocolo_id']) ? (int)$row['protocolo_id'] : null,
        'tipo_evaluacion_id' => isset($row['tipo_evaluacion_id']) ? (int)$row['tipo_evaluacion_id'] : null,
        'motivo_evaluacion' => (string)($row['motivo_evaluacion'] ?? ''),
        'puesto_actual' => (string)($row['puesto_actual'] ?? ''),
        'area_trabajo' => (string)($row['area_trabajo'] ?? ''),
        'tiempo_puesto_meses' => isset($row['tiempo_puesto_meses']) ? (int)$row['tiempo_puesto_meses'] : null,
        'antecedentes_laborales_json' => $row['antecedentes_laborales_json'] !== null ? json_decode((string)$row['antecedentes_laborales_json'], true) : null,
        'antecedentes_patologicos_json' => $row['antecedentes_patologicos_json'] !== null ? json_decode((string)$row['antecedentes_patologicos_json'], true) : null,
        'habitos_json' => $row['habitos_json'] !== null ? json_decode((string)$row['habitos_json'], true) : null,
        'observaciones' => (string)($row['observaciones'] ?? ''),
        'estado' => (string)($row['estado'] ?? 'activo'),
        'anulado_motivo' => (string)($row['anulado_motivo'] ?? ''),
        'anulado_by' => isset($row['anulado_by']) ? (int)$row['anulado_by'] : null,
        'anulado_at' => (string)($row['anulado_at'] ?? ''),
        'created_by' => isset($row['created_by']) ? (int)$row['created_by'] : null,
        'updated_by' => isset($row['updated_by']) ? (int)$row['updated_by'] : null,
        'created_at' => (string)($row['created_at'] ?? ''),
        'updated_at' => (string)($row['updated_at'] ?? ''),
    ];
}

$requiredTables = [
    'ocupacional_ordenes',
    'ocupacional_historia_ocupacional',
];

foreach ($requiredTables as $table) {
    if (!table_exists_hist($mysqliOcup, $table)) {
        out_hist(500, [
            'success' => false,
            'error' => 'Falta la tabla ' . $table . '. Aplicar scripts SQL de Fase 4 en la base ocupacional.',
        ]);
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $accion = trim((string)($_GET['accion'] ?? 'listar'));

    if ($accion === 'listar') {
        require_ocup_permiso_any_hist(['ver_ordenes_ocupacional', 'ejecutar_ordenes_ocupacional']);
        $ordenId = (int)($_GET['orden_id'] ?? 0);
        if ($ordenId <= 0) {
            out_hist(422, ['success' => false, 'error' => 'orden_id es obligatorio']);
        }

        $orden = obtener_orden_hist($mysqliOcup, $ordenId);
        $stmt = $mysqliOcup->prepare('SELECT * FROM ocupacional_historia_ocupacional WHERE orden_id = ? AND estado <> "anulado" ORDER BY id DESC');
        if (!$stmt) {
            out_hist(500, ['success' => false, 'error' => 'No se pudo listar historia ocupacional']);
        }
        $stmt->bind_param('i', $ordenId);
        $stmt->execute();
        $res = $stmt->get_result();
        $rows = [];
        while ($row = $res->fetch_assoc()) {
            $rows[] = format_historia_row($row);
        }
        $stmt->close();

        out_hist(200, [
            'success' => true,
            'orden' => $orden,
            'data' => $rows,
        ]);
    }

    if ($accion === 'obtener') {
        require_ocup_permiso_any_hist(['ver_ordenes_ocupacional', 'ejecutar_ordenes_ocupacional']);
        $id = (int)($_GET['id'] ?? 0);
        if ($id <= 0) {
            out_hist(422, ['success' => false, 'error' => 'id es obligatorio']);
        }

        $stmt = $mysqliOcup->prepare('SELECT * FROM ocupacional_historia_ocupacional WHERE id = ? LIMIT 1');
        if (!$stmt) {
            out_hist(500, ['success' => false, 'error' => 'No se pudo consultar historia ocupacional']);
        }
        $stmt->bind_param('i', $id);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if (!$row) {
            out_hist(404, ['success' => false, 'error' => 'Historia ocupacional no encontrada']);
        }

        out_hist(200, [
            'success' => true,
            'data' => format_historia_row($row),
            'orden' => obtener_orden_hist($mysqliOcup, (int)$row['orden_id']),
        ]);
    }

    out_hist(422, ['success' => false, 'error' => 'accion GET no soportada']);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    out_hist(405, ['success' => false, 'error' => 'Metodo no permitido']);
}

$raw = file_get_contents('php://input');
$payload = json_decode($raw, true);
if (!is_array($payload)) {
    $payload = $_POST;
}

$accion = trim((string)($payload['accion'] ?? ''));
$usuarioId = isset($_SESSION['usuario']['id']) ? (int)$_SESSION['usuario']['id'] : null;

if ($accion === 'guardar') {
    require_ocup_permiso_any_hist(['ejecutar_ordenes_ocupacional', 'registrar_ordenes_ocupacional']);

    $id = (int)($payload['id'] ?? 0);
    $ordenId = (int)($payload['orden_id'] ?? 0);
    if ($ordenId <= 0) {
        out_hist(422, ['success' => false, 'error' => 'orden_id es obligatorio']);
    }

    $orden = require_orden_editable_hist($mysqliOcup, $ordenId);
    $motivoEvaluacion = trim((string)($payload['motivo_evaluacion'] ?? ''));
    $puestoActual = trim((string)($payload['puesto_actual'] ?? ''));
    $areaTrabajo = trim((string)($payload['area_trabajo'] ?? ''));
    $tiempoPuestoRaw = trim((string)($payload['tiempo_puesto_meses'] ?? ''));
    $observaciones = trim((string)($payload['observaciones'] ?? ''));

    $tiempoPuestoMeses = null;
    if ($tiempoPuestoRaw !== '') {
        if (!ctype_digit($tiempoPuestoRaw)) {
            out_hist(422, ['success' => false, 'error' => 'tiempo_puesto_meses debe ser entero no negativo']);
        }
        $tiempoPuestoMeses = (int)$tiempoPuestoRaw;
    }

    $antecedentesLaboralesJson = normalize_json_hist($payload['antecedentes_laborales_json'] ?? null, 'antecedentes_laborales_json');
    $antecedentesPatologicosJson = normalize_json_hist($payload['antecedentes_patologicos_json'] ?? null, 'antecedentes_patologicos_json');
    $habitosJson = normalize_json_hist($payload['habitos_json'] ?? null, 'habitos_json');

    if ($id > 0) {
        $stmtExists = $mysqliOcup->prepare('SELECT id FROM ocupacional_historia_ocupacional WHERE id = ? AND orden_id = ? LIMIT 1');
        if (!$stmtExists) {
            out_hist(500, ['success' => false, 'error' => 'No se pudo validar historia ocupacional']);
        }
        $stmtExists->bind_param('ii', $id, $ordenId);
        $stmtExists->execute();
        $exists = $stmtExists->get_result()->fetch_assoc();
        $stmtExists->close();
        if (!$exists) {
            out_hist(404, ['success' => false, 'error' => 'Historia ocupacional no encontrada para la orden']);
        }

        $stmt = $mysqliOcup->prepare('UPDATE ocupacional_historia_ocupacional
                                      SET motivo_evaluacion = ?,
                                          puesto_actual = ?,
                                          area_trabajo = ?,
                                          tiempo_puesto_meses = ?,
                                          antecedentes_laborales_json = ?,
                                          antecedentes_patologicos_json = ?,
                                          habitos_json = ?,
                                          observaciones = ?,
                                          updated_by = ?,
                                          updated_at = NOW()
                                      WHERE id = ? LIMIT 1');
        if (!$stmt) {
            out_hist(500, ['success' => false, 'error' => 'No se pudo actualizar historia ocupacional']);
        }
        $stmt->bind_param('sssissssii', $motivoEvaluacion, $puestoActual, $areaTrabajo, $tiempoPuestoMeses, $antecedentesLaboralesJson, $antecedentesPatologicosJson, $habitosJson, $observaciones, $usuarioId, $id);
        $stmt->execute();
        $stmt->close();

        $stmtGet = $mysqliOcup->prepare('SELECT * FROM ocupacional_historia_ocupacional WHERE id = ? LIMIT 1');
        $stmtGet->bind_param('i', $id);
        $stmtGet->execute();
        $row = $stmtGet->get_result()->fetch_assoc();
        $stmtGet->close();

        out_hist(200, [
            'success' => true,
            'message' => 'Historia ocupacional actualizada',
            'orden' => $orden,
            'data' => format_historia_row($row),
        ]);
    }

    $stmt = $mysqliOcup->prepare('INSERT INTO ocupacional_historia_ocupacional
                                  (orden_id, empresa_id, trabajador_id, protocolo_id, tipo_evaluacion_id, motivo_evaluacion, puesto_actual, area_trabajo, tiempo_puesto_meses, antecedentes_laborales_json, antecedentes_patologicos_json, habitos_json, observaciones, estado, created_by, updated_by)
                                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, "activo", ?, ?)');
    if (!$stmt) {
        out_hist(500, ['success' => false, 'error' => 'No se pudo registrar historia ocupacional']);
    }
    $empresaId = (int)$orden['empresa_id'];
    $trabajadorId = (int)$orden['trabajador_id'];
    $protocoloId = (int)$orden['protocolo_id'];
    $tipoEvaluacionId = (int)$orden['tipo_evaluacion_id'];
    $stmt->bind_param('iiiiisssissssii', $ordenId, $empresaId, $trabajadorId, $protocoloId, $tipoEvaluacionId, $motivoEvaluacion, $puestoActual, $areaTrabajo, $tiempoPuestoMeses, $antecedentesLaboralesJson, $antecedentesPatologicosJson, $habitosJson, $observaciones, $usuarioId, $usuarioId);
    $stmt->execute();
    $newId = (int)$stmt->insert_id;
    $stmt->close();

    $stmtGet = $mysqliOcup->prepare('SELECT * FROM ocupacional_historia_ocupacional WHERE id = ? LIMIT 1');
    $stmtGet->bind_param('i', $newId);
    $stmtGet->execute();
    $row = $stmtGet->get_result()->fetch_assoc();
    $stmtGet->close();

    out_hist(201, [
        'success' => true,
        'message' => 'Historia ocupacional registrada',
        'orden' => $orden,
        'data' => format_historia_row($row),
    ]);
}

if ($accion === 'anular') {
    require_ocup_permiso_any_hist(['ejecutar_ordenes_ocupacional', 'cerrar_ordenes_ocupacional']);

    $id = (int)($payload['id'] ?? 0);
    $motivo = trim((string)($payload['motivo'] ?? ''));
    if ($id <= 0) {
        out_hist(422, ['success' => false, 'error' => 'id es obligatorio']);
    }

    $stmtFind = $mysqliOcup->prepare('SELECT id, orden_id, estado FROM ocupacional_historia_ocupacional WHERE id = ? LIMIT 1');
    if (!$stmtFind) {
        out_hist(500, ['success' => false, 'error' => 'No se pudo validar historia ocupacional']);
    }
    $stmtFind->bind_param('i', $id);
    $stmtFind->execute();
    $row = $stmtFind->get_result()->fetch_assoc();
    $stmtFind->close();
    if (!$row) {
        out_hist(404, ['success' => false, 'error' => 'Historia ocupacional no encontrada']);
    }
    if ((string)$row['estado'] === 'anulado') {
        out_hist(422, ['success' => false, 'error' => 'La historia ocupacional ya se encuentra anulada']);
    }

    require_orden_editable_hist($mysqliOcup, (int)$row['orden_id']);

    $stmt = $mysqliOcup->prepare('UPDATE ocupacional_historia_ocupacional
                                  SET estado = "anulado",
                                      anulado_motivo = ?,
                                      anulado_by = ?,
                                      anulado_at = NOW(),
                                      updated_by = ?,
                                      updated_at = NOW()
                                  WHERE id = ? LIMIT 1');
    if (!$stmt) {
        out_hist(500, ['success' => false, 'error' => 'No se pudo anular historia ocupacional']);
    }
    $stmt->bind_param('siii', $motivo, $usuarioId, $usuarioId, $id);
    $stmt->execute();
    $stmt->close();

    out_hist(200, ['success' => true, 'message' => 'Historia ocupacional anulada']);
}

out_hist(422, ['success' => false, 'error' => 'accion POST no soportada']);