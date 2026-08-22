<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/auth_check.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/modules/CorrelativoOperativoModule.php';

function consultas_column_exists($conn, $table, $column) {
    $stmt = $conn->prepare('SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1');
    if (!$stmt) {
        return false;
    }
    $stmt->bind_param('ss', $table, $column);
    $stmt->execute();
    $res = $stmt->get_result();
    return $res && $res->num_rows > 0;
}

function consultas_require_schema($conn) {
    $required = [
        'medicos' => ['tipo_profesional', 'abreviatura_profesional', 'colegio_sigla', 'nro_colegiatura'],
        'consultas' => ['es_reprogramada', 'reprogramada_en', 'hc_origen_id', 'origen_creacion'],
    ];

    $missing = [];
    foreach ($required as $table => $columns) {
        foreach ($columns as $column) {
            if (!consultas_column_exists($conn, $table, $column)) {
                $missing[] = $table . '.' . $column;
            }
        }
    }

    if (!empty($missing)) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Esquema incompleto para api_consultas.php. Ejecuta la migracion de despliegue: sql/2026-04-05_consultas_recordatorios_schema_idempotente.sql',
            'missing_columns' => $missing,
        ]);
        exit;
    }
}

function consultas_actor_label($usuarioSesion) {
    if (!is_array($usuarioSesion)) {
        return 'sistema';
    }
    $rol = trim((string)($usuarioSesion['rol'] ?? 'usuario'));
    $nombre = trim((string)($usuarioSesion['nombre'] ?? ''));
    $apellido = trim((string)($usuarioSesion['apellido'] ?? ''));
    $display = trim($nombre . ' ' . $apellido);
    if ($display === '') {
        $display = trim((string)($usuarioSesion['usuario'] ?? ''));
    }
    if ($display === '') {
        $display = 'usuario';
    }
    return $display . ' (' . $rol . ')';
}

function consultas_actor_nombre($usuarioSesion) {
    if (!is_array($usuarioSesion)) {
        return 'usuario';
    }
    $nombre = trim((string)($usuarioSesion['nombre'] ?? ''));
    $apellido = trim((string)($usuarioSesion['apellido'] ?? ''));
    $display = trim($nombre . ' ' . $apellido);
    if ($display === '') {
        $display = trim((string)($usuarioSesion['usuario'] ?? ''));
    }
    if ($display === '') {
        $display = 'usuario';
    }
    return $display;
}

function consultas_actor_usuario_id($usuarioSesion) {
    if (!is_array($usuarioSesion)) {
        return 0;
    }
    return intval($usuarioSesion['id'] ?? 0);
}

function consultas_rol_normalizado($rol) {
    return strtolower(trim((string)$rol));
}

function consultas_es_rol_autorizador_anticipado($rol) {
    $rolNorm = consultas_rol_normalizado($rol);
    if ($rolNorm === '') {
        return false;
    }
    if (in_array($rolNorm, ['admin', 'administrador', 'superadmin'], true)) {
        return true;
    }
    if (strpos($rolNorm, 'recep') !== false) {
        return true;
    }
    if (strpos($rolNorm, 'caja') !== false || strpos($rolNorm, 'cajero') !== false) {
        return true;
    }
    return false;
}

function consultas_table_exists($conn, $table) {
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

function consultas_ensure_habilitacion_anticipada_schema($conn) {
    $sql = "CREATE TABLE IF NOT EXISTS consultas_habilitaciones_anticipadas (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        consulta_id INT NOT NULL,
        cotizacion_id INT NULL,
        estado VARCHAR(20) NOT NULL DEFAULT 'activo',
        motivo VARCHAR(255) NOT NULL,
        autorizado_por INT NULL,
        autorizado_rol VARCHAR(40) NULL,
        autorizado_nombre VARCHAR(120) NULL,
        autorizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        vence_en DATETIME NULL,
        revocado_por INT NULL,
        revocado_rol VARCHAR(40) NULL,
        revocado_nombre VARCHAR(120) NULL,
        revocado_en DATETIME NULL,
        motivo_revocacion VARCHAR(255) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_cha_consulta (consulta_id),
        KEY idx_cha_cotizacion (cotizacion_id),
        KEY idx_cha_estado (estado),
        KEY idx_cha_consulta_estado (consulta_id, estado)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";

    @mysqli_query($conn, $sql);
}

function consultas_habilitacion_estado_default($consultaId = 0, $cotizacionId = 0) {
    return [
        'consulta_id' => (int)$consultaId,
        'cotizacion_id' => (int)$cotizacionId,
        'habilitacion_anticipada_activa' => 0,
        'estado_resumen' => 'sin_habilitacion',
        'historial_count' => 0,
        'motivo' => null,
        'autorizado_por' => null,
        'autorizado_rol' => null,
        'autorizado_nombre' => null,
        'autorizado_en' => null,
        'vence_en' => null,
    ];
}

function consultas_resolver_habilitaciones_por_consulta_ids($conn, $consultaIds) {
    $out = [];
    $ids = array_values(array_unique(array_filter(array_map('intval', (array)$consultaIds), function ($id) {
        return $id > 0;
    })));
    if (empty($ids)) {
        return $out;
    }
    if (!consultas_table_exists($conn, 'consultas_habilitaciones_anticipadas')) {
        return $out;
    }

    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $types = str_repeat('i', count($ids));
    $sql = "SELECT h.*, agg.historial_count
            FROM consultas_habilitaciones_anticipadas h
            INNER JOIN (
                SELECT consulta_id, MAX(id) AS max_id, COUNT(*) AS historial_count
                FROM consultas_habilitaciones_anticipadas
                WHERE consulta_id IN ({$placeholders})
                GROUP BY consulta_id
            ) agg ON agg.max_id = h.id";
    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        return $out;
    }
    $stmt->bind_param($types, ...$ids);
    $stmt->execute();
    $res = $stmt->get_result();
    $ahora = time();

    while ($row = $res->fetch_assoc()) {
        $consultaId = (int)($row['consulta_id'] ?? 0);
        if ($consultaId <= 0) {
            continue;
        }
        $estado = strtolower(trim((string)($row['estado'] ?? '')));
        $venceEnRaw = trim((string)($row['vence_en'] ?? ''));
        $venceTs = $venceEnRaw !== '' ? strtotime($venceEnRaw) : false;
        $expirada = ($venceEnRaw !== '' && $venceTs !== false && $venceTs < $ahora);
        $activa = ($estado === 'activo' && !$expirada);
        $estadoResumen = $activa ? 'habilitado_anticipado' : ($expirada ? 'expirada' : ($estado !== '' ? $estado : 'sin_habilitacion'));

        $out[$consultaId] = [
            'consulta_id' => $consultaId,
            'cotizacion_id' => (int)($row['cotizacion_id'] ?? 0),
            'habilitacion_anticipada_activa' => $activa ? 1 : 0,
            'estado_resumen' => $estadoResumen,
            'historial_count' => max(0, (int)($row['historial_count'] ?? 0)),
            'motivo' => trim((string)($row['motivo'] ?? '')) !== '' ? trim((string)$row['motivo']) : null,
            'autorizado_por' => isset($row['autorizado_por']) ? (int)$row['autorizado_por'] : null,
            'autorizado_rol' => trim((string)($row['autorizado_rol'] ?? '')) !== '' ? trim((string)$row['autorizado_rol']) : null,
            'autorizado_nombre' => trim((string)($row['autorizado_nombre'] ?? '')) !== '' ? trim((string)$row['autorizado_nombre']) : null,
            'autorizado_en' => trim((string)($row['autorizado_en'] ?? '')) !== '' ? trim((string)$row['autorizado_en']) : null,
            'vence_en' => $venceEnRaw !== '' ? $venceEnRaw : null,
        ];
    }
    $stmt->close();

    return $out;
}

function consultas_es_cotizacion_pagada($estadoCotizacion) {
    $estado = strtolower(trim((string)$estadoCotizacion));
    return in_array($estado, ['pagado', 'pagada', 'completado', 'control', 'contrato'], true);
}

function consultas_regularizar_habilitacion_por_pago($conn, $consultaId, $cotizacionEstado) {
    $consultaId = (int)$consultaId;
    if ($consultaId <= 0) {
        return;
    }
    if (!consultas_table_exists($conn, 'consultas_habilitaciones_anticipadas')) {
        return;
    }
    if (!consultas_es_cotizacion_pagada($cotizacionEstado)) {
        return;
    }

    $stmt = $conn->prepare("UPDATE consultas_habilitaciones_anticipadas
                            SET estado = 'regularizado',
                                revocado_en = COALESCE(revocado_en, NOW()),
                                motivo_revocacion = CASE
                                    WHEN motivo_revocacion IS NULL OR TRIM(motivo_revocacion) = '' THEN 'Regularizado automáticamente por pago'
                                    ELSE motivo_revocacion
                                END
                            WHERE consulta_id = ?
                              AND estado = 'activo'");
    if (!$stmt) {
        return;
    }
    $stmt->bind_param('i', $consultaId);
    $stmt->execute();
    $stmt->close();
}

function consultas_enriquecer_correlativo_diario($conn, &$rows) {
    if (!is_array($rows) || empty($rows)) {
        return;
    }

    $pares = [];
    foreach ($rows as $row) {
        $medicoId = intval($row['medico_id'] ?? 0);
        $fecha = trim((string)($row['fecha'] ?? ''));
        if ($medicoId <= 0 || $fecha === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha)) {
            continue;
        }
        $key = $medicoId . '|' . $fecha;
        if (!isset($pares[$key])) {
            $pares[$key] = ['medico_id' => $medicoId, 'fecha' => $fecha];
        }
    }

    if (empty($pares)) {
        foreach ($rows as &$row) {
            $corrPersistido = intval($row['correlativo_dia_medico'] ?? 0);
            $row['correlativo_dia_medico'] = $corrPersistido > 0 ? $corrPersistido : null;
        }
        unset($row);
        return;
    }

    $pairs = array_values($pares);
    $rankMaps = correlativo_operativo_rank_maps($conn, $pairs);
    $rankByConsultaId = is_array($rankMaps['consulta'] ?? null) ? $rankMaps['consulta'] : [];

    foreach ($rows as &$row) {
        $consultaId = intval($row['id'] ?? 0);
        $corrPersistido = intval($row['correlativo_dia_medico'] ?? 0);
        $row['correlativo_dia_medico'] = $consultaId > 0 && isset($rankByConsultaId[$consultaId])
            ? intval($rankByConsultaId[$consultaId])
            : ($corrPersistido > 0 ? $corrPersistido : null);
    }
    unset($row);
}

function consultas_cotizacion_estado_map($conn, $cotizacionIds) {
    $out = [];
    $ids = array_values(array_unique(array_filter(array_map('intval', (array)$cotizacionIds), function ($id) {
        return $id > 0;
    })));
    if (empty($ids)) {
        return $out;
    }
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $types = str_repeat('i', count($ids));
    $sql = "SELECT id, estado FROM cotizaciones WHERE id IN ({$placeholders})";
    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        return $out;
    }
    $stmt->bind_param($types, ...$ids);
    $stmt->execute();
    $res = $stmt->get_result();
    while ($row = $res->fetch_assoc()) {
        $out[(int)($row['id'] ?? 0)] = trim((string)($row['estado'] ?? ''));
    }
    $stmt->close();
    return $out;
}

function consultas_cotizacion_consulta_explicita_map($conn, $cotizacionIds) {
    $out = [];
    $ids = array_values(array_unique(array_filter(array_map('intval', (array)$cotizacionIds), function ($id) {
        return $id > 0;
    })));
    if (empty($ids)) {
        return $out;
    }

    foreach ($ids as $id) {
        $out[$id] = 0;
    }

    if (!columna_existe_local($conn, 'cotizaciones_detalle', 'consulta_id')) {
        return $out;
    }

    $whereDetalleActivo = columna_existe_local($conn, 'cotizaciones_detalle', 'estado_item')
        ? " AND LOWER(TRIM(COALESCE(estado_item, 'activo'))) <> 'eliminado'"
        : '';

    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $types = str_repeat('i', count($ids));
    $sql = "SELECT cotizacion_id,
                   MIN(consulta_id) AS consulta_id_ref,
                   COUNT(DISTINCT consulta_id) AS consultas_distintas
            FROM cotizaciones_detalle
            WHERE cotizacion_id IN ({$placeholders})
              AND consulta_id IS NOT NULL
              AND consulta_id > 0{$whereDetalleActivo}
            GROUP BY cotizacion_id";

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        return $out;
    }
    $stmt->bind_param($types, ...$ids);
    $stmt->execute();
    $res = $stmt->get_result();

    while ($row = $res->fetch_assoc()) {
        $cotId = (int)($row['cotizacion_id'] ?? 0);
        $consultaRef = (int)($row['consulta_id_ref'] ?? 0);
        $distintas = (int)($row['consultas_distintas'] ?? 0);

        // Vínculo fuerte: solo aceptar cuando hay exactamente una consulta explícita.
        if ($cotId > 0 && $consultaRef > 0 && $distintas === 1) {
            $out[$cotId] = $consultaRef;
        }
    }
    $stmt->close();

    return $out;
}

function consultas_resolver_consulta_explicita_por_cotizacion($conn, $cotizacionId) {
    $cotizacionId = (int)$cotizacionId;
    if ($cotizacionId <= 0) {
        return 0;
    }
    $map = consultas_cotizacion_consulta_explicita_map($conn, [$cotizacionId]);
    return (int)($map[$cotizacionId] ?? 0);
}

function consultas_normalizar_servicio_tipo($raw) {
    $t = strtolower(trim((string)$raw));
    if ($t === '' || $t === 'consulta_medica' || $t === 'consulta médica' || $t === 'consulta medica') {
        return 'consulta';
    }
    if ($t === 'rayos_x' || $t === 'rayos x' || $t === 'rx') {
        return 'rayosx';
    }
    if ($t === 'procedimientos') {
        return 'procedimiento';
    }
    if ($t === 'operaciones') {
        return 'operacion';
    }
    return $t;
}

function consultas_es_servicio_clinico_panel_medico($tipo) {
    $validos = ['consulta', 'ecografia', 'rayosx', 'tomografia', 'procedimiento', 'operacion'];
    return in_array(consultas_normalizar_servicio_tipo($tipo), $validos, true);
}

function consultas_servicios_habilitados_medico($conn, $medicoId) {
    $medicoId = (int)$medicoId;
    if ($medicoId <= 0) {
        return ['consulta'];
    }

    $servicios = [];
    $stmt = $conn->prepare('SELECT DISTINCT LOWER(TRIM(servicio_tipo)) AS servicio_tipo FROM tarifas WHERE activo = 1 AND medico_id = ?');
    if ($stmt) {
        $stmt->bind_param('i', $medicoId);
        $stmt->execute();
        $res = $stmt->get_result();
        while ($row = $res->fetch_assoc()) {
            $tipo = consultas_normalizar_servicio_tipo($row['servicio_tipo'] ?? '');
            if ($tipo !== '' && consultas_es_servicio_clinico_panel_medico($tipo)) {
                $servicios[$tipo] = true;
            }
        }
        $stmt->close();
    }

    // Consulta suele ser parte del flujo clínico base del médico.
    $servicios['consulta'] = true;

    return array_keys($servicios);
}

function consultas_stats_servicios_pendientes_hoy($conn, $medicoId, $fechaYmd) {
    $medicoId = (int)$medicoId;
    $fechaYmd = trim((string)$fechaYmd);
    $conteo = [
        'consulta' => 0,
        'ecografia' => 0,
        'rayosx' => 0,
        'tomografia' => 0,
        'procedimiento' => 0,
        'operacion' => 0,
    ];

    if ($medicoId <= 0 || $fechaYmd === '') {
        return $conteo;
    }

    $whereDetalleActivoServicios = columna_existe_local($conn, 'cotizaciones_detalle', 'estado_item')
        ? " AND LOWER(TRIM(COALESCE(cd.estado_item, 'activo'))) <> 'eliminado'"
        : '';

    $sql = 'SELECT c.id, COALESCE(svc_ref.servicios_tipos_resumen, "") AS servicios_tipos_resumen'
        . ' FROM consultas c'
        . ' LEFT JOIN ('
        . '   SELECT cd.consulta_id,'
        . '          GROUP_CONCAT(DISTINCT LOWER(TRIM(cd.servicio_tipo)) ORDER BY LOWER(TRIM(cd.servicio_tipo)) ASC SEPARATOR ",") AS servicios_tipos_resumen'
        . '   FROM cotizaciones_detalle cd'
        . '   INNER JOIN cotizaciones ct ON ct.id = cd.cotizacion_id'
        . '   WHERE cd.consulta_id IS NOT NULL'
        . '     AND cd.consulta_id > 0'
        . '     AND LOWER(TRIM(ct.estado)) NOT IN ("anulado", "anulada")'
        . $whereDetalleActivoServicios
        . '   GROUP BY cd.consulta_id'
        . ' ) svc_ref ON svc_ref.consulta_id = c.id'
        . ' WHERE c.medico_id = ?'
        . '   AND c.fecha = ?'
        . '   AND LOWER(TRIM(COALESCE(c.estado, ""))) NOT IN ("cancelada", "cancelado", "completada", "completado")';

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        return $conteo;
    }

    $stmt->bind_param('is', $medicoId, $fechaYmd);
    $stmt->execute();
    $res = $stmt->get_result();

    while ($row = $res->fetch_assoc()) {
        $tiposRaw = trim((string)($row['servicios_tipos_resumen'] ?? ''));
        $tipos = [];
        if ($tiposRaw !== '') {
            foreach (explode(',', $tiposRaw) as $t) {
                $norm = consultas_normalizar_servicio_tipo($t);
                if ($norm !== '' && consultas_es_servicio_clinico_panel_medico($norm)) {
                    $tipos[$norm] = true;
                }
            }
        }

        if (empty($tipos)) {
            $tipos['consulta'] = true;
        }

        foreach (array_keys($tipos) as $tipo) {
            if (!array_key_exists($tipo, $conteo)) {
                $conteo[$tipo] = 0;
            }
            $conteo[$tipo]++;
        }
    }

    $stmt->close();
    return $conteo;
}

function consultas_stats_imagenologia_pendientes($conn, $medicoId, $fechaYmd) {
    $medicoId = (int)$medicoId;
    $fechaYmd = trim((string)$fechaYmd);
    $base = [
        'total_pendientes' => 0,
        'pendientes_hoy' => 0,
        'por_tipo' => [
            'ecografia' => 0,
            'rayosx' => 0,
            'tomografia' => 0,
        ],
    ];

    if ($medicoId <= 0) {
        return $base;
    }

    $stmt = $conn->prepare('SELECT LOWER(TRIM(tipo)) AS tipo, LOWER(TRIM(estado)) AS estado, DATE(fecha) AS fecha_orden FROM ordenes_imagen WHERE medico_id = ?');
    if (!$stmt) {
        return $base;
    }

    $stmt->bind_param('i', $medicoId);
    $stmt->execute();
    $res = $stmt->get_result();

    while ($row = $res->fetch_assoc()) {
        $estado = strtolower(trim((string)($row['estado'] ?? '')));
        if ($estado !== 'pendiente') {
            continue;
        }

        $tipo = strtolower(trim((string)($row['tipo'] ?? '')));
        if ($tipo === 'rx' || $tipo === 'rayos_x' || $tipo === 'rayos x') {
            $tipo = 'rayosx';
        }
        if (!isset($base['por_tipo'][$tipo])) {
            continue;
        }

        $base['total_pendientes']++;
        $base['por_tipo'][$tipo]++;

        $fechaOrden = trim((string)($row['fecha_orden'] ?? ''));
        if ($fechaYmd !== '' && $fechaOrden === $fechaYmd) {
            $base['pendientes_hoy']++;
        }
    }

    $stmt->close();
    return $base;
}

function consultas_stats_imagenologia_conciliacion($conn, $medicoId, $fechaYmd) {
    $medicoId = (int)$medicoId;
    $fechaYmd = trim((string)$fechaYmd);
    $out = [
        'pendientes_hoy_total' => 0,
        'vinculadas_consulta_hoy' => 0,
        'sin_consulta_hoy' => 0,
    ];

    if ($medicoId <= 0 || $fechaYmd === '') {
        return $out;
    }

    $sql = 'SELECT oi.consulta_id, c.id AS consulta_hoy_id'
        . ' FROM ordenes_imagen oi'
        . ' LEFT JOIN consultas c ON c.id = oi.consulta_id'
        . '  AND c.medico_id = ?'
        . '  AND c.fecha = ?'
        . ' WHERE oi.medico_id = ?'
        . '   AND DATE(oi.fecha) = ?'
        . '   AND LOWER(TRIM(COALESCE(oi.estado, ""))) = "pendiente"';

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        return $out;
    }

    $stmt->bind_param('isis', $medicoId, $fechaYmd, $medicoId, $fechaYmd);
    $stmt->execute();
    $res = $stmt->get_result();

    while ($row = $res->fetch_assoc()) {
        $out['pendientes_hoy_total']++;
        $tieneConsultaHoy = (int)($row['consulta_hoy_id'] ?? 0) > 0;
        if ($tieneConsultaHoy) {
            $out['vinculadas_consulta_hoy']++;
        } else {
            $out['sin_consulta_hoy']++;
        }
    }

    $stmt->close();
    return $out;
}

$method = $_SERVER['REQUEST_METHOD'];
$sessionUsuario = $_SESSION['usuario'] ?? null;
$sessionMedico = $_SESSION['medico'] ?? null;
$rolSesion = $sessionUsuario['rol'] ?? null;
$medicoSesionId = intval($_SESSION['medico_id'] ?? ($sessionUsuario['medico_id'] ?? ($sessionUsuario['id'] ?? 0)));
$esSesionMedico = ($medicoSesionId > 0) && (
    $rolSesion === 'medico'
    || isset($_SESSION['medico_id'])
    || (is_array($sessionMedico) && intval($sessionMedico['id'] ?? 0) === $medicoSesionId)
);

if (!isset($_SESSION['usuario']) && !isset($_SESSION['medico_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'No autenticado']);
    exit;
}

consultas_require_schema($conn);
consultas_ensure_habilitacion_anticipada_schema($conn);

function columna_existe_local($conn, $tabla, $columna) {
    $stmt = $conn->prepare('SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1');
    if (!$stmt) {
        return false;
    }
    $stmt->bind_param('ss', $tabla, $columna);
    $stmt->execute();
    $res = $stmt->get_result();
    return $res && $res->num_rows > 0;
}

function consultas_medico_existe($conn, $medicoId) {
    $medicoId = (int)$medicoId;
    if ($medicoId <= 0) {
        return false;
    }

    $stmt = $conn->prepare('SELECT 1 FROM medicos WHERE id = ? LIMIT 1');
    if (!$stmt) {
        return false;
    }
    $stmt->bind_param('i', $medicoId);
    $stmt->execute();
    $exists = (bool)$stmt->get_result()->fetch_row();
    $stmt->close();
    return $exists;
}

function consultas_buscar_conflicto_agenda_horario($conn, $medicoId, $fechaYmd, $horaHms) {
    $medicoId = (int)$medicoId;
    $fechaYmd = trim((string)$fechaYmd);
    $horaHms = trim((string)$horaHms);
    if ($medicoId <= 0 || $fechaYmd === '' || $horaHms === '') {
        return null;
    }
    if (!consultas_table_exists($conn, 'agenda_servicios_cotizacion')) {
        return null;
    }
    if (!columna_existe_local($conn, 'agenda_servicios_cotizacion', 'fecha_programada')
        || !columna_existe_local($conn, 'agenda_servicios_cotizacion', 'hora_programada')) {
        return null;
    }

    $hasAgendaMedico = columna_existe_local($conn, 'agenda_servicios_cotizacion', 'medico_id');
    $hasAgendaEstado = columna_existe_local($conn, 'agenda_servicios_cotizacion', 'estado_evento');
    $hasAgendaDetalle = columna_existe_local($conn, 'agenda_servicios_cotizacion', 'cotizacion_detalle_id');
    $hasAgendaServicioId = columna_existe_local($conn, 'agenda_servicios_cotizacion', 'servicio_id');
    $hasAgendaCotizacion = columna_existe_local($conn, 'agenda_servicios_cotizacion', 'cotizacion_id');
    $hasDetalleTable = consultas_table_exists($conn, 'cotizaciones_detalle');
    $hasTarifasTable = consultas_table_exists($conn, 'tarifas');
    $hasDetalleMedico = $hasDetalleTable && columna_existe_local($conn, 'cotizaciones_detalle', 'medico_id');
    $hasDetalleId = $hasDetalleTable && columna_existe_local($conn, 'cotizaciones_detalle', 'id');
    $hasDetalleServicioId = $hasDetalleTable && columna_existe_local($conn, 'cotizaciones_detalle', 'servicio_id');
    $hasTarifaMedico = $hasTarifasTable && columna_existe_local($conn, 'tarifas', 'medico_id');
    $hasTarifaId = $hasTarifasTable && columna_existe_local($conn, 'tarifas', 'id');

    $selectCot = $hasAgendaCotizacion ? 'a.cotizacion_id' : '0 AS cotizacion_id';
    $selectDet = $hasAgendaDetalle ? 'a.cotizacion_detalle_id' : '0 AS cotizacion_detalle_id';
    $selectEstado = $hasAgendaEstado ? 'LOWER(TRIM(COALESCE(a.estado_evento, ""))) AS estado_evento' : '"" AS estado_evento';
    $joinDetalle = ($hasAgendaDetalle && $hasDetalleTable && $hasDetalleId) ? ' LEFT JOIN cotizaciones_detalle cd ON cd.id = a.cotizacion_detalle_id' : '';
    $joinTarifa = ($hasTarifasTable && $hasTarifaId)
        ? ' LEFT JOIN tarifas t ON t.id = COALESCE(' . ($hasDetalleServicioId ? 'cd.servicio_id, ' : '') . ($hasAgendaServicioId ? 'a.servicio_id' : '0') . ')'
        : '';

    $medicoExprParts = [];
    if ($hasAgendaMedico) $medicoExprParts[] = 'a.medico_id';
    if ($hasDetalleMedico) $medicoExprParts[] = 'cd.medico_id';
    if ($hasTarifaMedico) $medicoExprParts[] = 't.medico_id';
    $medicoExpr = empty($medicoExprParts) ? '0' : ('COALESCE(' . implode(', ', $medicoExprParts) . ', 0)');

    $whereEstado = $hasAgendaEstado
        ? ' AND LOWER(TRIM(COALESCE(a.estado_evento, ""))) NOT IN ("cancelado", "no_asistio", "anulada", "completado")'
        : '';

    $sql = 'SELECT a.id, ' . $selectCot . ', ' . $selectDet . ', ' . $selectEstado
        . ' FROM agenda_servicios_cotizacion a'
        . $joinDetalle
        . $joinTarifa
        . ' WHERE ' . $medicoExpr . ' = ?'
        . ' AND a.fecha_programada = ? AND a.hora_programada = ?'
        . $whereEstado
        . ' ORDER BY a.id ASC LIMIT 1';

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        return null;
    }
    $stmt->bind_param('iss', $medicoId, $fechaYmd, $horaHms);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row ?: null;
}

function consultas_calcular_siguiente_correlativo_reprogramacion($conn, $medicoId, $fechaYmd, $consultaIdExcluir = 0) {
    $medicoId = (int)$medicoId;
    $consultaIdExcluir = (int)$consultaIdExcluir;
    $fechaYmd = trim((string)$fechaYmd);
    if ($medicoId <= 0 || $fechaYmd === '') {
        return 0;
    }

    $maxConsultas = 0;
    $stmtC = $conn->prepare('SELECT COALESCE(MAX(COALESCE(correlativo_dia_medico, 0)), 0) AS max_corr FROM consultas WHERE medico_id = ? AND fecha = ? AND id <> ? AND LOWER(TRIM(COALESCE(estado, ""))) NOT IN ("cancelada", "anulada")');
    if ($stmtC) {
        $stmtC->bind_param('isi', $medicoId, $fechaYmd, $consultaIdExcluir);
        $stmtC->execute();
        $rowC = $stmtC->get_result()->fetch_assoc();
        $stmtC->close();
        $maxConsultas = (int)($rowC['max_corr'] ?? 0);
    }

    $maxAgenda = 0;
    $hasAgenda = consultas_table_exists($conn, 'agenda_servicios_cotizacion');
    $hasRas = consultas_table_exists($conn, 'recordatorios_agenda_servicios');
    $hasRasTurnoOriginal = $hasRas && columna_existe_local($conn, 'recordatorios_agenda_servicios', 'turno_original');
    $hasRasTurnoVigente = $hasRas && columna_existe_local($conn, 'recordatorios_agenda_servicios', 'turno_vigente');
    if ($hasAgenda) {
        if ($hasRasTurnoOriginal && $hasRasTurnoVigente) {
            $exprAgenda = 'COALESCE(NULLIF(ras.turno_vigente, 0), NULLIF(ras.turno_original, 0), 0)';
        } elseif ($hasRasTurnoOriginal) {
            $exprAgenda = 'COALESCE(NULLIF(ras.turno_original, 0), 0)';
        } else {
            $exprAgenda = '0';
        }

        $sqlA = 'SELECT COALESCE(MAX(' . $exprAgenda . '), 0) AS max_corr'
            . ' FROM agenda_servicios_cotizacion a'
            . ' LEFT JOIN cotizaciones_detalle cd ON cd.id = a.cotizacion_detalle_id'
            . ' LEFT JOIN tarifas t ON t.id = COALESCE(cd.servicio_id, a.servicio_id)'
            . ($hasRas ? ' LEFT JOIN recordatorios_agenda_servicios ras ON ras.cotizacion_id = a.cotizacion_id' : '')
            . ' WHERE COALESCE(a.medico_id, cd.medico_id, t.medico_id, 0) = ?'
            . '   AND a.fecha_programada = ?'
            . '   AND a.estado_evento IN ("pendiente", "confirmado")';
        $stmtA = $conn->prepare($sqlA);
        if ($stmtA) {
            $stmtA->bind_param('is', $medicoId, $fechaYmd);
            $stmtA->execute();
            $rowA = $stmtA->get_result()->fetch_assoc();
            $stmtA->close();
            $maxAgenda = (int)($rowA['max_corr'] ?? 0);
        }
    }

    return max($maxConsultas, $maxAgenda) + 1;
}

function resolver_consulta_id_por_cotizacion($conn, $cotizacionId) {
    $cotizacionId = intval($cotizacionId);
    if ($cotizacionId <= 0) {
        return 0;
    }

    if (columna_existe_local($conn, 'cotizaciones_detalle', 'consulta_id')) {
        $sqlDetalle = 'SELECT consulta_id FROM cotizaciones_detalle WHERE cotizacion_id = ? AND consulta_id IS NOT NULL AND consulta_id > 0 ORDER BY id ASC LIMIT 1';
        $stmtDetalle = $conn->prepare($sqlDetalle);
        if ($stmtDetalle) {
            $stmtDetalle->bind_param('i', $cotizacionId);
            $stmtDetalle->execute();
            $rowDetalle = $stmtDetalle->get_result()->fetch_assoc();
            $stmtDetalle->close();
            $consultaId = intval($rowDetalle['consulta_id'] ?? 0);
            if ($consultaId > 0) {
                return $consultaId;
            }
        }
    }

    $stmtCot = $conn->prepare('SELECT observaciones FROM cotizaciones WHERE id = ? LIMIT 1');
    $observaciones = '';
    if ($stmtCot) {
        $stmtCot->bind_param('i', $cotizacionId);
        $stmtCot->execute();
        $rowCot = $stmtCot->get_result()->fetch_assoc();
        $stmtCot->close();
        $observaciones = trim((string)($rowCot['observaciones'] ?? ''));
        if ($observaciones !== '' && preg_match('/consulta\s*#\s*(\d+)/i', $observaciones, $m)) {
            $consultaId = intval($m[1] ?? 0);
            if ($consultaId > 0) {
                return $consultaId;
            }
        }
    }

    // Fallback para cotizaciones antiguas: intentar deducir por paciente + médico + fecha.
    $pacienteId = 0;
    $fechaCot = '';
    $stmtCotMeta = $conn->prepare('SELECT paciente_id, fecha FROM cotizaciones WHERE id = ? LIMIT 1');
    if ($stmtCotMeta) {
        $stmtCotMeta->bind_param('i', $cotizacionId);
        $stmtCotMeta->execute();
        $rowMeta = $stmtCotMeta->get_result()->fetch_assoc();
        $stmtCotMeta->close();
        $pacienteId = intval($rowMeta['paciente_id'] ?? 0);
        $fechaCot = trim((string)($rowMeta['fecha'] ?? ''));
    }

    if ($pacienteId > 0) {
        $medicoId = 0;
        if (columna_existe_local($conn, 'cotizaciones_detalle', 'medico_id')) {
            $stmtMed = $conn->prepare('SELECT medico_id FROM cotizaciones_detalle WHERE cotizacion_id = ? AND medico_id IS NOT NULL AND medico_id > 0 ORDER BY id ASC LIMIT 1');
            if ($stmtMed) {
                $stmtMed->bind_param('i', $cotizacionId);
                $stmtMed->execute();
                $rowMed = $stmtMed->get_result()->fetch_assoc();
                $stmtMed->close();
                $medicoId = intval($rowMed['medico_id'] ?? 0);
            }
        }

        $fechaSolo = '';
        if ($fechaCot !== '') {
            $fechaSolo = date('Y-m-d', strtotime($fechaCot));
        }

        if ($medicoId > 0 && $fechaSolo !== '') {
            $stmtGuess = $conn->prepare('SELECT id FROM consultas WHERE paciente_id = ? AND medico_id = ? AND fecha = ? ORDER BY id DESC LIMIT 1');
            if ($stmtGuess) {
                $stmtGuess->bind_param('iis', $pacienteId, $medicoId, $fechaSolo);
                $stmtGuess->execute();
                $rowGuess = $stmtGuess->get_result()->fetch_assoc();
                $stmtGuess->close();
                $consultaId = intval($rowGuess['id'] ?? 0);
                if ($consultaId > 0) {
                    return $consultaId;
                }
            }
        }

        if ($medicoId > 0) {
            $stmtGuess = $conn->prepare('SELECT id FROM consultas WHERE paciente_id = ? AND medico_id = ? ORDER BY id DESC LIMIT 1');
            if ($stmtGuess) {
                $stmtGuess->bind_param('ii', $pacienteId, $medicoId);
                $stmtGuess->execute();
                $rowGuess = $stmtGuess->get_result()->fetch_assoc();
                $stmtGuess->close();
                $consultaId = intval($rowGuess['id'] ?? 0);
                if ($consultaId > 0) {
                    return $consultaId;
                }
            }
        }

        if ($fechaSolo !== '') {
            $stmtGuess = $conn->prepare('SELECT id FROM consultas WHERE paciente_id = ? AND fecha = ? ORDER BY id DESC LIMIT 1');
            if ($stmtGuess) {
                $stmtGuess->bind_param('is', $pacienteId, $fechaSolo);
                $stmtGuess->execute();
                $rowGuess = $stmtGuess->get_result()->fetch_assoc();
                $stmtGuess->close();
                $consultaId = intval($rowGuess['id'] ?? 0);
                if ($consultaId > 0) {
                    return $consultaId;
                }
            }
        }
    }

    return 0;
}

function consultas_disponibilidad_cache_dir() {
    return __DIR__ . '/tmp/api-cache';
}

function consultas_disponibilidad_cache_file($cacheKey) {
    return consultas_disponibilidad_cache_dir() . '/consultas_disp_' . $cacheKey . '.json';
}

function consultas_disponibilidad_cache_read($cacheKey, $ttlSeconds) {
    $file = consultas_disponibilidad_cache_file($cacheKey);
    if (!is_file($file)) {
        return null;
    }

    $mtime = @filemtime($file);
    if ($mtime === false || (time() - $mtime) > $ttlSeconds) {
        return null;
    }

    $content = @file_get_contents($file);
    if (!is_string($content) || $content === '') {
        return null;
    }

    $payload = json_decode($content, true);
    return is_array($payload) ? $payload : null;
}

function consultas_disponibilidad_cache_write($cacheKey, $payload) {
    $dir = consultas_disponibilidad_cache_dir();
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }

    $file = consultas_disponibilidad_cache_file($cacheKey);
    @file_put_contents($file, json_encode($payload));
}

function consultas_disponibilidad_cache_clear_all() {
    $pattern = consultas_disponibilidad_cache_dir() . '/consultas_disp_*.json';
    $files = glob($pattern);
    if (!is_array($files)) {
        return;
    }

    foreach ($files as $file) {
        @unlink($file);
    }
}

if ($method !== 'GET') {
    consultas_disponibilidad_cache_clear_all();
}

function resolver_cotizacion_id_por_consulta($conn, $consultaId) {
    $consultaId = intval($consultaId);
    if ($consultaId <= 0) {
        return 0;
    }

    if (columna_existe_local($conn, 'cotizaciones_detalle', 'consulta_id')) {
        $sql = "SELECT cd.cotizacion_id
                FROM cotizaciones_detalle cd
                INNER JOIN cotizaciones c ON c.id = cd.cotizacion_id
            WHERE cd.consulta_id = ? AND LOWER(TRIM(cd.servicio_tipo)) = 'consulta' AND LOWER(TRIM(c.estado)) <> 'anulada'
            ORDER BY cd.id DESC LIMIT 1";
        $stmt = $conn->prepare($sql);
        if ($stmt) {
            $stmt->bind_param('i', $consultaId);
            $stmt->execute();
            $row = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            $cotizacionId = intval($row['cotizacion_id'] ?? 0);
            if ($cotizacionId > 0) {
                return $cotizacionId;
            }
        }
    }

    $likeConsulta = '%consulta #' . $consultaId . '%';
    $stmt = $conn->prepare("SELECT id FROM cotizaciones WHERE LOWER(TRIM(estado)) <> 'anulada' AND LOWER(observaciones) LIKE ? ORDER BY id DESC LIMIT 1");
    if ($stmt) {
        $stmt->bind_param('s', $likeConsulta);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return intval($row['id'] ?? 0);
    }

    return 0;
}

function obtener_estado_cotizacion_por_id($conn, $cotizacionId) {
    $cotizacionId = intval($cotizacionId);
    if ($cotizacionId <= 0) {
        return '';
    }

    $stmt = $conn->prepare('SELECT estado FROM cotizaciones WHERE id = ? LIMIT 1');
    if (!$stmt) {
        return '';
    }

    $stmt->bind_param('i', $cotizacionId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    return trim((string)($row['estado'] ?? ''));
}

function obtener_tarifa_consulta_para_medico($conn, $medicoId) {
    $medicoId = intval($medicoId);
    if ($medicoId <= 0) {
        return null;
    }

    $stmt = $conn->prepare('SELECT id, descripcion, precio_particular FROM tarifas WHERE servicio_tipo = "consulta" AND activo = 1 AND medico_id = ? ORDER BY id DESC LIMIT 1');
    if ($stmt) {
        $stmt->bind_param('i', $medicoId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if ($row) {
            return $row;
        }
    }

    $stmtFallback = $conn->prepare('SELECT id, descripcion, precio_particular FROM tarifas WHERE servicio_tipo = "consulta" AND activo = 1 AND (medico_id IS NULL OR medico_id = 0) ORDER BY id DESC LIMIT 1');
    if ($stmtFallback) {
        $stmtFallback->execute();
        $rowFallback = $stmtFallback->get_result()->fetch_assoc();
        $stmtFallback->close();
        if ($rowFallback) {
            return $rowFallback;
        }
    }

    return null;
}

function sincronizar_cotizacion_por_consulta($conn, $consultaId, $medicoId, $cotizacionIdPreferida = 0) {
    $consultaId = intval($consultaId);
    $medicoId = intval($medicoId);
    $cotizacionId = intval($cotizacionIdPreferida);

    if ($consultaId <= 0 || $medicoId <= 0) {
        return ['ok' => false, 'reason' => 'datos_invalidos'];
    }

    if ($cotizacionId <= 0) {
        $cotizacionId = resolver_cotizacion_id_por_consulta($conn, $consultaId);
    }
    if ($cotizacionId <= 0) {
        return ['ok' => false, 'reason' => 'cotizacion_no_encontrada'];
    }

    $tarifa = obtener_tarifa_consulta_para_medico($conn, $medicoId);
    if (!$tarifa) {
        return ['ok' => false, 'reason' => 'tarifa_no_encontrada'];
    }

    $precio = round((float)($tarifa['precio_particular'] ?? 0), 2);
    if ($precio <= 0) {
        return ['ok' => false, 'reason' => 'tarifa_precio_invalido'];
    }

    $detalleId = 0;
    if (columna_existe_local($conn, 'cotizaciones_detalle', 'consulta_id')) {
        $stmtDet = $conn->prepare("SELECT id FROM cotizaciones_detalle WHERE cotizacion_id = ? AND consulta_id = ? AND LOWER(TRIM(servicio_tipo)) = 'consulta' ORDER BY id DESC LIMIT 1");
        if ($stmtDet) {
            $stmtDet->bind_param('ii', $cotizacionId, $consultaId);
            $stmtDet->execute();
            $rowDet = $stmtDet->get_result()->fetch_assoc();
            $stmtDet->close();
            $detalleId = intval($rowDet['id'] ?? 0);
        }
    }

    if ($detalleId <= 0) {
        $stmtDet = $conn->prepare("SELECT id FROM cotizaciones_detalle WHERE cotizacion_id = ? AND LOWER(TRIM(servicio_tipo)) = 'consulta' ORDER BY id DESC LIMIT 1");
        if ($stmtDet) {
            $stmtDet->bind_param('i', $cotizacionId);
            $stmtDet->execute();
            $rowDet = $stmtDet->get_result()->fetch_assoc();
            $stmtDet->close();
            $detalleId = intval($rowDet['id'] ?? 0);
        }
    }

    if ($detalleId <= 0) {
        return ['ok' => false, 'reason' => 'detalle_consulta_no_encontrado'];
    }

    $descripcion = trim((string)($tarifa['descripcion'] ?? 'Consulta médica'));
    if ($descripcion === '') {
        $descripcion = 'Consulta médica';
    }

    $tarifaId = intval($tarifa['id'] ?? 0);
    $sets = [
        'servicio_id = ?',
        'descripcion = ?',
        'precio_unitario = ?',
        'subtotal = ?',
    ];
    $types = 'isdd';
    $params = [$tarifaId, $descripcion, $precio, $precio];

    if (columna_existe_local($conn, 'cotizaciones_detalle', 'medico_id')) {
        $sets[] = 'medico_id = ?';
        $types .= 'i';
        $params[] = $medicoId;
    }

    if (columna_existe_local($conn, 'cotizaciones_detalle', 'consulta_id')) {
        $sets[] = 'consulta_id = ?';
        $types .= 'i';
        $params[] = $consultaId;
    }

    $sqlUpdDet = 'UPDATE cotizaciones_detalle SET ' . implode(', ', $sets) . ' WHERE id = ?';
    $types .= 'i';
    $params[] = $detalleId;

    $stmtUpdDet = $conn->prepare($sqlUpdDet);
    if (!$stmtUpdDet) {
        return ['ok' => false, 'reason' => 'no_prepara_update_detalle'];
    }
    $stmtUpdDet->bind_param($types, ...$params);
    $okDet = $stmtUpdDet->execute();
    $stmtUpdDet->close();
    if (!$okDet) {
        return ['ok' => false, 'reason' => 'error_update_detalle'];
    }

    $whereItemsActivos = '';
    if (columna_existe_local($conn, 'cotizaciones_detalle', 'estado_item')) {
        $whereItemsActivos = " AND estado_item <> 'eliminado'";
    }
    $sqlTotal = 'SELECT COALESCE(SUM(subtotal), 0) AS total FROM cotizaciones_detalle WHERE cotizacion_id = ?' . $whereItemsActivos;
    $stmtTotal = $conn->prepare($sqlTotal);
    if (!$stmtTotal) {
        return ['ok' => false, 'reason' => 'no_prepara_total'];
    }
    $stmtTotal->bind_param('i', $cotizacionId);
    $stmtTotal->execute();
    $rowTotal = $stmtTotal->get_result()->fetch_assoc();
    $stmtTotal->close();
    $nuevoTotal = round((float)($rowTotal['total'] ?? 0), 2);

    $okCot = false;
    $nuevoSaldo = null;
    $nuevoEstado = null;

    $hasTotalPagado = columna_existe_local($conn, 'cotizaciones', 'total_pagado');
    $hasSaldo = columna_existe_local($conn, 'cotizaciones', 'saldo_pendiente');
    $hasEstado = columna_existe_local($conn, 'cotizaciones', 'estado');

    if ($hasTotalPagado && $hasSaldo) {
        $stmtPag = $conn->prepare('SELECT COALESCE(total_pagado, 0) AS total_pagado, COALESCE(estado, "pendiente") AS estado FROM cotizaciones WHERE id = ? LIMIT 1');
        if (!$stmtPag) {
            return ['ok' => false, 'reason' => 'no_prepara_select_pagado'];
        }
        $stmtPag->bind_param('i', $cotizacionId);
        $stmtPag->execute();
        $rowPag = $stmtPag->get_result()->fetch_assoc();
        $stmtPag->close();

        $pagado = round((float)($rowPag['total_pagado'] ?? 0), 2);
        $nuevoSaldo = max(0, round($nuevoTotal - $pagado, 2));
        $nuevoEstado = $nuevoSaldo <= 0 ? 'pagado' : ($pagado > 0 ? 'parcial' : 'pendiente');

        if ($hasEstado) {
            $stmtUpdCot = $conn->prepare('UPDATE cotizaciones SET total = ?, saldo_pendiente = ?, estado = ? WHERE id = ?');
            if (!$stmtUpdCot) {
                return ['ok' => false, 'reason' => 'no_prepara_update_cotizacion'];
            }
            $stmtUpdCot->bind_param('ddsi', $nuevoTotal, $nuevoSaldo, $nuevoEstado, $cotizacionId);
        } else {
            $stmtUpdCot = $conn->prepare('UPDATE cotizaciones SET total = ?, saldo_pendiente = ? WHERE id = ?');
            if (!$stmtUpdCot) {
                return ['ok' => false, 'reason' => 'no_prepara_update_cotizacion'];
            }
            $stmtUpdCot->bind_param('ddi', $nuevoTotal, $nuevoSaldo, $cotizacionId);
        }
        $okCot = $stmtUpdCot->execute();
        $stmtUpdCot->close();
    } else {
        $stmtUpdCot = $conn->prepare('UPDATE cotizaciones SET total = ? WHERE id = ?');
        if (!$stmtUpdCot) {
            return ['ok' => false, 'reason' => 'no_prepara_update_cotizacion'];
        }
        $stmtUpdCot->bind_param('di', $nuevoTotal, $cotizacionId);
        $okCot = $stmtUpdCot->execute();
        $stmtUpdCot->close();
    }

    if (!$okCot) {
        return ['ok' => false, 'reason' => 'error_update_cotizacion'];
    }

    return [
        'ok' => true,
        'cotizacion_id' => $cotizacionId,
        'detalle_id' => $detalleId,
        'precio_consulta' => $precio,
        'total_cotizacion' => $nuevoTotal,
        'saldo_pendiente' => $nuevoSaldo,
        'estado_cotizacion' => $nuevoEstado,
    ];
}

function sincronizar_hc_proxima_cita_por_consulta($conn, $consultaId, $medicoId, $fecha, $hora, $tipoConsulta = null, $actor = 'sistema') {
    $consultaId = intval($consultaId);
    $medicoId = intval($medicoId);
    $fecha = trim((string)$fecha);
    $hora = trim((string)$hora);
    $tipoConsulta = trim((string)($tipoConsulta ?? 'programada'));

    if ($consultaId <= 0 || $medicoId <= 0 || $fecha === '' || $hora === '') {
        return ['ok' => false, 'reason' => 'datos_invalidos'];
    }

    $patronConsultaId = '%"consulta_id":' . $consultaId . '%';
    $stmt = $conn->prepare('SELECT id, datos FROM historia_clinica WHERE datos LIKE ?');
    if (!$stmt) {
        return ['ok' => false, 'reason' => 'prepare_error'];
    }
    $stmt->bind_param('s', $patronConsultaId);
    $stmt->execute();
    $res = $stmt->get_result();

    $updated = 0;
    while ($row = $res->fetch_assoc()) {
        $hcId = intval($row['id'] ?? 0);
        $datos = json_decode((string)($row['datos'] ?? ''), true);
        if (!is_array($datos) || !isset($datos['proxima_cita']) || !is_array($datos['proxima_cita'])) {
            continue;
        }

        $proxima = $datos['proxima_cita'];
        if (intval($proxima['consulta_id'] ?? 0) !== $consultaId) {
            continue;
        }

        $fechaAnterior = trim((string)($proxima['fecha'] ?? ''));
        $horaAnterior = trim((string)($proxima['hora'] ?? ''));
        $historial = [];
        if (isset($proxima['historial']) && is_array($proxima['historial'])) {
            $historial = $proxima['historial'];
        }
        $historial[] = [
            'accion' => 'reprogramada_desde_agenda',
            'fecha_evento' => date('Y-m-d H:i:s'),
            'actor' => $actor,
            'consulta_id' => $consultaId,
            'antes' => [
                'fecha' => $fechaAnterior,
                'hora' => $horaAnterior,
            ],
            'despues' => [
                'fecha' => $fecha,
                'hora' => $hora,
            ],
        ];
        if (count($historial) > 20) {
            $historial = array_slice($historial, -20);
        }

        $proxima['medico_id'] = $medicoId;
        $proxima['fecha'] = $fecha;
        $proxima['hora'] = $hora;
        $proxima['tipo_consulta'] = $tipoConsulta !== '' ? $tipoConsulta : 'programada';
        $proxima['actualizada_desde_agenda_en'] = date('Y-m-d H:i:s');
        $proxima['programar'] = true;
        $proxima['historial'] = $historial;

        $datos['proxima_cita'] = $proxima;
        $jsonActualizado = json_encode($datos, JSON_UNESCAPED_UNICODE);
        if (!is_string($jsonActualizado) || $jsonActualizado === '') {
            continue;
        }

        $stmtUpd = $conn->prepare('UPDATE historia_clinica SET datos = ?, fecha_registro = CURRENT_TIMESTAMP WHERE id = ? LIMIT 1');
        if (!$stmtUpd) {
            continue;
        }
        $stmtUpd->bind_param('si', $jsonActualizado, $hcId);
        $okUpd = $stmtUpd->execute();
        $stmtUpd->close();
        if ($okUpd) {
            $updated++;
        }
    }
    $stmt->close();

    return [
        'ok' => true,
        'updated_hc' => $updated,
    ];
}

switch ($method) {
    case 'GET':
        // Listar consultas (por médico, paciente o todas)
        $consulta_id = isset($_GET['consulta_id']) ? intval($_GET['consulta_id']) : null;
        $cotizacion_id = isset($_GET['cotizacion_id']) ? intval($_GET['cotizacion_id']) : null;
        if ((!$consulta_id || $consulta_id <= 0) && $cotizacion_id > 0) {
            $consulta_id = resolver_consulta_id_por_cotizacion($conn, $cotizacion_id);
        }
        $medico_id = isset($_GET['medico_id']) ? intval($_GET['medico_id']) : null;
        $paciente_id = isset($_GET['paciente_id']) ? intval($_GET['paciente_id']) : null;
        $page = isset($_GET['page']) ? intval($_GET['page']) : 0;
        $per_page = isset($_GET['per_page']) ? intval($_GET['per_page']) : 0;
        $search = isset($_GET['search']) ? trim($_GET['search']) : '';
        $fecha_desde = isset($_GET['fecha_desde']) ? trim($_GET['fecha_desde']) : '';
        $fecha_hasta = isset($_GET['fecha_hasta']) ? trim($_GET['fecha_hasta']) : '';
        $solo_activas = isset($_GET['solo_activas'])
            ? in_array(strtolower(trim((string)$_GET['solo_activas'])), ['1', 'true', 'si', 'sí', 'yes'], true)
            : false;
        $incluir_completadas_sin_triaje = isset($_GET['incluir_completadas_sin_triaje'])
            ? in_array(strtolower(trim((string)$_GET['incluir_completadas_sin_triaje'])), ['1', 'true', 'si', 'sí', 'yes'], true)
            : false;
        $vista = strtolower(trim((string)($_GET['vista'] ?? '')));
        $usar_paginacion = ($page > 0 && $per_page > 0);
        if ($usar_paginacion && $per_page > 100) {
            $per_page = 100;
        }

        if ($esSesionMedico) {
            if ($medico_id && $medico_id !== $medicoSesionId) {
                http_response_code(403);
                echo json_encode(['success' => false, 'error' => 'No autorizado para ver consultas de otro médico']);
                exit;
            }
            $medico_id = $medicoSesionId;
            $paciente_id = null;
        }

        if ($vista === 'anticipada') {
            $cotizacionIdsRaw = trim((string)($_GET['cotizacion_ids'] ?? ''));
            $cotizacionIds = array_values(array_unique(array_filter(array_map('intval', preg_split('/[^0-9]+/', $cotizacionIdsRaw)), function ($id) {
                return $id > 0;
            })));
            if (count($cotizacionIds) > 200) {
                $cotizacionIds = array_slice($cotizacionIds, 0, 200);
            }

            $mapCotizacionConsulta = [];
            $consultaIds = [];
            $cotEstadoMap = consultas_cotizacion_estado_map($conn, $cotizacionIds);
            $mapConsultaExplicita = consultas_cotizacion_consulta_explicita_map($conn, $cotizacionIds);
            foreach ($cotizacionIds as $cotId) {
                $consultaRef = (int)($mapConsultaExplicita[(int)$cotId] ?? 0);
                $mapCotizacionConsulta[$cotId] = $consultaRef > 0 ? (int)$consultaRef : 0;
                if ($consultaRef > 0) {
                    $consultaIds[] = (int)$consultaRef;
                }
            }

            $consultaIds = array_values(array_unique($consultaIds));
            if ($esSesionMedico && !empty($consultaIds)) {
                $ph = implode(',', array_fill(0, count($consultaIds), '?'));
                $typesOwn = str_repeat('i', count($consultaIds)) . 'i';
                $paramsOwn = $consultaIds;
                $paramsOwn[] = $medicoSesionId;
                $sqlOwn = "SELECT id FROM consultas WHERE id IN ({$ph}) AND medico_id = ?";
                $stmtOwn = $conn->prepare($sqlOwn);
                if ($stmtOwn) {
                    $stmtOwn->bind_param($typesOwn, ...$paramsOwn);
                    $stmtOwn->execute();
                    $resOwn = $stmtOwn->get_result();
                    $permitidas = [];
                    while ($rowOwn = $resOwn->fetch_assoc()) {
                        $permitidas[] = (int)($rowOwn['id'] ?? 0);
                    }
                    $stmtOwn->close();
                    $consultaIds = array_values(array_unique(array_filter($permitidas, function ($id) {
                        return $id > 0;
                    })));
                }
            }

            foreach ($cotizacionIds as $cotId) {
                $consultaRef = (int)($mapCotizacionConsulta[$cotId] ?? 0);
                $estadoCot = $cotEstadoMap[(int)$cotId] ?? '';
                if ($consultaRef > 0) {
                    consultas_regularizar_habilitacion_por_pago($conn, $consultaRef, $estadoCot);
                }
            }

            $habByConsulta = consultas_resolver_habilitaciones_por_consulta_ids($conn, $consultaIds);
            $estados = [];
            foreach ($cotizacionIds as $cotId) {
                $consultaRef = (int)($mapCotizacionConsulta[$cotId] ?? 0);
                $estadoItem = consultas_habilitacion_estado_default($consultaRef, (int)$cotId);
                $estadoCot = $cotEstadoMap[(int)$cotId] ?? '';

                if ($consultaRef > 0 && isset($habByConsulta[$consultaRef])) {
                    $estadoItem = array_merge($estadoItem, $habByConsulta[$consultaRef]);
                    $estadoItem['cotizacion_id'] = (int)$cotId;

                    $historial = (int)($estadoItem['historial_count'] ?? 0);
                    if (consultas_es_cotizacion_pagada($estadoCot) && $historial > 0) {
                        $estadoItem['habilitacion_anticipada_activa'] = 0;
                        $estadoItem['estado_resumen'] = 'regularizado';
                    }
                }
                $estados[(string)$cotId] = $estadoItem;
            }

            echo json_encode([
                'success' => true,
                'estados' => $estados,
                'puede_autorizar' => consultas_es_rol_autorizador_anticipado($rolSesion),
            ]);
            break;
        }

        $from = ' FROM consultas LEFT JOIN pacientes ON consultas.paciente_id = pacientes.id LEFT JOIN medicos ON consultas.medico_id = medicos.id';
        $where = [];
        $params = [];
        $types = '';

        if ($consulta_id) {
            $where[] = 'consultas.id = ?';
            $params[] = $consulta_id;
            $types .= 'i';
        }

        if ($medico_id) {
            $where[] = 'consultas.medico_id = ?';
            $params[] = $medico_id;
            $types .= 'i';
        } elseif ($paciente_id) {
            $where[] = 'consultas.paciente_id = ?';
            $params[] = $paciente_id;
            $types .= 'i';
        }

        if ($search !== '') {
            $where[] = '(pacientes.nombre LIKE ? OR pacientes.apellido LIKE ? OR pacientes.historia_clinica LIKE ? OR pacientes.dni LIKE ? OR medicos.nombre LIKE ? OR medicos.apellido LIKE ? OR medicos.especialidad LIKE ? OR consultas.estado LIKE ? OR consultas.tipo_consulta LIKE ? OR CAST(consultas.id AS CHAR) LIKE ?)';
            $searchLike = '%' . $search . '%';
            $params[] = $searchLike;
            $params[] = $searchLike;
            $params[] = $searchLike;
            $params[] = $searchLike;
            $params[] = $searchLike;
            $params[] = $searchLike;
            $params[] = $searchLike;
            $params[] = $searchLike;
            $params[] = $searchLike;
            $params[] = $searchLike;
            $types .= 'ssssssssss';
        }

        if ($fecha_desde !== '') {
            $where[] = 'consultas.fecha >= ?';
            $params[] = $fecha_desde;
            $types .= 's';
        }

        if ($fecha_hasta !== '') {
            $where[] = 'consultas.fecha <= ?';
            $params[] = $fecha_hasta;
            $types .= 's';
        }

        // Vista ligera para HC: evita stats y joins/subconsultas pesadas cuando
        // solo se necesita el contexto de una consulta puntual.
        if ($vista === 'hc_fast' && $consulta_id && $consulta_id > 0) {
            $sqlHcFast = 'SELECT consultas.*, '
                . 'pacientes.nombre AS paciente_nombre, pacientes.apellido AS paciente_apellido, pacientes.historia_clinica, pacientes.dni, '
                . 'medicos.nombre AS medico_nombre, medicos.apellido AS medico_apellido, medicos.especialidad AS medico_especialidad, '
                . 'medicos.cmp AS medico_cmp, medicos.rne AS medico_rne, medicos.firma AS medico_firma, '
                . 'medicos.tipo_profesional AS medico_tipo_profesional, medicos.abreviatura_profesional AS medico_abreviatura_profesional, '
                . 'medicos.colegio_sigla AS medico_colegio_sigla, medicos.nro_colegiatura AS medico_nro_colegiatura '
                . 'FROM consultas '
                . 'LEFT JOIN pacientes ON consultas.paciente_id = pacientes.id '
                . 'LEFT JOIN medicos ON consultas.medico_id = medicos.id '
                . 'WHERE consultas.id = ?';

            $typesHcFast = 'i';
            $paramsHcFast = [$consulta_id];

            if ($esSesionMedico && $medicoSesionId > 0) {
                $sqlHcFast .= ' AND consultas.medico_id = ?';
                $typesHcFast .= 'i';
                $paramsHcFast[] = $medicoSesionId;
            }

            $sqlHcFast .= ' LIMIT 1';

            $stmtHcFast = $conn->prepare($sqlHcFast);
            if (!$stmtHcFast) {
                http_response_code(500);
                echo json_encode(['success' => false, 'error' => 'Error al preparar consulta rápida']);
                exit;
            }

            $stmtHcFast->bind_param($typesHcFast, ...$paramsHcFast);
            $stmtHcFast->execute();
            $rowHcFast = $stmtHcFast->get_result()->fetch_assoc();
            $stmtHcFast->close();

            $rowsHcFast = $rowHcFast ? [$rowHcFast] : [];
            consultas_enriquecer_correlativo_diario($conn, $rowsHcFast);
            $rowHcFast = !empty($rowsHcFast) ? $rowsHcFast[0] : null;

            echo json_encode([
                'success' => true,
                'consultas' => $rowHcFast ? [$rowHcFast] : [],
                'stats' => [
                    'total' => $rowHcFast ? 1 : 0,
                    'pendientes' => 0,
                    'emergencias' => 0,
                ],
            ]);
            exit;
        }

        if ($solo_activas) {
            if ($incluir_completadas_sin_triaje) {
                // En panel de triaje mostrar también consultas completadas para que no desaparezcan tras guardar.
                $where[] = "LOWER(TRIM(COALESCE(consultas.estado, ''))) <> 'cancelada'";
            } else {
                $where[] = "LOWER(TRIM(COALESCE(consultas.estado, ''))) NOT IN ('cancelada', 'completada')";
            }
        }

        // Vista optimizada para calendario de disponibilidad: evita JOINs pesados
        // y retorna únicamente campos necesarios para cálculo de cupos.
        if ($vista === 'disponibilidad') {
            $cacheBypass = isset($_GET['no_cache']) && in_array(strtolower(trim((string)$_GET['no_cache'])), ['1', 'true', 'yes', 'si', 'sí'], true);
            $cacheTtlSeconds = 45;
            $cacheFingerprint = [
                'consulta_id' => (int)$consulta_id,
                'medico_id' => (int)$medico_id,
                'paciente_id' => (int)$paciente_id,
                'solo_activas' => (int)$solo_activas,
                'incluir_completadas_sin_triaje' => (int)$incluir_completadas_sin_triaje,
                'fecha_desde' => $fecha_desde,
                'fecha_hasta' => $fecha_hasta,
                'page' => (int)$page,
                'per_page' => (int)$per_page,
                'sesion_medico' => (int)$esSesionMedico,
                'medico_sesion_id' => (int)$medicoSesionId,
            ];
            $cacheKey = sha1(json_encode($cacheFingerprint));

            if (!$cacheBypass) {
                $cached = consultas_disponibilidad_cache_read($cacheKey, $cacheTtlSeconds);
                if (is_array($cached)) {
                    echo json_encode($cached);
                    exit;
                }
            }

            $whereSqlSimple = count($where) ? (' WHERE ' . implode(' AND ', $where)) : '';
            $sqlSimple = 'SELECT consultas.id, consultas.medico_id, consultas.fecha, consultas.hora, consultas.estado FROM consultas'
                . $whereSqlSimple
                . ' ORDER BY consultas.fecha DESC, consultas.hora DESC';

            if ($usar_paginacion) {
                $offset = ($page - 1) * $per_page;
                $sqlSimple .= ' LIMIT ? OFFSET ?';
                $paramsSimple = $params;
                $paramsSimple[] = $per_page;
                $paramsSimple[] = $offset;
                $typesSimple = $types . 'ii';
            } else {
                $paramsSimple = $params;
                $typesSimple = $types;
            }

            $stmtSimple = $conn->prepare($sqlSimple);
            if ($typesSimple) {
                $stmtSimple->bind_param($typesSimple, ...$paramsSimple);
            }
            $stmtSimple->execute();
            $resSimple = $stmtSimple->get_result();
            $rowsSimple = [];
            while ($rowSimple = $resSimple->fetch_assoc()) {
                $rowsSimple[] = $rowSimple;
            }
            $stmtSimple->close();

            consultas_enriquecer_correlativo_diario($conn, $rowsSimple);

            $totalSimple = 0;
            if ($usar_paginacion) {
                $sqlCountSimple = 'SELECT COUNT(*) AS total FROM consultas' . $whereSqlSimple;
                $stmtCountSimple = $conn->prepare($sqlCountSimple);
                if ($types) {
                    $stmtCountSimple->bind_param($types, ...$params);
                }
                $stmtCountSimple->execute();
                $countRowSimple = $stmtCountSimple->get_result()->fetch_assoc();
                $stmtCountSimple->close();
                $totalSimple = intval($countRowSimple['total'] ?? 0);
            } else {
                $totalSimple = count($rowsSimple);
            }

            $payload = [
                'success' => true,
                'consultas' => $rowsSimple,
                'total' => $totalSimple,
                'pendientes' => null,
                'emergencias' => null,
                'page' => $usar_paginacion ? $page : null,
                'per_page' => $usar_paginacion ? $per_page : null,
                'total_pages' => $usar_paginacion && $per_page > 0 ? ceil($totalSimple / $per_page) : null,
            ];

            if (!$cacheBypass) {
                consultas_disponibilidad_cache_write($cacheKey, $payload);
            }

            echo json_encode($payload);
            exit;
        }

        // Si la consulta está vinculada a agenda de contrato, solo se muestra al médico
        // cuando el evento ya fue atendido/espontáneo para evitar visibilidad anticipada.
        if ($esSesionMedico && columna_existe_local($conn, 'agenda_contrato', 'consulta_id')) {
            $where[] = "(NOT EXISTS (SELECT 1 FROM agenda_contrato agp WHERE agp.consulta_id = consultas.id) OR EXISTS (SELECT 1 FROM agenda_contrato aga WHERE aga.consulta_id = consultas.id AND LOWER(TRIM(COALESCE(aga.estado_evento, ''))) IN ('atendido', 'espontaneo')))";
        }

        $whereSql = count($where) ? (' WHERE ' . implode(' AND ', $where)) : '';

        $statsSql = 'SELECT COUNT(*) AS total, '
            . 'SUM(CASE WHEN consultas.estado = "pendiente" THEN 1 ELSE 0 END) AS pendientes, '
            . 'SUM(CASE WHEN consultas.clasificacion = "emergencia" THEN 1 ELSE 0 END) AS emergencias'
            . $from
            . $whereSql;

        $statsStmt = $conn->prepare($statsSql);
        if ($types) {
            $statsStmt->bind_param($types, ...$params);
        }
        $statsStmt->execute();
        $statsRes = $statsStmt->get_result();
        $statsRow = $statsRes->fetch_assoc() ?: [];
        $statsStmt->close();

        $hasCdOrigenCobro = columna_existe_local($conn, 'cotizaciones_detalle', 'origen_cobro');
        $hasCotEsCostoCeroContrato = columna_existe_local($conn, 'cotizaciones', 'es_costo_cero_contrato');

        $selectContratoOrigenExpr = $hasCdOrigenCobro
            ? 'MAX(CASE WHEN LOWER(TRIM(COALESCE(cd.origen_cobro, ""))) = "contrato" THEN 1 ELSE 0 END) AS tiene_origen_contrato'
            : '0 AS tiene_origen_contrato';

        $selectCotEsCostoCeroExpr = $hasCotEsCostoCeroContrato
            ? 'COALESCE(cot.es_costo_cero_contrato, 0) AS cot_es_costo_cero_contrato'
            : '0 AS cot_es_costo_cero_contrato';

        $whereDetalleActivoServicios = columna_existe_local($conn, 'cotizaciones_detalle', 'estado_item')
            ? " AND LOWER(TRIM(COALESCE(cd.estado_item, 'activo'))) <> 'eliminado'"
            : '';

        $fromData = ' FROM consultas'
            . ' LEFT JOIN pacientes ON consultas.paciente_id = pacientes.id'
            . ' LEFT JOIN medicos ON consultas.medico_id = medicos.id'
            . ' LEFT JOIN ('
            . '   SELECT cd.consulta_id, MAX(cd.cotizacion_id) AS cotizacion_id, ' . $selectContratoOrigenExpr
            . '   FROM cotizaciones_detalle cd'
            . '   INNER JOIN cotizaciones ct ON ct.id = cd.cotizacion_id'
            . '   WHERE cd.consulta_id IS NOT NULL'
            . '     AND cd.consulta_id > 0'
            . '     AND LOWER(TRIM(cd.servicio_tipo)) = \'consulta\''
            . '     AND LOWER(TRIM(ct.estado)) NOT IN ("anulado", "anulada")'
            . '   GROUP BY cd.consulta_id'
            . ' ) cot_ref ON cot_ref.consulta_id = consultas.id'
            . ' LEFT JOIN cotizaciones cot ON cot.id = cot_ref.cotizacion_id'
            . ' LEFT JOIN ('
            . '   SELECT cd.consulta_id,'
            . '          GROUP_CONCAT(DISTINCT LOWER(TRIM(cd.servicio_tipo)) ORDER BY LOWER(TRIM(cd.servicio_tipo)) ASC SEPARATOR ",") AS servicios_tipos_resumen,'
            . '          COUNT(*) AS servicios_count,'
            . '          SUM(CASE WHEN LOWER(TRIM(cd.servicio_tipo)) <> "consulta" THEN 1 ELSE 0 END) AS servicios_extras_count'
            . '   FROM cotizaciones_detalle cd'
            . '   INNER JOIN cotizaciones ct ON ct.id = cd.cotizacion_id'
            . '   WHERE cd.consulta_id IS NOT NULL'
            . '     AND cd.consulta_id > 0'
            . '     AND LOWER(TRIM(ct.estado)) NOT IN ("anulado", "anulada")'
            . $whereDetalleActivoServicios
            . '   GROUP BY cd.consulta_id'
            . ' ) svc_ref ON svc_ref.consulta_id = consultas.id';

        $sql = 'SELECT consultas.*, pacientes.nombre AS paciente_nombre, pacientes.apellido AS paciente_apellido, pacientes.historia_clinica, pacientes.dni, medicos.nombre AS medico_nombre, medicos.apellido AS medico_apellido, medicos.especialidad AS medico_especialidad, medicos.cmp AS medico_cmp, medicos.rne AS medico_rne, medicos.firma AS medico_firma, medicos.tipo_profesional AS medico_tipo_profesional, medicos.abreviatura_profesional AS medico_abreviatura_profesional, medicos.colegio_sigla AS medico_colegio_sigla, medicos.nro_colegiatura AS medico_nro_colegiatura,'
            . ' cot_ref.cotizacion_id AS cotizacion_id,'
            . ' cot.estado AS cotizacion_estado,'
            . ' cot_ref.tiene_origen_contrato AS cot_tiene_origen_contrato,'
            . ' COALESCE(svc_ref.servicios_tipos_resumen, "") AS servicios_tipos_resumen,'
            . ' COALESCE(svc_ref.servicios_count, 0) AS servicios_count,'
            . ' COALESCE(svc_ref.servicios_extras_count, 0) AS servicios_extras_count,'
            . ' ' . $selectCotEsCostoCeroExpr
            . $fromData
            . $whereSql
            . ' ORDER BY consultas.fecha DESC, consultas.hora DESC';

        if ($usar_paginacion) {
            $offset = ($page - 1) * $per_page;
            $sql .= ' LIMIT ? OFFSET ?';
            $paramsQuery = $params;
            $paramsQuery[] = $per_page;
            $paramsQuery[] = $offset;
            $typesQuery = $types . 'ii';
        } else {
            $paramsQuery = $params;
            $typesQuery = $types;
        }

        $stmt = $conn->prepare($sql);
        if ($typesQuery) $stmt->bind_param($typesQuery, ...$paramsQuery);
        $stmt->execute();
        $res = $stmt->get_result();
        $rows = [];
        while ($row = $res->fetch_assoc()) {
            $rows[] = $row;
        }

        consultas_enriquecer_correlativo_diario($conn, $rows);

        $consultaIdsListado = [];
        foreach ($rows as $tmpRow) {
            $cid = intval($tmpRow['id'] ?? 0);
            if ($cid > 0) {
                $consultaIdsListado[] = $cid;
            }
        }

        foreach ($rows as $tmpRow) {
            $consultaIdTmp = intval($tmpRow['id'] ?? 0);
            $cotEstadoTmp = trim((string)($tmpRow['cotizacion_estado'] ?? ''));
            if ($consultaIdTmp > 0) {
                consultas_regularizar_habilitacion_por_pago($conn, $consultaIdTmp, $cotEstadoTmp);
            }
        }

        $habByConsultaListado = consultas_resolver_habilitaciones_por_consulta_ids($conn, $consultaIdsListado);

        foreach ($rows as &$row) {
            $cotId = intval($row['cotizacion_id'] ?? 0);
            $cotEstado = trim((string)($row['cotizacion_estado'] ?? ''));
            $cotTieneOrigenContrato = intval($row['cot_tiene_origen_contrato'] ?? 0) === 1;
            $cotEsCostoCeroContrato = intval($row['cot_es_costo_cero_contrato'] ?? 0) === 1;
            $cotEstadoNorm = strtolower($cotEstado);
            $esContratoLegacy = in_array($cotEstadoNorm, ['control', 'contrato'], true);

            $row['cotizacion_id'] = $cotId > 0 ? $cotId : null;
            $row['cotizacion_estado'] = $cotEstado !== '' ? $cotEstado : null;
            $row['es_contrato'] = ($cotTieneOrigenContrato || $cotEsCostoCeroContrato || $esContratoLegacy) ? 1 : 0;
            $row['servicios_tipos_resumen'] = trim((string)($row['servicios_tipos_resumen'] ?? ''));
            $row['servicios_count'] = intval($row['servicios_count'] ?? 0);
            $row['servicios_extras_count'] = intval($row['servicios_extras_count'] ?? 0);

            $consultaId = intval($row['id'] ?? 0);
            $hab = $habByConsultaListado[$consultaId] ?? consultas_habilitacion_estado_default($consultaId, $cotId);
            $historialCount = intval($hab['historial_count'] ?? 0);
            if (consultas_es_cotizacion_pagada($cotEstado) && $historialCount > 0) {
                $hab['habilitacion_anticipada_activa'] = 0;
                $hab['estado_resumen'] = 'regularizado';
            }
            $row['habilitacion_anticipada_activa'] = intval($hab['habilitacion_anticipada_activa'] ?? 0);
            $row['habilitacion_anticipada_estado'] = $hab['estado_resumen'] ?? 'sin_habilitacion';
            $row['habilitacion_anticipada_historial_count'] = $historialCount;
            $row['habilitacion_anticipada_motivo'] = $hab['motivo'] ?? null;
            $row['habilitacion_anticipada_autorizado_por'] = $hab['autorizado_por'] ?? null;
            $row['habilitacion_anticipada_autorizado_rol'] = $hab['autorizado_rol'] ?? null;
            $row['habilitacion_anticipada_autorizado_nombre'] = $hab['autorizado_nombre'] ?? null;
            $row['habilitacion_anticipada_autorizado_en'] = $hab['autorizado_en'] ?? null;
            $row['habilitacion_anticipada_vence_en'] = $hab['vence_en'] ?? null;
        }
        unset($row);

        $totalFiltrado = intval($statsRow['total'] ?? count($rows));
        $respuesta = [
            'success' => true,
            'consultas' => $rows,
            'stats' => [
                'total' => $totalFiltrado,
                'pendientes' => intval($statsRow['pendientes'] ?? 0),
                'emergencias' => intval($statsRow['emergencias'] ?? 0),
            ],
        ];

        if ($esSesionMedico) {
            $hoyYmd = date('Y-m-d');
            $serviciosHabilitados = consultas_servicios_habilitados_medico($conn, $medicoSesionId);
            $pendientesPorServicio = consultas_stats_servicios_pendientes_hoy($conn, $medicoSesionId, $hoyYmd);
            $statsImagenologiaPendiente = consultas_stats_imagenologia_pendientes($conn, $medicoSesionId, $hoyYmd);
            $statsImagenologiaConciliacion = consultas_stats_imagenologia_conciliacion($conn, $medicoSesionId, $hoyYmd);

            $respuesta['stats_servicios_hoy'] = [
                'fecha_referencia' => $hoyYmd,
                'servicios_habilitados' => array_values($serviciosHabilitados),
                'pendientes_por_servicio' => $pendientesPorServicio,
            ];
            $respuesta['stats_imagenologia_pendiente'] = [
                'fecha_referencia' => $hoyYmd,
                'total_pendientes' => (int)($statsImagenologiaPendiente['total_pendientes'] ?? 0),
                'pendientes_hoy' => (int)($statsImagenologiaPendiente['pendientes_hoy'] ?? 0),
                'por_tipo' => $statsImagenologiaPendiente['por_tipo'] ?? [
                    'ecografia' => 0,
                    'rayosx' => 0,
                    'tomografia' => 0,
                ],
                'conciliacion' => [
                    'pendientes_hoy_total' => (int)($statsImagenologiaConciliacion['pendientes_hoy_total'] ?? 0),
                    'vinculadas_consulta_hoy' => (int)($statsImagenologiaConciliacion['vinculadas_consulta_hoy'] ?? 0),
                    'sin_consulta_hoy' => (int)($statsImagenologiaConciliacion['sin_consulta_hoy'] ?? 0),
                ],
            ];
        }

        if ($usar_paginacion) {
            $respuesta['pagination'] = [
                'page' => $page,
                'per_page' => $per_page,
                'total' => $totalFiltrado,
                'total_pages' => max(1, (int)ceil($totalFiltrado / $per_page)),
            ];
        }

        echo json_encode($respuesta);
        $stmt->close();
        break;
    case 'POST':
        // Agendar nueva consulta
        $data = json_decode(file_get_contents('php://input'), true);
        $paciente_id = $data['paciente_id'] ?? null;
        $medico_id = $data['medico_id'] ?? null;
        $fecha = $data['fecha'] ?? null;
        $hora = $data['hora'] ?? null;
        if (!$paciente_id || !$medico_id || !$fecha || !$hora) {
            echo json_encode(['success' => false, 'error' => 'Faltan datos requeridos']);
            exit;
        }

        if (!consultas_medico_existe($conn, $medico_id)) {
            echo json_encode(['success' => false, 'error' => 'El médico seleccionado no existe o ya no está disponible']);
            exit;
        }
        
        // Normalizar formato de hora (agregar segundos si no los tiene)
        if (strlen($hora) == 5 && substr_count($hora, ':') == 1) {
            $hora = $hora . ':00';
        }
        // Reglas de flujo:
        // - espontanea: mantiene validación de caja en fecha seleccionada.
        // - reservada_sin_turno: permite reservar sin validar caja ni disponibilidad del bloque.
        $tipo_consulta = $data['tipo_consulta'] ?? 'programada';
        $origen_creacion = trim((string)($data['origen_creacion'] ?? 'agendada'));
        if (!in_array($origen_creacion, ['agendada', 'cotizador', 'hc_proxima', 'reservada_sin_turno'], true)) {
            $origen_creacion = 'agendada';
        }

        $es_reservada_sin_turno = ($origen_creacion === 'reservada_sin_turno');

        if ($tipo_consulta === 'espontanea' && !$es_reservada_sin_turno) {
            $usuario_id = $_SESSION['usuario']['id'] ?? null;
            // Normalizar fecha a Y-m-d
            $fecha_consulta = date('Y-m-d', strtotime($fecha));
            $stmtCaja = $conn->prepare('SELECT id FROM cajas WHERE usuario_id = ? AND DATE(fecha) = ? AND TRIM(LOWER(estado)) = "abierta" LIMIT 1');
            $stmtCaja->bind_param('is', $usuario_id, $fecha_consulta);
            $stmtCaja->execute();
            $resCaja = $stmtCaja->get_result();
            $cajaAbierta = $resCaja->fetch_assoc();
            $stmtCaja->close();
            if (!$cajaAbierta) {
                echo json_encode([
                    'success' => false,
                    'error' => 'No hay caja abierta para el usuario en la fecha seleccionada. Abra una caja antes de agendar la consulta espontánea.',
                    'debug' => [
                        'usuario_id' => $usuario_id,
                        'fecha_consulta' => $fecha_consulta
                    ]
                ]);
                exit;
            }
        }

        // === VALIDACIÓN ATÓMICA DE CUPOS / CONFLICTOS ===
        // Para programada: valida bloque y cupos.
        // Para espontánea/reservada_sin_turno: permite cualquier hora, pero mantiene validación de conflicto exacto.
        $es_espontanea = ($tipo_consulta === 'espontanea');
        $omitir_validacion_disponibilidad = $es_espontanea || $es_reservada_sin_turno;
        $conn->begin_transaction();
        try {
            $totalSlots = null;
            $agendadas = null;

            if (!$omitir_validacion_disponibilidad) {
                // 1. Bloquear el bloque de disponibilidad para este médico/fecha/hora
                //    FOR UPDATE previene lecturas concurrentes del mismo bloque.
                $stmtBloque = $conn->prepare(
                    'SELECT id, hora_inicio, hora_fin FROM disponibilidad_medicos
                     WHERE medico_id = ? AND fecha = ?
                     AND hora_inicio <= ? AND hora_fin > ?
                     LIMIT 1 FOR UPDATE'
                );
                $stmtBloque->bind_param('isss', $medico_id, $fecha, $hora, $hora);
                $stmtBloque->execute();
                $bloque = $stmtBloque->get_result()->fetch_assoc();
                $stmtBloque->close();

                if (!$bloque) {
                    $conn->rollback();
                    echo json_encode([
                        'success' => false,
                        'error' => 'No hay disponibilidad registrada para este médico en el horario seleccionado',
                    ]);
                    exit;
                }

                // 2. Calcular capacidad total del bloque (intervalos de 30 min)
                [$hIni, $mIni] = array_map('intval', explode(':', $bloque['hora_inicio']));
                [$hFin, $mFin] = array_map('intval', explode(':', $bloque['hora_fin']));
                $totalSlots = 0;
                $h = $hIni; $m = $mIni;
                while ($h < $hFin || ($h === $hFin && $m < $mFin)) {
                    $totalSlots++;
                    $m += 30;
                    if ($m >= 60) { $h++; $m = 0; }
                }

                // 3. Contar consultas activas en el bloque (dentro del rango hora_inicio..hora_fin)
                $stmtCount = $conn->prepare(
                    'SELECT COUNT(*) AS cnt FROM consultas
                     WHERE medico_id = ? AND fecha = ?
                     AND hora >= ? AND hora < ?
                     AND LOWER(TRIM(COALESCE(estado, ""))) NOT IN ("cancelada", "completada")'
                );
                $stmtCount->bind_param('isss', $medico_id, $fecha, $bloque['hora_inicio'], $bloque['hora_fin']);
                $stmtCount->execute();
                $cntRow = $stmtCount->get_result()->fetch_assoc();
                $stmtCount->close();
                $agendadas = (int)($cntRow['cnt'] ?? 0);

                if ($agendadas >= $totalSlots) {
                    $conn->rollback();
                    echo json_encode([
                        'success' => false,
                        'error' => 'Cupos agotados para este horario. No hay cupos disponibles.',
                        'cupos_disponibles' => 0,
                    ]);
                    exit;
                }
            }

            // 4. Verificar conflicto exacto de hora (mismo médico, misma fecha, misma hora)
            $stmtConf = $conn->prepare(
                'SELECT id, estado FROM consultas
                 WHERE medico_id = ? AND fecha = ? AND hora = ?
                 AND LOWER(TRIM(COALESCE(estado, ""))) NOT IN ("cancelada", "completada")'
            );
            $stmtConf->bind_param('iss', $medico_id, $fecha, $hora);
            $stmtConf->execute();
            $conflicto = $stmtConf->get_result()->fetch_assoc();
            $stmtConf->close();

            if ($conflicto) {
                $conn->rollback();
                echo json_encode([
                    'success' => false,
                    'error' => 'El médico ya tiene una consulta pendiente en ese horario',
                    'detalle' => "Consulta ID {$conflicto['id']} con estado '{$conflicto['estado']}'",
                ]);
                exit;
            }

            $conflictoAgenda = consultas_buscar_conflicto_agenda_horario($conn, (int)$medico_id, (string)$fecha, (string)$hora);
            if ($conflictoAgenda) {
                $conn->rollback();
                $agendaId = (int)($conflictoAgenda['id'] ?? 0);
                $agendaEstado = (string)($conflictoAgenda['estado_evento'] ?? 'pendiente');
                echo json_encode([
                    'success' => false,
                    'error' => 'El médico ya tiene un servicio programado en ese horario',
                    'detalle' => "Agenda ID {$agendaId} con estado '{$agendaEstado}'",
                ]);
                exit;
            }

            // 5. Insertar la consulta dentro de la transacción
            $stmtIns = $conn->prepare(
                'INSERT INTO consultas (paciente_id, medico_id, fecha, hora, tipo_consulta, origen_creacion)
                 VALUES (?, ?, ?, ?, ?, ?)'
            );
            $stmtIns->bind_param('iissss', $paciente_id, $medico_id, $fecha, $hora, $tipo_consulta, $origen_creacion);
            $ok = $stmtIns->execute();
            $nuevaId = $ok ? $stmtIns->insert_id : null;
            $stmtIns->close();

            if (!$ok) {
                $conn->rollback();
                echo json_encode(['success' => false, 'error' => 'No se pudo registrar la consulta']);
                exit;
            }

            $conn->commit();
            $responseOk = [
                'success'          => true,
                'id'               => $nuevaId,
            ];
            if (!$omitir_validacion_disponibilidad && $totalSlots !== null && $agendadas !== null) {
                $responseOk['cupos_restantes'] = $totalSlots - $agendadas - 1;
            }
            echo json_encode($responseOk);

        } catch (Exception $e) {
            $conn->rollback();
            echo json_encode(['success' => false, 'error' => 'Error del servidor: ' . $e->getMessage()]);
        }
        break;
    case 'PUT':
        // Actualizar estado o reprogramar consulta existente
        $data = json_decode(file_get_contents('php://input'), true);
        $accion = strtolower(trim((string)($data['accion'] ?? '')));
        $id = $data['id'] ?? null;
        $cotizacion_id = isset($data['cotizacion_id']) ? intval($data['cotizacion_id']) : 0;
        if (($accion === 'habilitar_anticipado' || $accion === 'revocar_anticipado') && (!$id || intval($id) <= 0) && $cotizacion_id > 0) {
            $id = consultas_resolver_consulta_explicita_por_cotizacion($conn, $cotizacion_id);
        } elseif ((!$id || intval($id) <= 0) && $cotizacion_id > 0) {
            $id = resolver_consulta_id_por_cotizacion($conn, $cotizacion_id);
        }

        if ($accion === 'habilitar_anticipado' || $accion === 'revocar_anticipado') {
            $consultaId = intval($id ?? 0);
            if ($consultaId <= 0) {
                echo json_encode([
                    'success' => false,
                    'error' => 'La cotización no tiene vínculo clínico explícito (consulta_id) para gestionar habilitación anticipada',
                    'requiere_vinculo_explicito' => true,
                ]);
                exit;
            }

            if (!consultas_es_rol_autorizador_anticipado($rolSesion)) {
                http_response_code(403);
                echo json_encode(['success' => false, 'error' => 'No autorizado para gestionar habilitación anticipada']);
                exit;
            }

            $usuarioIdActor = consultas_actor_usuario_id($sessionUsuario);
            $rolActor = consultas_rol_normalizado($rolSesion ?: 'usuario');
            $nombreActor = consultas_actor_nombre($sessionUsuario);

            $stmtConsulta = $conn->prepare('SELECT id FROM consultas WHERE id = ? LIMIT 1');
            if (!$stmtConsulta) {
                echo json_encode(['success' => false, 'error' => 'No se pudo validar la consulta']);
                exit;
            }
            $stmtConsulta->bind_param('i', $consultaId);
            $stmtConsulta->execute();
            $consultaExiste = (bool)$stmtConsulta->get_result()->fetch_row();
            $stmtConsulta->close();
            if (!$consultaExiste) {
                echo json_encode(['success' => false, 'error' => 'Consulta no encontrada']);
                exit;
            }

            if (!consultas_table_exists($conn, 'consultas_habilitaciones_anticipadas')) {
                echo json_encode(['success' => false, 'error' => 'No existe tabla de habilitaciones anticipadas']);
                exit;
            }

            if ($accion === 'habilitar_anticipado') {
                $motivo = trim((string)($data['motivo'] ?? ''));
                if ($motivo === '' || strlen($motivo) < 5) {
                    echo json_encode(['success' => false, 'error' => 'Motivo obligatorio (mínimo 5 caracteres)']);
                    exit;
                }
                $venceHoras = isset($data['vence_horas']) ? intval($data['vence_horas']) : 24;
                if ($venceHoras < 1) {
                    $venceHoras = 1;
                }
                if ($venceHoras > 168) {
                    $venceHoras = 168;
                }

                $stmtReemplaza = $conn->prepare("UPDATE consultas_habilitaciones_anticipadas
                                                SET estado = 'revocado',
                                                    revocado_por = ?,
                                                    revocado_rol = ?,
                                                    revocado_nombre = ?,
                                                    revocado_en = NOW(),
                                                    motivo_revocacion = 'Reemplazada por nueva autorización'
                                                WHERE consulta_id = ?
                                                  AND estado = 'activo'");
                if ($stmtReemplaza) {
                    $stmtReemplaza->bind_param('issi', $usuarioIdActor, $rolActor, $nombreActor, $consultaId);
                    $stmtReemplaza->execute();
                    $stmtReemplaza->close();
                }

                $stmtIns = $conn->prepare("INSERT INTO consultas_habilitaciones_anticipadas
                    (consulta_id, cotizacion_id, estado, motivo, autorizado_por, autorizado_rol, autorizado_nombre, autorizado_en, vence_en)
                    VALUES (?, ?, 'activo', ?, ?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? HOUR))");
                if (!$stmtIns) {
                    echo json_encode(['success' => false, 'error' => 'No se pudo registrar habilitación anticipada']);
                    exit;
                }
                $stmtIns->bind_param('iisissi', $consultaId, $cotizacion_id, $motivo, $usuarioIdActor, $rolActor, $nombreActor, $venceHoras);
                $okIns = $stmtIns->execute();
                $stmtIns->close();
                if (!$okIns) {
                    echo json_encode(['success' => false, 'error' => 'No se pudo guardar habilitación anticipada']);
                    exit;
                }

            } else {
                $motivoRevocacion = trim((string)($data['motivo'] ?? ''));
                if ($motivoRevocacion === '') {
                    $motivoRevocacion = 'Revocación manual';
                }

                $stmtRev = $conn->prepare("UPDATE consultas_habilitaciones_anticipadas
                                          SET estado = 'revocado',
                                              revocado_por = ?,
                                              revocado_rol = ?,
                                              revocado_nombre = ?,
                                              revocado_en = NOW(),
                                              motivo_revocacion = ?
                                          WHERE consulta_id = ?
                                            AND estado = 'activo'");
                if (!$stmtRev) {
                    echo json_encode(['success' => false, 'error' => 'No se pudo revocar habilitación anticipada']);
                    exit;
                }
                $stmtRev->bind_param('isssi', $usuarioIdActor, $rolActor, $nombreActor, $motivoRevocacion, $consultaId);
                $stmtRev->execute();
                $stmtRev->close();
            }

            $hab = consultas_resolver_habilitaciones_por_consulta_ids($conn, [$consultaId]);
            $estadoOut = $hab[$consultaId] ?? consultas_habilitacion_estado_default($consultaId, $cotizacion_id);
            echo json_encode([
                'success' => true,
                'consulta_id' => $consultaId,
                'cotizacion_id' => $cotizacion_id,
                'habilitacion' => $estadoOut,
            ]);
            exit;
        }

        $estado = array_key_exists('estado', $data) ? trim((string)$data['estado']) : null;
        $medico_id = isset($data['medico_id']) ? intval($data['medico_id']) : null;
        $fecha = isset($data['fecha']) ? trim((string)$data['fecha']) : null;
        $hora = isset($data['hora']) ? trim((string)$data['hora']) : null;
        $tipo_consulta = isset($data['tipo_consulta']) ? trim((string)$data['tipo_consulta']) : null;

        if (!$id) {
            echo json_encode(['success' => false, 'error' => 'Faltan datos requeridos']);
            exit;
        }

        $actualizarEstado = ($estado !== null && $estado !== '');
        $camposReprogramacion = [
            'medico_id' => $medico_id,
            'fecha' => $fecha,
            'hora' => $hora,
        ];
        $camposReprogramacionPresentes = 0;
        foreach ($camposReprogramacion as $valor) {
            if ($valor !== null && $valor !== '') {
                $camposReprogramacionPresentes++;
            }
        }
        $actualizarAgenda = ($camposReprogramacionPresentes > 0);

        if (!$actualizarEstado && !$actualizarAgenda) {
            echo json_encode(['success' => false, 'error' => 'Debe enviar estado o datos de reprogramación']);
            exit;
        }

        if ($actualizarAgenda && $camposReprogramacionPresentes < 3) {
            echo json_encode(['success' => false, 'error' => 'Para reprogramar, envíe medico_id, fecha y hora']);
            exit;
        }

        if ($actualizarAgenda && $medico_id <= 0) {
            echo json_encode(['success' => false, 'error' => 'Médico inválido']);
            exit;
        }

        if ($actualizarAgenda && !consultas_medico_existe($conn, $medico_id)) {
            echo json_encode(['success' => false, 'error' => 'El médico seleccionado no existe o ya no está disponible']);
            exit;
        }

        if ($actualizarAgenda && strlen($hora) == 5 && substr_count($hora, ':') == 1) {
            $hora = $hora . ':00';
        }

        $stmtOwner = $conn->prepare('SELECT medico_id, fecha, hora FROM consultas WHERE id = ? LIMIT 1');
        $stmtOwner->bind_param('i', $id);
        $stmtOwner->execute();
        $ownerRow = $stmtOwner->get_result()->fetch_assoc();
        $stmtOwner->close();
        if (!$ownerRow) {
            echo json_encode(['success' => false, 'error' => 'Consulta no encontrada']);
            exit;
        }

        if ($esSesionMedico) {
            if (!$ownerRow || intval($ownerRow['medico_id']) !== $medicoSesionId) {
                http_response_code(403);
                echo json_encode(['success' => false, 'error' => 'No autorizado para actualizar esta consulta']);
                exit;
            }
        }

        $esReprogramacion = false;
        $turnoAntesReprogramacion = 0;
        $turnoAhoraReprogramacion = 0;
        if ($actualizarAgenda) {
            $fechaActual = trim((string)($ownerRow['fecha'] ?? ''));
            $horaActual = trim((string)($ownerRow['hora'] ?? ''));
            $horaActualNorm = $horaActual !== '' ? substr($horaActual, 0, 5) : '';
            $horaNuevaNorm = $hora !== null ? substr((string)$hora, 0, 5) : '';
            $esReprogramacion = ($fechaActual !== (string)$fecha) || ($horaActualNorm !== $horaNuevaNorm) || (intval($ownerRow['medico_id'] ?? 0) !== intval($medico_id));

            if ($esReprogramacion && columna_existe_local($conn, 'consultas', 'correlativo_dia_medico')) {
                $turnoAntesReprogramacion = intval($ownerRow['correlativo_dia_medico'] ?? 0);
                if ($turnoAntesReprogramacion <= 0) {
                    $stmtTurnoActual = $conn->prepare('SELECT COALESCE(correlativo_dia_medico, 0) AS corr FROM consultas WHERE id = ? LIMIT 1');
                    if ($stmtTurnoActual) {
                        $stmtTurnoActual->bind_param('i', $id);
                        $stmtTurnoActual->execute();
                        $rowTurnoActual = $stmtTurnoActual->get_result()->fetch_assoc();
                        $stmtTurnoActual->close();
                        $turnoAntesReprogramacion = intval($rowTurnoActual['corr'] ?? 0);
                    }
                }
                $turnoAhoraReprogramacion = consultas_calcular_siguiente_correlativo_reprogramacion($conn, intval($medico_id), (string)$fecha, intval($id));
                if ($turnoAhoraReprogramacion <= 0) {
                    $turnoAhoraReprogramacion = max(1, $turnoAntesReprogramacion);
                }
            }

            $stmtConflicto = $conn->prepare('SELECT id, estado FROM consultas WHERE medico_id=? AND fecha=? AND hora=? AND id<>? AND estado NOT IN ("cancelada", "completada") LIMIT 1');
            $stmtConflicto->bind_param('issi', $medico_id, $fecha, $hora, $id);
            $stmtConflicto->execute();
            $conflicto = $stmtConflicto->get_result()->fetch_assoc();
            $stmtConflicto->close();

            if ($conflicto) {
                echo json_encode([
                    'success' => false,
                    'error' => 'El médico ya tiene una consulta pendiente en ese horario',
                    'detalle' => "Consulta ID {$conflicto['id']} con estado '{$conflicto['estado']}'",
                ]);
                exit;
            }

            $conflictoAgenda = consultas_buscar_conflicto_agenda_horario($conn, (int)$medico_id, (string)$fecha, (string)$hora);
            if ($conflictoAgenda) {
                $agendaId = (int)($conflictoAgenda['id'] ?? 0);
                $agendaEstado = (string)($conflictoAgenda['estado_evento'] ?? 'pendiente');
                echo json_encode([
                    'success' => false,
                    'error' => 'El médico ya tiene un servicio programado en ese horario',
                    'detalle' => "Agenda ID {$agendaId} con estado '{$agendaEstado}'",
                ]);
                exit;
            }
        }

        if ($actualizarAgenda && $actualizarEstado) {
            $stmt = $conn->prepare('UPDATE consultas SET medico_id=?, fecha=?, hora=?, tipo_consulta=COALESCE(?, tipo_consulta), estado=? WHERE id=?');
            $stmt->bind_param('issssi', $medico_id, $fecha, $hora, $tipo_consulta, $estado, $id);
        } elseif ($actualizarAgenda) {
            $stmt = $conn->prepare('UPDATE consultas SET medico_id=?, fecha=?, hora=?, tipo_consulta=COALESCE(?, tipo_consulta) WHERE id=?');
            $stmt->bind_param('isssi', $medico_id, $fecha, $hora, $tipo_consulta, $id);
        } else {
            $stmt = $conn->prepare('UPDATE consultas SET estado=? WHERE id=?');
            $stmt->bind_param('si', $estado, $id);
        }

        $ok = $stmt->execute();

        if ($ok && $actualizarAgenda && $esReprogramacion && $turnoAhoraReprogramacion > 0 && columna_existe_local($conn, 'consultas', 'correlativo_dia_medico')) {
            $stmtCorr = $conn->prepare('UPDATE consultas SET correlativo_dia_medico = ? WHERE id = ? LIMIT 1');
            if ($stmtCorr) {
                $stmtCorr->bind_param('ii', $turnoAhoraReprogramacion, $id);
                $stmtCorr->execute();
                $stmtCorr->close();
            }

            if (consultas_table_exists($conn, 'recordatorios_consultas')) {
                $turnoAntesFinal = max(1, intval($turnoAntesReprogramacion));
                $turnoAhoraFinal = max(1, intval($turnoAhoraReprogramacion));
                $horaObs = substr((string)$hora, 0, 5);
                $observacionReprog = sprintf(
                    'Cita reprogramada para %s %s. Turno: Antes N°%d -> Ahora N°%d.',
                    (string)$fecha,
                    $horaObs,
                    $turnoAntesFinal,
                    $turnoAhoraFinal
                );
                $usuarioIdActor = consultas_actor_usuario_id($sessionUsuario);
                $hasRcTurnoOriginal = columna_existe_local($conn, 'recordatorios_consultas', 'turno_original');
                $hasRcTurnoVigente = columna_existe_local($conn, 'recordatorios_consultas', 'turno_vigente');

                if ($hasRcTurnoOriginal && $hasRcTurnoVigente) {
                    $stmtRc = $conn->prepare(
                        'INSERT INTO recordatorios_consultas (consulta_id, estado, observacion, fecha_ultimo_contacto, intentos, actualizado_por, turno_original, turno_vigente)
                         VALUES (?, "pendiente", ?, NOW(), 1, ?, ?, ?)
                         ON DUPLICATE KEY UPDATE
                           estado = "pendiente",
                           observacion = VALUES(observacion),
                           fecha_ultimo_contacto = NOW(),
                           intentos = intentos + 1,
                           actualizado_por = VALUES(actualizado_por),
                           turno_original = COALESCE(NULLIF(turno_original, 0), VALUES(turno_original)),
                           turno_vigente = VALUES(turno_vigente),
                           updated_at = CURRENT_TIMESTAMP'
                    );
                    if ($stmtRc) {
                        $stmtRc->bind_param('isiii', $id, $observacionReprog, $usuarioIdActor, $turnoAntesFinal, $turnoAhoraFinal);
                        $stmtRc->execute();
                        $stmtRc->close();
                    }
                } elseif ($hasRcTurnoOriginal) {
                    $stmtRc = $conn->prepare(
                        'INSERT INTO recordatorios_consultas (consulta_id, estado, observacion, fecha_ultimo_contacto, intentos, actualizado_por, turno_original)
                         VALUES (?, "pendiente", ?, NOW(), 1, ?, ?)
                         ON DUPLICATE KEY UPDATE
                           estado = "pendiente",
                           observacion = VALUES(observacion),
                           fecha_ultimo_contacto = NOW(),
                           intentos = intentos + 1,
                           actualizado_por = VALUES(actualizado_por),
                           turno_original = COALESCE(NULLIF(turno_original, 0), VALUES(turno_original)),
                           updated_at = CURRENT_TIMESTAMP'
                    );
                    if ($stmtRc) {
                        $stmtRc->bind_param('isii', $id, $observacionReprog, $usuarioIdActor, $turnoAntesFinal);
                        $stmtRc->execute();
                        $stmtRc->close();
                    }
                } else {
                    $stmtRc = $conn->prepare(
                        'INSERT INTO recordatorios_consultas (consulta_id, estado, observacion, fecha_ultimo_contacto, intentos, actualizado_por)
                         VALUES (?, "pendiente", ?, NOW(), 1, ?)
                         ON DUPLICATE KEY UPDATE
                           estado = "pendiente",
                           observacion = VALUES(observacion),
                           fecha_ultimo_contacto = NOW(),
                           intentos = intentos + 1,
                           actualizado_por = VALUES(actualizado_por),
                           updated_at = CURRENT_TIMESTAMP'
                    );
                    if ($stmtRc) {
                        $stmtRc->bind_param('isi', $id, $observacionReprog, $usuarioIdActor);
                        $stmtRc->execute();
                        $stmtRc->close();
                    }
                }
            }
        }

        if ($ok && $actualizarAgenda && $esReprogramacion && columna_existe_local($conn, 'consultas', 'es_reprogramada')) {
            if (columna_existe_local($conn, 'consultas', 'reprogramada_en')) {
                $stmtMarca = $conn->prepare('UPDATE consultas SET es_reprogramada = 1, reprogramada_en = NOW() WHERE id = ? LIMIT 1');
            } else {
                $stmtMarca = $conn->prepare('UPDATE consultas SET es_reprogramada = 1 WHERE id = ? LIMIT 1');
            }
            if ($stmtMarca) {
                $stmtMarca->bind_param('i', $id);
                $stmtMarca->execute();
                $stmtMarca->close();
            }
        }

        $syncCotizacion = null;
        $syncHistoriaClinicaProxima = null;
        $actorAgenda = consultas_actor_label($sessionUsuario);
        if ($ok && $actualizarAgenda) {
            try {
                $syncCotizacion = sincronizar_cotizacion_por_consulta($conn, intval($id), intval($medico_id), intval($cotizacion_id));
            } catch (Throwable $e) {
                $syncCotizacion = [
                    'ok' => false,
                    'reason' => 'exception',
                    'message' => $e->getMessage(),
                ];
            }

            try {
                $syncHistoriaClinicaProxima = sincronizar_hc_proxima_cita_por_consulta(
                    $conn,
                    intval($id),
                    intval($medico_id),
                    (string)$fecha,
                    (string)$hora,
                    $tipo_consulta,
                    $actorAgenda
                );
            } catch (Throwable $e) {
                $syncHistoriaClinicaProxima = [
                    'ok' => false,
                    'reason' => 'exception',
                    'message' => $e->getMessage(),
                ];
            }
        }

        echo json_encode([
            'success' => $ok,
            'cotizacion_sync' => $syncCotizacion,
            'historia_clinica_proxima_sync' => $syncHistoriaClinicaProxima,
            'turno_antes' => $turnoAntesReprogramacion > 0 ? intval($turnoAntesReprogramacion) : null,
            'turno_ahora' => $turnoAhoraReprogramacion > 0 ? intval($turnoAhoraReprogramacion) : null,
        ]);
        $stmt->close();
        break;
    default:
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
}
