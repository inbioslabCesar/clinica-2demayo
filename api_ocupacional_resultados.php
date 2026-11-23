<?php

require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/db_ocupacional.php';
require_once __DIR__ . '/modules/OcupacionalSesion.php';

function out_result_ocup($code, $payload)
{
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload);
    exit;
}

function parse_session_permisos_result_ocup()
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

function resolve_medico_sesion_id_result_ocup()
{
    $usuario = OcupacionalSesion::usuario();
    if (!is_array($usuario)) {
        return 0;
    }
    $id = (int)($_SESSION['medico_id'] ?? ($usuario['medico_id'] ?? ($usuario['id'] ?? 0)));
    return $id > 0 ? $id : 0;
}

function es_sesion_medico_result_ocup()
{
    $usuario = OcupacionalSesion::usuario();
    if (!is_array($usuario)) {
        return false;
    }
    $rol = strtolower(trim((string)($usuario['rol'] ?? '')));
    return $rol === 'medico' && resolve_medico_sesion_id_result_ocup() > 0;
}

function es_sesion_enfermero_result_ocup()
{
    $usuario = OcupacionalSesion::usuario();
    if (!is_array($usuario)) {
        return false;
    }
    $rol = strtolower(trim((string)($usuario['rol'] ?? '')));
    return $rol === 'enfermero';
}

function es_sesion_laboratorista_result_ocup()
{
    $usuario = OcupacionalSesion::usuario();
    if (!is_array($usuario)) {
        return false;
    }
    $rol = strtolower(trim((string)($usuario['rol'] ?? '')));
    return $rol === 'laboratorista';
}

function es_detalle_triaje_result_ocup($examenCodigo, $examenDescripcion, $examenGrupo = '', $examenSubgrupo = '')
{
    $codigo = strtoupper(trim((string)$examenCodigo));
    if ($codigo === 'TRI_0001') {
        return true;
    }
    $text = strtolower(trim((string)$examenDescripcion . ' ' . (string)$examenGrupo . ' ' . (string)$examenSubgrupo));
    return strpos($text, 'triaje') !== false || strpos($text, 'triage') !== false;
}

function require_owner_medico_result_ocup($ownerMedicoId, $contexto = 'resultado')
{
    if (!es_sesion_medico_result_ocup()) {
        return;
    }
    $medicoSesionId = resolve_medico_sesion_id_result_ocup();
    if ($medicoSesionId <= 0 || (int)$ownerMedicoId <= 0 || $medicoSesionId !== (int)$ownerMedicoId) {
        out_result_ocup(403, ['success' => false, 'error' => 'No autorizado para acceder a este ' . $contexto]);
    }
}

function es_detalle_psicologico_result_ocup($examenCodigo, $examenDescripcion, $examenGrupo = '', $examenSubgrupo = '')
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

function medico_es_responsable_clinico_por_detalle_result_ocup($mysqliOcup, $ordenDetalleId, $medicoId)
{
    $detalleId = (int)$ordenDetalleId;
    $medico = (int)$medicoId;
    if ($detalleId <= 0 || $medico <= 0) {
        return false;
    }
    if (!table_exists_result_ocup($mysqliOcup, 'ocupacional_resultados_clinicos')) {
        return false;
    }

    $stmt = $mysqliOcup->prepare('SELECT 1
                                  FROM ocupacional_resultados_clinicos rc
                                  WHERE rc.orden_detalle_id = ?
                                    AND COALESCE(rc.estado, "") <> "anulado"
                                    AND CAST(JSON_UNQUOTE(JSON_EXTRACT(rc.datos_json, "$.responsable_profesional_id")) AS UNSIGNED) = ?
                                  LIMIT 1');
    if (!$stmt) {
        return false;
    }
    $stmt->bind_param('ii', $detalleId, $medico);
    $stmt->execute();
    $exists = (bool)$stmt->get_result()->fetch_row();
    $stmt->close();
    return $exists;
}

function medico_es_responsable_clinico_por_bloque_result_ocup($mysqliOcup, $ordenDetalleId, $medicoId)
{
    $detalleId = (int)$ordenDetalleId;
    $medico = (int)$medicoId;
    if ($detalleId <= 0 || $medico <= 0) {
        return false;
    }
    if (!table_exists_result_ocup($mysqliOcup, 'ocupacional_resultados_clinicos')) {
        return false;
    }

    $stmtRef = $mysqliOcup->prepare('SELECT dref.orden_id,
                                            dref.examen_codigo,
                                            dref.examen_descripcion,
                                            COALESCE(NULLIF(dref.grupo_snapshot, ""), egref.grupo, "") AS examen_grupo,
                                            COALESCE(NULLIF(dref.subgrupo_snapshot, ""), egref.subgrupo, "") AS examen_subgrupo
                                     FROM ocupacional_orden_detalle dref
                                     LEFT JOIN ocupacional_examenes_generales egref ON egref.id = dref.examen_id
                                     WHERE dref.id = ?
                                     LIMIT 1');
    if (!$stmtRef) {
        return false;
    }
    $stmtRef->bind_param('i', $detalleId);
    $stmtRef->execute();
    $ref = $stmtRef->get_result()->fetch_assoc();
    $stmtRef->close();
    if (!$ref) {
        return false;
    }

    $refGrupo = strtoupper(trim((string)($ref['examen_grupo'] ?? '')));
    $refPsico = es_detalle_psicologico_result_ocup(
        (string)($ref['examen_codigo'] ?? ''),
        (string)($ref['examen_descripcion'] ?? ''),
        (string)($ref['examen_grupo'] ?? ''),
        (string)($ref['examen_subgrupo'] ?? '')
    );

    $ordenId = (int)($ref['orden_id'] ?? 0);
    if ($ordenId <= 0) {
        return false;
    }

    $stmtCand = $mysqliOcup->prepare('SELECT d2.examen_codigo,
                                             d2.examen_descripcion,
                                             COALESCE(NULLIF(d2.grupo_snapshot, ""), eg2.grupo, "") AS examen_grupo,
                                             COALESCE(NULLIF(d2.subgrupo_snapshot, ""), eg2.subgrupo, "") AS examen_subgrupo
                                      FROM ocupacional_orden_detalle d2
                                      LEFT JOIN ocupacional_examenes_generales eg2 ON eg2.id = d2.examen_id
                                      INNER JOIN ocupacional_resultados_clinicos rc2 ON rc2.orden_detalle_id = d2.id
                                      WHERE d2.orden_id = ?
                                        AND COALESCE(rc2.estado, "") <> "anulado"
                                        AND CAST(JSON_UNQUOTE(JSON_EXTRACT(rc2.datos_json, "$.responsable_profesional_id")) AS UNSIGNED) = ?');
    if (!$stmtCand) {
        return false;
    }
    $stmtCand->bind_param('ii', $ordenId, $medico);
    $stmtCand->execute();
    $resCand = $stmtCand->get_result();

    while ($cand = $resCand->fetch_assoc()) {
        $candGrupo = strtoupper(trim((string)($cand['examen_grupo'] ?? '')));
        if ($refGrupo !== '' && $candGrupo !== '' && $refGrupo === $candGrupo) {
            $stmtCand->close();
            return true;
        }

        if ($refPsico && es_detalle_psicologico_result_ocup(
            (string)($cand['examen_codigo'] ?? ''),
            (string)($cand['examen_descripcion'] ?? ''),
            (string)($cand['examen_grupo'] ?? ''),
            (string)($cand['examen_subgrupo'] ?? '')
        )) {
            $stmtCand->close();
            return true;
        }
    }
    $stmtCand->close();

    return false;
}

function require_owner_medico_or_clinico_result_ocup($mysqliOcup, $ownerMedicoId, $ordenDetalleId, $contexto = 'resultado')
{
    if (!es_sesion_medico_result_ocup()) {
        return;
    }

    $medicoSesionId = resolve_medico_sesion_id_result_ocup();
    $ownerId = (int)$ownerMedicoId;
    if ($medicoSesionId > 0 && $ownerId > 0 && $medicoSesionId === $ownerId) {
        return;
    }

    if (medico_es_responsable_clinico_por_detalle_result_ocup($mysqliOcup, (int)$ordenDetalleId, $medicoSesionId)) {
        return;
    }

    if (medico_es_responsable_clinico_por_bloque_result_ocup($mysqliOcup, (int)$ordenDetalleId, $medicoSesionId)) {
        return;
    }

    out_result_ocup(403, ['success' => false, 'error' => 'No autorizado para acceder a este ' . $contexto]);
}

function column_exists_result_ocup($conn, $table, $column)
{
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

function require_owner_medico_by_detalle_result_ocup($mysqliOcup, $ordenDetalleId, $sqlExprOrdenMedicoResponsable, $contexto = 'resultado clinico')
{
    if (!es_sesion_medico_result_ocup()) {
        return;
    }
    $detalleId = (int)$ordenDetalleId;
    if ($detalleId <= 0) {
        out_result_ocup(422, ['success' => false, 'error' => 'orden_detalle_id es obligatorio']);
    }
    $stmtOwner = $mysqliOcup->prepare('SELECT d.id, ' . $sqlExprOrdenMedicoResponsable . ' AS medico_responsable_id
                                       FROM ocupacional_orden_detalle d
                                       INNER JOIN ocupacional_ordenes o ON o.id = d.orden_id
                                       WHERE d.id = ? LIMIT 1');
    if (!$stmtOwner) {
        out_result_ocup(500, ['success' => false, 'error' => 'No se pudo validar ownership medico']);
    }
    $stmtOwner->bind_param('i', $detalleId);
    $stmtOwner->execute();
    $owner = $stmtOwner->get_result()->fetch_assoc();
    $stmtOwner->close();
    if (!$owner) {
        out_result_ocup(404, ['success' => false, 'error' => 'Detalle de orden no encontrado']);
    }
    require_owner_medico_result_ocup((int)($owner['medico_responsable_id'] ?? 0), $contexto);
}

function require_ocup_permiso_any_result($permisosValidos, $fallback = 'ejecutar_ordenes_ocupacional')
{
    $usuario = OcupacionalSesion::usuario();
    if (!is_array($usuario)) {
        out_result_ocup(401, ['success' => false, 'error' => 'No autenticado']);
    }

    $rol = strtolower(trim((string)($usuario['rol'] ?? '')));
    if ($rol === 'administrador') {
        return;
    }

    if ($rol === 'medico' && resolve_medico_sesion_id_result_ocup() > 0) {
        $lista = is_array($permisosValidos) ? $permisosValidos : [$permisosValidos];
        if ($fallback !== '') {
            $lista[] = $fallback;
        }
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
        out_result_ocup(403, ['success' => false, 'error' => 'No autorizado para esta accion']);
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
        out_result_ocup(403, ['success' => false, 'error' => 'No autorizado para esta accion']);
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
        out_result_ocup(403, ['success' => false, 'error' => 'No autorizado para esta accion']);
    }

    $permisos = parse_session_permisos_result_ocup();
    if (!in_array('access_salud_ocupacional', $permisos, true)) {
        out_result_ocup(403, ['success' => false, 'error' => 'No autorizado para salud ocupacional']);
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

    out_result_ocup(403, ['success' => false, 'error' => 'No autorizado para esta accion']);
}

function table_exists_result_ocup($conn, $table)
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

function normalize_formato_codigo_ocup($value, $fallback)
{
    $raw = trim((string)$value);
    if ($raw === '') {
        $raw = trim((string)$fallback);
    }
    if ($raw === '') {
        $raw = 'formato_general';
    }
    $raw = strtolower($raw);
    $raw = preg_replace('/[^a-z0-9_\-]+/', '_', $raw);
    $raw = trim((string)$raw, '_');
    if ($raw === '') {
        $raw = 'formato_general';
    }
    if (strlen($raw) > 40) {
        $raw = substr($raw, 0, 40);
    }
    return $raw;
}

function decode_json_any_result_ocup($raw)
{
    if ($raw === null || $raw === '') {
        return [];
    }
    $value = $raw;
    for ($i = 0; $i < 3; $i++) {
        if (is_string($value)) {
            $decoded = json_decode($value, true);
            if (json_last_error() !== JSON_ERROR_NONE) {
                break;
            }
            $value = $decoded;
            continue;
        }
        break;
    }
    return is_array($value) ? $value : [];
}

function build_parametros_lab_from_snapshot_result_ocup($snapshot, $fallbackNombre = '', $fallbackReferencia = '')
{
    $valores = decode_json_any_result_ocup($snapshot['valores_referenciales'] ?? []);
    $categoria = trim((string)($snapshot['categoria'] ?? ''));
    $parametros = [];

    foreach ($valores as $item) {
        if (!is_array($item)) {
            continue;
        }
        $nombre = trim((string)($item['nombre'] ?? ''));
        $tipoRaw = trim((string)($item['tipo'] ?? 'Parámetro'));
        $tipoLower = strtolower($tipoRaw);
        $isTitulo = strpos($tipoLower, 'titul') !== false;
        if ($nombre === '' && !$isTitulo) {
            continue;
        }
        $referencias = decode_json_any_result_ocup($item['referencias'] ?? []);
        $refText = '';
        if (!empty($referencias) && is_array($referencias[0])) {
            $primera = $referencias[0];
            $refText = trim((string)($primera['valor'] ?? ''));
            if ($refText === '') {
                $min = trim((string)($primera['valor_min'] ?? ''));
                $max = trim((string)($primera['valor_max'] ?? ''));
                if ($min !== '' || $max !== '') {
                    $refText = trim($min . ' - ' . $max);
                }
            }
        }
        $parametros[] = [
            'grupo' => $categoria,
            'tipo' => $tipoRaw,
            'nombre' => $nombre,
            'valor' => '',
            'unidad' => trim((string)($item['unidad'] ?? '')),
            'referencia' => $refText,
            'min' => trim((string)($item['min'] ?? ($item['valor_min'] ?? ''))),
            'max' => trim((string)($item['max'] ?? ($item['valor_max'] ?? ''))),
            'metodologia' => trim((string)($item['metodologia'] ?? '')),
            'formula' => trim((string)($item['formula'] ?? '')),
            'decimales' => isset($item['decimales']) ? $item['decimales'] : null,
            'codigo_interno' => trim((string)($item['codigo_interno'] ?? '')),
            'opciones' => is_array($item['opciones'] ?? null) ? $item['opciones'] : [],
            'referencias' => $referencias,
            'color_texto' => trim((string)($item['color_texto'] ?? '')),
            'color_fondo' => trim((string)($item['color_fondo'] ?? '')),
            'alineacion' => trim((string)($item['alineacion'] ?? 'izquierda')),
            'negrita' => !empty($item['negrita']) ? 1 : 0,
            'cursiva' => !empty($item['cursiva']) ? 1 : 0,
            'rows' => isset($item['rows']) ? (int)$item['rows'] : 0,
        ];
    }

    if (!empty($parametros)) {
        return $parametros;
    }

    return [];
}

function build_template_codigo_ocup($codigo, $descripcion, $grupo = '', $subgrupo = '')
{
    $text = strtolower(trim((string)$codigo . ' ' . (string)$descripcion . ' ' . (string)$grupo . ' ' . (string)$subgrupo));

    if (strpos($text, 'epw') !== false || strpos($text, 'epworth') !== false) {
        return 'epworth_test';
    }
    if (strpos($text, 'fobia') !== false || (strpos($text, 'estr') !== false && strpos($text, 'psico') !== false)) {
        return 'fobia_estres';
    }

    if (strpos($text, 'triaje') !== false || strpos($text, 'triage') !== false || strpos($text, 'signos vitales') !== false) {
        return 'triaje_clinico';
    }
    if (strpos($text, 'hemograma') !== false || strpos($text, 'lab') !== false || strpos($text, 'laboratorio') !== false) {
        return 'lab_basico';
    }
    if (strpos($text, 'audio') !== false) {
        return 'audiometria_basica';
    }
    if (strpos($text, 'oftal') !== false || strpos($text, 'vision') !== false) {
        return 'oftalmologia_basica';
    }
    if (strpos($text, 'psico') !== false) {
        return 'psicologia_basica';
    }
    if (strpos($text, 'electro') !== false || strpos($text, 'ekg') !== false || strpos($text, 'ecg') !== false) {
        return 'ekg_basico';
    }
    if (strpos($text, 'evaluacion medica') !== false
        || strpos($text, 'examen medico') !== false
        || strpos($text, 'medicina ocupacional') !== false
        || strpos($text, 'ev_0001') !== false) {
        return 'evaluacion_medica_ocupacional';
    }

    return 'general_basico';
}

function snapshot_has_parametros_lab_result_ocup($snapshotJson)
{
    $snapshot = decode_json_any_result_ocup($snapshotJson);
    if (!is_array($snapshot) || empty($snapshot)) {
        return false;
    }
    $valores = decode_json_any_result_ocup($snapshot['valores_referenciales'] ?? []);
    if (!is_array($valores) || empty($valores)) {
        return false;
    }

    foreach ($valores as $item) {
        if (!is_array($item)) {
            continue;
        }
        $tipoRaw = trim((string)($item['tipo'] ?? 'Parámetro'));
        $tipoLower = strtolower($tipoRaw);
        $isTitulo = strpos($tipoLower, 'titul') !== false;
        $nombre = trim((string)($item['nombre'] ?? ''));
        if ($isTitulo || $nombre !== '') {
            return true;
        }
    }

    return false;
}

function resolve_template_code_result_ocup($codigo, $descripcion, $grupo, $subgrupo, $snapshotJson)
{
    if (snapshot_has_parametros_lab_result_ocup($snapshotJson)) {
        return 'lab_basico';
    }
    return build_template_codigo_ocup($codigo, $descripcion, $grupo, $subgrupo);
}

function resolve_snapshot_json_result_ocup($detalleSnapshot, $examenSnapshot)
{
    $detalleText = trim((string)$detalleSnapshot);
    if ($detalleText !== '') {
        return $detalleText;
    }
    return trim((string)$examenSnapshot);
}

function fetch_lab_snapshot_from_core_result_ocup($connCore, $laboratorioExamenId, $examenDescripcion)
{
    if (!($connCore instanceof mysqli)) {
        return '';
    }
    if (!table_exists_result_ocup($connCore, 'examenes_laboratorio')) {
        return '';
    }

    $row = null;
    $labId = (int)$laboratorioExamenId;
    if ($labId > 0) {
        $stmt = $connCore->prepare('SELECT id, nombre, categoria, metodologia, valores_referenciales,
                                           precio_publico, precio_convenio, tipo_tubo, tipo_frasco,
                                           tiempo_resultado, condicion_paciente, preanalitica
                                    FROM examenes_laboratorio
                                    WHERE id = ? LIMIT 1');
        if ($stmt) {
            $stmt->bind_param('i', $labId);
            $stmt->execute();
            $row = $stmt->get_result()->fetch_assoc() ?: null;
            $stmt->close();
        }
    }

    if (!$row) {
        $nombre = trim((string)$examenDescripcion);
        if ($nombre === '') {
            return '';
        }
        $stmtByName = $connCore->prepare('SELECT id, nombre, categoria, metodologia, valores_referenciales,
                                                 precio_publico, precio_convenio, tipo_tubo, tipo_frasco,
                                                 tiempo_resultado, condicion_paciente, preanalitica
                                          FROM examenes_laboratorio
                                          WHERE UPPER(TRIM(nombre)) = UPPER(?)
                                             OR UPPER(TRIM(nombre)) LIKE CONCAT("%", UPPER(?), "%")
                                             OR UPPER(?) LIKE CONCAT("%", UPPER(TRIM(nombre)), "%")
                                          ORDER BY CASE WHEN UPPER(TRIM(nombre)) = UPPER(?) THEN 0 ELSE 1 END, id DESC
                                          LIMIT 1');
        if ($stmtByName) {
            $stmtByName->bind_param('ssss', $nombre, $nombre, $nombre, $nombre);
            $stmtByName->execute();
            $row = $stmtByName->get_result()->fetch_assoc() ?: null;
            $stmtByName->close();
        }
    }

    if (!$row) {
        return '';
    }

    $valoresReferenciales = decode_json_any_result_ocup($row['valores_referenciales'] ?? '');
    if (!is_array($valoresReferenciales) || empty($valoresReferenciales)) {
        return '';
    }

    $snapshot = [
        'origen' => 'laboratorio_moderno_fallback',
        'laboratorio_examen_id' => (int)($row['id'] ?? 0),
        'laboratorio_version_id' => 0,
        'nombre' => (string)($row['nombre'] ?? ''),
        'categoria' => (string)($row['categoria'] ?? ''),
        'metodologia' => (string)($row['metodologia'] ?? ''),
        'valores_referenciales' => $valoresReferenciales,
        'precio_publico' => isset($row['precio_publico']) ? (float)$row['precio_publico'] : 0,
        'precio_convenio' => isset($row['precio_convenio']) ? (float)$row['precio_convenio'] : 0,
        'tipo_tubo' => (string)($row['tipo_tubo'] ?? ''),
        'tipo_frasco' => (string)($row['tipo_frasco'] ?? ''),
        'tiempo_resultado' => (string)($row['tiempo_resultado'] ?? ''),
        'condicion_paciente' => (string)($row['condicion_paciente'] ?? ''),
        'preanalitica' => (string)($row['preanalitica'] ?? ''),
        'imported_at' => date('c'),
    ];

    $json = json_encode($snapshot, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    return is_string($json) ? $json : '';
}

function build_template_data_ocup($templateCode, $examenCodigo = '', $examenDescripcion = '', $valoresNormales = '', $labSnapshotJson = '')
{
    switch ($templateCode) {
        case 'triaje_clinico':
            return [
                'presion_sistolica' => '',
                'presion_diastolica' => '',
                'frecuencia_cardiaca' => '',
                'frecuencia_respiratoria' => '',
                'temperatura' => '',
                'saturacion_oxigeno' => '',
                'peso_kg' => '',
                'talla_cm' => '',
                'perimetro_abdominal_cm' => '',
                'imc' => '',
                'observaciones' => '',
            ];
        case 'evaluacion_medica_ocupacional':
            return [
                'motivo_evaluacion' => '',
                'antecedentes_ocupacionales' => '',
                'antecedentes_personales' => '',
                'anamnesis' => '',
                'examen_fisico' => '',
                'diagnostico' => '',
                'conclusion' => '',
                'recomendaciones' => '',
            ];
        case 'lab_basico':
            $snapshot = decode_json_any_result_ocup($labSnapshotJson);
            $parametros = !empty($snapshot)
                ? build_parametros_lab_from_snapshot_result_ocup(
                    $snapshot,
                    trim((string)$examenDescripcion) !== '' ? trim((string)$examenDescripcion) : trim((string)$examenCodigo),
                    trim((string)$valoresNormales)
                )
                : [];
            return [
                'responsable_evaluacion' => '',
                'tipo_muestra' => '',
                'condiciones_muestra' => '',
                'parametros' => $parametros,
                'hallazgos' => '',
                'conclusion' => '',
                'recomendaciones' => '',
            ];
        case 'audiometria_basica':
            return [
                'od' => ['500' => '', '1000' => '', '2000' => '', '3000' => '', '4000' => '', '6000' => '', '8000' => ''],
                'oi' => ['500' => '', '1000' => '', '2000' => '', '3000' => '', '4000' => '', '6000' => '', '8000' => ''],
                'otoscopia_od' => '',
                'otoscopia_oi' => '',
                'impresion' => '',
                'recomendaciones' => '',
            ];
        case 'oftalmologia_basica':
            return [
                'agudeza_visual_od' => '',
                'agudeza_visual_oi' => '',
                'vision_colores' => '',
                'impresion' => '',
                'recomendaciones' => '',
            ];
        case 'psicologia_basica':
            return [
                'responsable_evaluacion' => '',
                'motivo_evaluacion' => 'EVALUACION MEDICA OCUPACIONAL',
                'presentacion' => 'adecuada',
                'postura' => 'erguida',
                'discurso_ritmo' => 'fluido',
                'discurso_tono' => 'moderado',
                'discurso_articulacion' => 'sin_dificultad',
                'orientacion_tiempo' => 'orientado',
                'orientacion_espacio' => 'orientado',
                'orientacion_persona' => 'orientado',
                'nivel_intelectual' => '',
                'coordinacion_visomotriz' => '',
                'nivel_memoria' => '',
                'personalidad' => '',
                'afectividad' => '',
                'conclusion_cognitiva' => '',
                'conclusion_emocional' => '',
                'recomendaciones' => '',
                'observaciones' => '',
                'hallazgos' => '',
                'diagnostico' => '',
                'conclusion' => '',
            ];
        case 'epworth_test':
            return [
                'p1' => '',
                'p2' => '',
                'p3' => '',
                'p4' => '',
                'p5' => '',
                'p6' => '',
                'p7' => '',
                'p8' => '',
                'obs' => '',
            ];
        case 'fobia_estres':
            return [
                'p1' => '',
                'p2' => '',
                'p3' => '',
                'p4' => '',
                'p5' => '',
                'p6' => '',
                'p7' => '',
                'p8' => '',
                'p9' => '',
                'p10' => '',
                'p11' => '',
                'p12' => '',
                'p13' => '',
                'p14' => '',
                'p15' => '',
                'p16' => '',
                'p17' => '',
                'p18' => '',
                'p19' => '',
                'p20' => '',
                'p21' => '',
                'p22' => '',
                'obs' => '',
            ];
        case 'ekg_basico':
            return [
                'ritmo' => '',
                'frecuencia' => '',
                'eje' => '',
                'hallazgos' => '',
                'conclusion' => '',
            ];
        default:
            return [
                'motivo' => '',
                'hallazgos' => '',
                'conclusion' => '',
                'recomendaciones' => '',
            ];
    }
}

function require_text_result_ocup($data, $key, $label)
{
    if (trim((string)($data[$key] ?? '')) === '') {
        out_result_ocup(422, ['success' => false, 'error' => $label . ' es obligatorio para finalizar']);
    }
}

function require_number_range_result_ocup($data, $key, $label, $min, $max)
{
    $value = $data[$key] ?? null;
    if ($value === null || trim((string)$value) === '' || !is_numeric($value)) {
        out_result_ocup(422, ['success' => false, 'error' => $label . ' debe ser numerico para finalizar']);
    }
    $number = (float)$value;
    if ($number < $min || $number > $max) {
        out_result_ocup(422, ['success' => false, 'error' => $label . ' esta fuera del rango permitido']);
    }
}

function validate_finalized_data_result_ocup($templateCode, $data)
{
    if (!is_array($data)) {
        out_result_ocup(422, ['success' => false, 'error' => 'Los datos clinicos son invalidos']);
    }

    if ($templateCode === 'triaje_clinico') {
        require_number_range_result_ocup($data, 'presion_sistolica', 'Presion sistolica', 50, 260);
        require_number_range_result_ocup($data, 'presion_diastolica', 'Presion diastolica', 30, 180);
        require_number_range_result_ocup($data, 'frecuencia_cardiaca', 'Frecuencia cardiaca', 20, 250);
        require_number_range_result_ocup($data, 'frecuencia_respiratoria', 'Frecuencia respiratoria', 5, 80);
        require_number_range_result_ocup($data, 'temperatura', 'Temperatura', 30, 45);
        require_number_range_result_ocup($data, 'saturacion_oxigeno', 'Saturacion de oxigeno', 50, 100);
        require_number_range_result_ocup($data, 'peso_kg', 'Peso', 2, 400);
        require_number_range_result_ocup($data, 'talla_cm', 'Talla', 40, 250);
        if (trim((string)($data['perimetro_abdominal_cm'] ?? '')) !== '') {
            require_number_range_result_ocup($data, 'perimetro_abdominal_cm', 'Perimetro abdominal', 20, 300);
        }
        return;
    }

    if ($templateCode === 'audiometria_basica') {
        foreach (['od' => 'OD', 'oi' => 'OI'] as $earKey => $earLabel) {
            $ear = isset($data[$earKey]) && is_array($data[$earKey]) ? $data[$earKey] : [];
            foreach (['500', '1000', '2000', '4000'] as $frequency) {
                require_number_range_result_ocup($ear, $frequency, $earLabel . ' ' . $frequency . ' Hz', -10, 130);
            }
        }
        require_text_result_ocup($data, 'impresion', 'Impresion audiometrica');
        return;
    }

    if ($templateCode === 'evaluacion_medica_ocupacional') {
        require_text_result_ocup($data, 'anamnesis', 'Anamnesis');
        require_text_result_ocup($data, 'examen_fisico', 'Examen fisico');
        require_text_result_ocup($data, 'conclusion', 'Conclusion');
        return;
    }

    if ($templateCode === 'oftalmologia_basica') {
        require_text_result_ocup($data, 'agudeza_visual_od', 'Agudeza visual OD');
        require_text_result_ocup($data, 'agudeza_visual_oi', 'Agudeza visual OI');
        require_text_result_ocup($data, 'impresion', 'Impresion oftalmologica');
        return;
    }

    if ($templateCode === 'lab_basico') {
        $parametros = isset($data['parametros']) && is_array($data['parametros']) ? $data['parametros'] : [];
        $parametrosCompletos = 0;
        foreach ($parametros as $parametro) {
            if (!is_array($parametro)) {
                continue;
            }
            $nombre = trim((string)($parametro['nombre'] ?? ''));
            $valor = trim((string)($parametro['valor'] ?? ''));
            if ($nombre !== '' && $valor !== '') {
                $parametrosCompletos++;
            }
        }
        if ($parametrosCompletos === 0) {
            out_result_ocup(422, ['success' => false, 'error' => 'Registre al menos un parametro de laboratorio con nombre y resultado']);
        }
        require_text_result_ocup($data, 'conclusion', 'Conclusion de laboratorio');
        return;
    }

    if ($templateCode === 'psicologia_basica') {
        $legacyResult = trim((string)($data['hallazgos'] ?? '')) !== ''
            && trim((string)($data['conclusion'] ?? '')) !== '';
        if ($legacyResult) {
            return;
        }
        require_text_result_ocup($data, 'motivo_evaluacion', 'Motivo de evaluacion');
        require_text_result_ocup($data, 'nivel_intelectual', 'Nivel intelectual');
        require_text_result_ocup($data, 'coordinacion_visomotriz', 'Coordinacion visomotriz');
        require_text_result_ocup($data, 'nivel_memoria', 'Nivel de memoria');
        require_text_result_ocup($data, 'personalidad', 'Personalidad');
        require_text_result_ocup($data, 'afectividad', 'Afectividad');
        require_text_result_ocup($data, 'conclusion_cognitiva', 'Conclusion del area cognitiva');
        require_text_result_ocup($data, 'conclusion_emocional', 'Conclusion del area emocional');
        require_text_result_ocup($data, 'recomendaciones', 'Recomendaciones');
        return;
    }

    if ($templateCode === 'epworth_test') {
        for ($i = 1; $i <= 8; $i++) {
            $key = 'p' . $i;
            $value = trim((string)($data[$key] ?? ''));
            if ($value === '' || !in_array($value, ['0', '1', '2', '3'], true)) {
                out_result_ocup(422, ['success' => false, 'error' => 'Complete las 8 respuestas del test de Epworth']);
            }
        }
        return;
    }

    if ($templateCode === 'fobia_estres') {
        for ($i = 1; $i <= 22; $i++) {
            $key = 'p' . $i;
            $value = strtoupper(trim((string)($data[$key] ?? '')));
            if (!in_array($value, ['SI', 'NO'], true)) {
                out_result_ocup(422, ['success' => false, 'error' => 'Complete las 22 respuestas del test de fobias y estres']);
            }
        }
        return;
    }

    require_text_result_ocup($data, 'hallazgos', 'Hallazgos');
    require_text_result_ocup($data, 'conclusion', 'Conclusion');
}

function normalize_template_codigo_ocup($value, $fallback = 'plantilla')
{
    $raw = strtolower(trim((string)$value));
    if ($raw === '') {
        $raw = strtolower(trim((string)$fallback));
    }
    $raw = preg_replace('/[^a-z0-9_\-]+/', '_', $raw);
    $raw = trim((string)$raw, '_');
    if ($raw === '') {
        $raw = 'plantilla';
    }
    if (strlen($raw) > 60) {
        $raw = substr($raw, 0, 60);
    }
    return $raw;
}

function safe_json_decode_assoc_result_ocup($value)
{
    $decoded = json_decode((string)$value, true);
    if (json_last_error() !== JSON_ERROR_NONE || !is_array($decoded)) {
        return [];
    }
    return $decoded;
}

function ensure_template_table_result_ocup($conn)
{
    // La tabla ocupacional_plantillas_resultado la crea la herramienta de esquema, nunca una petición.
    return table_exists_result_ocup($conn, 'ocupacional_plantillas_resultado');
}

function fetch_template_catalog_result_ocup($conn, $templateCode, $examenCodigo, $formatoCodigo)
{
    if (!ensure_template_table_result_ocup($conn)) {
        return [];
    }

    $templateCode = trim((string)$templateCode);
    $examenCodigo = trim((string)$examenCodigo);
    $formatoCodigo = trim((string)$formatoCodigo);

    $sql = 'SELECT id, codigo, nombre, template_code, examen_codigo, formato_codigo, datos_json
            FROM ocupacional_plantillas_resultado
            WHERE activo = 1
              AND (
                    (examen_codigo IS NOT NULL AND examen_codigo <> "" AND examen_codigo = ?)
                 OR (template_code = ? AND (examen_codigo IS NULL OR examen_codigo = ""))
                  )
              AND (formato_codigo IS NULL OR formato_codigo = "" OR formato_codigo = ?)
            ORDER BY CASE WHEN examen_codigo = ? THEN 0 ELSE 1 END, id DESC';

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        return [];
    }
    $stmt->bind_param('ssss', $examenCodigo, $templateCode, $formatoCodigo, $examenCodigo);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();

    $out = [];
    foreach ($rows as $row) {
        $out[] = [
            'id' => (int)$row['id'],
            'codigo' => (string)($row['codigo'] ?? ''),
            'nombre' => (string)($row['nombre'] ?? ''),
            'template_code' => (string)($row['template_code'] ?? ''),
            'examen_codigo' => (string)($row['examen_codigo'] ?? ''),
            'formato_codigo' => (string)($row['formato_codigo'] ?? ''),
            'origen' => 'catalogo',
            'datos_json' => safe_json_decode_assoc_result_ocup($row['datos_json'] ?? '{}'),
        ];
    }
    return $out;
}

function default_template_entry_result_ocup($templateCode, $templateData, $examenCodigo, $formatoCodigo)
{
    return [
        'id' => 0,
        'codigo' => 'default_' . normalize_template_codigo_ocup($templateCode, 'general'),
        'nombre' => 'Plantilla sugerida del sistema',
        'template_code' => (string)$templateCode,
        'examen_codigo' => (string)$examenCodigo,
        'formato_codigo' => (string)$formatoCodigo,
        'origen' => 'sistema',
        'datos_json' => is_array($templateData) ? $templateData : [],
    ];
}

function merge_templates_with_default_result_ocup($catalog, $templateCode, $templateData, $examenCodigo, $formatoCodigo)
{
    $list = is_array($catalog) ? $catalog : [];
    $default = default_template_entry_result_ocup($templateCode, $templateData, $examenCodigo, $formatoCodigo);

    if (count($list) === 0) {
        return [$default];
    }

    $list[] = $default;
    return $list;
}

function decode_json_field_result_ocup($value, $fieldName)
{
    if (is_array($value)) {
        return [json_encode($value, JSON_UNESCAPED_UNICODE), $value];
    }
    if (is_object($value)) {
        $arr = json_decode(json_encode($value), true);
        return [json_encode($arr, JSON_UNESCAPED_UNICODE), $arr];
    }
    $text = trim((string)$value);
    if ($text === '') {
        return [json_encode([], JSON_UNESCAPED_UNICODE), []];
    }
    $decoded = json_decode($text, true);
    if (json_last_error() !== JSON_ERROR_NONE || !is_array($decoded)) {
        out_result_ocup(422, ['success' => false, 'error' => $fieldName . ' debe ser JSON valido']);
    }
    return [json_encode($decoded, JSON_UNESCAPED_UNICODE), $decoded];
}

function bind_params_dynamic_result_ocup($stmt, $types, $params)
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

function registrar_evento_result_ocup($mysqliOcup, $ordenId, $tipo, $descripcion, $usuarioId, $payload = null)
{
    $ordenId = (int)$ordenId;
    if ($ordenId <= 0) {
        return;
    }
    if (!table_exists_result_ocup($mysqliOcup, 'ocupacional_orden_eventos')) {
        return;
    }

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

function resolve_orden_id_by_detalle_result_ocup($mysqliOcup, $ordenDetalleId)
{
    $id = (int)$ordenDetalleId;
    if ($id <= 0) {
        return 0;
    }
    $stmt = $mysqliOcup->prepare('SELECT orden_id FROM ocupacional_orden_detalle WHERE id = ? LIMIT 1');
    if (!$stmt) {
        return 0;
    }
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return (int)($row['orden_id'] ?? 0);
}

function normalize_role_result_ocup($value)
{
    $role = strtolower(trim((string)$value));
    $role = strtr($role, [
        'á' => 'a',
        'é' => 'e',
        'í' => 'i',
        'ó' => 'o',
        'ú' => 'u',
    ]);
    return $role;
}

function is_laboratorio_role_result_ocup($value)
{
    $role = normalize_role_result_ocup($value);
    return in_array($role, ['laboratorista', 'quimico'], true);
}

function resolve_laboratorio_signer_profile_result_ocup($mysqliMain, $preferredUserId = 0)
{
    if (!($mysqliMain instanceof mysqli)) {
        return null;
    }
    if (!table_exists_result_ocup($mysqliMain, 'usuarios')) {
        return null;
    }

    $hasActivoCol = column_exists_result_ocup($mysqliMain, 'usuarios', 'activo');
    $hasProfesionCol = column_exists_result_ocup($mysqliMain, 'usuarios', 'profesion');
    $hasCargoCol = column_exists_result_ocup($mysqliMain, 'usuarios', 'cargo_firma');
    $hasColegioTipoCol = column_exists_result_ocup($mysqliMain, 'usuarios', 'colegiatura_tipo');
    $hasColegioNumeroCol = column_exists_result_ocup($mysqliMain, 'usuarios', 'colegiatura_numero');
    $hasFirmaCol = column_exists_result_ocup($mysqliMain, 'usuarios', 'firma_reportes');

    $selectCols = ['id', 'nombre', 'rol'];
    if ($hasProfesionCol) $selectCols[] = 'profesion';
    if ($hasCargoCol) $selectCols[] = 'cargo_firma';
    if ($hasColegioTipoCol) $selectCols[] = 'colegiatura_tipo';
    if ($hasColegioNumeroCol) $selectCols[] = 'colegiatura_numero';
    if ($hasFirmaCol) $selectCols[] = 'firma_reportes';

    $whereBase = " FROM usuarios WHERE LOWER(TRIM(rol)) IN ('laboratorista', 'quimico', 'químico')";
    if ($hasActivoCol) {
        $whereBase .= ' AND COALESCE(activo, 1) = 1';
    }

    $buildProfile = function ($row, $resolvedBy) {
        if (!is_array($row)) {
            return null;
        }
        $nombre = trim((string)($row['nombre'] ?? ''));
        if ($nombre === '') {
            return null;
        }

        $cargoFirma = trim((string)($row['cargo_firma'] ?? ''));
        $profesion = trim((string)($row['profesion'] ?? ''));
        $colegiaturaTipo = trim((string)($row['colegiatura_tipo'] ?? ''));
        $colegiaturaNumero = trim((string)($row['colegiatura_numero'] ?? ''));
        $firma = trim((string)($row['firma_reportes'] ?? ''));
        if (!preg_match('/^data:image\/(png|jpeg|jpg);base64,/', $firma)) {
            $firma = '';
        }

        return [
            'user_id' => (int)($row['id'] ?? 0),
            'rol' => (string)($row['rol'] ?? ''),
            'nombre' => $nombre,
            'cargo' => $cargoFirma !== '' ? $cargoFirma : $profesion,
            'colegiatura' => trim($colegiaturaTipo . ' ' . $colegiaturaNumero),
            'firma_data_url' => $firma,
            'resolved_by' => $resolvedBy,
        ];
    };

    $preferredId = (int)$preferredUserId;
    if ($preferredId > 0) {
        $stmtPreferred = $mysqliMain->prepare('SELECT ' . implode(', ', $selectCols) . $whereBase . ' AND id = ? LIMIT 1');
        if ($stmtPreferred) {
            $stmtPreferred->bind_param('i', $preferredId);
            $stmtPreferred->execute();
            $preferredRow = $stmtPreferred->get_result()->fetch_assoc();
            $stmtPreferred->close();

            $preferredProfile = $buildProfile($preferredRow, 'preferred_user');
            if ($preferredProfile) {
                return $preferredProfile;
            }
        }
    }

    $orderSql = $hasFirmaCol
        ? " ORDER BY CASE WHEN firma_reportes IS NOT NULL AND TRIM(firma_reportes) <> '' THEN 0 ELSE 1 END, id ASC"
        : ' ORDER BY id ASC';
    $stmtFallback = $mysqliMain->prepare('SELECT ' . implode(', ', $selectCols) . $whereBase . $orderSql . ' LIMIT 1');
    if (!$stmtFallback) {
        return null;
    }
    $stmtFallback->execute();
    $fallbackRow = $stmtFallback->get_result()->fetch_assoc();
    $stmtFallback->close();

    return $buildProfile($fallbackRow, 'first_laboratorio_user');
}

function resolve_branding_for_pdf_result_ocup($pdoMain, $areaCode)
{
    $defaults = [
        'logo_url' => '',
        'logo_size_pdf' => 130,
    ];
    if (!($pdoMain instanceof PDO)) {
        return $defaults;
    }

    try {
        $stmt = $pdoMain->query('SELECT * FROM configuracion_clinica ORDER BY created_at DESC LIMIT 1');
        $cfg = $stmt ? $stmt->fetch(PDO::FETCH_ASSOC) : null;
        if (!$cfg) {
            return $defaults;
        }

        $preferLaboratorio = ((string)$areaCode === 'laboratorio');
        $logoKeys = $preferLaboratorio
            ? ['logo_laboratorio_url', 'logo_resultados_laboratorio_url', 'logo_url']
            : ['logo_ocupacional_url', 'logo_url'];
        $sizeKeys = $preferLaboratorio
            ? ['logo_laboratorio_size_pdf', 'logo_size_pdf']
            : ['logo_size_pdf'];

        $logoUrl = '';
        foreach ($logoKeys as $key) {
            if (isset($cfg[$key]) && trim((string)$cfg[$key]) !== '') {
                $logoUrl = trim((string)$cfg[$key]);
                break;
            }
        }

        $logoSize = 130;
        foreach ($sizeKeys as $key) {
            if (isset($cfg[$key]) && trim((string)$cfg[$key]) !== '' && is_numeric($cfg[$key])) {
                $logoSize = (int)$cfg[$key];
                break;
            }
        }
        if ($logoSize < 40) $logoSize = 40;
        if ($logoSize > 260) $logoSize = 260;

        return [
            'logo_url' => $logoUrl,
            'logo_size_pdf' => $logoSize,
        ];
    } catch (Throwable $e) {
        return $defaults;
    }
}

function sync_estado_orden_por_detalle_result_ocup($mysqliOcup, $ordenId, $usuarioId)
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

$requiredTables = [
    'ocupacional_ordenes',
    'ocupacional_orden_detalle',
    'ocupacional_resultados_clinicos',
];

foreach ($requiredTables as $table) {
    if (!table_exists_result_ocup($mysqliOcup, $table)) {
        out_result_ocup(500, [
            'success' => false,
            'error' => 'Falta la tabla ' . $table . '. Aplicar scripts SQL de Fase 4 en la base ocupacional.',
        ]);
    }
}

$esSesionMedico = es_sesion_medico_result_ocup();
$esSesionEnfermero = es_sesion_enfermero_result_ocup();
$medicoSesionId = resolve_medico_sesion_id_result_ocup();
$hasOrdenMedicoResponsableCol = column_exists_result_ocup($mysqliOcup, 'ocupacional_ordenes', 'medico_responsable_id');
$hasDetalleSnapshotCol = column_exists_result_ocup($mysqliOcup, 'ocupacional_orden_detalle', 'examen_snapshot_json');
$hasExamenSnapshotCol = column_exists_result_ocup($mysqliOcup, 'ocupacional_examenes_generales', 'laboratorio_snapshot_json');
$hasExamenLabIdCol = column_exists_result_ocup($mysqliOcup, 'ocupacional_examenes_generales', 'laboratorio_examen_id');
$sqlExprOrdenMedicoResponsable = $hasOrdenMedicoResponsableCol ? 'o.medico_responsable_id' : 'NULL';
$sqlExprDetalleSnapshot = $hasDetalleSnapshotCol ? 'd.examen_snapshot_json' : 'NULL';
$sqlExprExamenSnapshot = $hasExamenSnapshotCol ? 'eg.laboratorio_snapshot_json' : 'NULL';
$sqlExprExamenLabId = $hasExamenLabIdCol ? 'eg.laboratorio_examen_id' : '0';

if ($esSesionMedico && !$hasOrdenMedicoResponsableCol) {
    out_result_ocup(500, ['success' => false, 'error' => 'Falta columna medico_responsable_id para validar ownership medico']);
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    require_ocup_permiso_any_result(['ver_ordenes_ocupacional', 'ejecutar_ordenes_ocupacional']);

    $accion = trim((string)($_GET['accion'] ?? 'obtener'));

    if ($accion === 'resolver_firmante_pdf') {
        $ordenDetalleId = (int)($_GET['orden_detalle_id'] ?? 0);
        if ($ordenDetalleId <= 0) {
            out_result_ocup(422, ['success' => false, 'error' => 'orden_detalle_id es obligatorio']);
        }

        $stmtDet = $mysqliOcup->prepare('SELECT d.id, d.examen_codigo, d.examen_descripcion,
                                                ' . $sqlExprDetalleSnapshot . ' AS examen_snapshot_json,
                                                ' . $sqlExprExamenSnapshot . ' AS examen_general_snapshot_json,
                                                eg.grupo AS examen_grupo, eg.subgrupo AS examen_subgrupo,
                                                ' . $sqlExprOrdenMedicoResponsable . ' AS medico_responsable_id
                                         FROM ocupacional_orden_detalle d
                                         INNER JOIN ocupacional_ordenes o ON o.id = d.orden_id
                                         LEFT JOIN ocupacional_examenes_generales eg ON eg.id = d.examen_id
                                         WHERE d.id = ? LIMIT 1');
        if (!$stmtDet) {
            out_result_ocup(500, ['success' => false, 'error' => 'No se pudo resolver detalle para firmante']);
        }
        $stmtDet->bind_param('i', $ordenDetalleId);
        $stmtDet->execute();
        $detalle = $stmtDet->get_result()->fetch_assoc();
        $stmtDet->close();

        if (!$detalle) {
            out_result_ocup(404, ['success' => false, 'error' => 'Detalle de orden no encontrado']);
        }
        if ($esSesionMedico) {
            require_owner_medico_or_clinico_result_ocup(
                $mysqliOcup,
                (int)($detalle['medico_responsable_id'] ?? 0),
                (int)($detalle['id'] ?? 0),
                'resultado clinico'
            );
        }

        $snapshotJson = resolve_snapshot_json_result_ocup(
            $detalle['examen_snapshot_json'] ?? '',
            $detalle['examen_general_snapshot_json'] ?? ''
        );
        $templateCode = resolve_template_code_result_ocup(
            $detalle['examen_codigo'] ?? '',
            $detalle['examen_descripcion'] ?? '',
            $detalle['examen_grupo'] ?? '',
            $detalle['examen_subgrupo'] ?? '',
            $snapshotJson
        );

        $areaCode = ((string)$templateCode === 'lab_basico') ? 'laboratorio' : 'medico';
        $firmanteLabel = $areaCode === 'laboratorio' ? 'PROFESIONAL DE LABORATORIO' : 'MEDICO RESPONSABLE';
        $signer = null;

        if ($areaCode === 'laboratorio') {
            $signer = resolve_laboratorio_signer_profile_result_ocup(isset($mysqli) ? $mysqli : null, 0);
        }

        $branding = resolve_branding_for_pdf_result_ocup(isset($pdo) ? $pdo : null, $areaCode);

        out_result_ocup(200, [
            'success' => true,
            'data' => [
                'area_code' => $areaCode,
                'template_code' => $templateCode,
                'firmante_label' => $firmanteLabel,
                'signer' => $signer,
                'branding' => $branding,
            ],
        ]);
    }

    if ($accion === 'listar_plantillas') {
        if ($esSesionEnfermero) {
            out_result_ocup(403, ['success' => false, 'error' => 'No autorizado para gestionar plantillas']);
        }
        $examenCodigoRaw = trim((string)($_GET['examen_codigo'] ?? ''));
        $examenDescripcion = trim((string)($_GET['examen_descripcion'] ?? ''));
        $templateCode = build_template_codigo_ocup($examenCodigoRaw, $examenDescripcion);
        $formatoCodigo = normalize_formato_codigo_ocup($_GET['formato_codigo'] ?? '', $examenCodigoRaw !== '' ? $examenCodigoRaw : 'formato_general');
        $catalog = fetch_template_catalog_result_ocup($mysqliOcup, $templateCode, $examenCodigoRaw, $formatoCodigo);
        $templateData = build_template_data_ocup($templateCode, $examenCodigoRaw, $examenDescripcion);
        $plantillas = merge_templates_with_default_result_ocup($catalog, $templateCode, $templateData, $examenCodigoRaw, $formatoCodigo);

        out_result_ocup(200, [
            'success' => true,
            'data' => [
                'template_code' => $templateCode,
                'formato_codigo' => $formatoCodigo,
                'plantillas' => $plantillas,
                'plantilla_sugerida' => (count($catalog) > 0 ? $catalog[0]['datos_json'] : $templateData),
            ],
        ]);
    }

    if ($accion !== 'obtener') {
        out_result_ocup(422, ['success' => false, 'error' => 'accion GET no soportada']);
    }

    $ordenDetalleId = (int)($_GET['orden_detalle_id'] ?? 0);
    if ($ordenDetalleId <= 0) {
        out_result_ocup(422, ['success' => false, 'error' => 'orden_detalle_id es obligatorio']);
    }

    $stmtDet = $mysqliOcup->prepare('SELECT d.id, d.orden_id, d.examen_id, d.examen_codigo, d.examen_descripcion,
                                            ' . $sqlExprDetalleSnapshot . ' AS examen_snapshot_json,
                                            ' . $sqlExprExamenSnapshot . ' AS examen_general_snapshot_json,
                              ' . $sqlExprExamenLabId . ' AS laboratorio_examen_id,
                                            ' . $sqlExprOrdenMedicoResponsable . ' AS medico_responsable_id,
                                            eg.grupo AS examen_grupo, eg.subgrupo AS examen_subgrupo, eg.valores_normales,
                                            o.estado AS estado_orden
                                     FROM ocupacional_orden_detalle d
                                     INNER JOIN ocupacional_ordenes o ON o.id = d.orden_id
                                     LEFT JOIN ocupacional_examenes_generales eg ON eg.id = d.examen_id
                                     WHERE d.id = ? LIMIT 1');
    if (!$stmtDet) {
        out_result_ocup(500, ['success' => false, 'error' => 'No se pudo consultar detalle de orden']);
    }
    $stmtDet->bind_param('i', $ordenDetalleId);
    $stmtDet->execute();
    $detalle = $stmtDet->get_result()->fetch_assoc();
    $stmtDet->close();

    if (!$detalle) {
        out_result_ocup(404, ['success' => false, 'error' => 'Detalle de orden no encontrado']);
    }
    if ($esSesionMedico) {
        require_owner_medico_or_clinico_result_ocup(
            $mysqliOcup,
            (int)($detalle['medico_responsable_id'] ?? 0),
            (int)($detalle['id'] ?? 0),
            'resultado clinico'
        );
    }
    if ($esSesionEnfermero && !es_detalle_triaje_result_ocup(
        (string)($detalle['examen_codigo'] ?? ''),
        (string)($detalle['examen_descripcion'] ?? ''),
        (string)($detalle['examen_grupo'] ?? ''),
        (string)($detalle['examen_subgrupo'] ?? '')
    )) {
        out_result_ocup(403, ['success' => false, 'error' => 'No autorizado para acceder a resultados no triaje']);
    }

    $snapshotJson = resolve_snapshot_json_result_ocup(
        $detalle['examen_snapshot_json'] ?? '',
        $detalle['examen_general_snapshot_json'] ?? ''
    );
    if ($snapshotJson === '') {
        $snapshotJson = fetch_lab_snapshot_from_core_result_ocup(
            isset($mysqli) ? $mysqli : null,
            (int)($detalle['laboratorio_examen_id'] ?? 0),
            (string)($detalle['examen_descripcion'] ?? '')
        );
    }

    $formatoCodigo = normalize_formato_codigo_ocup($_GET['formato_codigo'] ?? '', $detalle['examen_codigo'] ?? 'formato_general');
    $templateCode = resolve_template_code_result_ocup(
        $detalle['examen_codigo'] ?? '',
        $detalle['examen_descripcion'] ?? '',
        $detalle['examen_grupo'] ?? '',
        $detalle['examen_subgrupo'] ?? '',
        $snapshotJson
    );
    $templateData = build_template_data_ocup(
        $templateCode,
        $detalle['examen_codigo'] ?? '',
        $detalle['examen_descripcion'] ?? '',
        $detalle['valores_normales'] ?? '',
        $snapshotJson
    );
    $catalog = fetch_template_catalog_result_ocup(
        $mysqliOcup,
        $templateCode,
        (string)($detalle['examen_codigo'] ?? ''),
        $formatoCodigo
    );
    $plantillasDisponibles = merge_templates_with_default_result_ocup(
        $catalog,
        $templateCode,
        $templateData,
        (string)($detalle['examen_codigo'] ?? ''),
        $formatoCodigo
    );

    $stmtRes = $mysqliOcup->prepare('SELECT *
                                     FROM ocupacional_resultados_clinicos
                                     WHERE orden_detalle_id = ? AND formato_codigo = ?
                                     LIMIT 1');
    if (!$stmtRes) {
        out_result_ocup(500, ['success' => false, 'error' => 'No se pudo consultar resultado clinico']);
    }
    $stmtRes->bind_param('is', $ordenDetalleId, $formatoCodigo);
    $stmtRes->execute();
    $row = $stmtRes->get_result()->fetch_assoc();
    $stmtRes->close();

    $dataRow = null;
    if ($row) {
        $dataRow = [
            'id' => (int)$row['id'],
            'orden_detalle_id' => (int)$row['orden_detalle_id'],
            'orden_id' => (int)$row['orden_id'],
            'examen_id' => (int)$row['examen_id'],
            'formato_codigo' => (string)$row['formato_codigo'],
            'datos_json' => $row['datos_json'] ? json_decode((string)$row['datos_json'], true) : [],
            'estado' => (string)($row['estado'] ?? 'borrador'),
            'observacion' => (string)($row['observacion'] ?? ''),
            'created_at' => (string)($row['created_at'] ?? ''),
            'updated_at' => (string)($row['updated_at'] ?? ''),
        ];
    }

    out_result_ocup(200, [
        'success' => true,
        'detalle' => [
            'id' => (int)$detalle['id'],
            'orden_id' => (int)$detalle['orden_id'],
            'examen_id' => (int)$detalle['examen_id'],
            'examen_codigo' => (string)($detalle['examen_codigo'] ?? ''),
            'examen_descripcion' => (string)($detalle['examen_descripcion'] ?? ''),
            'estado_orden' => (string)($detalle['estado_orden'] ?? ''),
            'formato_codigo' => $formatoCodigo,
            'template_code' => $templateCode,
        ],
        'data' => $dataRow,
        'plantilla_sugerida' => (count($catalog) > 0 ? $catalog[0]['datos_json'] : $templateData),
        'plantillas_disponibles' => $plantillasDisponibles,
    ]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    out_result_ocup(405, ['success' => false, 'error' => 'Metodo no permitido']);
}

require_ocup_permiso_any_result(['ejecutar_ordenes_ocupacional']);

$raw = file_get_contents('php://input');
$payload = json_decode($raw, true);
if (!is_array($payload)) {
    $payload = $_POST;
}

$accion = trim((string)($payload['accion'] ?? ''));
if ($accion === 'guardar_plantilla') {
    if ($esSesionEnfermero) {
        out_result_ocup(403, ['success' => false, 'error' => 'No autorizado para gestionar plantillas']);
    }
    if (!ensure_template_table_result_ocup($mysqliOcup)) {
        out_result_ocup(500, ['success' => false, 'error' => 'No se pudo inicializar catalogo de plantillas']);
    }

    $nombre = trim((string)($payload['nombre'] ?? ''));
    if ($nombre === '') {
        out_result_ocup(422, ['success' => false, 'error' => 'nombre es obligatorio']);
    }
    if (strlen($nombre) < 4) {
        out_result_ocup(422, ['success' => false, 'error' => 'nombre debe tener al menos 4 caracteres']);
    }
    if (strlen($nombre) > 120) {
        out_result_ocup(422, ['success' => false, 'error' => 'nombre excede 120 caracteres']);
    }

    $examenCodigo = trim((string)($payload['examen_codigo'] ?? ''));
    $examenDescripcion = trim((string)($payload['examen_descripcion'] ?? ''));
    $templateCode = normalize_template_codigo_ocup(
        $payload['template_code'] ?? build_template_codigo_ocup($examenCodigo, $examenDescripcion),
        'general_basico'
    );
    $formatoCodigo = normalize_formato_codigo_ocup($payload['formato_codigo'] ?? '', $examenCodigo !== '' ? $examenCodigo : 'formato_general');
    $codigoInput = trim((string)($payload['codigo'] ?? ''));
    if ($codigoInput === '') {
        $codigoInput = $templateCode . '_' . date('YmdHis');
    }
    $codigo = normalize_template_codigo_ocup($codigoInput, 'plantilla');
    [$datosJsonText, $datosDecoded] = decode_json_field_result_ocup($payload['datos_json'] ?? [], 'datos_json');

    if ($datosDecoded === [] && trim((string)($payload['datos_json'] ?? '')) !== '[]') {
        // allow empty object as valid template body.
    }

    $usuarioId = (int) (OcupacionalSesion::usuario()['id'] ?? 0) ?: null;
    $plantillaId = (int)($payload['id'] ?? 0);
    $ordenDetalleId = (int)($payload['orden_detalle_id'] ?? 0);
    require_owner_medico_by_detalle_result_ocup($mysqliOcup, $ordenDetalleId, $sqlExprOrdenMedicoResponsable, 'plantilla clinica');
    $ordenIdEvento = resolve_orden_id_by_detalle_result_ocup($mysqliOcup, $ordenDetalleId);

    if ($plantillaId > 0) {
        $stmtUpd = $mysqliOcup->prepare('UPDATE ocupacional_plantillas_resultado
                                         SET codigo = ?, nombre = ?, template_code = ?, examen_codigo = ?, formato_codigo = ?, datos_json = ?, activo = 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP
                                         WHERE id = ?
                                         LIMIT 1');
        if (!$stmtUpd) {
            out_result_ocup(500, ['success' => false, 'error' => 'No se pudo actualizar plantilla']);
        }
        $stmtUpd->bind_param('ssssssii', $codigo, $nombre, $templateCode, $examenCodigo, $formatoCodigo, $datosJsonText, $usuarioId, $plantillaId);
        try {
            $okUpd = $stmtUpd->execute();
        } catch (Throwable $e) {
            $stmtUpd->close();
            out_result_ocup(500, ['success' => false, 'error' => 'No se pudo actualizar plantilla (codigo duplicado?)']);
        }
        $affectedUpd = $stmtUpd->affected_rows;
        $stmtUpd->close();
        if (!$okUpd) {
            out_result_ocup(500, ['success' => false, 'error' => 'No se pudo actualizar plantilla (codigo duplicado?)']);
        }
        if ($affectedUpd <= 0) {
            out_result_ocup(404, ['success' => false, 'error' => 'Plantilla no encontrada para actualizar']);
        }
        $savedId = $plantillaId;
    } else {
        $stmtInsTpl = $mysqliOcup->prepare('INSERT INTO ocupacional_plantillas_resultado
                                            (codigo, nombre, template_code, examen_codigo, formato_codigo, datos_json, activo, created_by, updated_by)
                                            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)');
        if (!$stmtInsTpl) {
            out_result_ocup(500, ['success' => false, 'error' => 'No se pudo registrar plantilla']);
        }
        $stmtInsTpl->bind_param('ssssssii', $codigo, $nombre, $templateCode, $examenCodigo, $formatoCodigo, $datosJsonText, $usuarioId, $usuarioId);
        try {
            $okIns = $stmtInsTpl->execute();
        } catch (Throwable $e) {
            $stmtInsTpl->close();
            out_result_ocup(500, ['success' => false, 'error' => 'No se pudo registrar plantilla (codigo duplicado?)']);
        }
        $savedId = (int)$stmtInsTpl->insert_id;
        $stmtInsTpl->close();
        if (!$okIns || $savedId <= 0) {
            out_result_ocup(500, ['success' => false, 'error' => 'No se pudo registrar plantilla (codigo duplicado?)']);
        }
    }

    $stmtOutTpl = $mysqliOcup->prepare('SELECT id, codigo, nombre, template_code, examen_codigo, formato_codigo, datos_json, activo
                                        FROM ocupacional_plantillas_resultado
                                        WHERE id = ?
                                        LIMIT 1');
    if (!$stmtOutTpl) {
        out_result_ocup(500, ['success' => false, 'error' => 'No se pudo consultar plantilla guardada']);
    }
    $stmtOutTpl->bind_param('i', $savedId);
    $stmtOutTpl->execute();
    $savedTpl = $stmtOutTpl->get_result()->fetch_assoc();
    $stmtOutTpl->close();

    registrar_evento_result_ocup(
        $mysqliOcup,
        $ordenIdEvento,
        'plantilla_guardada',
        'Plantilla clinica guardada: ' . (string)($savedTpl['nombre'] ?? $nombre),
        $usuarioId,
        [
            'plantilla_id' => (int)($savedTpl['id'] ?? 0),
            'codigo' => (string)($savedTpl['codigo'] ?? ''),
            'template_code' => (string)($savedTpl['template_code'] ?? ''),
            'formato_codigo' => (string)($savedTpl['formato_codigo'] ?? ''),
        ]
    );

    out_result_ocup(200, [
        'success' => true,
        'message' => 'Plantilla guardada',
        'data' => [
            'id' => (int)($savedTpl['id'] ?? 0),
            'codigo' => (string)($savedTpl['codigo'] ?? ''),
            'nombre' => (string)($savedTpl['nombre'] ?? ''),
            'template_code' => (string)($savedTpl['template_code'] ?? ''),
            'examen_codigo' => (string)($savedTpl['examen_codigo'] ?? ''),
            'formato_codigo' => (string)($savedTpl['formato_codigo'] ?? ''),
            'origen' => 'catalogo',
            'datos_json' => safe_json_decode_assoc_result_ocup($savedTpl['datos_json'] ?? '{}'),
            'activo' => (int)($savedTpl['activo'] ?? 0),
        ],
    ]);
}

if ($accion === 'eliminar_plantilla') {
    if ($esSesionEnfermero) {
        out_result_ocup(403, ['success' => false, 'error' => 'No autorizado para gestionar plantillas']);
    }
    if (!ensure_template_table_result_ocup($mysqliOcup)) {
        out_result_ocup(500, ['success' => false, 'error' => 'No se pudo inicializar catalogo de plantillas']);
    }
    $id = (int)($payload['id'] ?? 0);
    if ($id <= 0) {
        out_result_ocup(422, ['success' => false, 'error' => 'id es obligatorio']);
    }
    $usuarioId = (int) (OcupacionalSesion::usuario()['id'] ?? 0) ?: null;
    $ordenDetalleId = (int)($payload['orden_detalle_id'] ?? 0);
    require_owner_medico_by_detalle_result_ocup($mysqliOcup, $ordenDetalleId, $sqlExprOrdenMedicoResponsable, 'plantilla clinica');
    $ordenIdEvento = resolve_orden_id_by_detalle_result_ocup($mysqliOcup, $ordenDetalleId);

    $stmtTpl = $mysqliOcup->prepare('SELECT id, codigo, nombre, activo FROM ocupacional_plantillas_resultado WHERE id = ? LIMIT 1');
    if (!$stmtTpl) {
        out_result_ocup(500, ['success' => false, 'error' => 'No se pudo validar plantilla']);
    }
    $stmtTpl->bind_param('i', $id);
    $stmtTpl->execute();
    $tplRow = $stmtTpl->get_result()->fetch_assoc();
    $stmtTpl->close();
    if (!$tplRow) {
        out_result_ocup(404, ['success' => false, 'error' => 'Plantilla no encontrada']);
    }
    if ((int)($tplRow['activo'] ?? 0) === 0) {
        out_result_ocup(200, ['success' => true, 'message' => 'Plantilla ya estaba eliminada']);
    }

    $stmtDelTpl = $mysqliOcup->prepare('UPDATE ocupacional_plantillas_resultado
                                        SET activo = 0, updated_by = ?, updated_at = CURRENT_TIMESTAMP
                                        WHERE id = ?
                                        LIMIT 1');
    if (!$stmtDelTpl) {
        out_result_ocup(500, ['success' => false, 'error' => 'No se pudo eliminar plantilla']);
    }
    $stmtDelTpl->bind_param('ii', $usuarioId, $id);
    $stmtDelTpl->execute();
    $affected = $stmtDelTpl->affected_rows;
    $stmtDelTpl->close();

    if ($affected <= 0) {
        out_result_ocup(404, ['success' => false, 'error' => 'Plantilla no encontrada']);
    }

    registrar_evento_result_ocup(
        $mysqliOcup,
        $ordenIdEvento,
        'plantilla_eliminada',
        'Plantilla clinica eliminada: ' . (string)($tplRow['nombre'] ?? $id),
        $usuarioId,
        [
            'plantilla_id' => (int)$id,
            'codigo' => (string)($tplRow['codigo'] ?? ''),
        ]
    );

    out_result_ocup(200, ['success' => true, 'message' => 'Plantilla eliminada']);
}

if ($accion === 'actualizar_examen_detalle') {
    $ordenDetalleId = (int)($payload['orden_detalle_id'] ?? 0);
    if ($ordenDetalleId <= 0) {
        out_result_ocup(422, ['success' => false, 'error' => 'orden_detalle_id es obligatorio']);
    }
    if (!$hasDetalleSnapshotCol) {
        out_result_ocup(422, ['success' => false, 'error' => 'La tabla ocupacional no soporta refresco de snapshot en detalle']);
    }

    $stmtDet = $mysqliOcup->prepare('SELECT d.id, d.orden_id, d.examen_id, d.examen_codigo, d.examen_descripcion,
                                            ' . $sqlExprDetalleSnapshot . ' AS examen_snapshot_json,
                                            ' . $sqlExprExamenSnapshot . ' AS examen_general_snapshot_json,
                                            ' . $sqlExprExamenLabId . ' AS laboratorio_examen_id,
                                            ' . $sqlExprOrdenMedicoResponsable . ' AS medico_responsable_id,
                                            eg.grupo AS examen_grupo, eg.subgrupo AS examen_subgrupo
                                     FROM ocupacional_orden_detalle d
                                     INNER JOIN ocupacional_ordenes o ON o.id = d.orden_id
                                     LEFT JOIN ocupacional_examenes_generales eg ON eg.id = d.examen_id
                                     WHERE d.id = ? LIMIT 1');
    if (!$stmtDet) {
        out_result_ocup(500, ['success' => false, 'error' => 'No se pudo validar detalle de orden']);
    }
    $stmtDet->bind_param('i', $ordenDetalleId);
    $stmtDet->execute();
    $detalle = $stmtDet->get_result()->fetch_assoc();
    $stmtDet->close();

    if (!$detalle) {
        out_result_ocup(404, ['success' => false, 'error' => 'Detalle de orden no encontrado']);
    }
    if ($esSesionMedico) {
        require_owner_medico_or_clinico_result_ocup(
            $mysqliOcup,
            (int)($detalle['medico_responsable_id'] ?? 0),
            (int)($detalle['id'] ?? 0),
            'resultado clinico'
        );
    }
    if ($esSesionEnfermero && !es_detalle_triaje_result_ocup(
        (string)($detalle['examen_codigo'] ?? ''),
        (string)($detalle['examen_descripcion'] ?? ''),
        (string)($detalle['examen_grupo'] ?? ''),
        (string)($detalle['examen_subgrupo'] ?? '')
    )) {
        out_result_ocup(403, ['success' => false, 'error' => 'No autorizado para actualizar resultados no triaje']);
    }

    $snapshotJson = fetch_lab_snapshot_from_core_result_ocup(
        isset($mysqli) ? $mysqli : null,
        (int)($detalle['laboratorio_examen_id'] ?? 0),
        (string)($detalle['examen_descripcion'] ?? '')
    );

    if ($snapshotJson === '') {
        $snapshotJson = resolve_snapshot_json_result_ocup(
            $detalle['examen_snapshot_json'] ?? '',
            $detalle['examen_general_snapshot_json'] ?? ''
        );
    }

    if ($snapshotJson === '') {
        out_result_ocup(422, ['success' => false, 'error' => 'No se encontro snapshot de laboratorio para este examen']);
    }

    $snapshotDecoded = decode_json_any_result_ocup($snapshotJson);
    $nuevoNombre = trim((string)($snapshotDecoded['nombre'] ?? ''));
    if ($nuevoNombre === '') {
        $nuevoNombre = trim((string)($detalle['examen_descripcion'] ?? ''));
    }

    $stmtUpd = $mysqliOcup->prepare('UPDATE ocupacional_orden_detalle
                                     SET examen_snapshot_json = ?,
                                         examen_descripcion = ?
                                     WHERE id = ?
                                     LIMIT 1');
    if (!$stmtUpd) {
        out_result_ocup(500, ['success' => false, 'error' => 'No se pudo actualizar detalle con snapshot']);
    }
    $stmtUpd->bind_param('ssi', $snapshotJson, $nuevoNombre, $ordenDetalleId);
    $stmtUpd->execute();
    $stmtUpd->close();

    $usuarioId = (int) (OcupacionalSesion::usuario()['id'] ?? 0) ?: null;
    registrar_evento_result_ocup(
        $mysqliOcup,
        (int)$detalle['orden_id'],
        'detalle_examen_actualizado',
        'Examen actualizado desde catalogo de laboratorio: ' . $nuevoNombre,
        $usuarioId,
        [
            'orden_detalle_id' => $ordenDetalleId,
            'examen_codigo' => (string)($detalle['examen_codigo'] ?? ''),
            'examen_descripcion_anterior' => (string)($detalle['examen_descripcion'] ?? ''),
            'examen_descripcion_nueva' => $nuevoNombre,
            'laboratorio_examen_id' => (int)($detalle['laboratorio_examen_id'] ?? 0),
        ]
    );

    out_result_ocup(200, [
        'success' => true,
        'message' => 'Examen del detalle actualizado desde laboratorio',
        'data' => [
            'orden_detalle_id' => $ordenDetalleId,
            'orden_id' => (int)$detalle['orden_id'],
            'examen_codigo' => (string)($detalle['examen_codigo'] ?? ''),
            'examen_descripcion' => $nuevoNombre,
        ],
    ]);
}

if ($accion === 'registrar_emision_pdf') {
    if ($esSesionEnfermero) {
        out_result_ocup(403, ['success' => false, 'error' => 'No autorizado para registrar emision de PDF']);
    }
    $ordenDetalleId = (int)($payload['orden_detalle_id'] ?? 0);
    if ($ordenDetalleId <= 0) {
        out_result_ocup(422, ['success' => false, 'error' => 'orden_detalle_id es obligatorio']);
    }
    if ($esSesionMedico) {
        $stmtOwner = $mysqliOcup->prepare('SELECT d.id, ' . $sqlExprOrdenMedicoResponsable . ' AS medico_responsable_id
                                           FROM ocupacional_orden_detalle d
                                           INNER JOIN ocupacional_ordenes o ON o.id = d.orden_id
                                           WHERE d.id = ? LIMIT 1');
        if (!$stmtOwner) {
            out_result_ocup(500, ['success' => false, 'error' => 'No se pudo validar acceso para emision de PDF']);
        }
        $stmtOwner->bind_param('i', $ordenDetalleId);
        $stmtOwner->execute();
        $owner = $stmtOwner->get_result()->fetch_assoc();
        $stmtOwner->close();

        if (!$owner) {
            out_result_ocup(404, ['success' => false, 'error' => 'Detalle de orden no encontrado']);
        }

        require_owner_medico_or_clinico_result_ocup(
            $mysqliOcup,
            (int)($owner['medico_responsable_id'] ?? 0),
            (int)($owner['id'] ?? 0),
            'resultado clinico'
        );
    }

    $formatoCodigo = normalize_formato_codigo_ocup($payload['formato_codigo'] ?? '', 'formato_general');
    $stmtPdf = $mysqliOcup->prepare('SELECT rc.id, rc.orden_id, rc.estado, d.examen_codigo, d.examen_descripcion
                                     FROM ocupacional_resultados_clinicos rc
                                     INNER JOIN ocupacional_orden_detalle d ON d.id = rc.orden_detalle_id
                                     WHERE rc.orden_detalle_id = ? AND rc.formato_codigo = ?
                                     LIMIT 1');
    if (!$stmtPdf) {
        out_result_ocup(500, ['success' => false, 'error' => 'No se pudo validar resultado para PDF']);
    }
    $stmtPdf->bind_param('is', $ordenDetalleId, $formatoCodigo);
    $stmtPdf->execute();
    $resultadoPdf = $stmtPdf->get_result()->fetch_assoc();
    $stmtPdf->close();
    if (!$resultadoPdf) {
        out_result_ocup(404, ['success' => false, 'error' => 'Resultado clinico no encontrado']);
    }
    if ((string)($resultadoPdf['estado'] ?? '') !== 'finalizado') {
        out_result_ocup(422, ['success' => false, 'error' => 'Solo se puede emitir PDF de un resultado finalizado']);
    }

    $usuarioId = (int) (OcupacionalSesion::usuario()['id'] ?? 0) ?: null;
    registrar_evento_result_ocup(
        $mysqliOcup,
        (int)$resultadoPdf['orden_id'],
        'resultado_pdf_emitido',
        'PDF de resultado clinico emitido: ' . (string)($resultadoPdf['examen_codigo'] ?? $formatoCodigo),
        $usuarioId,
        [
            'resultado_id' => (int)$resultadoPdf['id'],
            'orden_detalle_id' => $ordenDetalleId,
            'formato_codigo' => $formatoCodigo,
            'examen_codigo' => (string)($resultadoPdf['examen_codigo'] ?? ''),
            'examen_descripcion' => (string)($resultadoPdf['examen_descripcion'] ?? ''),
            'formato_documento' => 'pdf',
        ]
    );
    out_result_ocup(200, ['success' => true, 'message' => 'Emision de PDF clinico registrada']);
}

if ($accion !== 'guardar') {
    out_result_ocup(422, ['success' => false, 'error' => 'accion POST no soportada']);
}

$ordenDetalleId = (int)($payload['orden_detalle_id'] ?? 0);
if ($ordenDetalleId <= 0) {
    out_result_ocup(422, ['success' => false, 'error' => 'orden_detalle_id es obligatorio']);
}

$stmtDet = $mysqliOcup->prepare('SELECT d.id, d.orden_id, d.examen_id, d.examen_codigo, d.examen_descripcion, d.estado_ejecucion,
                                        ' . $sqlExprDetalleSnapshot . ' AS examen_snapshot_json,
                                        ' . $sqlExprExamenSnapshot . ' AS examen_general_snapshot_json,
                                        ' . $sqlExprExamenLabId . ' AS laboratorio_examen_id,
                                        ' . $sqlExprOrdenMedicoResponsable . ' AS medico_responsable_id,
                                        eg.grupo AS examen_grupo, eg.subgrupo AS examen_subgrupo,
                                        o.estado AS estado_orden
                                 FROM ocupacional_orden_detalle d
                                 INNER JOIN ocupacional_ordenes o ON o.id = d.orden_id
                                 LEFT JOIN ocupacional_examenes_generales eg ON eg.id = d.examen_id
                                 WHERE d.id = ? LIMIT 1');
if (!$stmtDet) {
    out_result_ocup(500, ['success' => false, 'error' => 'No se pudo validar detalle de orden']);
}
$stmtDet->bind_param('i', $ordenDetalleId);
$stmtDet->execute();
$detalle = $stmtDet->get_result()->fetch_assoc();
$stmtDet->close();

if (!$detalle) {
    out_result_ocup(404, ['success' => false, 'error' => 'Detalle de orden no encontrado']);
}
if ($esSesionMedico) {
    require_owner_medico_or_clinico_result_ocup(
        $mysqliOcup,
        (int)($detalle['medico_responsable_id'] ?? 0),
        (int)($detalle['id'] ?? 0),
        'resultado clinico'
    );
}
if ($esSesionEnfermero && !es_detalle_triaje_result_ocup(
    (string)($detalle['examen_codigo'] ?? ''),
    (string)($detalle['examen_descripcion'] ?? ''),
    (string)($detalle['examen_grupo'] ?? ''),
    (string)($detalle['examen_subgrupo'] ?? '')
)) {
    out_result_ocup(403, ['success' => false, 'error' => 'No autorizado para guardar resultados no triaje']);
}

$estadoOrden = (string)($detalle['estado_orden'] ?? '');
if (in_array($estadoOrden, ['cerrada', 'anulada'], true)) {
    out_result_ocup(422, ['success' => false, 'error' => 'No se puede guardar resultado clinico en orden cerrada o anulada']);
}

$formatoCodigo = normalize_formato_codigo_ocup($payload['formato_codigo'] ?? '', $detalle['examen_codigo'] ?? 'formato_general');
[$datosJsonText, $datosDecoded] = decode_json_field_result_ocup($payload['datos_json'] ?? [], 'datos_json');

$estado = strtolower(trim((string)($payload['estado'] ?? 'borrador')));
if (!in_array($estado, ['borrador', 'finalizado', 'anulado'], true)) {
    out_result_ocup(422, ['success' => false, 'error' => 'estado invalido']);
}
if ($esSesionEnfermero && !in_array($estado, ['borrador', 'finalizado'], true)) {
    out_result_ocup(422, ['success' => false, 'error' => 'Enfermeria solo puede guardar en borrador o finalizado']);
}
if ($estado === 'finalizado') {
    $snapshotJson = resolve_snapshot_json_result_ocup(
        $detalle['examen_snapshot_json'] ?? '',
        $detalle['examen_general_snapshot_json'] ?? ''
    );
    if ($snapshotJson === '') {
        $snapshotJson = fetch_lab_snapshot_from_core_result_ocup(
            isset($mysqli) ? $mysqli : null,
            (int)($detalle['laboratorio_examen_id'] ?? 0),
            (string)($detalle['examen_descripcion'] ?? '')
        );
    }
    $templateCode = resolve_template_code_result_ocup(
        $detalle['examen_codigo'] ?? '',
        $detalle['examen_descripcion'] ?? '',
        $detalle['examen_grupo'] ?? '',
        $detalle['examen_subgrupo'] ?? '',
        $snapshotJson
    );
    validate_finalized_data_result_ocup($templateCode, $datosDecoded);
}

$observacion = trim((string)($payload['observacion'] ?? ''));
$usuarioId = (int) (OcupacionalSesion::usuario()['id'] ?? 0) ?: null;

$stmtFind = $mysqliOcup->prepare('SELECT id FROM ocupacional_resultados_clinicos WHERE orden_detalle_id = ? AND formato_codigo = ? LIMIT 1');
if (!$stmtFind) {
    out_result_ocup(500, ['success' => false, 'error' => 'No se pudo consultar resultado existente']);
}
$stmtFind->bind_param('is', $ordenDetalleId, $formatoCodigo);
$stmtFind->execute();
$exist = $stmtFind->get_result()->fetch_assoc();
$stmtFind->close();

if ($exist) {
    $resultadoId = (int)$exist['id'];
    $stmtUp = $mysqliOcup->prepare('UPDATE ocupacional_resultados_clinicos
                                    SET datos_json = ?, estado = ?, observacion = ?, ejecutado_by = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
                                    WHERE id = ? LIMIT 1');
    if (!$stmtUp) {
        out_result_ocup(500, ['success' => false, 'error' => 'No se pudo actualizar resultado clinico']);
    }
    $stmtUp->bind_param('sssiii', $datosJsonText, $estado, $observacion, $usuarioId, $usuarioId, $resultadoId);
    $stmtUp->execute();
    $stmtUp->close();
} else {
    $stmtIns = $mysqliOcup->prepare('INSERT INTO ocupacional_resultados_clinicos
                                     (orden_detalle_id, orden_id, examen_id, formato_codigo, datos_json, estado, ejecutado_by, observacion, created_by, updated_by)
                                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    if (!$stmtIns) {
        out_result_ocup(500, ['success' => false, 'error' => 'No se pudo registrar resultado clinico']);
    }
    $ordenId = (int)$detalle['orden_id'];
    $examenId = (int)$detalle['examen_id'];
    $stmtIns->bind_param('iiisssisii', $ordenDetalleId, $ordenId, $examenId, $formatoCodigo, $datosJsonText, $estado, $usuarioId, $observacion, $usuarioId, $usuarioId);
    $stmtIns->execute();
    $resultadoId = (int)$stmtIns->insert_id;
    $stmtIns->close();
}

// Sincronizar estado de detalle segun todos sus formatos clinicos.
$stmtFinal = $mysqliOcup->prepare('SELECT EXISTS (
                                      SELECT 1
                                      FROM ocupacional_resultados_clinicos
                                      WHERE orden_detalle_id = ?
                                        AND estado = "finalizado"
                                   ) AS tiene_finalizado');
$tieneFinalizado = false;
if ($stmtFinal) {
    $stmtFinal->bind_param('i', $ordenDetalleId);
    $stmtFinal->execute();
    $tieneFinalizado = (int)($stmtFinal->get_result()->fetch_assoc()['tiene_finalizado'] ?? 0) === 1;
    $stmtFinal->close();
}

$nuevoEstadoDetalle = null;
if ($tieneFinalizado) {
    $nuevoEstadoDetalle = 'realizado';
} elseif ((string)($detalle['estado_ejecucion'] ?? '') === 'realizado'
    || ($estado === 'borrador' && (string)($detalle['estado_ejecucion'] ?? '') === 'pendiente')) {
    $nuevoEstadoDetalle = 'en_proceso';
}

if ($nuevoEstadoDetalle !== null) {
    $stmtUpdDet = $mysqliOcup->prepare('UPDATE ocupacional_orden_detalle
                                        SET estado_ejecucion = ?, observacion_ejecucion = ?, fecha_ejecucion = CASE WHEN ? = "realizado" THEN CURRENT_TIMESTAMP ELSE NULL END, updated_by = ?, updated_at = CURRENT_TIMESTAMP
                                        WHERE id = ? LIMIT 1');
    if ($stmtUpdDet) {
        $stmtUpdDet->bind_param('sssii', $nuevoEstadoDetalle, $observacion, $nuevoEstadoDetalle, $usuarioId, $ordenDetalleId);
        $stmtUpdDet->execute();
        $stmtUpdDet->close();
    }
    sync_estado_orden_por_detalle_result_ocup($mysqliOcup, (int)$detalle['orden_id'], (int)$usuarioId);
}

$stmtOut = $mysqliOcup->prepare('SELECT * FROM ocupacional_resultados_clinicos WHERE id = ? LIMIT 1');
if (!$stmtOut) {
    out_result_ocup(500, ['success' => false, 'error' => 'No se pudo consultar resultado guardado']);
}
$stmtOut->bind_param('i', $resultadoId);
$stmtOut->execute();
$saved = $stmtOut->get_result()->fetch_assoc();
$stmtOut->close();

out_result_ocup(200, [
    'success' => true,
    'message' => 'Resultado clinico guardado',
    'data' => [
        'id' => (int)$saved['id'],
        'orden_detalle_id' => (int)$saved['orden_detalle_id'],
        'orden_id' => (int)$saved['orden_id'],
        'examen_id' => (int)$saved['examen_id'],
        'formato_codigo' => (string)$saved['formato_codigo'],
        'datos_json' => $saved['datos_json'] ? json_decode((string)$saved['datos_json'], true) : $datosDecoded,
        'estado' => (string)($saved['estado'] ?? 'borrador'),
        'observacion' => (string)($saved['observacion'] ?? ''),
        'updated_at' => (string)($saved['updated_at'] ?? ''),
    ],
]);
