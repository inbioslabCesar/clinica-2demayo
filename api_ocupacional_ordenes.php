<?php

require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db_ocupacional.php';

function out_orden($code, $payload)
{
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload);
    exit;
}

function with_debug_sql_error_orden($payload, $conn)
{
    if (function_exists('api_debug_enabled') && api_debug_enabled() && $conn instanceof mysqli) {
        $payload['sql_error'] = (string)($conn->error ?? '');
        $payload['sql_errno'] = (int)($conn->errno ?? 0);
    }
    return $payload;
}

function bind_params_dynamic_orden($stmt, $types, $params)
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

function parse_session_permisos_orden()
{
    $raw = $_SESSION['usuario']['permisos'] ?? [];
    if (is_string($raw)) {
        $decoded = json_decode($raw, true);
        $raw = is_array($decoded) ? $decoded : [];
    }
    if (!is_array($raw)) {
        return [];
    }
    return array_values(array_filter(array_map('strval', $raw), function ($v) {
        return trim($v) !== '';
    }));
}

function resolve_medico_sesion_id_orden()
{
    $usuario = $_SESSION['usuario'] ?? null;
    if (!is_array($usuario)) {
        return 0;
    }
    $id = (int)($_SESSION['medico_id'] ?? ($usuario['medico_id'] ?? ($usuario['id'] ?? 0)));
    return $id > 0 ? $id : 0;
}

function es_sesion_medico_orden()
{
    $usuario = $_SESSION['usuario'] ?? null;
    if (!is_array($usuario)) {
        return false;
    }
    $rol = strtolower(trim((string)($usuario['rol'] ?? '')));
    return $rol === 'medico' && resolve_medico_sesion_id_orden() > 0;
}

function es_sesion_enfermero_orden()
{
    $usuario = $_SESSION['usuario'] ?? null;
    if (!is_array($usuario)) {
        return false;
    }
    $rol = strtolower(trim((string)($usuario['rol'] ?? '')));
    return $rol === 'enfermero';
}

function es_sesion_laboratorista_orden()
{
    $usuario = $_SESSION['usuario'] ?? null;
    if (!is_array($usuario)) {
        return false;
    }
    $rol = strtolower(trim((string)($usuario['rol'] ?? '')));
    return $rol === 'laboratorista';
}

function es_detalle_triaje_orden($examenCodigo, $examenDescripcion, $examenGrupo = '')
{
    $codigo = strtoupper(trim((string)$examenCodigo));
    if ($codigo === 'TRI_0001') {
        return true;
    }
    $desc = strtolower(trim((string)$examenDescripcion . ' ' . (string)$examenGrupo));
    return strpos($desc, 'triaje') !== false || strpos($desc, 'triage') !== false;
}

function es_detalle_psicologico_orden($examenCodigo, $examenDescripcion, $examenGrupo = '', $examenSubgrupo = '')
{
    $codigo = strtoupper(trim((string)$examenCodigo));
    if ($codigo === 'PSI_0001' || $codigo === 'EPW_0001' || $codigo === 'FOBIA') {
        return true;
    }
    if (strpos($codigo, 'PSI_') === 0) {
        return true;
    }
    $texto = strtoupper(trim((string)$examenDescripcion . ' ' . (string)$examenGrupo . ' ' . (string)$examenSubgrupo));
    if ($texto === '') {
        return false;
    }
    return strpos($texto, 'PSICOLOG') !== false;
}

function require_owner_medico_orden($ownerMedicoId, $contexto = 'orden')
{
    if (!es_sesion_medico_orden()) {
        return;
    }
    $medicoSesionId = resolve_medico_sesion_id_orden();
    if ($medicoSesionId <= 0 || (int)$ownerMedicoId <= 0 || $medicoSesionId !== (int)$ownerMedicoId) {
        out_orden(403, ['success' => false, 'error' => 'No autorizado para acceder a este ' . $contexto]);
    }
}

function medico_es_responsable_clinico_en_orden_orden($mysqliOcup, $ordenId, $medicoId)
{
    $oid = (int)$ordenId;
    $mid = (int)$medicoId;
    if ($oid <= 0 || $mid <= 0) {
        return false;
    }
    if (!table_exists_orden($mysqliOcup, 'ocupacional_resultados_clinicos')) {
        return false;
    }

    $stmt = $mysqliOcup->prepare('SELECT 1
                                  FROM ocupacional_orden_detalle od
                                  INNER JOIN ocupacional_resultados_clinicos rc ON rc.orden_detalle_id = od.id
                                  WHERE od.orden_id = ?
                                    AND COALESCE(rc.estado, "") <> "anulado"
                                    AND CAST(JSON_UNQUOTE(JSON_EXTRACT(rc.datos_json, "$.responsable_profesional_id")) AS UNSIGNED) = ?
                                  LIMIT 1');
    if (!$stmt) {
        return false;
    }
    $stmt->bind_param('ii', $oid, $mid);
    $stmt->execute();
    $exists = (bool)$stmt->get_result()->fetch_row();
    $stmt->close();
    return $exists;
}

function medico_grupos_clinicos_autorizados_en_orden_orden($mysqliOcup, $ordenId, $medicoId)
{
    $oid = (int)$ordenId;
    $mid = (int)$medicoId;
    if ($oid <= 0 || $mid <= 0) {
        return [];
    }
    if (!table_exists_orden($mysqliOcup, 'ocupacional_resultados_clinicos')) {
        return [];
    }

        $stmt = $mysqliOcup->prepare('SELECT od.examen_codigo,
                                                                                 od.examen_descripcion,
                                                                                 COALESCE(NULLIF(od.grupo_snapshot, ""), eg.grupo, "") AS grupo_autorizado,
                                                                                 COALESCE(NULLIF(od.subgrupo_snapshot, ""), eg.subgrupo, "") AS subgrupo_autorizado
                                  FROM ocupacional_orden_detalle od
                                  LEFT JOIN ocupacional_examenes_generales eg ON eg.id = od.examen_id
                                  INNER JOIN ocupacional_resultados_clinicos rc ON rc.orden_detalle_id = od.id
                                  WHERE od.orden_id = ?
                                    AND COALESCE(rc.estado, "") <> "anulado"
                                    AND CAST(JSON_UNQUOTE(JSON_EXTRACT(rc.datos_json, "$.responsable_profesional_id")) AS UNSIGNED) = ?');
    if (!$stmt) {
        return [];
    }

    $stmt->bind_param('ii', $oid, $mid);
    $stmt->execute();
    $res = $stmt->get_result();

    $grupos = [];
    while ($row = $res->fetch_assoc()) {
        $g = strtoupper(trim((string)($row['grupo_autorizado'] ?? '')));
        if ($g !== '') {
            $grupos[$g] = true;
        }

        if (es_detalle_psicologico_orden(
            (string)($row['examen_codigo'] ?? ''),
            (string)($row['examen_descripcion'] ?? ''),
            (string)($row['grupo_autorizado'] ?? ''),
            (string)($row['subgrupo_autorizado'] ?? '')
        )) {
            $grupos['PSICOLOGIA'] = true;
        }
    }
    $stmt->close();

    return array_keys($grupos);
}

function require_owner_medico_by_orden_id_orden($mysqliOcup, $ordenId, $ordenExtraColumns, $contexto = 'orden')
{
    if (!es_sesion_medico_orden()) {
        return;
    }
    if (empty($ordenExtraColumns['medico_responsable_id'])) {
        out_orden(500, ['success' => false, 'error' => 'Falta columna medico_responsable_id para validar ownership medico']);
    }
    $stmtOwner = $mysqliOcup->prepare('SELECT medico_responsable_id FROM ocupacional_ordenes WHERE id = ? LIMIT 1');
    if (!$stmtOwner) {
        out_orden(500, ['success' => false, 'error' => 'No se pudo validar ownership medico']);
    }
    $stmtOwner->bind_param('i', $ordenId);
    $stmtOwner->execute();
    $owner = $stmtOwner->get_result()->fetch_assoc();
    $stmtOwner->close();
    if (!$owner) {
        out_orden(404, ['success' => false, 'error' => 'Orden no encontrada']);
    }
    require_owner_medico_orden((int)($owner['medico_responsable_id'] ?? 0), $contexto);
}

function require_ocup_permiso_orden($permiso)
{
    $usuario = $_SESSION['usuario'] ?? null;
    if (!is_array($usuario)) {
        out_orden(401, ['success' => false, 'error' => 'No autenticado']);
    }

    $rol = strtolower(trim((string)($usuario['rol'] ?? '')));
    if ($rol === 'administrador') {
        return;
    }

    $permisos = parse_session_permisos_orden();
    if (!in_array('access_salud_ocupacional', $permisos, true) || !in_array($permiso, $permisos, true)) {
        out_orden(403, ['success' => false, 'error' => 'No autorizado para esta accion']);
    }
}

function require_ocup_access_orden()
{
    $usuario = $_SESSION['usuario'] ?? null;
    if (!is_array($usuario)) {
        out_orden(401, ['success' => false, 'error' => 'No autenticado']);
    }

    $rol = strtolower(trim((string)($usuario['rol'] ?? '')));
    if ($rol === 'administrador') {
        return;
    }
    if ($rol === 'medico' && resolve_medico_sesion_id_orden() > 0) {
        return;
    }
    if ($rol === 'enfermero') {
        return;
    }
    if ($rol === 'laboratorista') {
        return;
    }

    $permisos = parse_session_permisos_orden();
    if (!in_array('access_salud_ocupacional', $permisos, true)) {
        out_orden(403, ['success' => false, 'error' => 'No autorizado para salud ocupacional']);
    }
}

function require_ocup_permiso_any_orden($permisosValidos, $fallback = 'registrar_trabajadores_ocupacional')
{
    $usuario = $_SESSION['usuario'] ?? null;
    if (!is_array($usuario)) {
        out_orden(401, ['success' => false, 'error' => 'No autenticado']);
    }

    $rol = strtolower(trim((string)($usuario['rol'] ?? '')));
    if ($rol === 'administrador') {
        return;
    }

    if ($rol === 'medico' && resolve_medico_sesion_id_orden() > 0) {
        $lista = is_array($permisosValidos) ? $permisosValidos : [$permisosValidos];
        $permitidosMedico = [
            'ver_ordenes_ocupacional',
            'ejecutar_ordenes_ocupacional',
            'cerrar_ordenes_ocupacional',
            'emitir_certificados_ocupacional',
        ];
        foreach ($lista as $perm) {
            $p = trim((string)$perm);
            if ($p !== '' && in_array($p, $permitidosMedico, true)) {
                return;
            }
        }
        out_orden(403, ['success' => false, 'error' => 'No autorizado para esta accion']);
    }

    if ($rol === 'enfermero') {
        $lista = is_array($permisosValidos) ? $permisosValidos : [$permisosValidos];
        if ($fallback !== '') {
            $lista[] = $fallback;
        }
        $permitidosEnfermero = [
            'ver_ordenes_ocupacional',
            'ejecutar_ordenes_ocupacional',
        ];
        foreach ($lista as $perm) {
            $p = trim((string)$perm);
            if ($p !== '' && in_array($p, $permitidosEnfermero, true)) {
                return;
            }
        }
        out_orden(403, ['success' => false, 'error' => 'No autorizado para esta accion']);
    }

    if ($rol === 'laboratorista') {
        $lista = is_array($permisosValidos) ? $permisosValidos : [$permisosValidos];
        if ($fallback !== '') {
            $lista[] = $fallback;
        }
        $permitidosLaboratorio = [
            'ver_ordenes_ocupacional',
            'ejecutar_ordenes_ocupacional',
        ];
        foreach ($lista as $perm) {
            $p = trim((string)$perm);
            if ($p !== '' && in_array($p, $permitidosLaboratorio, true)) {
                return;
            }
        }
        out_orden(403, ['success' => false, 'error' => 'No autorizado para esta accion']);
    }

    $permisos = parse_session_permisos_orden();
    if (!in_array('access_salud_ocupacional', $permisos, true)) {
        out_orden(403, ['success' => false, 'error' => 'No autorizado para salud ocupacional']);
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

    out_orden(403, ['success' => false, 'error' => 'No autorizado para esta accion']);
}

function is_safe_identifier_orden($value)
{
    return preg_match('/^[A-Za-z0-9_]+$/', (string)$value) === 1;
}

function table_exists_orden($conn, $table)
{
    $table = trim((string)$table);
    if ($table === '' || !is_safe_identifier_orden($table)) {
        return false;
    }

    // Prefer SHOW TABLES for hosting environments where information_schema is restricted.
    $tableEscaped = $conn->real_escape_string($table);
    $res = $conn->query("SHOW TABLES LIKE '{$tableEscaped}'");
    if ($res instanceof mysqli_result) {
        $exists = $res->num_rows > 0;
        $res->free();
        return $exists;
    }

    // Fallback for environments where SHOW TABLES may be blocked.
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

function column_exists_orden($conn, $table, $column)
{
    $table = trim((string)$table);
    $column = trim((string)$column);
    if ($table === '' || $column === '' || !is_safe_identifier_orden($table) || !is_safe_identifier_orden($column)) {
        return false;
    }

    // Prefer SHOW COLUMNS to avoid dependency on information_schema privileges.
    $columnEscaped = $conn->real_escape_string($column);
    $res = $conn->query("SHOW COLUMNS FROM `{$table}` LIKE '{$columnEscaped}'");
    if ($res instanceof mysqli_result) {
        $exists = $res->num_rows > 0;
        $res->free();
        return $exists;
    }

    // Fallback for environments where SHOW COLUMNS may be blocked.
    $stmt = $conn->prepare('SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1');
    if (!$stmt) {
        return false;
    }
    $stmt->bind_param('ss', $table, $column);
    $stmt->execute();
    $exists = (bool)$stmt->get_result()->fetch_row();
    $stmt->close();
    return $exists;
}

function resolve_extra_columns_orden($conn)
{
    $cols = [
        'subcontrata_empresa_id' => false,
        'facturar_empresa_id' => false,
        'firma_doctor' => false,
        'modo' => false,
        'gestante' => false,
        'documento' => false,
        'indica_dr' => false,
        'medico_responsable_id' => false,
        'medico_nombre_snapshot' => false,
        'medico_especialidad_snapshot' => false,
        'medico_cmp_snapshot' => false,
        'medico_rne_snapshot' => false,
        'medico_rna_snapshot' => false,
        'medico_firma_snapshot' => false,
        'aptitud_registrada_by' => false,
        'aptitud_registrada_at' => false,
        'certificado_fecha_evaluacion' => false,
        'certificado_fecha_emision' => false,
    ];

    foreach ($cols as $name => $_) {
        $cols[$name] = column_exists_orden($conn, 'ocupacional_ordenes', $name);
    }

    return $cols;
}

function resolve_extra_columns_detalle_orden($conn)
{
    $cols = [
        'grupo_snapshot' => false,
        'subgrupo_snapshot' => false,
        'grupo_orden_snapshot' => false,
        'examen_orden_snapshot' => false,
        'examen_snapshot_json' => false,
    ];

    foreach ($cols as $name => $_) {
        $cols[$name] = column_exists_orden($conn, 'ocupacional_orden_detalle', $name);
    }

    return $cols;
}

function normalize_text_orden($value)
{
    return strtoupper(trim((string)$value));
}

function normalize_aptitud_enum_orden($value)
{
    $raw = trim((string)$value);
    if ($raw === '') {
        return '';
    }

    $normalized = strtoupper(preg_replace('/\s+/', ' ', str_replace('_', ' ', $raw)));
    $normalized = strtr($normalized, [
        'Á' => 'A',
        'É' => 'E',
        'Í' => 'I',
        'Ó' => 'O',
        'Ú' => 'U',
        'Ñ' => 'N',
    ]);

    if ($normalized === 'APTO CON RESTRICCION' || $normalized === 'APTO CON RESTRICCIONES') {
        return 'APTO_CON_RESTRICCIONES';
    }

    if ($normalized === 'NO APTO' || $normalized === 'NOAPTO') {
        return 'NO_APTO';
    }

    if (in_array($normalized, [
        'OBSERVADO',
        'NO CONCLUIDO',
        'EN PROCESO',
        'COVID POSITIVO',
        'COVID ANTIGENA POSITIVO',
        'EXAMEN COMPLEMENTARIO HCG BETA POSITIVO',
        'PRUEBA ANTIGENA COVID-19 POSITIVO',
    ], true)) {
        return 'NO_APTO';
    }

    if (in_array($normalized, [
        'APTO',
        'SANO',
        'CONCLUIDO - NORMAL',
        'EXAMEN COMPLEMENTARIO CONCLUIDO',
        'EXAMEN DE RETIRO CONCLUIDO',
        'COVID NEGATIVO',
        'COVID ANTIGENA NEGATIVO',
        'EXAMEN COMPLEMENTARIO HCG BETA NEGATIVO',
        'PRUEBA ANTIGENA COVID-19 NEGATIVO',
        'PRUEBA RAPIDA SEROLOGICA COVID-19 IGG/IGM NO REACTIVO',
    ], true)) {
        return 'APTO';
    }

    if (in_array($normalized, ['APTO', 'APTO CON RESTRICCION', 'APTO CON RESTRICCIONES', 'NO APTO'], true)) {
        return $normalized === 'APTO' ? 'APTO' : ($normalized === 'NO APTO' ? 'NO_APTO' : 'APTO_CON_RESTRICCIONES');
    }

    return '';
}

function require_medico_responsable_orden($mysqliCore, $medicoId)
{
    $id = (int)$medicoId;
    if ($id <= 0) {
        out_orden(422, ['success' => false, 'error' => 'medico_responsable_id es obligatorio']);
    }

    $stmt = $mysqliCore->prepare('SELECT id, nombre, apellido, especialidad, cmp, rne, rna, firma,
                                         tipo_profesional, abreviatura_profesional, nro_colegiatura
                                  FROM medicos
                                  WHERE id = ? LIMIT 1');
    if (!$stmt) {
        out_orden(500, ['success' => false, 'error' => 'No se pudo validar medico responsable']);
    }
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $medico = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$medico) {
        out_orden(422, ['success' => false, 'error' => 'Medico responsable no encontrado']);
    }
    if (strtolower(trim((string)($medico['tipo_profesional'] ?? 'medico'))) !== 'medico') {
        out_orden(422, ['success' => false, 'error' => 'El responsable debe estar registrado como medico']);
    }

    $cmp = trim((string)($medico['cmp'] ?? ''));
    if ($cmp === '') {
        $cmp = trim((string)($medico['nro_colegiatura'] ?? ''));
    }
    if ($cmp === '') {
        out_orden(422, ['success' => false, 'error' => 'El medico responsable no tiene CMP registrado']);
    }

    $firma = trim((string)($medico['firma'] ?? ''));
    if ($firma === '') {
        out_orden(422, ['success' => false, 'error' => 'El medico responsable no tiene firma registrada']);
    }

    $abreviatura = trim((string)($medico['abreviatura_profesional'] ?? ''));
    $nombre = trim($abreviatura . ' ' . trim((string)($medico['nombre'] ?? '') . ' ' . (string)($medico['apellido'] ?? '')));

    return [
        'id' => (int)$medico['id'],
        'nombre' => $nombre,
        'apellido' => trim((string)($medico['apellido'] ?? '')),
        'especialidad' => trim((string)($medico['especialidad'] ?? '')),
        'cmp' => $cmp,
        'rne' => trim((string)($medico['rne'] ?? '')),
        'rna' => trim((string)($medico['rna'] ?? '')),
        'firma' => $firma,
    ];
}

function calculate_age_orden($fechaNacimiento)
{
    $fn = trim((string)$fechaNacimiento);
    if ($fn === '') {
        return null;
    }
    $dob = DateTime::createFromFormat('Y-m-d', $fn);
    if (!$dob || $dob->format('Y-m-d') !== $fn) {
        return null;
    }
    $today = new DateTime('now', new DateTimeZone('America/Lima'));
    return (int)$today->diff($dob)->y;
}

function is_valid_date_orden($value)
{
    $v = trim((string)$value);
    if ($v === '') {
        return false;
    }
    $d = DateTime::createFromFormat('Y-m-d', $v);
    return $d && $d->format('Y-m-d') === $v;
}

function resolve_certificado_fechas_orden($fechaOrden, $fechaEvaluacionRef, $fechaEmisionRef)
{
    $fechaOrdenText = trim((string)$fechaOrden);
    $fechaEvaluacionRefText = trim((string)$fechaEvaluacionRef);
    $fechaEmisionRefText = trim((string)$fechaEmisionRef);

    $baseEvaluacion = is_valid_date_orden($fechaOrdenText) ? $fechaOrdenText : date('Y-m-d');
    $fechaEvaluacion = is_valid_date_orden($fechaEvaluacionRefText) ? $fechaEvaluacionRefText : $baseEvaluacion;
    $fechaEmision = is_valid_date_orden($fechaEmisionRefText) ? $fechaEmisionRefText : $fechaEvaluacion;

    return [
        'fecha_evaluacion_ref' => is_valid_date_orden($fechaEvaluacionRefText) ? $fechaEvaluacionRefText : '',
        'fecha_emision_ref' => is_valid_date_orden($fechaEmisionRefText) ? $fechaEmisionRefText : '',
        'fecha_evaluacion' => $fechaEvaluacion,
        'fecha_emision' => $fechaEmision,
    ];
}

function parse_estado_clinico_items_orden($raw)
{
    $items = [];
    $text = trim((string)$raw);
    if ($text === '') {
        return $items;
    }

    $chunks = explode('||', $text);
    foreach ($chunks as $chunk) {
        $part = trim((string)$chunk);
        if ($part === '') {
            continue;
        }
        $segments = explode('::', $part, 3);
        if (count($segments) < 3) {
            continue;
        }

        $id = (int)$segments[0];
        $descripcion = trim((string)$segments[1]);
        $estado = trim((string)$segments[2]);

        if ($id <= 0 || $descripcion === '') {
            continue;
        }
        if (!in_array($estado, ['pendiente', 'en_proceso', 'realizado', 'observado'], true)) {
            $estado = 'pendiente';
        }

        $items[] = [
            'detalle_id' => $id,
            'examen_descripcion' => $descripcion,
            'estado' => $estado,
        ];
    }

    return $items;
}

function registrar_evento_orden($mysqliOcup, $ordenId, $tipo, $descripcion, $usuarioId, $payload = null)
{
    $payloadJson = null;
    if (is_array($payload) && !empty($payload)) {
        $payloadJson = json_encode($payload, JSON_UNESCAPED_UNICODE);
    }

    $stmt = $mysqliOcup->prepare('INSERT INTO ocupacional_orden_eventos
                                  (orden_id, tipo_evento, descripcion, payload_json, created_by)
                                  VALUES (?, ?, ?, ?, ?)');
    if (!$stmt) {
        return;
    }
    $stmt->bind_param('isssi', $ordenId, $tipo, $descripcion, $payloadJson, $usuarioId);
    $stmt->execute();
    $stmt->close();
}

function get_resumen_clinico_orden($mysqliOcup, $ordenId)
{
    $stmt = $mysqliOcup->prepare('SELECT
                                    COUNT(*) AS total,
                                    SUM(CASE WHEN d.estado_ejecucion = "observado" THEN 1 ELSE 0 END) AS observados,
                                    SUM(CASE WHEN d.estado_ejecucion = "realizado"
                                              AND EXISTS (
                                                  SELECT 1
                                                  FROM ocupacional_resultados_clinicos rc
                                                  WHERE rc.orden_detalle_id = d.id
                                                    AND rc.estado = "finalizado"
                                              )
                                             THEN 1 ELSE 0 END) AS finalizados
                                  FROM ocupacional_orden_detalle d
                                  WHERE d.orden_id = ?');
    if (!$stmt) {
        return null;
    }
    $stmt->bind_param('i', $ordenId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    $interconsultasAbiertas = 0;
    if (table_exists_orden($mysqliOcup, 'ocupacional_interconsultas')) {
        $stmtInter = $mysqliOcup->prepare('SELECT COUNT(*) AS total
                                           FROM ocupacional_interconsultas
                                           WHERE orden_id = ? AND estado IN ("solicitada", "respondida")');
        if (!$stmtInter) {
            return null;
        }
        $stmtInter->bind_param('i', $ordenId);
        $stmtInter->execute();
        $interconsultasAbiertas = (int)($stmtInter->get_result()->fetch_assoc()['total'] ?? 0);
        $stmtInter->close();
    }

    return [
        'total' => (int)($row['total'] ?? 0),
        'observados' => (int)($row['observados'] ?? 0),
        'finalizados' => (int)($row['finalizados'] ?? 0),
        'interconsultas_abiertas' => $interconsultasAbiertas,
    ];
}

function require_orden_clinicamente_finalizada($mysqliOcup, $ordenId)
{
    $resumen = get_resumen_clinico_orden($mysqliOcup, $ordenId);
    if ($resumen === null) {
        out_orden(500, ['success' => false, 'error' => 'No se pudo validar resultados clinicos de la orden']);
    }
    if ($resumen['total'] <= 0) {
        out_orden(422, ['success' => false, 'error' => 'La orden no tiene examenes para validar']);
    }
    if ($resumen['observados'] > 0) {
        out_orden(422, ['success' => false, 'error' => 'No se puede continuar. La orden tiene examenes observados pendientes de resolver']);
    }
    if ($resumen['interconsultas_abiertas'] > 0) {
        out_orden(422, ['success' => false, 'error' => 'No se puede continuar. La orden tiene interconsultas pendientes de levantar']);
    }
    if ($resumen['finalizados'] < $resumen['total']) {
        $faltantes = $resumen['total'] - $resumen['finalizados'];
        out_orden(422, [
            'success' => false,
            'error' => 'No se puede continuar. Faltan ' . $faltantes . ' resultado(s) clinico(s) finalizado(s)',
        ]);
    }

    return $resumen;
}

function orden_tiene_certificado_emitido_orden($mysqliOcup, $ordenId)
{
    $stmt = $mysqliOcup->prepare('SELECT 1 FROM ocupacional_orden_eventos WHERE orden_id = ? AND tipo_evento = "certificado_emitido" LIMIT 1');
    if (!$stmt) {
        return false;
    }
    $stmt->bind_param('i', $ordenId);
    $stmt->execute();
    $exists = $stmt->get_result()->fetch_assoc() ? true : false;
    $stmt->close();
    return $exists;
}

function orden_tiene_avance_clinico_orden($mysqliOcup, $ordenId)
{
    $stmtDetalle = $mysqliOcup->prepare('SELECT COUNT(*) AS total FROM ocupacional_orden_detalle WHERE orden_id = ? AND estado_ejecucion <> "pendiente"');
    if ($stmtDetalle) {
        $stmtDetalle->bind_param('i', $ordenId);
        $stmtDetalle->execute();
        $totalDetalle = (int)($stmtDetalle->get_result()->fetch_assoc()['total'] ?? 0);
        $stmtDetalle->close();
        if ($totalDetalle > 0) {
            return true;
        }
    }

    $stmtResultados = $mysqliOcup->prepare('SELECT COUNT(*) AS total
                                            FROM ocupacional_resultados_clinicos rc
                                            INNER JOIN ocupacional_orden_detalle d ON d.id = rc.orden_detalle_id
                                            WHERE d.orden_id = ?');
    if ($stmtResultados) {
        $stmtResultados->bind_param('i', $ordenId);
        $stmtResultados->execute();
        $totalResultados = (int)($stmtResultados->get_result()->fetch_assoc()['total'] ?? 0);
        $stmtResultados->close();
        if ($totalResultados > 0) {
            return true;
        }
    }

    if (table_exists_orden($mysqliOcup, 'ocupacional_interconsultas')) {
        $stmtInter = $mysqliOcup->prepare('SELECT COUNT(*) AS total FROM ocupacional_interconsultas WHERE orden_id = ? AND estado <> "anulada"');
        if ($stmtInter) {
            $stmtInter->bind_param('i', $ordenId);
            $stmtInter->execute();
            $totalInter = (int)($stmtInter->get_result()->fetch_assoc()['total'] ?? 0);
            $stmtInter->close();
            if ($totalInter > 0) {
                return true;
            }
        }
    }

    if (table_exists_orden($mysqliOcup, 'ocupacional_historia_ocupacional')) {
        $stmtHistoria = $mysqliOcup->prepare('SELECT COUNT(*) AS total FROM ocupacional_historia_ocupacional WHERE orden_id = ? AND estado <> "anulado"');
        if ($stmtHistoria) {
            $stmtHistoria->bind_param('i', $ordenId);
            $stmtHistoria->execute();
            $totalHistoria = (int)($stmtHistoria->get_result()->fetch_assoc()['total'] ?? 0);
            $stmtHistoria->close();
            if ($totalHistoria > 0) {
                return true;
            }
        }
    }

    return false;
}

function find_orden_duplicada_activa_orden($mysqliOcup, $empresaId, $trabajadorId, $protocoloId, $tipoEvaluacionId, $fechaOrden, $excludeOrdenId = 0)
{
    $sql = 'SELECT id, codigo
            FROM ocupacional_ordenes
            WHERE empresa_id = ?
              AND trabajador_id = ?
              AND protocolo_id = ?
              AND tipo_evaluacion_id = ?
              AND fecha_orden = ?
              AND estado <> "anulada"';
    if ($excludeOrdenId > 0) {
        $sql .= ' AND id <> ?';
    }
    $sql .= ' ORDER BY id DESC LIMIT 1';

    $stmt = $mysqliOcup->prepare($sql);
    if (!$stmt) {
        return null;
    }

    if ($excludeOrdenId > 0) {
        $stmt->bind_param('iiiisi', $empresaId, $trabajadorId, $protocoloId, $tipoEvaluacionId, $fechaOrden, $excludeOrdenId);
    } else {
        $stmt->bind_param('iiiis', $empresaId, $trabajadorId, $protocoloId, $tipoEvaluacionId, $fechaOrden);
    }
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    return $row ?: null;
}

function sync_estado_orden_por_detalle($mysqliOcup, $ordenId, $usuarioId)
{
    $stmt = $mysqliOcup->prepare('SELECT
                                    COUNT(*) AS total,
                                    SUM(CASE WHEN d.estado_ejecucion = "pendiente" THEN 1 ELSE 0 END) AS pendientes,
                                    SUM(CASE WHEN d.estado_ejecucion = "realizado"
                                              AND EXISTS (
                                                  SELECT 1
                                                  FROM ocupacional_resultados_clinicos rc
                                                  WHERE rc.orden_detalle_id = d.id
                                                    AND rc.estado = "finalizado"
                                              )
                                             THEN 1 ELSE 0 END) AS completados
                                  FROM ocupacional_orden_detalle d
                                  WHERE d.orden_id = ?');
    if (!$stmt) {
        return;
    }
    $stmt->bind_param('i', $ordenId);
    $stmt->execute();
    $agg = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    $total = (int)($agg['total'] ?? 0);
    $pendientes = (int)($agg['pendientes'] ?? 0);
    $completados = (int)($agg['completados'] ?? 0);

    $nuevoEstado = 'emitida';
    if ($total > 0 && $completados >= $total) {
        $nuevoEstado = 'completada';
    } elseif (($total - $pendientes) > 0) {
        $nuevoEstado = 'en_proceso';
    }

    $stmtUp = $mysqliOcup->prepare('UPDATE ocupacional_ordenes
                                    SET estado = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
                                    WHERE id = ? AND estado NOT IN ("anulada", "cerrada") LIMIT 1');
    if (!$stmtUp) {
        return;
    }
    $stmtUp->bind_param('sii', $nuevoEstado, $usuarioId, $ordenId);
    $stmtUp->execute();
    $stmtUp->close();
}

function resolve_examenes_orden($mysqliOcup, $mysqliCore, $empresaId, $trabajadorId, $protocoloId, $tipoEvaluacionId)
{
    $stmtTrab = $mysqliOcup->prepare('SELECT p.id, p.empresa_id, p.external_patient_id, p.puesto_trabajo, p.estado_laboral, p.documento_numero, e.razon_social
                                      FROM pacientes_ocupacionales p
                                      INNER JOIN empresas_ocupacionales e ON e.id = p.empresa_id
                                      WHERE p.id = ? LIMIT 1');
    if (!$stmtTrab) {
        out_orden(500, ['success' => false, 'error' => 'No se pudo validar trabajador']);
    }
    $stmtTrab->bind_param('i', $trabajadorId);
    $stmtTrab->execute();
    $trabajador = $stmtTrab->get_result()->fetch_assoc();
    $stmtTrab->close();

    if (!$trabajador) {
        out_orden(422, ['success' => false, 'error' => 'trabajador_id no encontrado']);
    }
    if ((int)$trabajador['empresa_id'] !== $empresaId) {
        out_orden(422, ['success' => false, 'error' => 'El trabajador no pertenece a la empresa seleccionada']);
    }
    if ((string)$trabajador['estado_laboral'] !== 'activo') {
        out_orden(422, ['success' => false, 'error' => 'El trabajador debe estar activo para generar orden']);
    }

    $stmtProt = $mysqliOcup->prepare('SELECT id, descripcion, estado FROM ocupacional_protocolos_empresa WHERE id = ? AND empresa_id = ? LIMIT 1');
    if (!$stmtProt) {
        out_orden(500, ['success' => false, 'error' => 'No se pudo validar protocolo']);
    }
    $stmtProt->bind_param('ii', $protocoloId, $empresaId);
    $stmtProt->execute();
    $protocolo = $stmtProt->get_result()->fetch_assoc();
    $stmtProt->close();
    if (!$protocolo) {
        out_orden(422, ['success' => false, 'error' => 'protocolo_id no corresponde a la empresa']);
    }
    if ((string)$protocolo['estado'] !== 'activo') {
        out_orden(422, ['success' => false, 'error' => 'El protocolo esta inactivo']);
    }

    $stmtTipo = $mysqliOcup->prepare('SELECT id, codigo, nombre, estado FROM ocupacional_tipos_evaluacion WHERE id = ? LIMIT 1');
    if (!$stmtTipo) {
        out_orden(500, ['success' => false, 'error' => 'No se pudo validar tipo de evaluacion']);
    }
    $stmtTipo->bind_param('i', $tipoEvaluacionId);
    $stmtTipo->execute();
    $tipo = $stmtTipo->get_result()->fetch_assoc();
    $stmtTipo->close();
    if (!$tipo || (string)$tipo['estado'] !== 'activo') {
        out_orden(422, ['success' => false, 'error' => 'tipo_evaluacion_id invalido o inactivo']);
    }

    $externalPatientId = (int)($trabajador['external_patient_id'] ?? 0);
    $stmtPac = $mysqliCore->prepare('SELECT id, nombre, apellido, sexo, fecha_nacimiento FROM pacientes WHERE id = ? LIMIT 1');
    if (!$stmtPac) {
        out_orden(500, ['success' => false, 'error' => 'No se pudo consultar identidad del paciente']);
    }
    $stmtPac->bind_param('i', $externalPatientId);
    $stmtPac->execute();
    $paciente = $stmtPac->get_result()->fetch_assoc();
    $stmtPac->close();
    if (!$paciente) {
        out_orden(422, ['success' => false, 'error' => 'No existe el paciente clinico relacionado']);
    }

    $sexoPaciente = normalize_text_orden($paciente['sexo'] ?? '');
    $sexoPaciente = $sexoPaciente === 'F' ? 'F' : ($sexoPaciente === 'M' ? 'M' : '');
    $edadPaciente = calculate_age_orden($paciente['fecha_nacimiento'] ?? '');
    $puestoTrabajador = normalize_text_orden($trabajador['puesto_trabajo'] ?? '');

    $hasGrupoMaster = table_exists_orden($mysqliOcup, 'ocupacional_grupos_examenes');
    $hasLabSnapshotExam = column_exists_orden($mysqliOcup, 'ocupacional_examenes_generales', 'laboratorio_snapshot_json');
    $grupoOrdenSelect = $hasGrupoMaster ? 'COALESCE(g.orden, 0)' : '0';
    $labSnapshotSelect = $hasLabSnapshotExam ? 'e.laboratorio_snapshot_json' : 'NULL';
    $grupoJoin = $hasGrupoMaster
        ? ' LEFT JOIN ocupacional_grupos_examenes g ON g.parent_id = 0 AND UPPER(g.nombre) = UPPER(e.grupo)'
        : '';

        $stmtRows = $mysqliOcup->prepare('SELECT
                                                                                c.id AS catalogo_id,
                                                                                c.examen_id,
                                                                                e.codigo,
                                                                                e.descripcion,
                                                                                e.grupo,
                                                                                e.subgrupo,
                                                                                ' . $labSnapshotSelect . ' AS laboratorio_snapshot_json,
                                                                                ' . $grupoOrdenSelect . ' AS grupo_orden,
                                                                                COALESCE(e.posicion, 0) AS examen_orden,
                                                                                pd.monto AS monto,
                                                                                1 AS tiene_config_protocolo
                                                                            FROM ocupacional_catalogo_empresas c
                                                                            INNER JOIN ocupacional_examenes_generales e ON e.id = c.examen_id
                                                                            ' . $grupoJoin . '
                                                                            INNER JOIN ocupacional_protocolo_detalle pd ON pd.catalogo_id = c.id
                                                                                                                                                             AND pd.protocolo_id = ?
                                                                                                                                                             AND pd.tipo_evaluacion_id = ?
                                                                            WHERE c.empresa_id = ?
                                                                                AND c.estado = "activo"
                                                                                AND e.estado = "activo"
                                                                            ORDER BY grupo_orden ASC, e.grupo ASC, e.subgrupo ASC, examen_orden ASC, e.descripcion ASC, e.id DESC');
    if (!$stmtRows) {
        out_orden(500, ['success' => false, 'error' => 'No se pudo consultar detalle del protocolo']);
    }
    $stmtRows->bind_param('iii', $protocoloId, $tipoEvaluacionId, $empresaId);
    $stmtRows->execute();
    $resRows = $stmtRows->get_result();

    $items = [];
    $catalogoIds = [];
    while ($row = $resRows->fetch_assoc()) {
        $catalogoId = (int)$row['catalogo_id'];
        $catalogoIds[] = $catalogoId;
        $items[$catalogoId] = [
            'catalogo_id' => $catalogoId,
            'examen_id' => (int)$row['examen_id'],
            'codigo' => (string)$row['codigo'],
            'descripcion' => (string)$row['descripcion'],
            'grupo' => (string)($row['grupo'] ?? ''),
            'subgrupo' => (string)($row['subgrupo'] ?? ''),
            'laboratorio_snapshot_json' => (string)($row['laboratorio_snapshot_json'] ?? ''),
            'grupo_orden' => (int)($row['grupo_orden'] ?? 0),
            'examen_orden' => (int)($row['examen_orden'] ?? 0),
            'monto' => number_format((float)$row['monto'], 2, '.', ''),
            'tiene_config_protocolo' => (int)($row['tiene_config_protocolo'] ?? 0) === 1,
            'aplica' => false,
            'motivo' => 'Sin evaluacion',
        ];
    }
    $stmtRows->close();

    if (empty($items)) {
        return [
            'trabajador' => $trabajador,
            'paciente' => $paciente,
            'protocolo' => $protocolo,
            'tipo' => $tipo,
            'items' => [],
            'total' => '0.00',
            'total_items_aplican' => 0,
        ];
    }

    $condicionesByCatalogo = [];
    $placeholders = implode(',', array_fill(0, count($catalogoIds), '?'));
    $typesCond = 'i' . str_repeat('i', count($catalogoIds));
    $paramsCond = array_merge([$protocoloId], $catalogoIds);
    $sqlCond = 'SELECT catalogo_id, puesto_trabajo, sexo, edad_min, edad_max
                FROM ocupacional_protocolo_condiciones
                WHERE protocolo_id = ? AND catalogo_id IN (' . $placeholders . ')';
    $stmtCond = $mysqliOcup->prepare($sqlCond);
    if ($stmtCond) {
        bind_params_dynamic_orden($stmtCond, $typesCond, $paramsCond);
        $stmtCond->execute();
        $resCond = $stmtCond->get_result();
        while ($c = $resCond->fetch_assoc()) {
            $cId = (int)$c['catalogo_id'];
            if (!isset($condicionesByCatalogo[$cId])) {
                $condicionesByCatalogo[$cId] = [];
            }
            $condicionesByCatalogo[$cId][] = [
                'puesto_trabajo' => normalize_text_orden($c['puesto_trabajo'] ?? ''),
                'sexo' => normalize_text_orden($c['sexo'] ?? ''),
                'edad_min' => isset($c['edad_min']) ? (int)$c['edad_min'] : null,
                'edad_max' => isset($c['edad_max']) ? (int)$c['edad_max'] : null,
            ];
        }
        $stmtCond->close();
    }

    $total = 0.0;
    $aplican = 0;
    foreach ($items as $catalogoId => &$item) {
        if (!empty($item['tiene_config_protocolo']) && (float)$item['monto'] <= 0) {
            $item['aplica'] = false;
            $item['motivo'] = 'Excluido en protocolo';
            continue;
        }

        $condiciones = $condicionesByCatalogo[$catalogoId] ?? [];

        if (empty($condiciones)) {
            $item['aplica'] = true;
            $item['motivo'] = 'Sin condiciones';
            $total += (float)$item['monto'];
            $aplican++;
            continue;
        }

        $matchAny = false;
        foreach ($condiciones as $cond) {
            $ok = true;

            if ($cond['puesto_trabajo'] !== '' && $cond['puesto_trabajo'] !== $puestoTrabajador) {
                $ok = false;
            }
            if ($ok && $cond['sexo'] !== '' && $cond['sexo'] !== $sexoPaciente) {
                $ok = false;
            }
            if ($ok && $cond['edad_min'] !== null) {
                if ($edadPaciente === null || $edadPaciente < $cond['edad_min']) {
                    $ok = false;
                }
            }
            if ($ok && $cond['edad_max'] !== null) {
                if ($edadPaciente === null || $edadPaciente > $cond['edad_max']) {
                    $ok = false;
                }
            }

            if ($ok) {
                $matchAny = true;
                break;
            }
        }

        if ($matchAny) {
            $item['aplica'] = true;
            $item['motivo'] = 'Cumple condicion';
            $total += (float)$item['monto'];
            $aplican++;
        } else {
            $item['aplica'] = false;
            $item['motivo'] = 'No cumple condicion';
        }
    }
    unset($item);

    return [
        'trabajador' => $trabajador,
        'paciente' => $paciente,
        'protocolo' => $protocolo,
        'tipo' => $tipo,
        'items' => array_values($items),
        'total' => number_format($total, 2, '.', ''),
        'total_items_aplican' => $aplican,
    ];
}

$requiredTables = [
    'empresas_ocupacionales',
    'pacientes_ocupacionales',
    'ocupacional_tipos_evaluacion',
    'ocupacional_protocolos_empresa',
    'ocupacional_catalogo_empresas',
    'ocupacional_protocolo_detalle',
    'ocupacional_protocolo_condiciones',
    'ocupacional_ordenes',
    'ocupacional_orden_detalle',
    'ocupacional_orden_eventos',
];

foreach ($requiredTables as $table) {
    if (!table_exists_orden($mysqliOcup, $table)) {
        out_orden(500, [
            'success' => false,
            'error' => 'Falta la tabla ' . $table . '. Aplicar migraciones sql/2026-06-15_ocupacional_fase3_ordenes.sql y sql/2026-06-16_ocupacional_fase3_cierre_auditoria.sql en la base ocupacional.',
        ]);
    }
}

$ordenExtraColumns = resolve_extra_columns_orden($mysqliOcup);
$detalleExtraColumns = resolve_extra_columns_detalle_orden($mysqliOcup);
$medicoSnapshotColumns = [
    'medico_responsable_id',
    'medico_nombre_snapshot',
    'medico_especialidad_snapshot',
    'medico_cmp_snapshot',
    'medico_rne_snapshot',
    'medico_rna_snapshot',
    'medico_firma_snapshot',
    'aptitud_registrada_by',
    'aptitud_registrada_at',
];
$medicoSnapshotReady = true;
foreach ($medicoSnapshotColumns as $columnName) {
    if (empty($ordenExtraColumns[$columnName])) {
        $medicoSnapshotReady = false;
        break;
    }
}

$sqlExprSubcontrataIdOrden = !empty($ordenExtraColumns['subcontrata_empresa_id']) ? 'o.subcontrata_empresa_id' : 'NULL';
$sqlExprFacturarIdOrden = !empty($ordenExtraColumns['facturar_empresa_id']) ? 'o.facturar_empresa_id' : 'NULL';
$sqlExprFirmaDoctorOrden = !empty($ordenExtraColumns['firma_doctor']) ? 'o.firma_doctor' : 'NULL';
$sqlExprModoOrden = !empty($ordenExtraColumns['modo']) ? 'o.modo' : 'NULL';
$sqlExprGestanteOrden = !empty($ordenExtraColumns['gestante']) ? 'o.gestante' : 'NULL';
$sqlExprDocumentoOrden = !empty($ordenExtraColumns['documento']) ? 'o.documento' : 'NULL';
$sqlExprIndicaDrOrden = !empty($ordenExtraColumns['indica_dr']) ? 'o.indica_dr' : 'NULL';
$sqlExprMedicoResponsableIdOrden = !empty($ordenExtraColumns['medico_responsable_id']) ? 'o.medico_responsable_id' : 'NULL';
$sqlExprMedicoNombreSnapshotOrden = !empty($ordenExtraColumns['medico_nombre_snapshot']) ? 'o.medico_nombre_snapshot' : 'NULL';
$sqlExprMedicoEspecialidadSnapshotOrden = !empty($ordenExtraColumns['medico_especialidad_snapshot']) ? 'o.medico_especialidad_snapshot' : 'NULL';
$sqlExprMedicoCmpSnapshotOrden = !empty($ordenExtraColumns['medico_cmp_snapshot']) ? 'o.medico_cmp_snapshot' : 'NULL';
$sqlExprMedicoRneSnapshotOrden = !empty($ordenExtraColumns['medico_rne_snapshot']) ? 'o.medico_rne_snapshot' : 'NULL';
$sqlExprMedicoRnaSnapshotOrden = !empty($ordenExtraColumns['medico_rna_snapshot']) ? 'o.medico_rna_snapshot' : 'NULL';
$sqlExprMedicoFirmaSnapshotOrden = !empty($ordenExtraColumns['medico_firma_snapshot']) ? 'o.medico_firma_snapshot' : 'NULL';
$sqlExprAptitudRegistradaByOrden = !empty($ordenExtraColumns['aptitud_registrada_by']) ? 'o.aptitud_registrada_by' : 'NULL';
$sqlExprAptitudRegistradaAtOrden = !empty($ordenExtraColumns['aptitud_registrada_at']) ? 'o.aptitud_registrada_at' : 'NULL';
$sqlExprCertFechaEvaluacionOrden = !empty($ordenExtraColumns['certificado_fecha_evaluacion']) ? 'o.certificado_fecha_evaluacion' : 'NULL';
$sqlExprCertFechaEmisionOrden = !empty($ordenExtraColumns['certificado_fecha_emision']) ? 'o.certificado_fecha_emision' : 'NULL';
$sqlJoinSubcontrataOrden = !empty($ordenExtraColumns['subcontrata_empresa_id'])
    ? ' LEFT JOIN empresas_ocupacionales esub ON esub.id = o.subcontrata_empresa_id'
    : '';
$sqlJoinFacturarOrden = !empty($ordenExtraColumns['facturar_empresa_id'])
    ? ' LEFT JOIN empresas_ocupacionales efac ON efac.id = o.facturar_empresa_id'
    : '';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    require_ocup_access_orden();

    $esSesionMedico = es_sesion_medico_orden();
    $esSesionEnfermero = es_sesion_enfermero_orden();
    $medicoSesionId = resolve_medico_sesion_id_orden();

    $accion = trim((string)($_GET['accion'] ?? 'listar_ordenes'));

    if ($esSesionEnfermero && !in_array($accion, ['listar_ordenes', 'detalle_orden'], true)) {
        out_orden(403, ['success' => false, 'error' => 'No autorizado para esta accion de enfermeria']);
    }

    if ($accion === 'previsualizar') {
        require_ocup_permiso_any_orden(['registrar_ordenes_ocupacional', 'ejecutar_ordenes_ocupacional']);
        $empresaId = (int)($_GET['empresa_id'] ?? 0);
        $trabajadorId = (int)($_GET['trabajador_id'] ?? 0);
        $protocoloId = (int)($_GET['protocolo_id'] ?? 0);
        $tipoEvaluacionId = (int)($_GET['tipo_evaluacion_id'] ?? 0);

        if ($empresaId <= 0 || $trabajadorId <= 0 || $protocoloId <= 0 || $tipoEvaluacionId <= 0) {
            out_orden(422, ['success' => false, 'error' => 'empresa_id, trabajador_id, protocolo_id y tipo_evaluacion_id son obligatorios']);
        }

        $resolved = resolve_examenes_orden($mysqliOcup, $mysqli, $empresaId, $trabajadorId, $protocoloId, $tipoEvaluacionId);

        out_orden(200, [
            'success' => true,
            'data' => [
                'trabajador' => [
                    'id' => (int)$resolved['trabajador']['id'],
                    'documento_numero' => (string)$resolved['trabajador']['documento_numero'],
                    'puesto_trabajo' => (string)$resolved['trabajador']['puesto_trabajo'],
                    'empresa' => (string)$resolved['trabajador']['razon_social'],
                ],
                'paciente' => [
                    'id' => (int)$resolved['paciente']['id'],
                    'nombre_completo' => trim((string)$resolved['paciente']['nombre'] . ' ' . (string)$resolved['paciente']['apellido']),
                    'sexo' => (string)($resolved['paciente']['sexo'] ?? ''),
                    'fecha_nacimiento' => (string)($resolved['paciente']['fecha_nacimiento'] ?? ''),
                    'edad' => calculate_age_orden($resolved['paciente']['fecha_nacimiento'] ?? ''),
                ],
                'protocolo' => [
                    'id' => (int)$resolved['protocolo']['id'],
                    'descripcion' => (string)$resolved['protocolo']['descripcion'],
                ],
                'tipo_evaluacion' => [
                    'id' => (int)$resolved['tipo']['id'],
                    'codigo' => (string)$resolved['tipo']['codigo'],
                    'nombre' => (string)$resolved['tipo']['nombre'],
                ],
                'items' => $resolved['items'],
                'total' => $resolved['total'],
                'total_items_aplican' => (int)$resolved['total_items_aplican'],
            ],
        ]);
    }

    if ($accion === 'listar_ordenes') {
        require_ocup_permiso_any_orden(['ver_ordenes_ocupacional', 'registrar_ordenes_ocupacional', 'ejecutar_ordenes_ocupacional']);
        $empresaId = (int)($_GET['empresa_id'] ?? 0);
        $page = (int)($_GET['page'] ?? 1);
        $perPage = (int)($_GET['per_page'] ?? 20);
        $q = trim((string)($_GET['q'] ?? ''));
        $estado = trim((string)($_GET['estado'] ?? ''));
        $tipo = trim((string)($_GET['tipo'] ?? ''));
        $fechaDesde = trim((string)($_GET['fecha_desde'] ?? ''));
        $fechaHasta = trim((string)($_GET['fecha_hasta'] ?? ''));
        $soloTriaje = (string)($_GET['solo_triaje'] ?? '') === '1';

        if ($esSesionEnfermero) {
            $soloTriaje = true;
        }

        $estadosValidos = ['emitida', 'en_proceso', 'completada', 'cerrada', 'anulada'];
        if ($estado !== '' && !in_array($estado, $estadosValidos, true)) {
            out_orden(422, ['success' => false, 'error' => 'estado invalido']);
        }
        if ($fechaDesde !== '' && !is_valid_date_orden($fechaDesde)) {
            out_orden(422, ['success' => false, 'error' => 'fecha_desde invalida. Formato esperado YYYY-MM-DD']);
        }
        if ($fechaHasta !== '' && !is_valid_date_orden($fechaHasta)) {
            out_orden(422, ['success' => false, 'error' => 'fecha_hasta invalida. Formato esperado YYYY-MM-DD']);
        }

        $page = max(1, $page);
        $perPage = max(1, min($perPage, 100));
        $offset = ($page - 1) * $perPage;

        $where = [];
        $types = '';
        $params = [];

        if ($empresaId > 0) {
            $where[] = 'o.empresa_id = ?';
            $types .= 'i';
            $params[] = $empresaId;
        }
        if ($esSesionMedico) {
            if (empty($ordenExtraColumns['medico_responsable_id'])) {
                out_orden(500, ['success' => false, 'error' => 'Falta columna medico_responsable_id para listar por medico']);
            }
            $hasResultadosClinicos = table_exists_orden($mysqliOcup, 'ocupacional_resultados_clinicos');
            if ($hasResultadosClinicos) {
                // Permite que un profesional vea ordenes donde fue consignado como responsable en el formato clinico.
                $where[] = '(o.medico_responsable_id = ? OR EXISTS (
                                SELECT 1
                                FROM ocupacional_orden_detalle odm
                                INNER JOIN ocupacional_resultados_clinicos rcm ON rcm.orden_detalle_id = odm.id
                                WHERE odm.orden_id = o.id
                                  AND CAST(JSON_UNQUOTE(JSON_EXTRACT(rcm.datos_json, "$.responsable_profesional_id")) AS UNSIGNED) = ?
                                  AND COALESCE(rcm.estado, "") <> "anulado"
                            ))';
                $types .= 'ii';
                $params[] = $medicoSesionId;
                $params[] = $medicoSesionId;
            } else {
                $where[] = 'o.medico_responsable_id = ?';
                $types .= 'i';
                $params[] = $medicoSesionId;
            }
        }
        if ($q !== '') {
            $where[] = '(o.codigo LIKE ? OR t.documento_numero LIKE ? OR p.descripcion LIKE ?)';
            $term = '%' . $q . '%';
            $types .= 'sss';
            $params[] = $term;
            $params[] = $term;
            $params[] = $term;
        }
        if ($estado !== '') {
            $where[] = 'o.estado = ?';
            $types .= 's';
            $params[] = $estado;
        }
        if ($tipo !== '') {
            $where[] = 'te.codigo = ?';
            $types .= 's';
            $params[] = $tipo;
        }
        if ($fechaDesde !== '') {
            $where[] = 'o.fecha_orden >= ?';
            $types .= 's';
            $params[] = $fechaDesde;
        }
        if ($fechaHasta !== '') {
            $where[] = 'o.fecha_orden <= ?';
            $types .= 's';
            $params[] = $fechaHasta;
        }
                if ($soloTriaje) {
                        $where[] = 'EXISTS (
                                                        SELECT 1
                                                        FROM ocupacional_orden_detalle odt
                                                        WHERE odt.orden_id = o.id
                                                            AND (
                                                                        UPPER(COALESCE(odt.examen_codigo, "")) = "TRI_0001"
                                                                        OR LOWER(COALESCE(odt.examen_descripcion, "")) LIKE "%triaje%"
                                                                        OR LOWER(COALESCE(odt.examen_descripcion, "")) LIKE "%triage%"
                                                                    )
                                                )';
                }

        $whereSql = empty($where) ? '' : (' WHERE ' . implode(' AND ', $where));

        $sqlCount = 'SELECT COUNT(*) AS total
                     FROM ocupacional_ordenes o
                     INNER JOIN pacientes_ocupacionales t ON t.id = o.trabajador_id
                     INNER JOIN ocupacional_protocolos_empresa p ON p.id = o.protocolo_id
                     INNER JOIN ocupacional_tipos_evaluacion te ON te.id = o.tipo_evaluacion_id' . $whereSql;
        $stmtCount = $mysqliOcup->prepare($sqlCount);
        if (!$stmtCount) {
            out_orden(500, with_debug_sql_error_orden(['success' => false, 'error' => 'No se pudo preparar conteo de ordenes'], $mysqliOcup));
        }
        bind_params_dynamic_orden($stmtCount, $types, $params);
        $stmtCount->execute();
        $total = (int)($stmtCount->get_result()->fetch_assoc()['total'] ?? 0);
        $stmtCount->close();

        $hasInterconsultasListado = table_exists_orden($mysqliOcup, 'ocupacional_interconsultas');
        $interconsultasSelect = $hasInterconsultasListado
            ? 'COALESCE(ic.total_interconsultas, 0) AS total_interconsultas,
                        COALESCE(ic.interconsultas_abiertas, 0) AS interconsultas_abiertas,
                        COALESCE(ic.interconsultas_respondidas, 0) AS interconsultas_respondidas,
                        COALESCE(ic.interconsultas_levantadas, 0) AS interconsultas_levantadas,
                        COALESCE(ic.levantamientos_favorables, 0) AS levantamientos_favorables,
                        COALESCE(ic.levantamientos_no_favorables, 0) AS levantamientos_no_favorables,'
            : '0 AS total_interconsultas,
                        0 AS interconsultas_abiertas,
                        0 AS interconsultas_respondidas,
                        0 AS interconsultas_levantadas,
                        0 AS levantamientos_favorables,
                        0 AS levantamientos_no_favorables,';
        $interconsultasJoin = $hasInterconsultasListado
            ? ' LEFT JOIN (
                    SELECT
                        orden_id,
                        COUNT(*) AS total_interconsultas,
                        SUM(CASE WHEN estado IN ("solicitada", "respondida") THEN 1 ELSE 0 END) AS interconsultas_abiertas,
                        SUM(CASE WHEN estado = "respondida" THEN 1 ELSE 0 END) AS interconsultas_respondidas,
                        SUM(CASE WHEN estado = "levantada" THEN 1 ELSE 0 END) AS interconsultas_levantadas,
                        SUM(CASE WHEN estado = "levantada" AND resultado_levantamiento = "FAVORABLE" THEN 1 ELSE 0 END) AS levantamientos_favorables,
                        SUM(CASE WHEN estado = "levantada" AND resultado_levantamiento = "NO_FAVORABLE" THEN 1 ELSE 0 END) AS levantamientos_no_favorables
                    FROM ocupacional_interconsultas
                    WHERE estado <> "anulada"
                    GROUP BY orden_id
                ) ic ON ic.orden_id = o.id'
            : '';

        $sqlExprDetalleObjetivoMedico = '0';
        if ($esSesionMedico && $medicoSesionId > 0 && table_exists_orden($mysqliOcup, 'ocupacional_resultados_clinicos')) {
            $mid = (int)$medicoSesionId;
            $sqlExprDetalleObjetivoMedico = '(SELECT odsel.id
                                              FROM ocupacional_orden_detalle odsel
                                              LEFT JOIN ocupacional_examenes_generales egsel ON egsel.id = odsel.examen_id
                                              WHERE odsel.orden_id = o.id
                                                AND (
                                                    o.medico_responsable_id = ' . $mid . '
                                                    OR EXISTS (
                                                        SELECT 1
                                                        FROM ocupacional_orden_detalle odown
                                                        LEFT JOIN ocupacional_examenes_generales egown ON egown.id = odown.examen_id
                                                        INNER JOIN ocupacional_resultados_clinicos rcown ON rcown.orden_detalle_id = odown.id
                                                        WHERE odown.orden_id = o.id
                                                          AND COALESCE(rcown.estado, "") <> "anulado"
                                                          AND CAST(JSON_UNQUOTE(JSON_EXTRACT(rcown.datos_json, "$.responsable_profesional_id")) AS UNSIGNED) = ' . $mid . '
                                                          AND (
                                                              UPPER(COALESCE(NULLIF(odown.grupo_snapshot, ""), egown.grupo, ""))
                                                                  = UPPER(COALESCE(NULLIF(odsel.grupo_snapshot, ""), egsel.grupo, ""))
                                                              OR (
                                                                  (
                                                                      UPPER(COALESCE(odown.examen_codigo, "")) LIKE "PSI_%"
                                                                      OR UPPER(COALESCE(odown.examen_descripcion, "")) LIKE "%PSICOLOG%"
                                                                      OR UPPER(COALESCE(NULLIF(odown.grupo_snapshot, ""), egown.grupo, "")) LIKE "%PSICOLOG%"
                                                                      OR UPPER(COALESCE(NULLIF(odown.subgrupo_snapshot, ""), egown.subgrupo, "")) LIKE "%PSICOLOG%"
                                                                  )
                                                                  AND
                                                                  (
                                                                      UPPER(COALESCE(odsel.examen_codigo, "")) LIKE "PSI_%"
                                                                      OR UPPER(COALESCE(odsel.examen_descripcion, "")) LIKE "%PSICOLOG%"
                                                                      OR UPPER(COALESCE(NULLIF(odsel.grupo_snapshot, ""), egsel.grupo, "")) LIKE "%PSICOLOG%"
                                                                      OR UPPER(COALESCE(NULLIF(odsel.subgrupo_snapshot, ""), egsel.subgrupo, "")) LIKE "%PSICOLOG%"
                                                                  )
                                                              )
                                                          )
                                                    )
                                                )
                                              ORDER BY
                                                  CASE
                                                      WHEN odsel.estado_ejecucion = "observado" THEN 0
                                                      WHEN odsel.estado_ejecucion = "pendiente" THEN 1
                                                      WHEN odsel.estado_ejecucion = "en_proceso" THEN 2
                                                      WHEN odsel.estado_ejecucion = "realizado" AND NOT EXISTS (
                                                          SELECT 1
                                                          FROM ocupacional_resultados_clinicos rcf
                                                          WHERE rcf.orden_detalle_id = odsel.id
                                                            AND rcf.estado = "finalizado"
                                                      ) THEN 3
                                                      ELSE 4
                                                  END,
                                                  odsel.id ASC
                                              LIMIT 1)';
        }

        $sqlRows = 'SELECT
                        o.id,
                        o.codigo,
                        o.empresa_id,
                        o.trabajador_id,
                        o.protocolo_id,
                        o.tipo_evaluacion_id,
                        o.fecha_orden,
                        o.estado,
                        o.monto_total,
                        o.aptitud_final,
                        o.restriccion_final,
                        o.recomendacion_final,
                        o.observacion,
                        ' . $sqlExprSubcontrataIdOrden . ' AS subcontrata_empresa_id,
                        ' . $sqlExprFacturarIdOrden . ' AS facturar_empresa_id,
                        ' . $sqlExprFirmaDoctorOrden . ' AS firma_doctor,
                        ' . $sqlExprModoOrden . ' AS modo,
                        ' . $sqlExprGestanteOrden . ' AS gestante,
                        ' . $sqlExprDocumentoOrden . ' AS documento,
                        ' . $sqlExprIndicaDrOrden . ' AS indica_dr,
                        ' . $sqlExprMedicoResponsableIdOrden . ' AS medico_responsable_id,
                        e.razon_social,
                        IFNULL(esub.razon_social, "") AS subcontrata_razon_social,
                        IFNULL(efac.razon_social, "") AS facturar_razon_social,
                        t.external_patient_id,
                        t.documento_numero,
                        t.puesto_trabajo,
                        p.descripcion AS protocolo_descripcion,
                        te.codigo AS tipo_codigo,
                        COALESCE(d.total_items, 0) AS total_items,
                        COALESCE(d.total_completados, 0) AS total_completados,
                        COALESCE(d.total_pendientes, 0) AS total_pendientes,
                        COALESCE(d.total_en_proceso, 0) AS total_en_proceso,
                        COALESCE(d.total_observados, 0) AS total_observados,
                        COALESCE(d.observaciones_resumen, "") AS observaciones_resumen,
                        COALESCE(d.estado_clinico_items_raw, "") AS estado_clinico_items_raw,
                        COALESCE(d.triaje_detalle_id, 0) AS triaje_detalle_id,
                        COALESCE(' . $sqlExprDetalleObjetivoMedico . ', 0) AS detalle_objetivo_medico_id,
                        COALESCE(d.triaje_finalizado, 0) AS triaje_finalizado,
                        ' . $interconsultasSelect . '
                        COALESCE(ce.total_certificados, 0) AS total_certificados,
                        ce.ultimo_certificado_at
                    FROM ocupacional_ordenes o
                    INNER JOIN empresas_ocupacionales e ON e.id = o.empresa_id'
                    . $sqlJoinSubcontrataOrden
                    . $sqlJoinFacturarOrden
                    . '
                    INNER JOIN pacientes_ocupacionales t ON t.id = o.trabajador_id
                    INNER JOIN ocupacional_protocolos_empresa p ON p.id = o.protocolo_id
                    INNER JOIN ocupacional_tipos_evaluacion te ON te.id = o.tipo_evaluacion_id
                    LEFT JOIN (
                        SELECT
                            orden_id,
                            COUNT(*) AS total_items,
                            SUM(CASE WHEN od.estado_ejecucion = "realizado"
                                      AND EXISTS (
                                          SELECT 1
                                          FROM ocupacional_resultados_clinicos rc
                                          WHERE rc.orden_detalle_id = od.id
                                            AND rc.estado = "finalizado"
                                      )
                                                                         THEN 1 ELSE 0 END) AS total_completados,
                                                        SUM(CASE WHEN od.estado_ejecucion = "pendiente" THEN 1 ELSE 0 END) AS total_pendientes,
                                                        SUM(CASE
                                                                WHEN od.estado_ejecucion = "en_proceso"
                                                                    OR (od.estado_ejecucion = "realizado" AND NOT EXISTS (
                                                                        SELECT 1
                                                                        FROM ocupacional_resultados_clinicos rp
                                                                        WHERE rp.orden_detalle_id = od.id
                                                                            AND rp.estado = "finalizado"
                                                                    ))
                                                                THEN 1 ELSE 0
                                                        END) AS total_en_proceso,
                                                        SUM(CASE WHEN od.estado_ejecucion = "observado" THEN 1 ELSE 0 END) AS total_observados,
                                                        GROUP_CONCAT(
                                                                CASE
                                                                        WHEN TRIM(COALESCE(od.observacion_ejecucion, "")) <> ""
                                                                        THEN CONCAT(od.examen_descripcion, ": ", od.observacion_ejecucion)
                                                                        ELSE NULL
                                                                END
                                                                ORDER BY od.id ASC SEPARATOR " | "
                                                        ) AS observaciones_resumen,
                                                        GROUP_CONCAT(
                                                            CONCAT(
                                                                od.id,
                                                                "::",
                                                                REPLACE(REPLACE(COALESCE(od.examen_descripcion, ""), "::", " "), "||", " "),
                                                                "::",
                                                                CASE
                                                                    WHEN od.estado_ejecucion = "observado" THEN "observado"
                                                                    WHEN od.estado_ejecucion = "realizado"
                                                                         AND EXISTS (
                                                                            SELECT 1
                                                                            FROM ocupacional_resultados_clinicos rcx
                                                                            WHERE rcx.orden_detalle_id = od.id
                                                                              AND rcx.estado = "finalizado"
                                                                        ) THEN "realizado"
                                                                    WHEN od.estado_ejecucion = "en_proceso"
                                                                         OR (od.estado_ejecucion = "realizado" AND NOT EXISTS (
                                                                            SELECT 1
                                                                            FROM ocupacional_resultados_clinicos rpx
                                                                            WHERE rpx.orden_detalle_id = od.id
                                                                              AND rpx.estado = "finalizado"
                                                                        )) THEN "en_proceso"
                                                                    ELSE "pendiente"
                                                                END
                                                            )
                                                            ORDER BY od.id ASC SEPARATOR "||"
                                                        ) AS estado_clinico_items_raw,
                                                        MAX(CASE
                                                                WHEN UPPER(od.examen_codigo) = "TRI_0001"
                                                                    OR LOWER(od.examen_descripcion) LIKE "%triaje%"
                                                                    OR LOWER(od.examen_descripcion) LIKE "%triage%"
                                                                THEN od.id ELSE 0
                                                        END) AS triaje_detalle_id,
                                                        MAX(CASE
                                                                WHEN (UPPER(od.examen_codigo) = "TRI_0001"
                                                                     OR LOWER(od.examen_descripcion) LIKE "%triaje%"
                                                                     OR LOWER(od.examen_descripcion) LIKE "%triage%")
                                                                    AND EXISTS (
                                                                            SELECT 1
                                                                            FROM ocupacional_resultados_clinicos tr
                                                                            WHERE tr.orden_detalle_id = od.id
                                                                                AND tr.estado = "finalizado"
                                                                    )
                                                                THEN 1 ELSE 0
                                                        END) AS triaje_finalizado
                        FROM ocupacional_orden_detalle od
                        GROUP BY orden_id
                    ) d ON d.orden_id = o.id
                    LEFT JOIN (
                        SELECT
                            orden_id,
                            COUNT(*) AS total_certificados,
                            MAX(created_at) AS ultimo_certificado_at
                        FROM ocupacional_orden_eventos
                        WHERE tipo_evento = "certificado_emitido"
                        GROUP BY orden_id
                    ) ce ON ce.orden_id = o.id'
                    . $interconsultasJoin
                    . $whereSql
                    . ' ORDER BY o.id DESC LIMIT ? OFFSET ?';
        $stmtRows = $mysqliOcup->prepare($sqlRows);
        if (!$stmtRows) {
            out_orden(500, with_debug_sql_error_orden(['success' => false, 'error' => 'No se pudo listar ordenes'], $mysqliOcup));
        }
        $typesRows = $types . 'ii';
        $paramsRows = $params;
        $paramsRows[] = $perPage;
        $paramsRows[] = $offset;
        bind_params_dynamic_orden($stmtRows, $typesRows, $paramsRows);
        $stmtRows->execute();
        $resRows = $stmtRows->get_result();

        $rows = [];
        while ($r = $resRows->fetch_assoc()) {
            $estadoClinicoItems = parse_estado_clinico_items_orden((string)($r['estado_clinico_items_raw'] ?? ''));
            if ($esSesionEnfermero) {
                $triajeIdRow = (int)($r['triaje_detalle_id'] ?? 0);
                $estadoClinicoItems = array_values(array_filter(
                    $estadoClinicoItems,
                    static function ($item) use ($triajeIdRow) {
                        if ($triajeIdRow > 0 && (int)($item['detalle_id'] ?? 0) === $triajeIdRow) {
                            return true;
                        }
                        return es_detalle_triaje_orden(
                            (string)($item['examen_codigo'] ?? ''),
                            (string)($item['examen_descripcion'] ?? ''),
                            ''
                        );
                    }
                ));
            }

            $rows[] = [
                'id' => (int)$r['id'],
                'codigo' => (string)($r['codigo'] ?? ''),
                'empresa_id' => (int)($r['empresa_id'] ?? 0),
                'trabajador_id' => (int)($r['trabajador_id'] ?? 0),
                'protocolo_id' => (int)($r['protocolo_id'] ?? 0),
                'tipo_evaluacion_id' => (int)($r['tipo_evaluacion_id'] ?? 0),
                'fecha_orden' => (string)($r['fecha_orden'] ?? ''),
                'estado' => (string)($r['estado'] ?? ''),
                'monto_total' => number_format((float)($r['monto_total'] ?? 0), 2, '.', ''),
                'aptitud_final' => (string)($r['aptitud_final'] ?? ''),
                'restriccion_final' => (string)($r['restriccion_final'] ?? ''),
                'recomendacion_final' => (string)($r['recomendacion_final'] ?? ''),
                'observacion_orden' => (string)($r['observacion'] ?? ''),
                'empresa' => (string)($r['razon_social'] ?? ''),
                'subcontrata_empresa_id' => isset($r['subcontrata_empresa_id']) ? (int)$r['subcontrata_empresa_id'] : 0,
                'subcontrata_empresa' => (string)($r['subcontrata_razon_social'] ?? ''),
                'facturar_empresa_id' => isset($r['facturar_empresa_id']) ? (int)$r['facturar_empresa_id'] : 0,
                'facturar_empresa' => (string)($r['facturar_razon_social'] ?? ''),
                'firma_doctor' => (string)($r['firma_doctor'] ?? ''),
                'modo' => (string)($r['modo'] ?? ''),
                'gestante' => isset($r['gestante']) ? (int)$r['gestante'] : 0,
                'documento' => (string)($r['documento'] ?? ''),
                'indica_dr' => (string)($r['indica_dr'] ?? ''),
                'medico_responsable_id' => (int)($r['medico_responsable_id'] ?? 0),
                '_external_patient_id' => (int)($r['external_patient_id'] ?? 0),
                'documento_numero' => (string)($r['documento_numero'] ?? ''),
                'puesto_trabajo' => (string)($r['puesto_trabajo'] ?? ''),
                'protocolo_descripcion' => (string)($r['protocolo_descripcion'] ?? ''),
                'tipo_codigo' => (string)($r['tipo_codigo'] ?? ''),
                'total_items' => (int)($r['total_items'] ?? 0),
                'total_completados' => (int)($r['total_completados'] ?? 0),
                'total_pendientes' => (int)($r['total_pendientes'] ?? 0),
                'total_en_proceso' => (int)($r['total_en_proceso'] ?? 0),
                'total_observados' => (int)($r['total_observados'] ?? 0),
                'observaciones_resumen' => (string)($r['observaciones_resumen'] ?? ''),
                'estado_clinico_items' => $estadoClinicoItems,
                'triaje_detalle_id' => (int)($r['triaje_detalle_id'] ?? 0),
                'detalle_objetivo_medico_id' => (int)($r['detalle_objetivo_medico_id'] ?? 0),
                'triaje_finalizado' => (int)($r['triaje_finalizado'] ?? 0) === 1,
                'total_interconsultas' => (int)($r['total_interconsultas'] ?? 0),
                'interconsultas_abiertas' => (int)($r['interconsultas_abiertas'] ?? 0),
                'interconsultas_respondidas' => (int)($r['interconsultas_respondidas'] ?? 0),
                'interconsultas_levantadas' => (int)($r['interconsultas_levantadas'] ?? 0),
                'levantamientos_favorables' => (int)($r['levantamientos_favorables'] ?? 0),
                'levantamientos_no_favorables' => (int)($r['levantamientos_no_favorables'] ?? 0),
                'certificado_emitido' => ((int)($r['total_certificados'] ?? 0)) > 0,
                'certificado_emitido_at' => (string)($r['ultimo_certificado_at'] ?? ''),
            ];
        }
        $stmtRows->close();

        $patientIds = array_values(array_unique(array_filter(array_column($rows, '_external_patient_id'))));
        $patientNames = [];
        if (!empty($patientIds)) {
            $placeholders = implode(',', array_fill(0, count($patientIds), '?'));
            $stmtPatients = $mysqli->prepare('SELECT id, nombre, apellido FROM pacientes WHERE id IN (' . $placeholders . ')');
            if ($stmtPatients) {
                bind_params_dynamic_orden($stmtPatients, str_repeat('i', count($patientIds)), $patientIds);
                $stmtPatients->execute();
                $resPatients = $stmtPatients->get_result();
                while ($patient = $resPatients->fetch_assoc()) {
                    $patientNames[(int)$patient['id']] = trim((string)($patient['nombre'] ?? '') . ' ' . (string)($patient['apellido'] ?? ''));
                }
                $stmtPatients->close();
            }
        }
        foreach ($rows as &$row) {
            $externalPatientId = (int)($row['_external_patient_id'] ?? 0);
            $row['paciente_nombre_completo'] = (string)($patientNames[$externalPatientId] ?? '');
            unset($row['_external_patient_id']);
        }
        unset($row);

        out_orden(200, [
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

    if ($accion === 'resumen_ordenes') {
        require_ocup_permiso_any_orden(['ver_ordenes_ocupacional']);
        $empresaId = (int)($_GET['empresa_id'] ?? 0);
        $estado = trim((string)($_GET['estado'] ?? ''));
        $tipo = trim((string)($_GET['tipo'] ?? ''));
        $fechaDesde = trim((string)($_GET['fecha_desde'] ?? ''));
        $fechaHasta = trim((string)($_GET['fecha_hasta'] ?? ''));
        $q = trim((string)($_GET['q'] ?? ''));

        $estadosValidos = ['emitida', 'en_proceso', 'completada', 'cerrada', 'anulada'];
        if ($estado !== '' && !in_array($estado, $estadosValidos, true)) {
            out_orden(422, ['success' => false, 'error' => 'estado invalido']);
        }
        if ($fechaDesde !== '' && !is_valid_date_orden($fechaDesde)) {
            out_orden(422, ['success' => false, 'error' => 'fecha_desde invalida. Formato esperado YYYY-MM-DD']);
        }
        if ($fechaHasta !== '' && !is_valid_date_orden($fechaHasta)) {
            out_orden(422, ['success' => false, 'error' => 'fecha_hasta invalida. Formato esperado YYYY-MM-DD']);
        }

        $where = [];
        $types = '';
        $params = [];
        if ($empresaId > 0) {
            $where[] = 'o.empresa_id = ?';
            $types .= 'i';
            $params[] = $empresaId;
        }
        if ($esSesionMedico) {
            if (empty($ordenExtraColumns['medico_responsable_id'])) {
                out_orden(500, ['success' => false, 'error' => 'Falta columna medico_responsable_id para listar por medico']);
            }
            $where[] = 'o.medico_responsable_id = ?';
            $types .= 'i';
            $params[] = $medicoSesionId;
        }
        if ($estado !== '') {
            $where[] = 'o.estado = ?';
            $types .= 's';
            $params[] = $estado;
        }
        if ($tipo !== '') {
            $where[] = 'te.codigo = ?';
            $types .= 's';
            $params[] = $tipo;
        }
        if ($fechaDesde !== '') {
            $where[] = 'o.fecha_orden >= ?';
            $types .= 's';
            $params[] = $fechaDesde;
        }
        if ($fechaHasta !== '') {
            $where[] = 'o.fecha_orden <= ?';
            $types .= 's';
            $params[] = $fechaHasta;
        }
        if ($q !== '') {
            $where[] = '(o.codigo LIKE ? OR t.documento_numero LIKE ? OR p.descripcion LIKE ?)';
            $term = '%' . $q . '%';
            $types .= 'sss';
            $params[] = $term;
            $params[] = $term;
            $params[] = $term;
        }

        $whereSql = empty($where) ? '' : (' WHERE ' . implode(' AND ', $where));
        $sql = 'SELECT
                    COUNT(*) AS total,
                    COALESCE(SUM(o.monto_total), 0) AS monto_total,
                    SUM(CASE WHEN o.estado = "emitida" THEN 1 ELSE 0 END) AS emitida,
                    SUM(CASE WHEN o.estado = "en_proceso" THEN 1 ELSE 0 END) AS en_proceso,
                    SUM(CASE WHEN o.estado = "completada" THEN 1 ELSE 0 END) AS completada,
                    SUM(CASE WHEN o.estado = "cerrada" THEN 1 ELSE 0 END) AS cerrada,
                    SUM(CASE WHEN o.estado = "anulada" THEN 1 ELSE 0 END) AS anulada
                FROM ocupacional_ordenes o
                INNER JOIN pacientes_ocupacionales t ON t.id = o.trabajador_id
                INNER JOIN ocupacional_protocolos_empresa p ON p.id = o.protocolo_id
                INNER JOIN ocupacional_tipos_evaluacion te ON te.id = o.tipo_evaluacion_id' . $whereSql;
        $stmt = $mysqliOcup->prepare($sql);
        if (!$stmt) {
            out_orden(500, with_debug_sql_error_orden(['success' => false, 'error' => 'No se pudo calcular resumen de ordenes'], $mysqliOcup));
        }
        bind_params_dynamic_orden($stmt, $types, $params);
        $stmt->execute();
        $r = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        out_orden(200, [
            'success' => true,
            'data' => [
                'total' => (int)($r['total'] ?? 0),
                'monto_total' => number_format((float)($r['monto_total'] ?? 0), 2, '.', ''),
                'emitida' => (int)($r['emitida'] ?? 0),
                'en_proceso' => (int)($r['en_proceso'] ?? 0),
                'completada' => (int)($r['completada'] ?? 0),
                'cerrada' => (int)($r['cerrada'] ?? 0),
                'anulada' => (int)($r['anulada'] ?? 0),
            ],
        ]);
    }

    if ($accion === 'reporte_ordenes') {
        require_ocup_permiso_any_orden(['ver_ordenes_ocupacional']);
        $empresaId = (int)($_GET['empresa_id'] ?? 0);
        $estado = trim((string)($_GET['estado'] ?? ''));
        $tipo = trim((string)($_GET['tipo'] ?? ''));
        $fechaDesde = trim((string)($_GET['fecha_desde'] ?? ''));
        $fechaHasta = trim((string)($_GET['fecha_hasta'] ?? ''));
        $q = trim((string)($_GET['q'] ?? ''));
        $limit = (int)($_GET['limit'] ?? 2000);
        $limit = max(1, min($limit, 10000));

        $estadosValidos = ['emitida', 'en_proceso', 'completada', 'cerrada', 'anulada'];
        if ($estado !== '' && !in_array($estado, $estadosValidos, true)) {
            out_orden(422, ['success' => false, 'error' => 'estado invalido']);
        }
        if ($fechaDesde !== '' && !is_valid_date_orden($fechaDesde)) {
            out_orden(422, ['success' => false, 'error' => 'fecha_desde invalida. Formato esperado YYYY-MM-DD']);
        }
        if ($fechaHasta !== '' && !is_valid_date_orden($fechaHasta)) {
            out_orden(422, ['success' => false, 'error' => 'fecha_hasta invalida. Formato esperado YYYY-MM-DD']);
        }

        $where = [];
        $types = '';
        $params = [];
        if ($empresaId > 0) {
            $where[] = 'o.empresa_id = ?';
            $types .= 'i';
            $params[] = $empresaId;
        }
        if ($esSesionMedico) {
            if (empty($ordenExtraColumns['medico_responsable_id'])) {
                out_orden(500, ['success' => false, 'error' => 'Falta columna medico_responsable_id para listar por medico']);
            }
            $where[] = 'o.medico_responsable_id = ?';
            $types .= 'i';
            $params[] = $medicoSesionId;
        }
        if ($estado !== '') {
            $where[] = 'o.estado = ?';
            $types .= 's';
            $params[] = $estado;
        }
        if ($tipo !== '') {
            $where[] = 'te.codigo = ?';
            $types .= 's';
            $params[] = $tipo;
        }
        if ($fechaDesde !== '') {
            $where[] = 'o.fecha_orden >= ?';
            $types .= 's';
            $params[] = $fechaDesde;
        }
        if ($fechaHasta !== '') {
            $where[] = 'o.fecha_orden <= ?';
            $types .= 's';
            $params[] = $fechaHasta;
        }
        if ($q !== '') {
            $where[] = '(o.codigo LIKE ? OR t.documento_numero LIKE ? OR p.descripcion LIKE ?)';
            $term = '%' . $q . '%';
            $types .= 'sss';
            $params[] = $term;
            $params[] = $term;
            $params[] = $term;
        }
        $whereSql = empty($where) ? '' : (' WHERE ' . implode(' AND ', $where));

        $sql = 'SELECT
                    o.id,
                    o.codigo,
                    o.fecha_orden,
                    o.estado,
                    o.monto_total,
                    o.aptitud_final,
                    ' . $sqlExprSubcontrataIdOrden . ' AS subcontrata_empresa_id,
                    ' . $sqlExprFacturarIdOrden . ' AS facturar_empresa_id,
                    ' . $sqlExprFirmaDoctorOrden . ' AS firma_doctor,
                    ' . $sqlExprModoOrden . ' AS modo,
                    ' . $sqlExprGestanteOrden . ' AS gestante,
                    ' . $sqlExprDocumentoOrden . ' AS documento,
                    ' . $sqlExprIndicaDrOrden . ' AS indica_dr,
                    e.razon_social,
                    IFNULL(esub.razon_social, "") AS subcontrata_razon_social,
                    IFNULL(efac.razon_social, "") AS facturar_razon_social,
                    t.documento_numero,
                    t.puesto_trabajo,
                    p.descripcion AS protocolo_descripcion,
                    te.codigo AS tipo_codigo,
                    COALESCE(d.total_items, 0) AS total_items,
                    COALESCE(d.total_completados, 0) AS total_completados
                FROM ocupacional_ordenes o
                INNER JOIN empresas_ocupacionales e ON e.id = o.empresa_id'
                . $sqlJoinSubcontrataOrden
                . $sqlJoinFacturarOrden
                . '
                INNER JOIN pacientes_ocupacionales t ON t.id = o.trabajador_id
                INNER JOIN ocupacional_protocolos_empresa p ON p.id = o.protocolo_id
                INNER JOIN ocupacional_tipos_evaluacion te ON te.id = o.tipo_evaluacion_id
                LEFT JOIN (
                    SELECT
                        orden_id,
                        COUNT(*) AS total_items,
                        SUM(CASE WHEN od.estado_ejecucion = "realizado"
                                  AND EXISTS (
                                      SELECT 1
                                      FROM ocupacional_resultados_clinicos rc
                                      WHERE rc.orden_detalle_id = od.id
                                        AND rc.estado = "finalizado"
                                  )
                                 THEN 1 ELSE 0 END) AS total_completados
                    FROM ocupacional_orden_detalle od
                    GROUP BY orden_id
                ) d ON d.orden_id = o.id'
                . $whereSql
                . ' ORDER BY o.id DESC LIMIT ?';

        $stmt = $mysqliOcup->prepare($sql);
        if (!$stmt) {
            out_orden(500, ['success' => false, 'error' => 'No se pudo generar reporte de ordenes']);
        }
        $types .= 'i';
        $params[] = $limit;
        bind_params_dynamic_orden($stmt, $types, $params);
        $stmt->execute();
        $res = $stmt->get_result();

        $rows = [];
        while ($r = $res->fetch_assoc()) {
            $rows[] = [
                'id' => (int)$r['id'],
                'codigo' => (string)($r['codigo'] ?? ''),
                'fecha_orden' => (string)($r['fecha_orden'] ?? ''),
                'estado' => (string)($r['estado'] ?? ''),
                'monto_total' => number_format((float)($r['monto_total'] ?? 0), 2, '.', ''),
                'aptitud_final' => (string)($r['aptitud_final'] ?? ''),
                'empresa' => (string)($r['razon_social'] ?? ''),
                'subcontrata_empresa_id' => isset($r['subcontrata_empresa_id']) ? (int)$r['subcontrata_empresa_id'] : 0,
                'subcontrata_empresa' => (string)($r['subcontrata_razon_social'] ?? ''),
                'facturar_empresa_id' => isset($r['facturar_empresa_id']) ? (int)$r['facturar_empresa_id'] : 0,
                'facturar_empresa' => (string)($r['facturar_razon_social'] ?? ''),
                'firma_doctor' => (string)($r['firma_doctor'] ?? ''),
                'modo' => (string)($r['modo'] ?? ''),
                'gestante' => isset($r['gestante']) ? (int)$r['gestante'] : 0,
                'documento' => (string)($r['documento'] ?? ''),
                'indica_dr' => (string)($r['indica_dr'] ?? ''),
                'documento_numero' => (string)($r['documento_numero'] ?? ''),
                'puesto_trabajo' => (string)($r['puesto_trabajo'] ?? ''),
                'protocolo_descripcion' => (string)($r['protocolo_descripcion'] ?? ''),
                'tipo_codigo' => (string)($r['tipo_codigo'] ?? ''),
                'total_items' => (int)($r['total_items'] ?? 0),
                'total_completados' => (int)($r['total_completados'] ?? 0),
            ];
        }
        $stmt->close();

        out_orden(200, [
            'success' => true,
            'data' => $rows,
        ]);
    }

    if ($accion === 'detalle_orden') {
        require_ocup_permiso_any_orden(['ver_ordenes_ocupacional', 'ejecutar_ordenes_ocupacional']);
        $ordenId = (int)($_GET['id'] ?? 0);
        if ($ordenId <= 0) {
            out_orden(422, ['success' => false, 'error' => 'id de orden es obligatorio']);
        }

        $stmtCabSql = 'SELECT
                                            o.id,
                                            o.codigo,
                                            o.fecha_orden,
                                            o.estado,
                                            o.monto_total,
                                            o.observacion,
                                            ' . $sqlExprSubcontrataIdOrden . ' AS subcontrata_empresa_id,
                                            ' . $sqlExprFacturarIdOrden . ' AS facturar_empresa_id,
                                            ' . $sqlExprFirmaDoctorOrden . ' AS firma_doctor,
                                            ' . $sqlExprModoOrden . ' AS modo,
                                            ' . $sqlExprGestanteOrden . ' AS gestante,
                                            ' . $sqlExprDocumentoOrden . ' AS documento,
                                            ' . $sqlExprIndicaDrOrden . ' AS indica_dr,
                                            o.aptitud_final,
                                            o.restriccion_final,
                                            o.recomendacion_final,
                                            o.medico_responsable,
                                            ' . $sqlExprMedicoResponsableIdOrden . ' AS medico_responsable_id,
                                            ' . $sqlExprMedicoNombreSnapshotOrden . ' AS medico_nombre_snapshot,
                                            ' . $sqlExprMedicoEspecialidadSnapshotOrden . ' AS medico_especialidad_snapshot,
                                            ' . $sqlExprMedicoCmpSnapshotOrden . ' AS medico_cmp_snapshot,
                                            ' . $sqlExprMedicoRneSnapshotOrden . ' AS medico_rne_snapshot,
                                            ' . $sqlExprMedicoRnaSnapshotOrden . ' AS medico_rna_snapshot,
                                            ' . $sqlExprMedicoFirmaSnapshotOrden . ' AS medico_firma_snapshot,
                                            ' . $sqlExprAptitudRegistradaByOrden . ' AS aptitud_registrada_by,
                                            ' . $sqlExprAptitudRegistradaAtOrden . ' AS aptitud_registrada_at,
                                            ' . $sqlExprCertFechaEvaluacionOrden . ' AS certificado_fecha_evaluacion_ref,
                                            ' . $sqlExprCertFechaEmisionOrden . ' AS certificado_fecha_emision_ref,
                                            e.razon_social AS empresa,
                                            IFNULL(esub.razon_social, "") AS subcontrata_razon_social,
                                            IFNULL(efac.razon_social, "") AS facturar_razon_social,
                                            t.external_patient_id,
                                            t.documento_numero,
                                            t.puesto_trabajo,
                                            t.area_riesgo,
                                            p.descripcion AS protocolo_descripcion,
                                            te.codigo AS tipo_codigo,
                                            te.nombre AS tipo_nombre
                                         FROM ocupacional_ordenes o
                                                      INNER JOIN empresas_ocupacionales e ON e.id = o.empresa_id'
                                                      . $sqlJoinSubcontrataOrden
                                                      . $sqlJoinFacturarOrden
                                                      . '
                                         INNER JOIN pacientes_ocupacionales t ON t.id = o.trabajador_id
                                         INNER JOIN ocupacional_protocolos_empresa p ON p.id = o.protocolo_id
                                         INNER JOIN ocupacional_tipos_evaluacion te ON te.id = o.tipo_evaluacion_id
                                                      WHERE o.id = ? LIMIT 1';
        $stmtCab = $mysqliOcup->prepare($stmtCabSql);
        if (!$stmtCab) {
            out_orden(500, ['success' => false, 'error' => 'No se pudo consultar cabecera de orden']);
        }
        $stmtCab->bind_param('i', $ordenId);
        $stmtCab->execute();
        $cab = $stmtCab->get_result()->fetch_assoc();
        $stmtCab->close();

        if (!$cab) {
            out_orden(404, ['success' => false, 'error' => 'Orden no encontrada']);
        }
        if ($esSesionMedico) {
            if (empty($ordenExtraColumns['medico_responsable_id'])) {
                out_orden(500, ['success' => false, 'error' => 'Falta columna medico_responsable_id para validar ownership medico']);
            }
            $ownerMedicoId = (int)($cab['medico_responsable_id'] ?? 0);
            if ($ownerMedicoId !== $medicoSesionId) {
                if (!medico_es_responsable_clinico_en_orden_orden($mysqliOcup, $ordenId, $medicoSesionId)) {
                    out_orden(403, ['success' => false, 'error' => 'No autorizado para acceder a este orden']);
                }
            }
        }

        $medicoRnaVigente = '';
        $medicoResponsableId = (int)($cab['medico_responsable_id'] ?? 0);
        if (trim((string)($cab['medico_rna_snapshot'] ?? '')) === '' && $medicoResponsableId > 0) {
            $stmtMedicoRna = $mysqli->prepare('SELECT rna FROM medicos WHERE id = ? LIMIT 1');
            if ($stmtMedicoRna) {
                $stmtMedicoRna->bind_param('i', $medicoResponsableId);
                $stmtMedicoRna->execute();
                $medicoRna = $stmtMedicoRna->get_result()->fetch_assoc();
                $stmtMedicoRna->close();
                $medicoRnaVigente = trim((string)($medicoRna['rna'] ?? ''));
            }
        }

        $pacienteNombreCompleto = '';
        $pacienteHistoriaClinica = '';
        $pacienteSexo = '';
        $pacienteFechaNacimiento = '';
        $pacienteEdad = null;
        $externalPatientId = (int)($cab['external_patient_id'] ?? 0);
        if ($externalPatientId > 0) {
            $stmtPac = $mysqli->prepare('SELECT nombre, apellido, historia_clinica, sexo, fecha_nacimiento FROM pacientes WHERE id = ? LIMIT 1');
            if ($stmtPac) {
                $stmtPac->bind_param('i', $externalPatientId);
                $stmtPac->execute();
                $pac = $stmtPac->get_result()->fetch_assoc();
                $stmtPac->close();
                if ($pac) {
                    $pacienteNombreCompleto = trim((string)($pac['nombre'] ?? '') . ' ' . (string)($pac['apellido'] ?? ''));
                    $pacienteHistoriaClinica = trim((string)($pac['historia_clinica'] ?? ''));
                    $pacienteSexo = trim((string)($pac['sexo'] ?? ''));
                    $pacienteFechaNacimiento = trim((string)($pac['fecha_nacimiento'] ?? ''));
                    $pacienteEdad = calculate_age_orden($pacienteFechaNacimiento);
                }
            }
        }

        $hasGrupoMasterDetalle = table_exists_orden($mysqliOcup, 'ocupacional_grupos_examenes');
        $grupoDetalleExpr = !empty($detalleExtraColumns['grupo_snapshot'])
            ? 'COALESCE(NULLIF(d.grupo_snapshot, ""), e.grupo, "")'
            : 'COALESCE(e.grupo, "")';
        $subgrupoDetalleExpr = !empty($detalleExtraColumns['subgrupo_snapshot'])
            ? 'COALESCE(NULLIF(d.subgrupo_snapshot, ""), e.subgrupo, "")'
            : 'COALESCE(e.subgrupo, "")';
        $grupoOrdenDetalleExpr = !empty($detalleExtraColumns['grupo_orden_snapshot'])
            ? 'CASE WHEN d.grupo_orden_snapshot > 0 THEN d.grupo_orden_snapshot ELSE ' . ($hasGrupoMasterDetalle ? 'COALESCE(g.orden, 0)' : '0') . ' END'
            : ($hasGrupoMasterDetalle ? 'COALESCE(g.orden, 0)' : '0');
        $examenOrdenDetalleExpr = !empty($detalleExtraColumns['examen_orden_snapshot'])
            ? 'CASE WHEN d.examen_orden_snapshot > 0 THEN d.examen_orden_snapshot ELSE COALESCE(e.posicion, 0) END'
            : 'COALESCE(e.posicion, 0)';
        $grupoDetalleJoin = $hasGrupoMasterDetalle
            ? ' LEFT JOIN ocupacional_grupos_examenes g ON g.parent_id = 0 AND UPPER(g.nombre) = UPPER(COALESCE(NULLIF(' . (!empty($detalleExtraColumns['grupo_snapshot']) ? 'd.grupo_snapshot' : '""') . ', ""), e.grupo, ""))'
            : '';

                $stmtDet = $mysqliOcup->prepare('SELECT
                                                                                        d.id,
                                                                                        d.catalogo_id,
                                                                                        d.examen_id,
                                                                                        d.examen_codigo,
                                                                                        d.examen_descripcion,
                                                                                        ' . $grupoDetalleExpr . ' AS examen_grupo,
                                                                                        ' . $subgrupoDetalleExpr . ' AS examen_subgrupo,
                                                                                        ' . $grupoOrdenDetalleExpr . ' AS grupo_orden,
                                                                                        ' . $examenOrdenDetalleExpr . ' AS examen_orden,
                                                                                        d.monto,
                                                                                        d.estado_ejecucion,
                                                                                        d.observacion_ejecucion,
                                                                                        d.fecha_ejecucion,
                                                                                        EXISTS (
                                                                                                SELECT 1
                                                                                                FROM ocupacional_resultados_clinicos rc
                                                                                                WHERE rc.orden_detalle_id = d.id
                                                                                                    AND rc.estado = "finalizado"
                                                                                        ) AS resultado_finalizado
                                                                                 FROM ocupacional_orden_detalle d
                                                                                 LEFT JOIN ocupacional_examenes_generales e ON e.id = d.examen_id
                                                                                 ' . $grupoDetalleJoin . '
                                                                                 WHERE d.orden_id = ?
                                                                                 ORDER BY grupo_orden ASC, examen_grupo ASC, examen_subgrupo ASC, examen_orden ASC, d.id ASC');
        if (!$stmtDet) {
            out_orden(500, ['success' => false, 'error' => 'No se pudo consultar detalle de orden']);
        }
        $stmtDet->bind_param('i', $ordenId);
        $stmtDet->execute();
        $resDet = $stmtDet->get_result();

        $detalles = [];
        while ($d = $resDet->fetch_assoc()) {
            $detalles[] = [
                'id' => (int)$d['id'],
                'catalogo_id' => (int)$d['catalogo_id'],
                'examen_id' => (int)$d['examen_id'],
                'examen_codigo' => (string)($d['examen_codigo'] ?? ''),
                'examen_descripcion' => (string)($d['examen_descripcion'] ?? ''),
                'examen_grupo' => (string)($d['examen_grupo'] ?? ''),
                'examen_subgrupo' => (string)($d['examen_subgrupo'] ?? ''),
                'grupo_orden' => (int)($d['grupo_orden'] ?? 0),
                'examen_orden' => (int)($d['examen_orden'] ?? 0),
                'monto' => number_format((float)($d['monto'] ?? 0), 2, '.', ''),
                'estado_ejecucion' => (string)($d['estado_ejecucion'] ?? 'pendiente'),
                'observacion_ejecucion' => (string)($d['observacion_ejecucion'] ?? ''),
                'fecha_ejecucion' => (string)($d['fecha_ejecucion'] ?? ''),
                'resultado_finalizado' => (int)($d['resultado_finalizado'] ?? 0) === 1,
            ];
        }
        $stmtDet->close();

        if ($esSesionMedico) {
            $ownerMedicoId = (int)($cab['medico_responsable_id'] ?? 0);
            if ($ownerMedicoId !== $medicoSesionId) {
                $gruposPermitidos = medico_grupos_clinicos_autorizados_en_orden_orden($mysqliOcup, $ordenId, $medicoSesionId);
                if (count($gruposPermitidos) > 0) {
                    $allowedMap = array_fill_keys($gruposPermitidos, true);
                    $detalles = array_values(array_filter(
                        $detalles,
                        static function ($it) use ($allowedMap) {
                            $grupo = strtoupper(trim((string)($it['examen_grupo'] ?? '')));
                            if ($grupo !== '' && isset($allowedMap[$grupo])) {
                                return true;
                            }

                            if (isset($allowedMap['PSICOLOGIA']) && es_detalle_psicologico_orden(
                                (string)($it['examen_codigo'] ?? ''),
                                (string)($it['examen_descripcion'] ?? ''),
                                (string)($it['examen_grupo'] ?? ''),
                                (string)($it['examen_subgrupo'] ?? '')
                            )) {
                                return true;
                            }

                            return false;
                        }
                    ));
                } else {
                    $detalles = [];
                }
                if (count($detalles) <= 0) {
                    out_orden(403, ['success' => false, 'error' => 'No autorizado para acceder a evaluaciones fuera de su bloque clinico']);
                }
            }
        }

        if ($esSesionEnfermero) {
            $detalles = array_values(array_filter(
                $detalles,
                static function ($it) {
                    return es_detalle_triaje_orden(
                        (string)($it['examen_codigo'] ?? ''),
                        (string)($it['examen_descripcion'] ?? ''),
                        (string)($it['examen_grupo'] ?? '')
                    );
                }
            ));
            if (count($detalles) <= 0) {
                out_orden(403, ['success' => false, 'error' => 'No autorizado para acceder a detalles no triaje']);
            }
        }

        $triajeResumen = [];
        if (table_exists_orden($mysqliOcup, 'ocupacional_resultados_clinicos')) {
            $stmtTriaje = $mysqliOcup->prepare('SELECT rc.datos_json
                                                FROM ocupacional_resultados_clinicos rc
                                                INNER JOIN ocupacional_orden_detalle d ON d.id = rc.orden_detalle_id
                                                LEFT JOIN ocupacional_examenes_generales e ON e.id = d.examen_id
                                                WHERE d.orden_id = ?
                                                  AND rc.estado = "finalizado"
                                                  AND (LOWER(d.examen_descripcion) LIKE "%triaje%"
                                                       OR LOWER(d.examen_descripcion) LIKE "%triage%"
                                                       OR LOWER(COALESCE(e.grupo, "")) LIKE "%triaje%")
                                                ORDER BY rc.updated_at DESC, rc.id DESC
                                                LIMIT 1');
            if ($stmtTriaje) {
                $stmtTriaje->bind_param('i', $ordenId);
                $stmtTriaje->execute();
                $rowTriaje = $stmtTriaje->get_result()->fetch_assoc();
                $stmtTriaje->close();
                if ($rowTriaje && trim((string)($rowTriaje['datos_json'] ?? '')) !== '') {
                    $decodedTriaje = json_decode((string)$rowTriaje['datos_json'], true);
                    $triajeResumen = is_array($decodedTriaje) ? $decodedTriaje : [];
                }
            }
        }

        $totalItems = count($detalles);
        $totalCompletados = 0;
        foreach ($detalles as $itemDet) {
            if ((string)$itemDet['estado_ejecucion'] === 'realizado' && $itemDet['resultado_finalizado']) {
                $totalCompletados++;
            }
        }

        $fechasCertificado = resolve_certificado_fechas_orden(
            (string)($cab['fecha_orden'] ?? ''),
            (string)($cab['certificado_fecha_evaluacion_ref'] ?? ''),
            (string)($cab['certificado_fecha_emision_ref'] ?? '')
        );

        $stmtEvt = $mysqliOcup->prepare('SELECT
                                            id,
                                            tipo_evento,
                                            descripcion,
                                            payload_json,
                                            created_by,
                                            created_at
                                         FROM ocupacional_orden_eventos
                                         WHERE orden_id = ?
                                         ORDER BY id DESC
                                         LIMIT 50');
        $eventos = [];
        if ($stmtEvt && !$esSesionEnfermero) {
            $stmtEvt->bind_param('i', $ordenId);
            $stmtEvt->execute();
            $resEvt = $stmtEvt->get_result();
            while ($ev = $resEvt->fetch_assoc()) {
                $eventos[] = [
                    'id' => (int)$ev['id'],
                    'tipo_evento' => (string)($ev['tipo_evento'] ?? ''),
                    'descripcion' => (string)($ev['descripcion'] ?? ''),
                    'payload_json' => (string)($ev['payload_json'] ?? ''),
                    'created_by' => isset($ev['created_by']) ? (int)$ev['created_by'] : null,
                    'created_at' => (string)($ev['created_at'] ?? ''),
                ];
            }
            $stmtEvt->close();
        }

        out_orden(200, [
            'success' => true,
            'data' => [
                'id' => (int)$cab['id'],
                'codigo' => (string)($cab['codigo'] ?? ''),
                'fecha_orden' => (string)($cab['fecha_orden'] ?? ''),
                'estado' => (string)($cab['estado'] ?? ''),
                'monto_total' => number_format((float)($cab['monto_total'] ?? 0), 2, '.', ''),
                'observacion' => (string)($cab['observacion'] ?? ''),
                'subcontrata_empresa_id' => isset($cab['subcontrata_empresa_id']) ? (int)$cab['subcontrata_empresa_id'] : 0,
                'subcontrata_empresa' => (string)($cab['subcontrata_razon_social'] ?? ''),
                'facturar_empresa_id' => isset($cab['facturar_empresa_id']) ? (int)$cab['facturar_empresa_id'] : 0,
                'facturar_empresa' => (string)($cab['facturar_razon_social'] ?? ''),
                'firma_doctor' => (string)($cab['firma_doctor'] ?? ''),
                'modo' => (string)($cab['modo'] ?? ''),
                'gestante' => isset($cab['gestante']) ? (int)$cab['gestante'] : 0,
                'documento' => (string)($cab['documento'] ?? ''),
                'indica_dr' => (string)($cab['indica_dr'] ?? ''),
                'aptitud_final' => $esSesionEnfermero ? '' : (string)($cab['aptitud_final'] ?? ''),
                'restriccion_final' => $esSesionEnfermero ? '' : (string)($cab['restriccion_final'] ?? ''),
                'recomendacion_final' => $esSesionEnfermero ? '' : (string)($cab['recomendacion_final'] ?? ''),
                'medico_responsable' => (string)($cab['medico_responsable'] ?? ''),
                'medico_responsable_id' => (int)($cab['medico_responsable_id'] ?? 0),
                'medico_nombre_snapshot' => (string)($cab['medico_nombre_snapshot'] ?? ''),
                'medico_especialidad_snapshot' => (string)($cab['medico_especialidad_snapshot'] ?? ''),
                'medico_cmp_snapshot' => (string)($cab['medico_cmp_snapshot'] ?? ''),
                'medico_rne_snapshot' => (string)($cab['medico_rne_snapshot'] ?? ''),
                'medico_rna_snapshot' => (string)($cab['medico_rna_snapshot'] ?? ''),
                'medico_rna_vigente' => $medicoRnaVigente,
                'medico_firma_snapshot' => (string)($cab['medico_firma_snapshot'] ?? ''),
                'aptitud_registrada_by' => isset($cab['aptitud_registrada_by']) ? (int)$cab['aptitud_registrada_by'] : null,
                'aptitud_registrada_at' => (string)($cab['aptitud_registrada_at'] ?? ''),
                'certificado_fecha_evaluacion_ref' => $fechasCertificado['fecha_evaluacion_ref'],
                'certificado_fecha_emision_ref' => $fechasCertificado['fecha_emision_ref'],
                'certificado_fecha_evaluacion' => $fechasCertificado['fecha_evaluacion'],
                'certificado_fecha_emision' => $fechasCertificado['fecha_emision'],
                'empresa' => (string)($cab['empresa'] ?? ''),
                'paciente_nombre_completo' => $pacienteNombreCompleto,
                'paciente_historia_clinica' => $pacienteHistoriaClinica,
                'paciente_sexo' => $pacienteSexo,
                'paciente_fecha_nacimiento' => $pacienteFechaNacimiento,
                'paciente_edad' => $pacienteEdad,
                'documento_numero' => (string)($cab['documento_numero'] ?? ''),
                'puesto_trabajo' => (string)($cab['puesto_trabajo'] ?? ''),
                'area_trabajo' => (string)($cab['area_riesgo'] ?? ''),
                'protocolo_descripcion' => (string)($cab['protocolo_descripcion'] ?? ''),
                'tipo_codigo' => (string)($cab['tipo_codigo'] ?? ''),
                'tipo_nombre' => (string)($cab['tipo_nombre'] ?? ''),
                'total_items' => $totalItems,
                'total_completados' => $totalCompletados,
                'items' => $detalles,
                'triaje' => $triajeResumen,
                'eventos' => $eventos,
            ],
        ]);
    }

    if ($accion === 'eventos_orden') {
        require_ocup_permiso_any_orden(['ver_auditoria_ordenes_ocupacional', 'ver_ordenes_ocupacional']);
        $ordenId = (int)($_GET['id'] ?? 0);
        $tipo = trim((string)($_GET['tipo'] ?? ''));
        $fechaDesde = trim((string)($_GET['fecha_desde'] ?? ''));
        $fechaHasta = trim((string)($_GET['fecha_hasta'] ?? ''));
        $limit = (int)($_GET['limit'] ?? 100);
        $limit = max(1, min($limit, 500));

        if ($ordenId <= 0) {
            out_orden(422, ['success' => false, 'error' => 'id de orden es obligatorio']);
        }
        require_owner_medico_by_orden_id_orden($mysqliOcup, $ordenId, $ordenExtraColumns, 'orden');

        if ($fechaDesde !== '' && !is_valid_date_orden($fechaDesde)) {
            out_orden(422, ['success' => false, 'error' => 'fecha_desde invalida. Formato esperado YYYY-MM-DD']);
        }
        if ($fechaHasta !== '' && !is_valid_date_orden($fechaHasta)) {
            out_orden(422, ['success' => false, 'error' => 'fecha_hasta invalida. Formato esperado YYYY-MM-DD']);
        }

        $where = ['orden_id = ?'];
        $types = 'i';
        $params = [$ordenId];

        if ($tipo !== '') {
            $where[] = 'tipo_evento = ?';
            $types .= 's';
            $params[] = $tipo;
        }
        if ($fechaDesde !== '') {
            $where[] = 'DATE(created_at) >= ?';
            $types .= 's';
            $params[] = $fechaDesde;
        }
        if ($fechaHasta !== '') {
            $where[] = 'DATE(created_at) <= ?';
            $types .= 's';
            $params[] = $fechaHasta;
        }

        $sql = 'SELECT id, tipo_evento, descripcion, payload_json, created_by, created_at
                FROM ocupacional_orden_eventos
                WHERE ' . implode(' AND ', $where) . '
                ORDER BY id DESC
                LIMIT ?';
        $stmt = $mysqliOcup->prepare($sql);
        if (!$stmt) {
            out_orden(500, ['success' => false, 'error' => 'No se pudo listar eventos de orden']);
        }

        $types .= 'i';
        $params[] = $limit;
        bind_params_dynamic_orden($stmt, $types, $params);
        $stmt->execute();
        $res = $stmt->get_result();

        $rows = [];
        while ($ev = $res->fetch_assoc()) {
            $rows[] = [
                'id' => (int)$ev['id'],
                'tipo_evento' => (string)($ev['tipo_evento'] ?? ''),
                'descripcion' => (string)($ev['descripcion'] ?? ''),
                'payload_json' => (string)($ev['payload_json'] ?? ''),
                'created_by' => isset($ev['created_by']) ? (int)$ev['created_by'] : null,
                'created_at' => (string)($ev['created_at'] ?? ''),
            ];
        }
        $stmt->close();

        out_orden(200, [
            'success' => true,
            'data' => $rows,
        ]);
    }

    out_orden(422, ['success' => false, 'error' => 'accion GET no soportada']);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    out_orden(405, ['success' => false, 'error' => 'Metodo no permitido']);
}

require_ocup_access_orden();

$esSesionMedico = es_sesion_medico_orden();
$esSesionEnfermero = es_sesion_enfermero_orden();
$medicoSesionId = resolve_medico_sesion_id_orden();

$raw = file_get_contents('php://input');
$payload = json_decode($raw, true);
if (!is_array($payload)) {
    $payload = $_POST;
}

$accion = trim((string)($payload['accion'] ?? ''));
$usuarioId = isset($_SESSION['usuario']['id']) ? (int)$_SESSION['usuario']['id'] : null;

if ($esSesionEnfermero) {
    out_orden(403, ['success' => false, 'error' => 'No autorizado para acciones POST en ordenes ocupacionales']);
}

if ($accion === 'registrar_orden') {
    require_ocup_permiso_any_orden(['registrar_ordenes_ocupacional']);
    $empresaId = (int)($payload['empresa_id'] ?? 0);
    $trabajadorId = (int)($payload['trabajador_id'] ?? 0);
    $protocoloId = (int)($payload['protocolo_id'] ?? 0);
    $tipoEvaluacionId = (int)($payload['tipo_evaluacion_id'] ?? 0);
    $fechaOrden = trim((string)($payload['fecha_orden'] ?? date('Y-m-d')));
    $observacion = trim((string)($payload['observacion'] ?? ''));
    $subcontrataEmpresaId = (int)($payload['subcontrata_empresa_id'] ?? 0);
    $facturarEmpresaId = (int)($payload['facturar_empresa_id'] ?? 0);
    $medicoResponsableId = (int)($payload['medico_responsable_id'] ?? 0);
    $modo = strtoupper(trim((string)($payload['modo'] ?? 'CONVALIDACION')));
    $gestanteRaw = $payload['gestante'] ?? 0;
    $gestante = ($gestanteRaw === true || $gestanteRaw === 1 || $gestanteRaw === '1' || $gestanteRaw === 'true') ? 1 : 0;
    $documento = trim((string)($payload['documento'] ?? ''));
    $indicaDr = trim((string)($payload['indica_dr'] ?? ''));

    if ($empresaId <= 0 || $trabajadorId <= 0 || $protocoloId <= 0 || $tipoEvaluacionId <= 0) {
        out_orden(422, ['success' => false, 'error' => 'empresa_id, trabajador_id, protocolo_id y tipo_evaluacion_id son obligatorios']);
    }

    $fechaObj = DateTime::createFromFormat('Y-m-d', $fechaOrden);
    if (!$fechaObj || $fechaObj->format('Y-m-d') !== $fechaOrden) {
        out_orden(422, ['success' => false, 'error' => 'fecha_orden invalida. Formato esperado YYYY-MM-DD']);
    }

    $modosValidos = ['CONVALIDACION', 'REVALIDACION', 'REEVALUACION'];
    if (!in_array($modo, $modosValidos, true)) {
        out_orden(422, ['success' => false, 'error' => 'modo invalido']);
    }

    $dup = find_orden_duplicada_activa_orden($mysqliOcup, $empresaId, $trabajadorId, $protocoloId, $tipoEvaluacionId, $fechaOrden);
    if ($dup) {
        out_orden(409, [
            'success' => false,
            'error' => 'Ya existe una orden activa para el mismo trabajador, protocolo, tipo y fecha',
            'data' => [
                'orden_id' => (int)($dup['id'] ?? 0),
                'codigo' => (string)($dup['codigo'] ?? ''),
            ],
        ]);
    }

    if (!$medicoSnapshotReady) {
        out_orden(500, ['success' => false, 'error' => 'Falta aplicar migracion 20260725_0020 de medico responsable']);
    }
    $medicoResponsable = require_medico_responsable_orden($mysqli, $medicoResponsableId);
    $firmaDoctor = strtoupper($medicoResponsable['apellido'] !== '' ? $medicoResponsable['apellido'] : $medicoResponsable['nombre']);
    $firmaDoctor = function_exists('mb_substr') ? mb_substr($firmaDoctor, 0, 80, 'UTF-8') : substr($firmaDoctor, 0, 80);

    foreach ([$subcontrataEmpresaId, $facturarEmpresaId] as $empresaRelacionadaId) {
        if ($empresaRelacionadaId <= 0) {
            continue;
        }
        $stmtEmpresaExtra = $mysqliOcup->prepare('SELECT id FROM empresas_ocupacionales WHERE id = ? LIMIT 1');
        if (!$stmtEmpresaExtra) {
            out_orden(500, ['success' => false, 'error' => 'No se pudo validar empresa relacionada']);
        }
        $stmtEmpresaExtra->bind_param('i', $empresaRelacionadaId);
        $stmtEmpresaExtra->execute();
        $existsExtra = $stmtEmpresaExtra->get_result()->fetch_assoc();
        $stmtEmpresaExtra->close();
        if (!$existsExtra) {
            out_orden(422, ['success' => false, 'error' => 'Empresa relacionada invalida para subcontrata/facturar']);
        }
    }

    $resolved = resolve_examenes_orden($mysqliOcup, $mysqli, $empresaId, $trabajadorId, $protocoloId, $tipoEvaluacionId);

    $itemsAplican = array_values(array_filter($resolved['items'], function ($it) {
        return !empty($it['aplica']);
    }));
    if (empty($itemsAplican)) {
        out_orden(422, ['success' => false, 'error' => 'No hay examenes aplicables para registrar en la orden']);
    }

    $mysqliOcup->begin_transaction();
    try {
        $insertColumns = [
            'codigo',
            'empresa_id',
            'trabajador_id',
            'protocolo_id',
            'tipo_evaluacion_id',
            'fecha_orden',
            'estado',
            'monto_total',
            'observacion',
            'created_by',
            'updated_by',
        ];
        $insertValues = ['NULL', '?', '?', '?', '?', '?', '"emitida"', '?', '?', '?', '?'];
        $insertTypes = 'iiiisdsii';
        $insertParams = [$empresaId, $trabajadorId, $protocoloId, $tipoEvaluacionId, $fechaOrden, (float)$resolved['total'], $observacion, $usuarioId, $usuarioId];

        if (!empty($ordenExtraColumns['subcontrata_empresa_id'])) {
            $insertColumns[] = 'subcontrata_empresa_id';
            $insertValues[] = '?';
            $insertTypes .= 'i';
            $insertParams[] = $subcontrataEmpresaId > 0 ? $subcontrataEmpresaId : null;
        }
        if (!empty($ordenExtraColumns['facturar_empresa_id'])) {
            $insertColumns[] = 'facturar_empresa_id';
            $insertValues[] = '?';
            $insertTypes .= 'i';
            $insertParams[] = $facturarEmpresaId > 0 ? $facturarEmpresaId : null;
        }
        if (!empty($ordenExtraColumns['firma_doctor'])) {
            $insertColumns[] = 'firma_doctor';
            $insertValues[] = '?';
            $insertTypes .= 's';
            $insertParams[] = $firmaDoctor;
        }
        $insertColumns = array_merge($insertColumns, [
            'medico_responsable',
            'medico_responsable_id',
            'medico_nombre_snapshot',
            'medico_especialidad_snapshot',
            'medico_cmp_snapshot',
            'medico_rne_snapshot',
            'medico_rna_snapshot',
            'medico_firma_snapshot',
        ]);
        $insertValues = array_merge($insertValues, ['?', '?', '?', '?', '?', '?', '?', '?']);
        $insertTypes .= 'sissssss';
        array_push(
            $insertParams,
            $medicoResponsable['nombre'],
            $medicoResponsable['id'],
            $medicoResponsable['nombre'],
            $medicoResponsable['especialidad'],
            $medicoResponsable['cmp'],
            $medicoResponsable['rne'],
            $medicoResponsable['rna'],
            $medicoResponsable['firma']
        );
        if (!empty($ordenExtraColumns['modo'])) {
            $insertColumns[] = 'modo';
            $insertValues[] = '?';
            $insertTypes .= 's';
            $insertParams[] = $modo;
        }
        if (!empty($ordenExtraColumns['gestante'])) {
            $insertColumns[] = 'gestante';
            $insertValues[] = '?';
            $insertTypes .= 'i';
            $insertParams[] = $gestante;
        }
        if (!empty($ordenExtraColumns['documento'])) {
            $insertColumns[] = 'documento';
            $insertValues[] = '?';
            $insertTypes .= 's';
            $insertParams[] = $documento;
        }
        if (!empty($ordenExtraColumns['indica_dr'])) {
            $insertColumns[] = 'indica_dr';
            $insertValues[] = '?';
            $insertTypes .= 's';
            $insertParams[] = $indicaDr;
        }

        $sqlInsert = 'INSERT INTO ocupacional_ordenes (' . implode(', ', $insertColumns) . ') VALUES (' . implode(', ', $insertValues) . ')';
        $stmtIns = $mysqliOcup->prepare($sqlInsert);
        if (!$stmtIns) {
            throw new Exception('No se pudo preparar insercion de orden');
        }
        bind_params_dynamic_orden($stmtIns, $insertTypes, $insertParams);
        $stmtIns->execute();
        $ordenId = (int)$stmtIns->insert_id;
        $stmtIns->close();

        $codigo = 'OO' . str_pad((string)$ordenId, 6, '0', STR_PAD_LEFT);
        $stmtCode = $mysqliOcup->prepare('UPDATE ocupacional_ordenes SET codigo = ? WHERE id = ? LIMIT 1');
        if (!$stmtCode) {
            throw new Exception('No se pudo actualizar codigo de orden');
        }
        $stmtCode->bind_param('si', $codigo, $ordenId);
        $stmtCode->execute();
        $stmtCode->close();

        $detalleSnapshotReady = !empty($detalleExtraColumns['grupo_snapshot'])
            && !empty($detalleExtraColumns['subgrupo_snapshot'])
            && !empty($detalleExtraColumns['grupo_orden_snapshot'])
            && !empty($detalleExtraColumns['examen_orden_snapshot']);
        $detalleLabSnapshotReady = !empty($detalleExtraColumns['examen_snapshot_json']);
        if ($detalleSnapshotReady && $detalleLabSnapshotReady) {
            $sqlDetalle = 'INSERT INTO ocupacional_orden_detalle
                          (orden_id, catalogo_id, examen_id, examen_codigo, examen_descripcion, grupo_snapshot, subgrupo_snapshot, grupo_orden_snapshot, examen_orden_snapshot, examen_snapshot_json, monto)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        } elseif ($detalleSnapshotReady) {
            $sqlDetalle = 'INSERT INTO ocupacional_orden_detalle
                          (orden_id, catalogo_id, examen_id, examen_codigo, examen_descripcion, grupo_snapshot, subgrupo_snapshot, grupo_orden_snapshot, examen_orden_snapshot, monto)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        } elseif ($detalleLabSnapshotReady) {
            $sqlDetalle = 'INSERT INTO ocupacional_orden_detalle
                          (orden_id, catalogo_id, examen_id, examen_codigo, examen_descripcion, examen_snapshot_json, monto)
                          VALUES (?, ?, ?, ?, ?, ?, ?)';
        } else {
            $sqlDetalle = 'INSERT INTO ocupacional_orden_detalle
                          (orden_id, catalogo_id, examen_id, examen_codigo, examen_descripcion, monto)
                          VALUES (?, ?, ?, ?, ?, ?)';
        }
        $stmtDet = $mysqliOcup->prepare($sqlDetalle);
        if (!$stmtDet) {
            throw new Exception('No se pudo preparar insercion de detalle');
        }

        foreach ($itemsAplican as $item) {
            $catalogoId = (int)$item['catalogo_id'];
            $examenId = (int)$item['examen_id'];
            $codigoEx = (string)$item['codigo'];
            $descEx = (string)$item['descripcion'];
            $grupoEx = (string)($item['grupo'] ?? '');
            $subgrupoEx = (string)($item['subgrupo'] ?? '');
            $grupoOrdenEx = (int)($item['grupo_orden'] ?? 0);
            $examenOrdenEx = (int)($item['examen_orden'] ?? 0);
            $examenSnapshotJson = (string)($item['laboratorio_snapshot_json'] ?? '');
            $monto = (float)$item['monto'];
            if ($detalleSnapshotReady && $detalleLabSnapshotReady) {
                $stmtDet->bind_param('iiissssiisd', $ordenId, $catalogoId, $examenId, $codigoEx, $descEx, $grupoEx, $subgrupoEx, $grupoOrdenEx, $examenOrdenEx, $examenSnapshotJson, $monto);
            } elseif ($detalleSnapshotReady) {
                $stmtDet->bind_param('iiissssiid', $ordenId, $catalogoId, $examenId, $codigoEx, $descEx, $grupoEx, $subgrupoEx, $grupoOrdenEx, $examenOrdenEx, $monto);
            } elseif ($detalleLabSnapshotReady) {
                $stmtDet->bind_param('iiisssd', $ordenId, $catalogoId, $examenId, $codigoEx, $descEx, $examenSnapshotJson, $monto);
            } else {
                $stmtDet->bind_param('iiissd', $ordenId, $catalogoId, $examenId, $codigoEx, $descEx, $monto);
            }
            $stmtDet->execute();
        }
        $stmtDet->close();

        registrar_evento_orden(
            $mysqliOcup,
            $ordenId,
            'orden_registrada',
            'Orden ocupacional registrada',
            $usuarioId,
            [
                'codigo' => $codigo,
                'total_items' => count($itemsAplican),
                'monto_total' => number_format((float)$resolved['total'], 2, '.', ''),
                'subcontrata_empresa_id' => $subcontrataEmpresaId,
                'facturar_empresa_id' => $facturarEmpresaId,
                'firma_doctor' => $firmaDoctor,
                'medico_responsable_id' => $medicoResponsable['id'],
                'medico_responsable_id' => $medicoResponsable['id'],
                'modo' => $modo,
                'gestante' => $gestante,
                'documento' => $documento,
                'indica_dr' => $indicaDr,
            ]
        );

        $mysqliOcup->commit();

        out_orden(201, [
            'success' => true,
            'data' => [
                'id' => $ordenId,
                'codigo' => $codigo,
                'empresa_id' => $empresaId,
                'trabajador_id' => $trabajadorId,
                'protocolo_id' => $protocoloId,
                'tipo_evaluacion_id' => $tipoEvaluacionId,
                'fecha_orden' => $fechaOrden,
                'monto_total' => number_format((float)$resolved['total'], 2, '.', ''),
                'total_items' => count($itemsAplican),
                'subcontrata_empresa_id' => $subcontrataEmpresaId,
                'facturar_empresa_id' => $facturarEmpresaId,
                'firma_doctor' => $firmaDoctor,
                'modo' => $modo,
                'gestante' => $gestante,
                'documento' => $documento,
                'indica_dr' => $indicaDr,
            ],
        ]);
    } catch (Throwable $e) {
        $mysqliOcup->rollback();
        out_orden(500, ['success' => false, 'error' => 'No se pudo registrar la orden ocupacional']);
    }
}

if ($accion === 'anular_orden') {
    require_ocup_permiso_any_orden(['anular_ordenes_ocupacional']);
    $ordenId = (int)($payload['id'] ?? 0);
    $motivo = trim((string)($payload['motivo'] ?? ''));
    if ($ordenId <= 0) {
        out_orden(422, ['success' => false, 'error' => 'id de orden es obligatorio']);
    }
    if ($motivo === '') {
        out_orden(422, ['success' => false, 'error' => 'motivo es obligatorio para anular']);
    }

        $stmt = $mysqliOcup->prepare('SELECT o.id, o.estado,
                                                                                EXISTS (
                                                                                        SELECT 1
                                                                                        FROM ocupacional_orden_eventos ev
                                                                                        WHERE ev.orden_id = o.id
                                                                                            AND ev.tipo_evento = "certificado_emitido"
                                                                                ) AS certificado_emitido
                                                                    FROM ocupacional_ordenes o
                                                                    WHERE o.id = ? LIMIT 1');
    if (!$stmt) {
        out_orden(500, ['success' => false, 'error' => 'No se pudo validar orden']);
    }
    $stmt->bind_param('i', $ordenId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$row) {
        out_orden(404, ['success' => false, 'error' => 'Orden no encontrada']);
    }
    if ((string)$row['estado'] === 'anulada') {
        out_orden(422, ['success' => false, 'error' => 'La orden ya se encuentra anulada']);
    }
    if (in_array((string)$row['estado'], ['completada', 'cerrada'], true)) {
        out_orden(422, ['success' => false, 'error' => 'No se puede anular una orden completada o cerrada']);
    }
    if ((int)($row['certificado_emitido'] ?? 0) === 1) {
        out_orden(422, ['success' => false, 'error' => 'No se puede anular una orden con certificado emitido']);
    }

    $stmtUp = $mysqliOcup->prepare('UPDATE ocupacional_ordenes SET estado = "anulada", updated_at = CURRENT_TIMESTAMP, updated_by = ? WHERE id = ? LIMIT 1');
    if (!$stmtUp) {
        out_orden(500, ['success' => false, 'error' => 'No se pudo anular la orden']);
    }
    $stmtUp->bind_param('ii', $usuarioId, $ordenId);
    $stmtUp->execute();
    $affected = $stmtUp->affected_rows;
    $stmtUp->close();

    if ($affected <= 0) {
        out_orden(500, ['success' => false, 'error' => 'No se pudo anular la orden']);
    }

    registrar_evento_orden(
        $mysqliOcup,
        $ordenId,
        'orden_anulada',
        'Orden anulada por usuario',
        $usuarioId,
        ['motivo' => $motivo]
    );

    out_orden(200, [
        'success' => true,
        'data' => [
            'id' => $ordenId,
            'estado' => 'anulada',
        ],
    ]);
}

if ($accion === 'editar_orden') {
    require_ocup_permiso_any_orden(['registrar_ordenes_ocupacional', 'anular_ordenes_ocupacional']);
    $ordenId = (int)($payload['id'] ?? 0);
    $fechaOrden = trim((string)($payload['fecha_orden'] ?? ''));
    $empresaId = (int)($payload['empresa_id'] ?? 0);
    $trabajadorId = (int)($payload['trabajador_id'] ?? 0);
    $protocoloId = (int)($payload['protocolo_id'] ?? 0);
    $tipoEvaluacionId = (int)($payload['tipo_evaluacion_id'] ?? 0);
    $observacion = trim((string)($payload['observacion'] ?? ''));
    $modo = strtoupper(trim((string)($payload['modo'] ?? '')));
    $gestanteRaw = $payload['gestante'] ?? null;
    $documento = trim((string)($payload['documento'] ?? ''));
    $indicaDr = trim((string)($payload['indica_dr'] ?? ''));
    $medicoResponsableId = (int)($payload['medico_responsable_id'] ?? 0);
    $subcontrataEmpresaId = (int)($payload['subcontrata_empresa_id'] ?? -1);
    $facturarEmpresaId = (int)($payload['facturar_empresa_id'] ?? -1);

    if ($ordenId <= 0) {
        out_orden(422, ['success' => false, 'error' => 'id de orden es obligatorio']);
    }
    if ($fechaOrden !== '' && !is_valid_date_orden($fechaOrden)) {
        out_orden(422, ['success' => false, 'error' => 'fecha_orden invalida. Formato esperado YYYY-MM-DD']);
    }

    $stmt = $mysqliOcup->prepare('SELECT id, codigo, estado,
                                         empresa_id, trabajador_id, protocolo_id, tipo_evaluacion_id,
                                         medico_responsable_id, fecha_orden,
                                         aptitud_final
                                  FROM ocupacional_ordenes WHERE id = ? LIMIT 1');
    if (!$stmt) {
        out_orden(500, ['success' => false, 'error' => 'No se pudo validar orden']);
    }
    $stmt->bind_param('i', $ordenId);
    $stmt->execute();
    $orden = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$orden) {
        out_orden(404, ['success' => false, 'error' => 'Orden no encontrada']);
    }
    if ((string)$orden['estado'] !== 'emitida') {
        out_orden(422, ['success' => false, 'error' => 'Solo se puede editar una orden en estado emitida']);
    }
    if (orden_tiene_certificado_emitido_orden($mysqliOcup, $ordenId)) {
        out_orden(422, ['success' => false, 'error' => 'No se puede editar una orden con certificado emitido']);
    }

    $empresaIdFinal = $empresaId > 0 ? $empresaId : (int)($orden['empresa_id'] ?? 0);
    $trabajadorIdFinal = $trabajadorId > 0 ? $trabajadorId : (int)($orden['trabajador_id'] ?? 0);
    $protocoloIdFinal = $protocoloId > 0 ? $protocoloId : (int)($orden['protocolo_id'] ?? 0);
    $tipoEvaluacionIdFinal = $tipoEvaluacionId > 0 ? $tipoEvaluacionId : (int)($orden['tipo_evaluacion_id'] ?? 0);
    $medicoResponsableIdFinal = $medicoResponsableId > 0 ? $medicoResponsableId : (int)($orden['medico_responsable_id'] ?? 0);
    $fechaOrdenFinal = $fechaOrden !== '' ? $fechaOrden : (string)($orden['fecha_orden'] ?? '');

    if ($empresaIdFinal <= 0 || $trabajadorIdFinal <= 0 || $protocoloIdFinal <= 0 || $tipoEvaluacionIdFinal <= 0) {
        out_orden(422, ['success' => false, 'error' => 'empresa_id, trabajador_id, protocolo_id y tipo_evaluacion_id son obligatorios']);
    }
    if ($medicoResponsableIdFinal <= 0) {
        out_orden(422, ['success' => false, 'error' => 'medico_responsable_id es obligatorio']);
    }

    $duplicada = find_orden_duplicada_activa_orden(
        $mysqliOcup,
        $empresaIdFinal,
        $trabajadorIdFinal,
        $protocoloIdFinal,
        $tipoEvaluacionIdFinal,
        $fechaOrdenFinal,
        $ordenId
    );
    if ($duplicada) {
        out_orden(409, [
            'success' => false,
            'error' => 'Ya existe una orden activa para el mismo trabajador, protocolo, tipo y fecha',
            'data' => [
                'orden_id' => (int)($duplicada['id'] ?? 0),
                'codigo' => (string)($duplicada['codigo'] ?? ''),
            ],
        ]);
    }

    $cambioEstructural = $empresaIdFinal !== (int)($orden['empresa_id'] ?? 0)
        || $trabajadorIdFinal !== (int)($orden['trabajador_id'] ?? 0)
        || $protocoloIdFinal !== (int)($orden['protocolo_id'] ?? 0)
        || $tipoEvaluacionIdFinal !== (int)($orden['tipo_evaluacion_id'] ?? 0);

    if ($cambioEstructural && orden_tiene_avance_clinico_orden($mysqliOcup, $ordenId)) {
        out_orden(422, ['success' => false, 'error' => 'No se puede cambiar empresa/trabajador/protocolo/tipo porque la orden ya tiene avance clinico']);
    }

    $medicoResponsable = require_medico_responsable_orden($mysqli, $medicoResponsableIdFinal);

    $updateColumns = [];
    $updateTypes = '';
    $updateParams = [];

    if ($fechaOrdenFinal !== '') {
        $updateColumns[] = 'fecha_orden = ?';
        $updateTypes .= 's';
        $updateParams[] = $fechaOrdenFinal;
    }
    $updateColumns[] = 'empresa_id = ?';
    $updateColumns[] = 'trabajador_id = ?';
    $updateColumns[] = 'protocolo_id = ?';
    $updateColumns[] = 'tipo_evaluacion_id = ?';
    $updateTypes .= 'iiii';
    $updateParams[] = $empresaIdFinal;
    $updateParams[] = $trabajadorIdFinal;
    $updateParams[] = $protocoloIdFinal;
    $updateParams[] = $tipoEvaluacionIdFinal;

    $updateColumns[] = 'observacion = ?';
    $updateTypes .= 's';
    $updateParams[] = $observacion;

    $updateColumns[] = 'medico_responsable = ?';
    $updateColumns[] = 'medico_responsable_id = ?';
    $updateColumns[] = 'medico_nombre_snapshot = ?';
    $updateColumns[] = 'medico_especialidad_snapshot = ?';
    $updateColumns[] = 'medico_cmp_snapshot = ?';
    $updateColumns[] = 'medico_rne_snapshot = ?';
    $updateColumns[] = 'medico_rna_snapshot = ?';
    $updateColumns[] = 'medico_firma_snapshot = ?';
    $updateTypes .= 'sissssss';
    $updateParams[] = $medicoResponsable['nombre'];
    $updateParams[] = $medicoResponsable['id'];
    $updateParams[] = $medicoResponsable['nombre'];
    $updateParams[] = $medicoResponsable['especialidad'];
    $updateParams[] = $medicoResponsable['cmp'];
    $updateParams[] = $medicoResponsable['rne'];
    $updateParams[] = $medicoResponsable['rna'];
    $updateParams[] = $medicoResponsable['firma'];

    if ($modo !== '' && !empty($ordenExtraColumns['modo'])) {
        $modosValidos = ['CONVALIDACION', 'REVALIDACION', 'REEVALUACION'];
        if (!in_array($modo, $modosValidos, true)) {
            out_orden(422, ['success' => false, 'error' => 'modo invalido']);
        }
        $updateColumns[] = 'modo = ?';
        $updateTypes .= 's';
        $updateParams[] = $modo;
    }
    if ($gestanteRaw !== null && !empty($ordenExtraColumns['gestante'])) {
        $gestante = ($gestanteRaw === true || $gestanteRaw === 1 || $gestanteRaw === '1' || $gestanteRaw === 'true') ? 1 : 0;
        $updateColumns[] = 'gestante = ?';
        $updateTypes .= 'i';
        $updateParams[] = $gestante;
    }
    if (!empty($ordenExtraColumns['documento'])) {
        $updateColumns[] = 'documento = ?';
        $updateTypes .= 's';
        $updateParams[] = $documento;
    }
    if (!empty($ordenExtraColumns['indica_dr'])) {
        $updateColumns[] = 'indica_dr = ?';
        $updateTypes .= 's';
        $updateParams[] = $indicaDr;
    }
    if ($subcontrataEmpresaId >= 0 && !empty($ordenExtraColumns['subcontrata_empresa_id'])) {
        $updateColumns[] = 'subcontrata_empresa_id = ?';
        $updateTypes .= 'i';
        $updateParams[] = $subcontrataEmpresaId > 0 ? $subcontrataEmpresaId : null;
    }
    if ($facturarEmpresaId >= 0 && !empty($ordenExtraColumns['facturar_empresa_id'])) {
        $updateColumns[] = 'facturar_empresa_id = ?';
        $updateTypes .= 'i';
        $updateParams[] = $facturarEmpresaId > 0 ? $facturarEmpresaId : null;
    }

    if ($cambioEstructural) {
        $resolved = resolve_examenes_orden($mysqliOcup, $mysqli, $empresaIdFinal, $trabajadorIdFinal, $protocoloIdFinal, $tipoEvaluacionIdFinal);
        $itemsAplican = array_values(array_filter($resolved['items'], function ($it) {
            return !empty($it['aplica']);
        }));
        if (empty($itemsAplican)) {
            out_orden(422, ['success' => false, 'error' => 'No hay examenes aplicables para la nueva configuracion de orden']);
        }

        $updateColumns[] = 'monto_total = ?';
        $updateTypes .= 'd';
        $updateParams[] = (float)$resolved['total'];
        $updateColumns[] = 'aptitud_final = NULL';
        $updateColumns[] = 'restriccion_final = NULL';
        $updateColumns[] = 'recomendacion_final = NULL';
        if (!empty($ordenExtraColumns['certificado_fecha_evaluacion'])) {
            $updateColumns[] = 'certificado_fecha_evaluacion = NULL';
        }
        if (!empty($ordenExtraColumns['certificado_fecha_emision'])) {
            $updateColumns[] = 'certificado_fecha_emision = NULL';
        }
    }

    $updateColumns[] = 'updated_by = ?';
    $updateColumns[] = 'updated_at = CURRENT_TIMESTAMP';
    $updateTypes .= 'ii';
    $updateParams[] = $usuarioId;
    $updateParams[] = $ordenId;

    $mysqliOcup->begin_transaction();
    try {
        $sql = 'UPDATE ocupacional_ordenes SET ' . implode(', ', $updateColumns) . ' WHERE id = ? LIMIT 1';
        $stmtUp = $mysqliOcup->prepare($sql);
        if (!$stmtUp) {
            throw new Exception('No se pudo editar la orden');
        }
        bind_params_dynamic_orden($stmtUp, $updateTypes, $updateParams);
        $stmtUp->execute();
        $stmtUp->close();

        if ($cambioEstructural) {
            $stmtDelDet = $mysqliOcup->prepare('DELETE FROM ocupacional_orden_detalle WHERE orden_id = ?');
            if (!$stmtDelDet) {
                throw new Exception('No se pudo limpiar detalle anterior');
            }
            $stmtDelDet->bind_param('i', $ordenId);
            $stmtDelDet->execute();
            $stmtDelDet->close();

            $detalleSnapshotReady = !empty($detalleExtraColumns['grupo_snapshot'])
                && !empty($detalleExtraColumns['subgrupo_snapshot'])
                && !empty($detalleExtraColumns['grupo_orden_snapshot'])
                && !empty($detalleExtraColumns['examen_orden_snapshot']);
            $detalleLabSnapshotReady = !empty($detalleExtraColumns['examen_snapshot_json']);
            if ($detalleSnapshotReady && $detalleLabSnapshotReady) {
                $sqlDetalle = 'INSERT INTO ocupacional_orden_detalle
                              (orden_id, catalogo_id, examen_id, examen_codigo, examen_descripcion, grupo_snapshot, subgrupo_snapshot, grupo_orden_snapshot, examen_orden_snapshot, examen_snapshot_json, monto)
                              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
            } elseif ($detalleSnapshotReady) {
                $sqlDetalle = 'INSERT INTO ocupacional_orden_detalle
                              (orden_id, catalogo_id, examen_id, examen_codigo, examen_descripcion, grupo_snapshot, subgrupo_snapshot, grupo_orden_snapshot, examen_orden_snapshot, monto)
                              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
            } elseif ($detalleLabSnapshotReady) {
                $sqlDetalle = 'INSERT INTO ocupacional_orden_detalle
                              (orden_id, catalogo_id, examen_id, examen_codigo, examen_descripcion, examen_snapshot_json, monto)
                              VALUES (?, ?, ?, ?, ?, ?, ?)';
            } else {
                $sqlDetalle = 'INSERT INTO ocupacional_orden_detalle
                              (orden_id, catalogo_id, examen_id, examen_codigo, examen_descripcion, monto)
                              VALUES (?, ?, ?, ?, ?, ?)';
            }
            $stmtDet = $mysqliOcup->prepare($sqlDetalle);
            if (!$stmtDet) {
                throw new Exception('No se pudo preparar detalle regenerado');
            }

            foreach ($itemsAplican as $item) {
                $catalogoId = (int)$item['catalogo_id'];
                $examenId = (int)$item['examen_id'];
                $codigoEx = (string)$item['codigo'];
                $descEx = (string)$item['descripcion'];
                $grupoEx = (string)($item['grupo'] ?? '');
                $subgrupoEx = (string)($item['subgrupo'] ?? '');
                $grupoOrdenEx = (int)($item['grupo_orden'] ?? 0);
                $examenOrdenEx = (int)($item['examen_orden'] ?? 0);
                $examenSnapshotJson = (string)($item['laboratorio_snapshot_json'] ?? '');
                $monto = (float)$item['monto'];
                if ($detalleSnapshotReady && $detalleLabSnapshotReady) {
                    $stmtDet->bind_param('iiissssiisd', $ordenId, $catalogoId, $examenId, $codigoEx, $descEx, $grupoEx, $subgrupoEx, $grupoOrdenEx, $examenOrdenEx, $examenSnapshotJson, $monto);
                } elseif ($detalleSnapshotReady) {
                    $stmtDet->bind_param('iiissssiid', $ordenId, $catalogoId, $examenId, $codigoEx, $descEx, $grupoEx, $subgrupoEx, $grupoOrdenEx, $examenOrdenEx, $monto);
                } elseif ($detalleLabSnapshotReady) {
                    $stmtDet->bind_param('iiisssd', $ordenId, $catalogoId, $examenId, $codigoEx, $descEx, $examenSnapshotJson, $monto);
                } else {
                    $stmtDet->bind_param('iiissd', $ordenId, $catalogoId, $examenId, $codigoEx, $descEx, $monto);
                }
                $stmtDet->execute();
            }
            $stmtDet->close();
        }

        registrar_evento_orden(
            $mysqliOcup,
            $ordenId,
            'orden_editada',
            'Orden ocupacional editada',
            $usuarioId,
            [
                'codigo' => (string)($orden['codigo'] ?? ''),
                'fecha_orden' => $fechaOrdenFinal,
                'empresa_id' => $empresaIdFinal,
                'trabajador_id' => $trabajadorIdFinal,
                'protocolo_id' => $protocoloIdFinal,
                'tipo_evaluacion_id' => $tipoEvaluacionIdFinal,
                'medico_responsable_id' => $medicoResponsable['id'],
                'observacion' => $observacion,
                'modo' => $modo,
                'documento' => $documento,
                'indica_dr' => $indicaDr,
                'subcontrata_empresa_id' => $subcontrataEmpresaId,
                'facturar_empresa_id' => $facturarEmpresaId,
                'cambio_estructural' => $cambioEstructural ? 1 : 0,
            ]
        );

        $mysqliOcup->commit();
    } catch (Throwable $e) {
        $mysqliOcup->rollback();
        out_orden(500, ['success' => false, 'error' => 'No se pudo editar la orden']);
    }

    out_orden(200, [
        'success' => true,
        'data' => [
            'id' => $ordenId,
            'codigo' => (string)($orden['codigo'] ?? ''),
        ],
    ]);
}

if ($accion === 'eliminar_orden') {
    require_ocup_permiso_any_orden(['anular_ordenes_ocupacional']);
    $ordenId = (int)($payload['id'] ?? 0);
    if ($ordenId <= 0) {
        out_orden(422, ['success' => false, 'error' => 'id de orden es obligatorio']);
    }

    $stmt = $mysqliOcup->prepare('SELECT id, codigo, estado FROM ocupacional_ordenes WHERE id = ? LIMIT 1');
    if (!$stmt) {
        out_orden(500, ['success' => false, 'error' => 'No se pudo validar orden']);
    }
    $stmt->bind_param('i', $ordenId);
    $stmt->execute();
    $orden = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$orden) {
        out_orden(404, ['success' => false, 'error' => 'Orden no encontrada']);
    }
    if ((string)$orden['estado'] !== 'emitida') {
        out_orden(422, ['success' => false, 'error' => 'Solo se puede eliminar una orden en estado emitida']);
    }
    if (orden_tiene_certificado_emitido_orden($mysqliOcup, $ordenId)) {
        out_orden(422, ['success' => false, 'error' => 'No se puede eliminar una orden con certificado emitido']);
    }

    $stmtRes = $mysqliOcup->prepare('SELECT COUNT(*) AS total
                                     FROM ocupacional_resultados_clinicos rc
                                     INNER JOIN ocupacional_orden_detalle d ON d.id = rc.orden_detalle_id
                                     WHERE d.orden_id = ?');
    if ($stmtRes) {
        $stmtRes->bind_param('i', $ordenId);
        $stmtRes->execute();
        $totalRes = (int)($stmtRes->get_result()->fetch_assoc()['total'] ?? 0);
        $stmtRes->close();
        if ($totalRes > 0) {
            out_orden(422, ['success' => false, 'error' => 'No se puede eliminar la orden porque ya tiene resultados clinicos']);
        }
    }

    if (table_exists_orden($mysqliOcup, 'ocupacional_interconsultas')) {
        $stmtIc = $mysqliOcup->prepare('SELECT COUNT(*) AS total FROM ocupacional_interconsultas WHERE orden_id = ?');
        if ($stmtIc) {
            $stmtIc->bind_param('i', $ordenId);
            $stmtIc->execute();
            $totalIc = (int)($stmtIc->get_result()->fetch_assoc()['total'] ?? 0);
            $stmtIc->close();
            if ($totalIc > 0) {
                out_orden(422, ['success' => false, 'error' => 'No se puede eliminar la orden porque tiene interconsultas']);
            }
        }
    }

    if (table_exists_orden($mysqliOcup, 'ocupacional_historia_ocupacional')) {
        $stmtHc = $mysqliOcup->prepare('SELECT COUNT(*) AS total FROM ocupacional_historia_ocupacional WHERE orden_id = ? AND estado <> "anulado"');
        if ($stmtHc) {
            $stmtHc->bind_param('i', $ordenId);
            $stmtHc->execute();
            $totalHc = (int)($stmtHc->get_result()->fetch_assoc()['total'] ?? 0);
            $stmtHc->close();
            if ($totalHc > 0) {
                out_orden(422, ['success' => false, 'error' => 'No se puede eliminar la orden porque tiene historia ocupacional registrada']);
            }
        }
    }

    $mysqliOcup->begin_transaction();
    try {
        if (table_exists_orden($mysqliOcup, 'ocupacional_interconsultas')) {
            $stmtDelIc = $mysqliOcup->prepare('DELETE FROM ocupacional_interconsultas WHERE orden_id = ?');
            if ($stmtDelIc) {
                $stmtDelIc->bind_param('i', $ordenId);
                $stmtDelIc->execute();
                $stmtDelIc->close();
            }
        }
        if (table_exists_orden($mysqliOcup, 'ocupacional_historia_ocupacional')) {
            $stmtDelHc = $mysqliOcup->prepare('DELETE FROM ocupacional_historia_ocupacional WHERE orden_id = ?');
            if ($stmtDelHc) {
                $stmtDelHc->bind_param('i', $ordenId);
                $stmtDelHc->execute();
                $stmtDelHc->close();
            }
        }

        $stmtDelEvt = $mysqliOcup->prepare('DELETE FROM ocupacional_orden_eventos WHERE orden_id = ?');
        if ($stmtDelEvt) {
            $stmtDelEvt->bind_param('i', $ordenId);
            $stmtDelEvt->execute();
            $stmtDelEvt->close();
        }

        $stmtDelDet = $mysqliOcup->prepare('DELETE FROM ocupacional_orden_detalle WHERE orden_id = ?');
        if (!$stmtDelDet) {
            throw new Exception('No se pudo eliminar detalle de orden');
        }
        $stmtDelDet->bind_param('i', $ordenId);
        $stmtDelDet->execute();
        $stmtDelDet->close();

        $stmtDelOrd = $mysqliOcup->prepare('DELETE FROM ocupacional_ordenes WHERE id = ? LIMIT 1');
        if (!$stmtDelOrd) {
            throw new Exception('No se pudo eliminar orden');
        }
        $stmtDelOrd->bind_param('i', $ordenId);
        $stmtDelOrd->execute();
        $affected = $stmtDelOrd->affected_rows;
        $stmtDelOrd->close();
        if ($affected <= 0) {
            throw new Exception('Orden no eliminada');
        }

        $mysqliOcup->commit();
        out_orden(200, [
            'success' => true,
            'data' => [
                'id' => $ordenId,
                'codigo' => (string)($orden['codigo'] ?? ''),
            ],
        ]);
    } catch (Throwable $e) {
        $mysqliOcup->rollback();
        out_orden(500, ['success' => false, 'error' => 'No se pudo eliminar la orden']);
    }
}

if ($accion === 'cerrar_orden') {
    require_ocup_permiso_any_orden(['cerrar_ordenes_ocupacional']);
    $ordenId = (int)($payload['id'] ?? 0);
    if ($ordenId <= 0) {
        out_orden(422, ['success' => false, 'error' => 'id de orden es obligatorio']);
    }

    $stmt = $mysqliOcup->prepare('SELECT id, estado FROM ocupacional_ordenes WHERE id = ? LIMIT 1');
    if (!$stmt) {
        out_orden(500, ['success' => false, 'error' => 'No se pudo validar orden']);
    }
    $stmt->bind_param('i', $ordenId);
    $stmt->execute();
    $orden = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$orden) {
        out_orden(404, ['success' => false, 'error' => 'Orden no encontrada']);
    }
    $estadoOrden = (string)($orden['estado'] ?? '');
    if ($estadoOrden === 'anulada') {
        out_orden(422, ['success' => false, 'error' => 'No se puede cerrar una orden anulada']);
    }
    if ($estadoOrden === 'cerrada') {
        out_orden(422, ['success' => false, 'error' => 'La orden ya se encuentra cerrada']);
    }

    $resumenClinico = require_orden_clinicamente_finalizada($mysqliOcup, $ordenId);

    $stmtUp = $mysqliOcup->prepare('UPDATE ocupacional_ordenes
                                    SET estado = "cerrada", updated_by = ?, updated_at = CURRENT_TIMESTAMP
                                    WHERE id = ? LIMIT 1');
    if (!$stmtUp) {
        out_orden(500, ['success' => false, 'error' => 'No se pudo cerrar la orden']);
    }
    $stmtUp->bind_param('ii', $usuarioId, $ordenId);
    $stmtUp->execute();
    $affected = $stmtUp->affected_rows;
    $stmtUp->close();

    if ($affected <= 0) {
        out_orden(500, ['success' => false, 'error' => 'No se pudo cerrar la orden']);
    }

    registrar_evento_orden(
        $mysqliOcup,
        $ordenId,
        'orden_cerrada',
        'Orden cerrada formalmente',
        $usuarioId,
        [
            'total_items' => $resumenClinico['total'],
            'total_finalizados' => $resumenClinico['finalizados'],
        ]
    );

    out_orden(200, [
        'success' => true,
        'data' => [
            'id' => $ordenId,
            'estado' => 'cerrada',
        ],
    ]);
}

if ($accion === 'guardar_aptitud_orden') {
    require_ocup_permiso_any_orden(['cerrar_ordenes_ocupacional', 'emitir_certificados_ocupacional']);
    $ordenId = (int)($payload['id'] ?? 0);
    $aptitudFinal = trim((string)($payload['aptitud_final'] ?? ''));
    $aptitudFinalPersist = normalize_aptitud_enum_orden($aptitudFinal);
    $restriccionFinal = trim((string)($payload['restriccion_final'] ?? ''));
    $recomendacionFinal = trim((string)($payload['recomendacion_final'] ?? ''));
    $medicoResponsableId = (int)($payload['medico_responsable_id'] ?? 0);
    $certificadoFechaEvaluacion = trim((string)($payload['certificado_fecha_evaluacion'] ?? ''));
    $certificadoFechaEmision = trim((string)($payload['certificado_fecha_emision'] ?? ''));

    if ($ordenId <= 0 || $aptitudFinal === '') {
        out_orden(422, ['success' => false, 'error' => 'id y aptitud_final son obligatorios']);
    }
    if ($aptitudFinalPersist === '') {
        out_orden(422, ['success' => false, 'error' => 'La aptitud seleccionada no es compatible con el certificado ocupacional']);
    }
    require_owner_medico_by_orden_id_orden($mysqliOcup, $ordenId, $ordenExtraColumns, 'orden');
    if (!$medicoSnapshotReady) {
        out_orden(500, ['success' => false, 'error' => 'Falta aplicar migracion 20260725_0020 de medico responsable']);
    }

    $stmt = $mysqliOcup->prepare('SELECT id, estado, medico_responsable_id FROM ocupacional_ordenes WHERE id = ? LIMIT 1');
    if (!$stmt) {
        out_orden(500, ['success' => false, 'error' => 'No se pudo validar orden']);
    }
    $stmt->bind_param('i', $ordenId);
    $stmt->execute();
    $orden = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$orden) {
        out_orden(404, ['success' => false, 'error' => 'Orden no encontrada']);
    }
    if ((string)$orden['estado'] === 'anulada') {
        out_orden(422, ['success' => false, 'error' => 'No se puede guardar aptitud en una orden anulada']);
    }

    if ($aptitudFinalPersist === 'APTO_CON_RESTRICCIONES' && $restriccionFinal === '') {
        out_orden(422, ['success' => false, 'error' => 'Debe registrar restricciones para la aptitud seleccionada']);
    }
    if ($certificadoFechaEvaluacion !== '' && !is_valid_date_orden($certificadoFechaEvaluacion)) {
        out_orden(422, ['success' => false, 'error' => 'certificado_fecha_evaluacion invalida. Formato esperado YYYY-MM-DD']);
    }
    if ($certificadoFechaEmision !== '' && !is_valid_date_orden($certificadoFechaEmision)) {
        out_orden(422, ['success' => false, 'error' => 'certificado_fecha_emision invalida. Formato esperado YYYY-MM-DD']);
    }
    if (($certificadoFechaEvaluacion !== '' || $certificadoFechaEmision !== '')
        && (empty($ordenExtraColumns['certificado_fecha_evaluacion']) || empty($ordenExtraColumns['certificado_fecha_emision']))) {
        out_orden(500, ['success' => false, 'error' => 'Falta aplicar migracion 20260730_0060 de fechas de certificado']);
    }

    $medicoResponsableIdResolved = $medicoResponsableId > 0
        ? $medicoResponsableId
        : (int)($orden['medico_responsable_id'] ?? 0);
    $medicoResponsable = require_medico_responsable_orden($mysqli, $medicoResponsableIdResolved);

    $resumenClinico = ['total' => 0, 'finalizados' => 0];
    $cerradaAlGuardarAptitud = (string)$orden['estado'] === 'completada';

    $updateColumns = [
        'aptitud_final = ?',
        'restriccion_final = ?',
        'recomendacion_final = ?',
        'medico_responsable = ?',
        'medico_responsable_id = ?',
        'medico_nombre_snapshot = ?',
        'medico_especialidad_snapshot = ?',
        'medico_cmp_snapshot = ?',
        'medico_rne_snapshot = ?',
        'medico_rna_snapshot = ?',
        'medico_firma_snapshot = ?',
        'aptitud_registrada_by = ?',
        'aptitud_registrada_at = CURRENT_TIMESTAMP',
    ];
    $updateTypes = 'ssssissssssi';
    $updateParams = [
        $aptitudFinalPersist,
        $restriccionFinal,
        $recomendacionFinal,
        $medicoResponsable['nombre'],
        $medicoResponsable['id'],
        $medicoResponsable['nombre'],
        $medicoResponsable['especialidad'],
        $medicoResponsable['cmp'],
        $medicoResponsable['rne'],
        $medicoResponsable['rna'],
        $medicoResponsable['firma'],
        $usuarioId,
    ];

    if (!empty($ordenExtraColumns['certificado_fecha_evaluacion'])) {
        $updateColumns[] = 'certificado_fecha_evaluacion = CASE WHEN ? = "" THEN NULL ELSE ? END';
        $updateTypes .= 'ss';
        $updateParams[] = $certificadoFechaEvaluacion;
        $updateParams[] = $certificadoFechaEvaluacion;
    }
    if (!empty($ordenExtraColumns['certificado_fecha_emision'])) {
        $updateColumns[] = 'certificado_fecha_emision = CASE WHEN ? = "" THEN NULL ELSE ? END';
        $updateTypes .= 'ss';
        $updateParams[] = $certificadoFechaEmision;
        $updateParams[] = $certificadoFechaEmision;
    }

    $updateColumns[] = 'estado = CASE WHEN estado = "completada" THEN "cerrada" ELSE estado END';
    $updateColumns[] = 'updated_by = ?';
    $updateColumns[] = 'updated_at = CURRENT_TIMESTAMP';
    $updateTypes .= 'ii';
    $updateParams[] = $usuarioId;
    $updateParams[] = $ordenId;

    $sqlUpdate = 'UPDATE ocupacional_ordenes SET ' . implode(', ', $updateColumns) . ' WHERE id = ? LIMIT 1';
    $stmtUp = $mysqliOcup->prepare($sqlUpdate);
    if (!$stmtUp) {
        out_orden(500, ['success' => false, 'error' => 'No se pudo guardar aptitud final']);
    }
    bind_params_dynamic_orden($stmtUp, $updateTypes, $updateParams);
    $stmtUp->execute();
    $stmtUp->close();

    registrar_evento_orden(
        $mysqliOcup,
        $ordenId,
        'aptitud_final_guardada',
        'Aptitud ocupacional final registrada',
        $usuarioId,
        [
            'aptitud_final' => $aptitudFinal,
            'aptitud_final_persistida' => $aptitudFinalPersist,
            'restriccion_final' => $restriccionFinal,
            'recomendacion_final' => $recomendacionFinal,
            'medico_responsable_id' => $medicoResponsable['id'],
            'medico_responsable' => $medicoResponsable['nombre'],
            'medico_cmp' => $medicoResponsable['cmp'],
            'medico_rne' => $medicoResponsable['rne'],
            'medico_rna' => $medicoResponsable['rna'],
            'certificado_fecha_evaluacion_ref' => $certificadoFechaEvaluacion,
            'certificado_fecha_emision_ref' => $certificadoFechaEmision,
        ]
    );

    if ($cerradaAlGuardarAptitud) {
        registrar_evento_orden(
            $mysqliOcup,
            $ordenId,
            'orden_cerrada',
            'Orden cerrada al registrar aptitud final',
            $usuarioId,
            [
                'total_examenes' => $resumenClinico['total'],
                'resultados_finalizados' => $resumenClinico['finalizados'],
                'aptitud_final' => $aptitudFinal,
            ]
        );
    }

    $estadoResultante = $cerradaAlGuardarAptitud ? 'cerrada' : (string)$orden['estado'];

    out_orden(200, [
        'success' => true,
        'data' => [
            'id' => $ordenId,
            'aptitud_final' => $aptitudFinal,
            'aptitud_final_persistida' => $aptitudFinalPersist,
            'estado' => $estadoResultante,
            'cerrada_al_guardar_aptitud' => $cerradaAlGuardarAptitud,
        ],
    ]);
}

if ($accion === 'registrar_emision_certificado_orden') {
    require_ocup_permiso_any_orden(['cerrar_ordenes_ocupacional', 'emitir_certificados_ocupacional']);
    $ordenId = (int)($payload['id'] ?? 0);
    $formato = trim((string)($payload['formato'] ?? 'pdf'));

    if ($ordenId <= 0) {
        out_orden(422, ['success' => false, 'error' => 'id de orden es obligatorio']);
    }
    require_owner_medico_by_orden_id_orden($mysqliOcup, $ordenId, $ordenExtraColumns, 'orden');
    if (!$medicoSnapshotReady) {
        out_orden(500, ['success' => false, 'error' => 'Falta aplicar migracion 20260725_0020 de medico responsable']);
    }

    $stmt = $mysqliOcup->prepare('SELECT id, codigo, estado, aptitud_final, restriccion_final,
                                         fecha_orden,
                                         ' . $sqlExprCertFechaEvaluacionOrden . ' AS certificado_fecha_evaluacion_ref,
                                         ' . $sqlExprCertFechaEmisionOrden . ' AS certificado_fecha_emision_ref,
                                         medico_responsable_id, medico_nombre_snapshot,
                                         medico_cmp_snapshot, medico_firma_snapshot
                                  FROM ocupacional_ordenes
                                  WHERE id = ? LIMIT 1');
    if (!$stmt) {
        out_orden(500, ['success' => false, 'error' => 'No se pudo validar orden para registrar certificado']);
    }
    $stmt->bind_param('i', $ordenId);
    $stmt->execute();
    $orden = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$orden) {
        out_orden(404, ['success' => false, 'error' => 'Orden no encontrada']);
    }
    if ((string)$orden['estado'] === 'anulada') {
        out_orden(422, ['success' => false, 'error' => 'No se puede emitir certificado para una orden anulada']);
    }
    if (trim((string)($orden['aptitud_final'] ?? '')) === '') {
        out_orden(422, ['success' => false, 'error' => 'Debe registrar aptitud final antes de emitir certificado']);
    }
    if ((int)($orden['medico_responsable_id'] ?? 0) <= 0
        || trim((string)($orden['medico_nombre_snapshot'] ?? '')) === ''
        || trim((string)($orden['medico_cmp_snapshot'] ?? '')) === ''
        || trim((string)($orden['medico_firma_snapshot'] ?? '')) === '') {
        out_orden(422, ['success' => false, 'error' => 'Debe registrar un medico responsable con CMP y firma antes de emitir certificado']);
    }
    $aptitudFinalNormalizada = strtoupper(preg_replace('/\s+/', ' ', str_replace('_', ' ', (string)($orden['aptitud_final'] ?? ''))));
    if (in_array($aptitudFinalNormalizada, ['APTO CON RESTRICCION', 'APTO CON RESTRICCIONES'], true)
        && trim((string)($orden['restriccion_final'] ?? '')) === '') {
        out_orden(422, ['success' => false, 'error' => 'Debe registrar las restricciones antes de emitir certificado']);
    }

    $fechasCertificado = resolve_certificado_fechas_orden(
        (string)($orden['fecha_orden'] ?? ''),
        (string)($orden['certificado_fecha_evaluacion_ref'] ?? ''),
        (string)($orden['certificado_fecha_emision_ref'] ?? '')
    );

    registrar_evento_orden(
        $mysqliOcup,
        $ordenId,
        'certificado_emitido',
        'Certificado de aptitud ocupacional emitido',
        $usuarioId,
        [
            'codigo' => (string)($orden['codigo'] ?? ''),
            'formato' => $formato !== '' ? $formato : 'pdf',
            'certificado_fecha_evaluacion' => $fechasCertificado['fecha_evaluacion'],
            'certificado_fecha_emision' => $fechasCertificado['fecha_emision'],
        ]
    );

    out_orden(200, [
        'success' => true,
        'data' => [
            'id' => $ordenId,
            'codigo' => (string)($orden['codigo'] ?? ''),
            'formato' => $formato !== '' ? $formato : 'pdf',
            'certificado_fecha_evaluacion' => $fechasCertificado['fecha_evaluacion'],
            'certificado_fecha_emision' => $fechasCertificado['fecha_emision'],
        ],
    ]);
}

if ($accion === 'actualizar_detalle_orden') {
    require_ocup_permiso_any_orden(['ejecutar_ordenes_ocupacional']);
    if ($esSesionEnfermero) {
        out_orden(403, ['success' => false, 'error' => 'No autorizado para actualizar estado manual del detalle']);
    }
    $detalleId = (int)($payload['detalle_id'] ?? 0);
    $estadoEjecucion = trim((string)($payload['estado_ejecucion'] ?? ''));
    $observacionEjecucion = trim((string)($payload['observacion_ejecucion'] ?? ''));
    $estadosValidos = ['pendiente', 'en_proceso', 'observado'];

    if ($detalleId <= 0 || !in_array($estadoEjecucion, $estadosValidos, true)) {
        out_orden(422, ['success' => false, 'error' => 'detalle_id y estado_ejecucion valido son obligatorios']);
    }
    if ($estadoEjecucion === 'observado' && $observacionEjecucion === '') {
        out_orden(422, ['success' => false, 'error' => 'La observacion es obligatoria para marcar un examen como observado']);
    }

    if ($esSesionMedico && empty($ordenExtraColumns['medico_responsable_id'])) {
        out_orden(500, ['success' => false, 'error' => 'Falta columna medico_responsable_id para validar ownership medico']);
    }

    $stmt = $mysqliOcup->prepare('SELECT d.id, d.orden_id, d.estado_ejecucion, o.estado AS estado_orden,
                                         ' . (!empty($ordenExtraColumns['medico_responsable_id']) ? 'o.medico_responsable_id' : 'NULL') . ' AS medico_responsable_id
                                  FROM ocupacional_orden_detalle d
                                  INNER JOIN ocupacional_ordenes o ON o.id = d.orden_id
                                  WHERE d.id = ? LIMIT 1');
    if (!$stmt) {
        out_orden(500, ['success' => false, 'error' => 'No se pudo validar detalle de orden']);
    }
    $stmt->bind_param('i', $detalleId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$row) {
        out_orden(404, ['success' => false, 'error' => 'Detalle de orden no encontrado']);
    }
    if ($esSesionMedico) {
        require_owner_medico_orden((int)($row['medico_responsable_id'] ?? 0), 'detalle de orden');
    }
    if ((string)$row['estado_orden'] === 'anulada') {
        out_orden(422, ['success' => false, 'error' => 'No se puede ejecutar detalle de una orden anulada']);
    }
    if ((string)$row['estado_orden'] === 'cerrada') {
        out_orden(422, ['success' => false, 'error' => 'No se puede ejecutar detalle de una orden cerrada']);
    }
    if ((string)$row['estado_ejecucion'] === 'observado' && $estadoEjecucion !== 'observado') {
        out_orden(422, ['success' => false, 'error' => 'Use el levantamiento o anulacion de interconsulta para liberar un examen observado']);
    }

    $fechaEjecucion = $estadoEjecucion === 'observado' ? date('Y-m-d H:i:s') : null;
    $ordenId = (int)$row['orden_id'];
    $mysqliOcup->begin_transaction();
    try {
        $stmtUp = $mysqliOcup->prepare('UPDATE ocupacional_orden_detalle
                                        SET estado_ejecucion = ?,
                                            observacion_ejecucion = ?,
                                            fecha_ejecucion = ?,
                                            updated_by = ?,
                                            updated_at = CURRENT_TIMESTAMP
                                        WHERE id = ? LIMIT 1');
        if (!$stmtUp) {
            throw new Exception('No se pudo preparar detalle de orden');
        }
        $stmtUp->bind_param('sssii', $estadoEjecucion, $observacionEjecucion, $fechaEjecucion, $usuarioId, $detalleId);
        $stmtUp->execute();
        $stmtUp->close();

        if ($estadoEjecucion === 'observado') {
            $stmtResultados = $mysqliOcup->prepare('UPDATE ocupacional_resultados_clinicos
                                                    SET estado = "borrador", updated_by = ?, updated_at = CURRENT_TIMESTAMP
                                                    WHERE orden_detalle_id = ? AND estado = "finalizado"');
            if (!$stmtResultados) {
                throw new Exception('No se pudo invalidar resultado observado');
            }
            $stmtResultados->bind_param('ii', $usuarioId, $detalleId);
            $stmtResultados->execute();
            $stmtResultados->close();
        }

        registrar_evento_orden(
            $mysqliOcup,
            $ordenId,
            'detalle_actualizado',
            $estadoEjecucion === 'observado' ? 'Examen observado; resultado clinico devuelto a borrador' : 'Actualizacion de estado de examen',
            $usuarioId,
            [
                'detalle_id' => $detalleId,
                'estado_ejecucion' => $estadoEjecucion,
                'observacion' => $observacionEjecucion,
            ]
        );
        sync_estado_orden_por_detalle($mysqliOcup, $ordenId, $usuarioId);
        $mysqliOcup->commit();
    } catch (Throwable $e) {
        $mysqliOcup->rollback();
        out_orden(500, ['success' => false, 'error' => 'No se pudo actualizar detalle de orden']);
    }

    out_orden(200, [
        'success' => true,
        'data' => [
            'detalle_id' => $detalleId,
            'orden_id' => $ordenId,
            'estado_ejecucion' => $estadoEjecucion,
            'fecha_ejecucion' => $fechaEjecucion,
        ],
    ]);
}

out_orden(422, ['success' => false, 'error' => 'accion POST no soportada']);
