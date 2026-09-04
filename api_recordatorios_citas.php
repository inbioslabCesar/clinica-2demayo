<?php
require_once __DIR__ . '/init_api.php';
if (!defined('SKIP_PDO_INIT')) {
    define('SKIP_PDO_INIT', true);
}
require_once __DIR__ . '/config.php';

function rc_require_session_roles(array $rolesPermitidos) {
    if (!isset($_SESSION['usuario']) || !is_array($_SESSION['usuario'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'No autenticado']);
        exit;
    }

    $rol = trim((string)($_SESSION['usuario']['rol'] ?? ''));
    if (!in_array($rol, $rolesPermitidos, true)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'No autorizado']);
        exit;
    }
}

function rc_column_exists($conn, $table, $column) {
    static $cache = [];

    $tableKey = strtolower(trim((string)$table));
    $columnKey = strtolower(trim((string)$column));
    if ($tableKey === '' || $columnKey === '') {
        return false;
    }

    $cacheKey = $tableKey . '.' . $columnKey;
    if (array_key_exists($cacheKey, $cache)) {
        return (bool)$cache[$cacheKey];
    }

    $stmt = $conn->prepare('SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1');
    if (!$stmt) {
        $cache[$cacheKey] = false;
        return false;
    }
    $stmt->bind_param('ss', $tableKey, $columnKey);
    $stmt->execute();
    $res = $stmt->get_result();
    $exists = $res && $res->num_rows > 0;
    $stmt->close();

    $cache[$cacheKey] = $exists;
    return $exists;
}

function rc_table_exists($conn, $table) {
    static $cache = [];

    $tableKey = strtolower(trim((string)$table));
    if ($tableKey === '') {
        return false;
    }

    if (array_key_exists($tableKey, $cache)) {
        return (bool)$cache[$tableKey];
    }

    $stmt = $conn->prepare('SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1');
    if (!$stmt) {
        $cache[$tableKey] = false;
        return false;
    }
    $stmt->bind_param('s', $tableKey);
    $stmt->execute();
    $res = $stmt->get_result();
    $exists = $res && $res->num_rows > 0;
    $stmt->close();

    $cache[$tableKey] = $exists;
    return $exists;
}

function rc_ensure_cola_medico_schema($conn) {
    $sql = "CREATE TABLE IF NOT EXISTS recordatorios_cola_medico (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        source_key VARCHAR(64) NOT NULL,
        consulta_id INT NULL,
        cotizacion_id INT NULL,
        medico_id INT NOT NULL,
        fecha_atencion DATE NOT NULL,
        estado_cola VARCHAR(24) NOT NULL DEFAULT 'pendiente',
        correlativo_cola INT NULL,
        es_siguiente TINYINT(1) NOT NULL DEFAULT 0,
        prioridad_cola VARCHAR(24) NOT NULL DEFAULT 'normal',
        prioridad_detalle VARCHAR(120) NULL,
        actualizado_por INT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_rcm_source_key (source_key),
        KEY idx_rcm_medico_fecha (medico_id, fecha_atencion),
        KEY idx_rcm_consulta (consulta_id),
        KEY idx_rcm_cotizacion (cotizacion_id),
        KEY idx_rcm_estado (estado_cola)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";
    @mysqli_query($conn, $sql);
}

function rc_cola_source_key($consultaId, $cotizacionId) {
    $consultaId = (int)$consultaId;
    $cotizacionId = (int)$cotizacionId;
    if ($consultaId > 0) {
        return 'consulta:' . $consultaId;
    }
    if ($cotizacionId > 0) {
        return 'cotizacion:' . $cotizacionId;
    }
    return '';
}

function rc_cola_siguiente_correlativo($conn, $medicoId, $fechaAtencion) {
    $medicoId = (int)$medicoId;
    $fechaAtencion = trim((string)$fechaAtencion);
    if ($medicoId <= 0 || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $fechaAtencion)) {
        return 1;
    }

    $stmt = $conn->prepare('SELECT COALESCE(MAX(COALESCE(correlativo_cola, 0)), 0) AS max_corr FROM recordatorios_cola_medico WHERE medico_id = ? AND fecha_atencion = ?');
    if (!$stmt) {
        return 1;
    }
    $stmt->bind_param('is', $medicoId, $fechaAtencion);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc() ?: [];
    $stmt->close();
    return max(1, ((int)($row['max_corr'] ?? 0)) + 1);
}

function rc_cola_map_for_items($conn, $items) {
    $out = [
        'by_consulta' => [],
        'by_cotizacion' => [],
    ];
    if (!rc_table_exists($conn, 'recordatorios_cola_medico')) {
        return $out;
    }

    $consultaIds = [];
    $cotizacionIds = [];
    foreach ((array)$items as $it) {
        $consultaIds[] = (int)($it['id'] ?? 0);
        $consultaIds[] = (int)($it['consulta_id_ref'] ?? 0);
        $cotizacionIds[] = (int)($it['cotizacion_id'] ?? 0);
    }
    $consultaIds = array_values(array_unique(array_filter($consultaIds, function ($id) { return $id > 0; })));
    $cotizacionIds = array_values(array_unique(array_filter($cotizacionIds, function ($id) { return $id > 0; })));
    if (empty($consultaIds) && empty($cotizacionIds)) {
        return $out;
    }

    $whereParts = [];
    $types = '';
    $params = [];
    if (!empty($consultaIds)) {
        $ph = implode(',', array_fill(0, count($consultaIds), '?'));
        $whereParts[] = "consulta_id IN ({$ph})";
        $types .= str_repeat('i', count($consultaIds));
        foreach ($consultaIds as $id) $params[] = $id;
    }
    if (!empty($cotizacionIds)) {
        $ph = implode(',', array_fill(0, count($cotizacionIds), '?'));
        $whereParts[] = "cotizacion_id IN ({$ph})";
        $types .= str_repeat('i', count($cotizacionIds));
        foreach ($cotizacionIds as $id) $params[] = $id;
    }

    $sql = 'SELECT source_key, consulta_id, cotizacion_id, medico_id, fecha_atencion, estado_cola, correlativo_cola, es_siguiente, prioridad_cola, prioridad_detalle, updated_at'
        . ' FROM recordatorios_cola_medico WHERE ' . implode(' OR ', $whereParts);
    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        return $out;
    }
    if ($types !== '') {
        $stmt->bind_param($types, ...$params);
    }
    $stmt->execute();
    $res = $stmt->get_result();
    while ($row = $res->fetch_assoc()) {
        $normalized = [
            'source_key' => (string)($row['source_key'] ?? ''),
            'consulta_id' => (int)($row['consulta_id'] ?? 0),
            'cotizacion_id' => (int)($row['cotizacion_id'] ?? 0),
            'medico_id' => (int)($row['medico_id'] ?? 0),
            'fecha_atencion' => (string)($row['fecha_atencion'] ?? ''),
            'estado_cola' => (string)($row['estado_cola'] ?? 'pendiente'),
            'correlativo_cola' => (int)($row['correlativo_cola'] ?? 0),
            'es_siguiente' => (int)($row['es_siguiente'] ?? 0),
            'prioridad_cola' => (string)($row['prioridad_cola'] ?? 'normal'),
            'prioridad_detalle' => (string)($row['prioridad_detalle'] ?? ''),
            'cola_updated_at' => (string)($row['updated_at'] ?? ''),
        ];
        $consultaId = (int)($row['consulta_id'] ?? 0);
        $cotId = (int)($row['cotizacion_id'] ?? 0);
        if ($consultaId > 0) {
            $out['by_consulta'][$consultaId] = $normalized;
        }
        if ($cotId > 0) {
            $out['by_cotizacion'][$cotId] = $normalized;
        }
    }
    $stmt->close();
    return $out;
}

function rc_attach_cola_to_items(&$items, $colaMap) {
    $byConsulta = is_array($colaMap['by_consulta'] ?? null) ? $colaMap['by_consulta'] : [];
    $byCot = is_array($colaMap['by_cotizacion'] ?? null) ? $colaMap['by_cotizacion'] : [];

    foreach ($items as &$item) {
        $consultaId = (int)($item['id'] ?? 0);
        if ((string)($item['origen_consulta'] ?? '') === 'agenda_servicio') {
            $consultaId = (int)($item['consulta_id_ref'] ?? 0);
        }
        $cotId = (int)($item['cotizacion_id'] ?? 0);

        $cola = null;
        if ($consultaId > 0 && isset($byConsulta[$consultaId])) {
            $cola = $byConsulta[$consultaId];
        } elseif ($cotId > 0 && isset($byCot[$cotId])) {
            $cola = $byCot[$cotId];
        }

        $item['cola_source_key'] = (string)($cola['source_key'] ?? '');
        $item['cola_estado'] = (string)($cola['estado_cola'] ?? 'pendiente');
        $item['cola_correlativo'] = (int)($cola['correlativo_cola'] ?? 0);
        $item['cola_es_siguiente'] = (int)($cola['es_siguiente'] ?? 0);
        $item['cola_prioridad'] = (string)($cola['prioridad_cola'] ?? 'normal');
        $item['cola_prioridad_detalle'] = (string)($cola['prioridad_detalle'] ?? '');
        $item['cola_updated_at'] = (string)($cola['cola_updated_at'] ?? '');

        $estadoConsulta = strtolower(trim((string)($item['estado_consulta'] ?? '')));
        if (in_array($estadoConsulta, ['completada', 'completado', 'cancelada', 'cancelado', 'anulada', 'anulado'], true)) {
            $item['cola_estado'] = 'en_atencion';
            $item['cola_correlativo'] = 0;
            $item['cola_es_siguiente'] = 0;
        }
    }
    unset($item);
}

function rc_require_schema($conn) {
    $missing = [];

    if (!rc_table_exists($conn, 'recordatorios_consultas')) {
        $missing[] = 'recordatorios_consultas';
    }

    $requiredCols = [
        'consultas' => ['origen_creacion', 'es_control', 'hc_origen_id'],
    ];
    foreach ($requiredCols as $table => $columns) {
        foreach ($columns as $column) {
            if (!rc_column_exists($conn, $table, $column)) {
                $missing[] = $table . '.' . $column;
            }
        }
    }

    if (!empty($missing)) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Esquema incompleto para api_recordatorios_citas.php. Ejecuta la migracion de despliegue: sql/2026-04-05_consultas_recordatorios_schema_idempotente.sql',
            'missing_schema' => $missing,
        ]);
        exit;
    }
}

function rc_parse_positive_int($value, $fallback) {
    $v = (int)$value;
    return $v > 0 ? $v : $fallback;
}

function rc_parse_tipo_recordatorio($value) {
    $tipo = strtolower(trim((string)$value));
    if ($tipo === 'falta_cancelar') {
        return 'falta_cancelar';
    }
    return 'citas';
}

function rc_normalizar_hora_hms($value) {
    $raw = trim((string)$value);
    if ($raw === '') return '';
    if (preg_match('/^(\d{2}):(\d{2})(:\d{2})?$/', $raw, $m)) {
        return sprintf('%02d:%02d:%02d', (int)$m[1], (int)$m[2], isset($m[3]) ? (int)substr($m[3], 1) : 0);
    }
    $ts = strtotime($raw);
    if ($ts === false) return '';
    return date('H:i:s', $ts);
}

function rc_sort_citas_por_hora(&$rows) {
    if (!is_array($rows)) return;
    usort($rows, function ($a, $b) {
        $ha = rc_normalizar_hora_hms($a['hora'] ?? '');
        $hb = rc_normalizar_hora_hms($b['hora'] ?? '');
        if ($ha !== $hb) return strcmp($ha, $hb);
        $pa = strtolower(trim((string)($a['origen'] ?? ''))) === 'agenda_servicio' ? 0 : 1;
        $pb = strtolower(trim((string)($b['origen'] ?? ''))) === 'agenda_servicio' ? 0 : 1;
        if ($pa !== $pb) return $pa <=> $pb;
        return ((int)($a['id'] ?? 0)) <=> ((int)($b['id'] ?? 0));
    });
}

function rc_servicio_label($value) {
    $tipo = strtolower(trim((string)$value));
    if ($tipo === 'rayos x' || $tipo === 'rayos_x' || $tipo === 'rx') return 'rayosx';
    if ($tipo === 'operaciones' || $tipo === 'cirugias' || $tipo === 'cirugia') return 'operacion';
    if ($tipo === 'procedimientos') return 'procedimiento';
    return $tipo !== '' ? $tipo : 'otros';
}

function rc_servicios_label($serviciosTipados, $fallback = '') {
    $raw = trim((string)$serviciosTipados);
    if ($raw !== '') {
        $parts = array_values(array_filter(array_map('trim', explode(',', $raw)), static function ($part) {
            return $part !== '';
        }));
        if (!empty($parts)) {
            $labels = [];
            foreach ($parts as $part) {
                $labels[] = rc_servicio_pretty_label($part);
            }
            $labels = array_values(array_unique($labels));
            if (count($labels) === 1) {
                return $labels[0];
            }
            return implode(' + ', $labels);
        }
    }

    return rc_servicio_pretty_label($fallback);
}

function rc_servicio_pretty_label($value) {
    $tipo = rc_servicio_label($value);
    if ($tipo === 'rayosx') return 'Rayos X';
    if ($tipo === 'ecografia') return 'Ecografía';
    if ($tipo === 'laboratorio') return 'Laboratorio';
    if ($tipo === 'farmacia') return 'Farmacia';
    if ($tipo === 'consulta') return 'Consulta';
    if ($tipo === 'procedimiento') return 'Procedimiento';
    if ($tipo === 'operacion') return 'Operación';
    if ($tipo === 'hospitalizacion') return 'Hospitalización';
    return $tipo !== '' ? ucfirst($tipo) : 'Servicio';
}

function rc_where_servicios_medicos_agenda($alias = 'a') {
    $col = $alias . ".servicio_tipo";
    return "LOWER(TRIM(COALESCE({$col}, ''))) IN ('consulta','rayosx','rayos x','rayos_x','rx','ecografia','procedimiento','procedimientos','operacion','operaciones','cirugia','cirugias')";
}

function rc_calcular_turno_original_agenda($conn, $cotizacionId) {
    $cotizacionId = (int)$cotizacionId;
    if ($cotizacionId <= 0) return 0;

    $stmtBase = $conn->prepare(
        'SELECT a.id, COALESCE(a.medico_id, cd.medico_id, t.medico_id, 0) AS medico_id, a.fecha_programada, a.hora_programada
         FROM agenda_servicios_cotizacion a
         LEFT JOIN cotizaciones_detalle cd ON cd.id = a.cotizacion_detalle_id
         LEFT JOIN tarifas t ON t.id = COALESCE(cd.servicio_id, a.servicio_id)
         WHERE a.cotizacion_id = ?
           AND a.estado_evento IN ("pendiente", "confirmado")
         ORDER BY a.fecha_programada ASC, a.hora_programada ASC, a.id ASC
         LIMIT 1'
    );
    if (!$stmtBase) {
        return 0;
    }
    $stmtBase->bind_param('i', $cotizacionId);
    $stmtBase->execute();
    $base = $stmtBase->get_result()->fetch_assoc();
    $stmtBase->close();

    $medicoId = (int)($base['medico_id'] ?? 0);
    $fecha = (string)($base['fecha_programada'] ?? '');
    $hora = (string)($base['hora_programada'] ?? '');
    $idRef = (int)($base['id'] ?? 0);
    if ($medicoId <= 0 || $fecha === '' || $hora === '' || $idRef <= 0) {
        return 0;
    }

    $stmtRank = $conn->prepare(
        'SELECT COUNT(*) AS turno
         FROM (
             SELECT ag.cotizacion_id, MIN(ag.hora_programada) AS hora_min, MIN(ag.id) AS id_min
             FROM agenda_servicios_cotizacion ag
             LEFT JOIN cotizaciones_detalle cd2 ON cd2.id = ag.cotizacion_detalle_id
             LEFT JOIN tarifas t2 ON t2.id = COALESCE(cd2.servicio_id, ag.servicio_id)
             WHERE COALESCE(ag.medico_id, cd2.medico_id, t2.medico_id, 0) = ?
               AND ag.fecha_programada = ?
               AND ag.estado_evento IN ("pendiente", "confirmado")
             GROUP BY ag.cotizacion_id
         ) q
         WHERE (q.hora_min < ?) OR (q.hora_min = ? AND q.id_min <= ?)'
    );
    if (!$stmtRank) {
        return 0;
    }
    $stmtRank->bind_param('isssi', $medicoId, $fecha, $hora, $hora, $idRef);
    $stmtRank->execute();
    $rankRow = $stmtRank->get_result()->fetch_assoc();
    $stmtRank->close();

    $turno = (int)($rankRow['turno'] ?? 0);
    return $turno > 0 ? $turno : 0;
}

function rc_ensure_turno_original_agenda($conn, $cotizacionId, $usuarioId, $hasTurnoOriginalColumn) {
    $cotizacionId = (int)$cotizacionId;
    if (!$hasTurnoOriginalColumn || $cotizacionId <= 0) {
        return 0;
    }

    $stmtCurrent = $conn->prepare('SELECT turno_original FROM recordatorios_agenda_servicios WHERE cotizacion_id = ? LIMIT 1');
    if ($stmtCurrent) {
        $stmtCurrent->bind_param('i', $cotizacionId);
        $stmtCurrent->execute();
        $currentRow = $stmtCurrent->get_result()->fetch_assoc();
        $stmtCurrent->close();
        $turnoActual = (int)($currentRow['turno_original'] ?? 0);
        if ($turnoActual > 0) {
            return $turnoActual;
        }
    }

    $turnoCalculado = rc_calcular_turno_original_agenda($conn, $cotizacionId);
    if ($turnoCalculado <= 0) {
        return 0;
    }

    $usuarioId = (int)$usuarioId;
    $observacion = 'Turno inicial asignado automaticamente';
    $stmtUpsert = $conn->prepare(
        'INSERT INTO recordatorios_agenda_servicios (cotizacion_id, estado, observacion, fecha_ultimo_contacto, intentos, actualizado_por, turno_original)
         VALUES (?, "pendiente", ?, NOW(), 0, ?, ?)
         ON DUPLICATE KEY UPDATE
           turno_original = COALESCE(NULLIF(turno_original, 0), VALUES(turno_original)),
           actualizado_por = VALUES(actualizado_por),
           updated_at = CURRENT_TIMESTAMP'
    );
    if ($stmtUpsert) {
        $stmtUpsert->bind_param('isii', $cotizacionId, $observacion, $usuarioId, $turnoCalculado);
        $stmtUpsert->execute();
        $stmtUpsert->close();
    }

    return $turnoCalculado;
}

function rc_resolver_observacion_agenda_recordatorio($rasObservacion, $agendaObservacion, $tituloEvento) {
    $ras = trim((string)$rasObservacion);
    $agenda = trim((string)$agendaObservacion);
    $titulo = trim((string)$tituloEvento);

    $rasNorm = function_exists('mb_strtolower') ? mb_strtolower($ras, 'UTF-8') : strtolower($ras);
    $esAuto = ($rasNorm === 'turno inicial asignado automaticamente');

    if ($ras !== '' && !$esAuto) {
        return $ras;
    }
    if ($agenda !== '') {
        return $agenda;
    }
    if ($ras !== '') {
        return $ras;
    }
    return $titulo;
}

function rc_normalizar_hora_para_orden($hora) {
    $raw = trim((string)$hora);
    if ($raw === '') return '';
    if (preg_match('/^(\d{2}):(\d{2})(:\d{2})?$/', $raw, $m)) {
        return sprintf('%02d:%02d:%02d', (int)$m[1], (int)$m[2], isset($m[3]) ? (int)substr($m[3], 1) : 0);
    }
    $ts = strtotime($raw);
    if ($ts === false) return '';
    return date('H:i:s', $ts);
}

function rc_reasignar_correlativo_unificado(&$items) {
    if (!is_array($items) || empty($items)) {
        return;
    }

    $indicesPorGrupo = [];
    foreach ($items as $idx => $item) {
        if (!is_array($item)) continue;
        $medicoId = (int)($item['medico_id'] ?? 0);
        $fecha = trim((string)($item['fecha'] ?? ''));
        if ($medicoId <= 0 || $fecha === '') continue;

        $grupo = $medicoId . '|' . $fecha;
        if (!isset($indicesPorGrupo[$grupo])) {
            $indicesPorGrupo[$grupo] = [];
        }
        $indicesPorGrupo[$grupo][] = $idx;
    }

    foreach ($indicesPorGrupo as $indices) {
        usort($indices, function ($ia, $ib) use ($items) {
            $ha = rc_normalizar_hora_para_orden($items[$ia]['hora'] ?? '');
            $hb = rc_normalizar_hora_para_orden($items[$ib]['hora'] ?? '');
            if ($ha !== $hb) return strcmp($ha, $hb);

            $priorA = (strtolower(trim((string)($items[$ia]['origen_consulta'] ?? ''))) === 'agenda_servicio') ? 0 : 1;
            $priorB = (strtolower(trim((string)($items[$ib]['origen_consulta'] ?? ''))) === 'agenda_servicio') ? 0 : 1;
            if ($priorA !== $priorB) return $priorA <=> $priorB;

            return ((int)($items[$ia]['id'] ?? 0)) <=> ((int)($items[$ib]['id'] ?? 0));
        });

        $n = 1;
        foreach ($indices as $idxItem) {
            $items[$idxItem]['correlativo_estable'] = $n;
            if (!isset($items[$idxItem]['correlativo_original']) || (int)($items[$idxItem]['correlativo_original'] ?? 0) <= 0) {
                $items[$idxItem]['correlativo_original'] = $n;
            }
            $n++;
        }
    }
}

function rc_calcular_siguiente_turno_vigente_agenda($conn, $medicoId, $fechaYmd, $cotizacionIdExcluir, $hasTurnoOriginalColumn, $hasTurnoVigenteColumn) {
    $medicoId = (int)$medicoId;
    $cotizacionIdExcluir = (int)$cotizacionIdExcluir;
    $fechaYmd = trim((string)$fechaYmd);
    if ($medicoId <= 0 || $fechaYmd === '') {
        return 0;
    }

    $exprAgendaTurno = '0';
    if ($hasTurnoOriginalColumn && $hasTurnoVigenteColumn) {
        $exprAgendaTurno = 'COALESCE(NULLIF(ras.turno_vigente, 0), NULLIF(ras.turno_original, 0), 0)';
    } elseif ($hasTurnoOriginalColumn) {
        $exprAgendaTurno = 'COALESCE(NULLIF(ras.turno_original, 0), 0)';
    }

    $sql = 'SELECT GREATEST('
        . 'COALESCE((SELECT MAX(COALESCE(c.correlativo_dia_medico, 0))'
        . ' FROM consultas c'
        . ' WHERE c.medico_id = ? AND c.fecha = ?'
        . '   AND LOWER(TRIM(COALESCE(c.estado, ""))) NOT IN ("cancelada", "anulada")), 0),'
        . 'COALESCE((SELECT MAX(' . $exprAgendaTurno . ')'
        . ' FROM agenda_servicios_cotizacion a'
        . ' LEFT JOIN cotizaciones_detalle cd ON cd.id = a.cotizacion_detalle_id'
        . ' LEFT JOIN tarifas t ON t.id = COALESCE(cd.servicio_id, a.servicio_id)'
        . ' LEFT JOIN recordatorios_agenda_servicios ras ON ras.cotizacion_id = a.cotizacion_id'
        . ' WHERE COALESCE(a.medico_id, cd.medico_id, t.medico_id, 0) = ?'
        . '   AND a.fecha_programada = ?'
        . '   AND a.cotizacion_id <> ?'
        . '   AND a.estado_evento IN ("pendiente", "confirmado")), 0)'
        . ') AS max_turno';

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        return 0;
    }
    $stmt->bind_param('isssi', $medicoId, $fechaYmd, $medicoId, $fechaYmd, $cotizacionIdExcluir);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    $maxTurno = (int)($row['max_turno'] ?? 0);
    return $maxTurno + 1;
}

function rc_ensure_turno_vigente_agenda($conn, $cotizacionId, $medicoId, $fechaYmd, $usuarioId, $hasTurnoOriginalColumn, $hasTurnoVigenteColumn) {
    $cotizacionId = (int)$cotizacionId;
    $medicoId = (int)$medicoId;
    $usuarioId = (int)$usuarioId;
    $fechaYmd = trim((string)$fechaYmd);

    if ($cotizacionId <= 0 || $medicoId <= 0 || $fechaYmd === '' || !$hasTurnoVigenteColumn) {
        return 0;
    }

    $turnoOriginal = rc_ensure_turno_original_agenda($conn, $cotizacionId, $usuarioId, $hasTurnoOriginalColumn);

    $turnoVigenteActual = 0;
    if ($hasTurnoOriginalColumn) {
        $stmtActual = $conn->prepare('SELECT COALESCE(turno_vigente, 0) AS turno_vigente, COALESCE(turno_original, 0) AS turno_original FROM recordatorios_agenda_servicios WHERE cotizacion_id = ? LIMIT 1');
    } else {
        $stmtActual = $conn->prepare('SELECT COALESCE(turno_vigente, 0) AS turno_vigente FROM recordatorios_agenda_servicios WHERE cotizacion_id = ? LIMIT 1');
    }
    if ($stmtActual) {
        $stmtActual->bind_param('i', $cotizacionId);
        $stmtActual->execute();
        $rowActual = $stmtActual->get_result()->fetch_assoc();
        $stmtActual->close();
        $turnoVigenteActual = (int)($rowActual['turno_vigente'] ?? 0);
        if ($hasTurnoOriginalColumn && $turnoOriginal <= 0) {
            $turnoOriginal = (int)($rowActual['turno_original'] ?? 0);
        }
    }

    if ($turnoVigenteActual > 0) {
        return $turnoVigenteActual;
    }

    $turnoNuevo = rc_calcular_siguiente_turno_vigente_agenda(
        $conn,
        $medicoId,
        $fechaYmd,
        $cotizacionId,
        $hasTurnoOriginalColumn,
        $hasTurnoVigenteColumn
    );
    if ($turnoNuevo <= 0) {
        $turnoNuevo = $turnoOriginal > 0 ? $turnoOriginal : 1;
    }

    if ($hasTurnoOriginalColumn) {
        $stmtUpd = $conn->prepare('UPDATE recordatorios_agenda_servicios SET turno_original = COALESCE(NULLIF(turno_original, 0), ?), turno_vigente = ?, actualizado_por = ?, updated_at = CURRENT_TIMESTAMP WHERE cotizacion_id = ?');
        if ($stmtUpd) {
            $turnoOriginalFinal = $turnoOriginal > 0 ? $turnoOriginal : $turnoNuevo;
            $stmtUpd->bind_param('iiii', $turnoOriginalFinal, $turnoNuevo, $usuarioId, $cotizacionId);
            $stmtUpd->execute();
            $stmtUpd->close();
        }
    } else {
        $stmtUpd = $conn->prepare('UPDATE recordatorios_agenda_servicios SET turno_vigente = ?, actualizado_por = ?, updated_at = CURRENT_TIMESTAMP WHERE cotizacion_id = ?');
        if ($stmtUpd) {
            $stmtUpd->bind_param('iii', $turnoNuevo, $usuarioId, $cotizacionId);
            $stmtUpd->execute();
            $stmtUpd->close();
        }
    }

    return $turnoNuevo;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    rc_require_session_roles(['administrador', 'recepcionista']);
    rc_ensure_cola_medico_schema($conn);

    $vista = strtolower(trim((string)($_GET['vista'] ?? '')));
    if ($vista === 'disponibilidad_medico') {
        $medicoId = (int)($_GET['medico_id'] ?? 0);
        $fecha = trim((string)($_GET['fecha'] ?? ''));

        if ($medicoId <= 0 || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'medico_id y fecha (YYYY-MM-DD) son requeridos']);
            exit;
        }

        $citas = [];

                if (rc_table_exists($conn, 'consultas')) {
                        $hasCotizaciones = rc_table_exists($conn, 'cotizaciones');
                        $hasCotizacionesDetalle = rc_table_exists($conn, 'cotizaciones_detalle');
                    $hasDetalleEstadoItem = $hasCotizacionesDetalle && rc_column_exists($conn, 'cotizaciones_detalle', 'estado_item');

                        $joinCotRef = '';
                        $joinCot = '';
                        $selectCotCols = 'NULL AS cotizacion_id, NULL AS cotizacion_estado, NULL AS saldo_pendiente';

                        if ($hasCotizaciones && $hasCotizacionesDetalle
                                && rc_column_exists($conn, 'cotizaciones_detalle', 'consulta_id')
                                && rc_column_exists($conn, 'cotizaciones_detalle', 'cotizacion_id')
                                && rc_column_exists($conn, 'cotizaciones', 'id')) {
                                $filtroDetalleActivo = $hasDetalleEstadoItem
                                    ? ' AND cd.estado_item <> "eliminado"'
                                    : '';
                                $joinCotRef = ' LEFT JOIN (
                                                                        SELECT cd.consulta_id, MAX(cd.cotizacion_id) AS cotizacion_id
                                                                        FROM cotizaciones_detalle cd
                                                                        INNER JOIN cotizaciones ct ON ct.id = cd.cotizacion_id
                                                                        WHERE cd.consulta_id IS NOT NULL
                                                                            AND cd.consulta_id > 0
                                                                            AND LOWER(TRIM(COALESCE(cd.servicio_tipo, ""))) = "consulta"'
                                                                            . $filtroDetalleActivo . '
                                                                            AND ct.estado NOT IN ("anulado", "anulada")
                                                                        GROUP BY cd.consulta_id
                                                                ) cot_ref ON cot_ref.consulta_id = c.id';
                                $joinCot = ' LEFT JOIN cotizaciones cot ON cot.id = cot_ref.cotizacion_id';
                                $selectCotCols = 'cot_ref.cotizacion_id AS cotizacion_id, cot.estado AS cotizacion_estado, COALESCE(cot.saldo_pendiente, 0) AS saldo_pendiente';
                        }

            $stmtCons = $conn->prepare(
                                'SELECT c.id, c.hora, c.estado, c.paciente_id,
                                                ' . $selectCotCols . ',
                        p.nombre AS paciente_nombre, p.apellido AS paciente_apellido
                 FROM consultas c
                 INNER JOIN pacientes p ON p.id = c.paciente_id
                                 ' . $joinCotRef . '
                                 ' . $joinCot . '
                 WHERE c.medico_id = ? AND c.fecha = ?
                   AND LOWER(TRIM(COALESCE(c.estado, ""))) NOT IN ("cancelada", "anulada", "completada")
                 ORDER BY c.hora ASC, c.id ASC'
            );
            if ($stmtCons) {
                $stmtCons->bind_param('is', $medicoId, $fecha);
                $stmtCons->execute();
                $resCons = $stmtCons->get_result();
                while ($row = $resCons->fetch_assoc()) {
                    $citas[] = [
                        'id' => (int)($row['id'] ?? 0),
                        'hora' => (string)($row['hora'] ?? ''),
                        'paciente_id' => (int)($row['paciente_id'] ?? 0),
                        'paciente_nombre' => trim((string)($row['paciente_nombre'] ?? '') . ' ' . (string)($row['paciente_apellido'] ?? '')),
                        'servicio' => 'Consulta',
                        'origen' => 'consulta',
                        'estado' => (string)($row['estado'] ?? ''),
                        'cotizacion_id' => isset($row['cotizacion_id']) && (int)$row['cotizacion_id'] > 0 ? (int)$row['cotizacion_id'] : null,
                        'cotizacion_estado' => !empty($row['cotizacion_estado']) ? (string)$row['cotizacion_estado'] : null,
                        'saldo_pendiente' => isset($row['saldo_pendiente']) ? round((float)$row['saldo_pendiente'], 2) : null,
                        'referencia' => 'Consulta #' . (int)($row['id'] ?? 0),
                    ];
                }
                $stmtCons->close();
            }
        }

        if (rc_table_exists($conn, 'agenda_servicios_cotizacion')
            && rc_column_exists($conn, 'agenda_servicios_cotizacion', 'fecha_programada')
            && rc_column_exists($conn, 'agenda_servicios_cotizacion', 'hora_programada')) {

            $hasAgendaMedico = rc_column_exists($conn, 'agenda_servicios_cotizacion', 'medico_id');
            $hasAgendaDetalle = rc_column_exists($conn, 'agenda_servicios_cotizacion', 'cotizacion_detalle_id');
            $hasAgendaServicioId = rc_column_exists($conn, 'agenda_servicios_cotizacion', 'servicio_id');
            $hasAgendaEstado = rc_column_exists($conn, 'agenda_servicios_cotizacion', 'estado_evento');

            $hasDetalle = rc_table_exists($conn, 'cotizaciones_detalle');
            $hasDetalleId = $hasDetalle && rc_column_exists($conn, 'cotizaciones_detalle', 'id');
            $hasDetalleMed = $hasDetalle && rc_column_exists($conn, 'cotizaciones_detalle', 'medico_id');
            $hasDetalleServ = $hasDetalle && rc_column_exists($conn, 'cotizaciones_detalle', 'servicio_id');

            $hasTarifas = rc_table_exists($conn, 'tarifas');
            $hasTarifaId = $hasTarifas && rc_column_exists($conn, 'tarifas', 'id');
            $hasTarifaMed = $hasTarifas && rc_column_exists($conn, 'tarifas', 'medico_id');

            $joinDetalle = ($hasAgendaDetalle && $hasDetalle && $hasDetalleId)
                ? ' LEFT JOIN cotizaciones_detalle cd ON cd.id = a.cotizacion_detalle_id'
                : '';
            $joinTarifa = ($hasTarifas && $hasTarifaId)
                ? ' LEFT JOIN tarifas t ON t.id = COALESCE('
                    . ($hasDetalleServ ? 'cd.servicio_id, ' : '')
                    . ($hasAgendaServicioId ? 'a.servicio_id' : '0')
                    . ')'
                : '';

            $medicoParts = [];
            if ($hasAgendaMedico) $medicoParts[] = 'a.medico_id';
            if ($hasDetalleMed) $medicoParts[] = 'cd.medico_id';
            if ($hasTarifaMed) $medicoParts[] = 't.medico_id';
            $medicoExpr = empty($medicoParts) ? '0' : ('COALESCE(' . implode(', ', $medicoParts) . ', 0)');

            $whereEstado = $hasAgendaEstado
                ? ' AND LOWER(TRIM(COALESCE(a.estado_evento, ""))) NOT IN ("cancelado", "no_asistio", "anulada", "completado", "atendido", "espontaneo", "pagado")'
                : '';

            $whereServicioMedico = ' AND ' . rc_where_servicios_medicos_agenda('a');

            $estadoSelect = $hasAgendaEstado ? 'a.estado_evento' : '"" AS estado_evento';

            $joinCotAgenda = rc_table_exists($conn, 'cotizaciones')
                ? ' LEFT JOIN cotizaciones cot ON cot.id = a.cotizacion_id'
                : '';

            $selectCotAgendaEstado = rc_table_exists($conn, 'cotizaciones')
                ? 'cot.estado AS cotizacion_estado'
                : '"" AS cotizacion_estado';
            $selectCotAgendaSaldo = rc_table_exists($conn, 'cotizaciones')
                ? 'COALESCE(cot.saldo_pendiente, 0) AS saldo_pendiente'
                : 'NULL AS saldo_pendiente';

            $sqlAgenda = 'SELECT a.id, a.hora_programada, a.servicio_tipo, a.titulo_evento, a.paciente_id, a.cotizacion_id, ' . $estadoSelect . ',
                                 ' . $selectCotAgendaEstado . ',
                                 ' . $selectCotAgendaSaldo . ',
                                 p.nombre AS paciente_nombre, p.apellido AS paciente_apellido
                          FROM agenda_servicios_cotizacion a
                          INNER JOIN pacientes p ON p.id = a.paciente_id'
                          . $joinDetalle
                          . $joinTarifa
                          . $joinCotAgenda
                          . ' WHERE ' . $medicoExpr . ' = ? AND a.fecha_programada = ?'
                         . $whereServicioMedico
                          . $whereEstado
                          . ' ORDER BY a.hora_programada ASC, a.id ASC';

            $stmtAg = $conn->prepare($sqlAgenda);
            if ($stmtAg) {
                $stmtAg->bind_param('is', $medicoId, $fecha);
                $stmtAg->execute();
                $resAg = $stmtAg->get_result();
                while ($row = $resAg->fetch_assoc()) {
                    $servicioLabel = rc_servicio_pretty_label((string)($row['servicio_tipo'] ?? ''));
                    $titulo = trim((string)($row['titulo_evento'] ?? ''));
                    if ($titulo === '') $titulo = $servicioLabel;

                    $citas[] = [
                        'id' => (int)($row['id'] ?? 0),
                        'hora' => (string)($row['hora_programada'] ?? ''),
                        'paciente_id' => (int)($row['paciente_id'] ?? 0),
                        'paciente_nombre' => trim((string)($row['paciente_nombre'] ?? '') . ' ' . (string)($row['paciente_apellido'] ?? '')),
                        'servicio' => $servicioLabel,
                        'detalle' => $titulo,
                        'origen' => 'agenda_servicio',
                        'estado' => (string)($row['estado_evento'] ?? ''),
                        'cotizacion_id' => (int)($row['cotizacion_id'] ?? 0),
                        'cotizacion_estado' => !empty($row['cotizacion_estado']) ? (string)$row['cotizacion_estado'] : null,
                        'saldo_pendiente' => isset($row['saldo_pendiente']) ? round((float)$row['saldo_pendiente'], 2) : null,
                        'referencia' => 'Agenda #' . (int)($row['id'] ?? 0),
                    ];
                }
                $stmtAg->close();
            }
        }

        rc_sort_citas_por_hora($citas);

        $horasOcupadas = [];
        foreach ($citas as $c) {
            $hh = rc_normalizar_hora_hms($c['hora'] ?? '');
            if ($hh === '') continue;
            $horasOcupadas[$hh] = true;
        }
        $horasOcupadas = array_keys($horasOcupadas);
        sort($horasOcupadas);

        echo json_encode([
            'success' => true,
            'medico_id' => $medicoId,
            'fecha' => $fecha,
            'count' => count($citas),
            'horas_ocupadas' => $horasOcupadas,
            'citas_programadas' => $citas,
        ]);
        exit;
    }

    $dias = rc_parse_positive_int($_GET['dias'] ?? 30, 30);
    if ($dias > 365) $dias = 365;
    $page = rc_parse_positive_int($_GET['page'] ?? 0, 0);
    $perPage = rc_parse_positive_int($_GET['per_page'] ?? 0, 0);
    $usarPaginacion = ($page > 0 && $perPage > 0);
    if ($usarPaginacion && $perPage > 100) $perPage = 100;
    $pacienteIdFiltro = (int)($_GET['paciente_id'] ?? 0);

    $estadoGestion = trim((string)($_GET['estado_gestion'] ?? ''));
    $busqueda = trim((string)($_GET['busqueda'] ?? ''));
    $soloSinGestion = ((string)($_GET['solo_sin_gestion'] ?? '0') === '1');
    $origenConsulta = trim((string)($_GET['origen_consulta'] ?? ''));
    $tipoRecordatorio = rc_parse_tipo_recordatorio($_GET['tipo_recordatorio'] ?? 'citas');
    $hasConsultasCorrelativoDia = rc_column_exists($conn, 'consultas', 'correlativo_dia_medico');
    $hasRcTurnoOriginal = rc_table_exists($conn, 'recordatorios_consultas')
        && rc_column_exists($conn, 'recordatorios_consultas', 'turno_original');
    $hasRcTurnoVigente = rc_table_exists($conn, 'recordatorios_consultas')
        && rc_column_exists($conn, 'recordatorios_consultas', 'turno_vigente');
    $hasRasTurnoOriginal = rc_table_exists($conn, 'recordatorios_agenda_servicios')
        && rc_column_exists($conn, 'recordatorios_agenda_servicios', 'turno_original');
    $hasRasTurnoVigente = rc_table_exists($conn, 'recordatorios_agenda_servicios')
        && rc_column_exists($conn, 'recordatorios_agenda_servicios', 'turno_vigente');
    if ($hasRcTurnoOriginal && $hasRcTurnoVigente) {
        $selectCorrelativoConsulta = 'COALESCE(NULLIF(rc.turno_vigente, 0), NULLIF(rc.turno_original, 0), ' . ($hasConsultasCorrelativoDia ? 'COALESCE(c.correlativo_dia_medico, 0)' : '0') . ')';
        $selectCorrelativoConsultaOriginal = 'COALESCE(NULLIF(rc.turno_original, 0), ' . ($hasConsultasCorrelativoDia ? 'COALESCE(c.correlativo_dia_medico, 0)' : '0') . ')';
    } elseif ($hasRcTurnoOriginal) {
        $selectCorrelativoConsulta = 'COALESCE(NULLIF(rc.turno_original, 0), ' . ($hasConsultasCorrelativoDia ? 'COALESCE(c.correlativo_dia_medico, 0)' : '0') . ')';
        $selectCorrelativoConsultaOriginal = $selectCorrelativoConsulta;
    } else {
        $selectCorrelativoConsulta = $hasConsultasCorrelativoDia ? 'COALESCE(c.correlativo_dia_medico, 0)' : '0';
        $selectCorrelativoConsultaOriginal = $selectCorrelativoConsulta;
    }
    if ($hasRasTurnoOriginal && $hasRasTurnoVigente) {
        $selectCorrelativoAgenda = 'COALESCE(NULLIF(ras.turno_vigente, 0), NULLIF(ras.turno_original, 0), 0)';
    } elseif ($hasRasTurnoOriginal) {
        $selectCorrelativoAgenda = 'COALESCE(ras.turno_original, 0)';
    } else {
        $selectCorrelativoAgenda = '0';
    }
    $selectCorrelativoAgendaOriginal = $hasRasTurnoOriginal ? 'COALESCE(ras.turno_original, 0)' : '0';

    if ($tipoRecordatorio === 'falta_cancelar') {
        if (!rc_table_exists($conn, 'cotizaciones') || !rc_table_exists($conn, 'pacientes') || !rc_table_exists($conn, 'cotizaciones_detalle')) {
            http_response_code(500);
            echo json_encode([
                'success' => false,
                'error' => 'Esquema incompleto para recordatorios de faltas de pago (cotizaciones/pacientes/detalle).',
            ]);
            exit;
        }

        $hasAtenciones = rc_table_exists($conn, 'atenciones');

        $whereDetalleActivo = rc_column_exists($conn, 'cotizaciones_detalle', 'estado_item')
            ? " AND cd.estado_item <> 'eliminado'"
            : '';

        $where = [
            "LOWER(TRIM(COALESCE(c.estado, ''))) IN ('pendiente', 'parcial')",
            'COALESCE(c.saldo_pendiente, 0) > 0',
            'DATE(c.fecha) >= DATE_SUB(CURDATE(), INTERVAL ? DAY)'
        ];
                if ($hasAtenciones) {
                    $where[] = 'COALESCE(atn.total_pendientes, 0) > 0';
                }

        $types = 'i';
        $params = [$dias];

        if ($busqueda !== '') {
            $where[] = "(
                CONCAT_WS(' ', p.nombre, p.apellido) LIKE ?
                OR p.dni LIKE ?
                OR p.telefono LIKE ?
                OR CAST(c.id AS CHAR) LIKE ?
                OR LOWER(TRIM(COALESCE(srv.servicios_tipos, ''))) LIKE ?
            )";
            $like = '%' . $busqueda . '%';
            $types .= 'sssss';
            $params[] = $like;
            $params[] = $like;
            $params[] = $like;
            $params[] = $like;
            $params[] = $like;
        }

        if ($pacienteIdFiltro > 0) {
            $where[] = 'c.paciente_id = ?';
            $types .= 'i';
            $params[] = $pacienteIdFiltro;
        }

        $whereSql = ' WHERE ' . implode(' AND ', $where);

        $from = " FROM cotizaciones c
                INNER JOIN pacientes p ON p.id = c.paciente_id
                LEFT JOIN (
                    SELECT
                        cd.cotizacion_id,
                        GROUP_CONCAT(DISTINCT LOWER(TRIM(COALESCE(cd.servicio_tipo, ''))) ORDER BY cd.servicio_tipo SEPARATOR ',') AS servicios_tipos
                    FROM cotizaciones_detalle cd
                    WHERE 1=1 {$whereDetalleActivo}
                    GROUP BY cd.cotizacion_id
                ) srv ON srv.cotizacion_id = c.id";

        if ($hasAtenciones) {
            $from .= "
                LEFT JOIN (
                    SELECT a.paciente_id, COUNT(*) AS total_pendientes
                    FROM atenciones a
                    WHERE LOWER(TRIM(COALESCE(a.estado, ''))) = 'pendiente'
                    GROUP BY a.paciente_id
                ) atn ON atn.paciente_id = c.paciente_id";
        }

        $countSql = 'SELECT COUNT(*) AS total' . $from . $whereSql;
        $stmtCount = $conn->prepare($countSql);
        if (!$stmtCount) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'No se pudo preparar conteo de faltas por cancelar']);
            exit;
        }
        $stmtCount->bind_param($types, ...$params);
        $stmtCount->execute();
        $countRow = $stmtCount->get_result()->fetch_assoc() ?: [];
        $stmtCount->close();
        $totalItems = (int)($countRow['total'] ?? 0);

        $sql = "SELECT
                c.id,
                c.paciente_id,
                DATE(c.fecha) AS fecha,
                TIME(c.fecha) AS hora,
                    p.nombre AS paciente_nombre,
                    p.apellido AS paciente_apellido,
                    p.dni AS paciente_dni,
                    p.telefono AS paciente_telefono,
                COALESCE(srv.servicios_tipos, '') AS servicios_tipos,
                c.id AS cotizacion_id,
                c.estado AS cotizacion_estado,
                COALESCE(c.saldo_pendiente, 0) AS saldo_pendiente"
            . $from
            . $whereSql
            . ' ORDER BY c.fecha ASC, c.id ASC';

        $paramsList = $params;
        $typesList = $types;
        if ($usarPaginacion) {
            $offset = ($page - 1) * $perPage;
            $sql .= ' LIMIT ? OFFSET ?';
            $typesList .= 'ii';
            $paramsList[] = $perPage;
            $paramsList[] = $offset;
        }

        $stmt = $conn->prepare($sql);
        if (!$stmt) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'No se pudo preparar listado de faltas por cancelar']);
            exit;
        }
        $stmt->bind_param($typesList, ...$paramsList);
        $stmt->execute();
        $res = $stmt->get_result();

        $items = [];
        while ($row = $res->fetch_assoc()) {
            $items[] = [
                'id' => (int)($row['id'] ?? 0),
                'paciente_id' => (int)($row['paciente_id'] ?? 0),
                'medico_id' => 0,
                'fecha' => (string)($row['fecha'] ?? ''),
                'hora' => (string)($row['hora'] ?? ''),
                'estado_consulta' => 'falta_cancelar',
                'es_control' => 0,
                'hc_origen_id' => 0,
                'tipo_consulta' => 'programada',
                'origen_consulta' => 'cotizacion_saldo_pendiente',
                'recordatorio_tipo' => 'falta_cancelar',
                'servicio_tipo' => rc_servicio_label(explode(',', (string)($row['servicios_tipos'] ?? ''))[0] ?? ''),
                'hc_tiene_registro' => 0,
                'hc_ultima_actualizacion' => null,
                'paciente_nombre' => (string)($row['paciente_nombre'] ?? ''),
                'paciente_apellido' => (string)($row['paciente_apellido'] ?? ''),
                'paciente_dni' => (string)($row['paciente_dni'] ?? ''),
                'paciente_telefono' => (string)($row['paciente_telefono'] ?? ''),
                'medico_nombre' => '',
                'medico_apellido' => '',
                'estado_gestion' => 'pendiente',
                'observacion' => 'Cotización con saldo pendiente por cobrar',
                'fecha_proximo_contacto' => null,
                'fecha_ultimo_contacto' => null,
                'intentos' => 0,
                'gestion_updated_at' => null,
                'cotizacion_id' => (int)($row['cotizacion_id'] ?? 0) > 0 ? (int)$row['cotizacion_id'] : null,
                'cotizacion_estado' => !empty($row['cotizacion_estado']) ? (string)$row['cotizacion_estado'] : null,
                'saldo_pendiente' => round((float)($row['saldo_pendiente'] ?? 0), 2),
            ];
        }
        $stmt->close();

        $response = [
            'success' => true,
            'dias' => $dias,
            'tipo_recordatorio' => $tipoRecordatorio,
            'count' => count($items),
            'total' => $totalItems,
            'stats' => [
                'urgentes' => 0,
                'hoy' => 0,
                'sin_telefono' => 0,
                'confirmadas' => 0,
                'atendidas' => 0,
            ],
            'prioridad' => [
                'critico' => 0,
                'alto' => 0,
                'normal' => (int)$totalItems,
                'bajo' => 0,
                'atendido' => 0,
                'resuelto' => 0,
            ],
            'items' => $items,
        ];
        if ($usarPaginacion) {
            $response['pagination'] = [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $totalItems,
                'total_pages' => max(1, (int)ceil($totalItems / $perPage)),
            ];
        }

        echo json_encode($response);
        exit;
    }

    rc_require_schema($conn);
    $hasAgendaServicios = rc_table_exists($conn, 'agenda_servicios_cotizacion');
    $permitirAgendaPorFiltro = ($origenConsulta === '' || $origenConsulta === 'agendada');
    $considerarAgendaEnListado = $hasAgendaServicios && $permitirAgendaPorFiltro && ($estadoGestion === '' || $estadoGestion === 'pendiente');
    $aplicarPaginacionEnMemoria = $usarPaginacion && $considerarAgendaEnListado;
    $aplicarPaginacionSql = $usarPaginacion && !$aplicarPaginacionEnMemoria;
    $filtroDetalleConsultaActivo = rc_column_exists($conn, 'cotizaciones_detalle', 'estado_item')
        ? " AND cd.estado_item <> 'eliminado'"
        : '';

    $from = " FROM consultas c
            INNER JOIN pacientes p ON p.id = c.paciente_id
            INNER JOIN medicos m ON m.id = c.medico_id
            LEFT JOIN recordatorios_consultas rc ON rc.consulta_id = c.id
            LEFT JOIN (
                SELECT h.consulta_id, MAX(h.fecha_registro) AS hc_ultima_actualizacion, 1 AS hc_tiene_registro
                FROM historia_clinica h
                GROUP BY h.consulta_id
            ) hc ON hc.consulta_id = c.id
                        LEFT JOIN (
                SELECT cd.consulta_id, MAX(cd.cotizacion_id) AS cotizacion_id
                FROM cotizaciones_detalle cd
                INNER JOIN cotizaciones ct ON ct.id = cd.cotizacion_id
                WHERE cd.consulta_id IS NOT NULL
                  AND cd.consulta_id > 0
                  AND ct.estado NOT IN ('anulado', 'anulada')
                GROUP BY cd.consulta_id
                        ) cot_ref_any ON cot_ref_any.consulta_id = c.id
                        LEFT JOIN (
                                SELECT cd.consulta_id, MAX(cd.cotizacion_id) AS cotizacion_id
                                FROM cotizaciones_detalle cd
                                INNER JOIN cotizaciones ct ON ct.id = cd.cotizacion_id
                                WHERE cd.consulta_id IS NOT NULL
                                    AND cd.consulta_id > 0
                                    AND LOWER(TRIM(COALESCE(cd.servicio_tipo, ''))) = 'consulta'"
                                    . $filtroDetalleConsultaActivo . "
                                    AND ct.estado NOT IN ('anulado', 'anulada')
                                GROUP BY cd.consulta_id
                        ) cot_ref_consulta ON cot_ref_consulta.consulta_id = c.id
                        LEFT JOIN cotizaciones cot_consulta ON cot_consulta.id = cot_ref_consulta.cotizacion_id";

    $where = [
        "c.estado IN ('pendiente', 'falta_cancelar', 'completada')",
        'c.fecha >= CURDATE()',
        'c.fecha <= DATE_ADD(CURDATE(), INTERVAL ? DAY)'
    ];
    $types = 'i';
    $params = [$dias];

    if ($estadoGestion !== '') {
        $where[] = 'COALESCE(rc.estado, \'pendiente\') = ?';
        $types .= 's';
        $params[] = $estadoGestion;
    }

    if (in_array($origenConsulta, ['agendada', 'cotizador', 'hc_proxima', 'reservada_sin_turno'], true)) {
        $where[] = 'COALESCE(NULLIF(TRIM(c.origen_creacion), ""), CASE'
              . ' WHEN c.hc_origen_id IS NOT NULL AND c.hc_origen_id > 0 THEN "hc_proxima"'
              . ' WHEN cot_ref_any.cotizacion_id IS NOT NULL THEN "cotizador"'
              . ' ELSE "agendada"'
              . ' END) = ?';
        $types .= 's';
        $params[] = $origenConsulta;
    }

    if ($soloSinGestion) {
        $where[] = "(rc.id IS NULL OR rc.estado IN ('pendiente', 'no_contesta'))";
    }

    if ($busqueda !== '') {
        $where[] = "(
            CONCAT_WS(' ', p.nombre, p.apellido) LIKE ?
            OR CONCAT_WS(' ', m.nombre, m.apellido) LIKE ?
            OR p.dni LIKE ?
            OR p.telefono LIKE ?
            OR CAST(c.id AS CHAR) LIKE ?
        )";
        $like = '%' . $busqueda . '%';
        $types .= 'sssss';
        $params[] = $like;
        $params[] = $like;
        $params[] = $like;
        $params[] = $like;
        $params[] = $like;
    }

    if ($pacienteIdFiltro > 0) {
        $where[] = 'c.paciente_id = ?';
        $types .= 'i';
        $params[] = $pacienteIdFiltro;
    }

    $whereSql = ' WHERE ' . implode(' AND ', $where);

    $statsSql = "SELECT
                COUNT(*) AS total,
                SUM(CASE
                    WHEN DATEDIFF(c.fecha, CURDATE()) <= 1
                     AND COALESCE(rc.estado, 'pendiente') IN ('pendiente', 'no_contesta')
                     AND COALESCE(hc.hc_tiene_registro, 0) = 0
                    THEN 1 ELSE 0 END) AS urgentes,
                SUM(CASE
                    WHEN DATEDIFF(c.fecha, CURDATE()) = 0
                    THEN 1 ELSE 0 END) AS hoy,
                SUM(CASE
                    WHEN COALESCE(NULLIF(TRIM(p.telefono), ''), '') = ''
                    THEN 1 ELSE 0 END) AS sin_telefono,
                SUM(CASE
                    WHEN COALESCE(rc.estado, 'pendiente') = 'confirmado'
                    THEN 1 ELSE 0 END) AS confirmadas,
                SUM(CASE
                    WHEN COALESCE(hc.hc_tiene_registro, 0) = 1
                    THEN 1 ELSE 0 END) AS atendidas,
                SUM(CASE
                    WHEN COALESCE(hc.hc_tiene_registro, 0) = 1
                    THEN 1 ELSE 0 END) AS pr_atendido,
                SUM(CASE
                    WHEN COALESCE(hc.hc_tiene_registro, 0) = 0
                     AND COALESCE(rc.estado, 'pendiente') IN ('confirmado', 'cancelado')
                    THEN 1 ELSE 0 END) AS pr_resuelto,
                SUM(CASE
                    WHEN COALESCE(hc.hc_tiene_registro, 0) = 0
                     AND COALESCE(rc.estado, 'pendiente') NOT IN ('confirmado', 'cancelado')
                     AND DATEDIFF(c.fecha, CURDATE()) = 0
                     AND COALESCE(rc.estado, 'pendiente') IN ('pendiente', 'no_contesta')
                    THEN 1 ELSE 0 END) AS pr_critico,
                SUM(CASE
                    WHEN COALESCE(hc.hc_tiene_registro, 0) = 0
                     AND COALESCE(rc.estado, 'pendiente') NOT IN ('confirmado', 'cancelado')
                     AND NOT (
                        DATEDIFF(c.fecha, CURDATE()) = 0
                        AND COALESCE(rc.estado, 'pendiente') IN ('pendiente', 'no_contesta')
                     )
                     AND (
                        (DATEDIFF(c.fecha, CURDATE()) = 1 AND COALESCE(rc.estado, 'pendiente') IN ('pendiente', 'no_contesta'))
                        OR (COALESCE(NULLIF(TRIM(p.telefono), ''), '') = '' AND COALESCE(rc.estado, 'pendiente') <> 'confirmado')
                     )
                    THEN 1 ELSE 0 END) AS pr_alto,
                SUM(CASE
                    WHEN COALESCE(hc.hc_tiene_registro, 0) = 0
                     AND COALESCE(rc.estado, 'pendiente') IN ('pendiente', 'contactado', 'no_contesta', 'reprogramar')
                     AND NOT (
                        DATEDIFF(c.fecha, CURDATE()) = 0
                        AND COALESCE(rc.estado, 'pendiente') IN ('pendiente', 'no_contesta')
                     )
                     AND NOT (
                        (DATEDIFF(c.fecha, CURDATE()) = 1 AND COALESCE(rc.estado, 'pendiente') IN ('pendiente', 'no_contesta'))
                        OR (COALESCE(NULLIF(TRIM(p.telefono), ''), '') = '' AND COALESCE(rc.estado, 'pendiente') <> 'confirmado')
                     )
                    THEN 1 ELSE 0 END) AS pr_normal
            "
        . $from
        . $whereSql;

    $stmtStats = $conn->prepare($statsSql);
    if (!$stmtStats) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'No se pudo preparar estadísticas de recordatorios']);
        exit;
    }
    $stmtStats->bind_param($types, ...$params);
    $stmtStats->execute();
    $statsRow = $stmtStats->get_result()->fetch_assoc() ?: [];
    $stmtStats->close();

    $totalItems = (int)($statsRow['total'] ?? 0);

    $prAtendido = (int)($statsRow['pr_atendido'] ?? 0);
    $prResuelto = (int)($statsRow['pr_resuelto'] ?? 0);
    $prCritico = (int)($statsRow['pr_critico'] ?? 0);
    $prAlto = (int)($statsRow['pr_alto'] ?? 0);
    $prNormal = (int)($statsRow['pr_normal'] ?? 0);
    $prBajo = max(0, $totalItems - ($prAtendido + $prResuelto + $prCritico + $prAlto + $prNormal));

    $sql = "SELECT
                c.id,
                c.paciente_id,
                c.medico_id,
                c.fecha,
                c.hora,
                c.estado AS estado_consulta,
                c.es_control,
                c.hc_origen_id,
                c.tipo_consulta,
                COALESCE(NULLIF(TRIM(c.origen_creacion), ''), CASE
                    WHEN c.hc_origen_id IS NOT NULL AND c.hc_origen_id > 0 THEN 'hc_proxima'
                    WHEN cot_ref_any.cotizacion_id IS NOT NULL THEN 'cotizador'
                    ELSE 'agendada'
                END) AS origen_consulta,
                COALESCE(hc.hc_tiene_registro, 0) AS hc_tiene_registro,
                hc.hc_ultima_actualizacion,
                p.nombre AS paciente_nombre,
                p.apellido AS paciente_apellido,
                p.dni AS paciente_dni,
                p.telefono AS paciente_telefono,
                m.nombre AS medico_nombre,
                m.apellido AS medico_apellido,
                COALESCE(rc.estado, 'pendiente') AS estado_gestion,
                COALESCE(rc.observacion, '') AS observacion,
                rc.fecha_proximo_contacto,
                rc.fecha_ultimo_contacto,
                COALESCE(rc.intentos, 0) AS intentos,
                rc.updated_at AS gestion_updated_at,
                CASE
                    WHEN cot_ref_consulta.cotizacion_id IS NOT NULL THEN cot_ref_consulta.cotizacion_id
                    WHEN c.estado = 'falta_cancelar' OR (c.hc_origen_id IS NOT NULL AND c.hc_origen_id > 0) THEN cot_ref_consulta.cotizacion_id
                    ELSE NULL
                END AS cotizacion_id,
                CASE
                    WHEN cot_ref_consulta.cotizacion_id IS NOT NULL THEN cot_consulta.estado
                    WHEN c.estado = 'falta_cancelar' OR (c.hc_origen_id IS NOT NULL AND c.hc_origen_id > 0) THEN cot_consulta.estado
                    ELSE NULL
                END AS cotizacion_estado,
                CASE
                    WHEN cot_ref_consulta.cotizacion_id IS NOT NULL THEN COALESCE(cot_consulta.saldo_pendiente, 0)
                    WHEN c.estado = 'falta_cancelar' OR (c.hc_origen_id IS NOT NULL AND c.hc_origen_id > 0) THEN COALESCE(cot_consulta.saldo_pendiente, 0)
                    ELSE NULL
                END AS saldo_pendiente,
                {$selectCorrelativoConsulta} AS correlativo_estable,
                {$selectCorrelativoConsultaOriginal} AS correlativo_original"
            . $from
            . $whereSql
            . ' ORDER BY c.fecha ASC, c.hora ASC, c.id ASC';

    $paramsList = $params;
    $typesList = $types;
    if ($aplicarPaginacionSql) {
        $offset = ($page - 1) * $perPage;
        $sql .= ' LIMIT ? OFFSET ?';
        $typesList .= 'ii';
        $paramsList[] = $perPage;
        $paramsList[] = $offset;
    }

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'No se pudo preparar consulta de recordatorios']);
        exit;
    }

    $stmt->bind_param($typesList, ...$paramsList);
    $stmt->execute();
    $res = $stmt->get_result();

    $items = [];
    while ($row = $res->fetch_assoc()) {
        $items[] = [
            'id' => (int)($row['id'] ?? 0),
            'paciente_id' => (int)($row['paciente_id'] ?? 0),
            'medico_id' => (int)($row['medico_id'] ?? 0),
            'fecha' => (string)($row['fecha'] ?? ''),
            'hora' => (string)($row['hora'] ?? ''),
            'estado_consulta' => (string)($row['estado_consulta'] ?? ''),
            'es_control' => (int)($row['es_control'] ?? 0),
            'hc_origen_id' => (int)($row['hc_origen_id'] ?? 0),
            'tipo_consulta' => (string)($row['tipo_consulta'] ?? ''),
            'origen_consulta' => (string)($row['origen_consulta'] ?? 'agendada'),
            'recordatorio_tipo' => 'cita',
            'servicio_tipo' => 'consulta',
            'hc_tiene_registro' => (int)($row['hc_tiene_registro'] ?? 0),
            'hc_ultima_actualizacion' => $row['hc_ultima_actualizacion'],
            'paciente_nombre' => (string)($row['paciente_nombre'] ?? ''),
            'paciente_apellido' => (string)($row['paciente_apellido'] ?? ''),
            'paciente_dni' => (string)($row['paciente_dni'] ?? ''),
            'paciente_telefono' => (string)($row['paciente_telefono'] ?? ''),
            'medico_nombre' => (string)($row['medico_nombre'] ?? ''),
            'medico_apellido' => (string)($row['medico_apellido'] ?? ''),
            'estado_gestion' => (string)($row['estado_gestion'] ?? 'pendiente'),
            'observacion' => (string)($row['observacion'] ?? ''),
            'fecha_proximo_contacto' => $row['fecha_proximo_contacto'],
            'fecha_ultimo_contacto' => $row['fecha_ultimo_contacto'],
            'intentos' => (int)($row['intentos'] ?? 0),
            'gestion_updated_at' => $row['gestion_updated_at'],
            'cotizacion_id' => isset($row['cotizacion_id']) && (int)$row['cotizacion_id'] > 0 ? (int)$row['cotizacion_id'] : null,
            'cotizacion_estado' => !empty($row['cotizacion_estado']) ? (string)$row['cotizacion_estado'] : null,
            'saldo_pendiente' => isset($row['saldo_pendiente']) ? round((float)$row['saldo_pendiente'], 2) : null,
            'correlativo_estable' => (int)($row['correlativo_estable'] ?? 0) > 0 ? (int)$row['correlativo_estable'] : null,
            'correlativo_original' => (int)($row['correlativo_original'] ?? 0) > 0 ? (int)$row['correlativo_original'] : null,
        ];
    }
    $stmt->close();

    $agendaRows = [];
    if ($considerarAgendaEnListado) {
        $agendaWhere = [
            "LOWER(TRIM(COALESCE(a.estado_evento, ''))) IN ('pendiente', 'confirmado')",
            'a.fecha_programada >= CURDATE()',
            'a.fecha_programada <= DATE_ADD(CURDATE(), INTERVAL ? DAY)',
            rc_where_servicios_medicos_agenda('a'),
        ];
        $agendaTypes = 'i';
        $agendaParams = [$dias];

        if ($busqueda !== '') {
            $agendaWhere[] = "(
                CONCAT_WS(' ', p.nombre, p.apellido) LIKE ?
                OR p.dni LIKE ?
                OR p.telefono LIKE ?
                OR CAST(a.id AS CHAR) LIKE ?
                OR LOWER(TRIM(COALESCE(a.servicio_tipo, ''))) LIKE ?
                OR LOWER(TRIM(COALESCE(a.titulo_evento, ''))) LIKE ?
            )";
            $like = '%' . $busqueda . '%';
            $agendaTypes .= 'ssssss';
            $agendaParams[] = $like;
            $agendaParams[] = $like;
            $agendaParams[] = $like;
            $agendaParams[] = $like;
            $agendaParams[] = $like;
            $agendaParams[] = $like;
        }

        $agendaSql = "SELECT
                a.id,
                a.paciente_id,
            COALESCE(a.medico_id, cd.medico_id, t.medico_id, 0) AS medico_id,
                COALESCE(cd.consulta_id, 0) AS consulta_id_ref,
                a.fecha_programada,
                a.hora_programada,
                a.estado_evento,
                a.servicio_tipo,
                a.titulo_evento,
                a.observaciones,
                a.cotizacion_id,
                cot.estado AS cotizacion_estado,
                cot.saldo_pendiente AS saldo_pendiente,
                COALESCE(srv.servicios_tipos, '') AS servicios_tipos,
                p.nombre AS paciente_nombre,
                p.apellido AS paciente_apellido,
                p.dni AS paciente_dni,
                p.telefono AS paciente_telefono,
                COALESCE(m.nombre, md.nombre, mt.nombre, '') AS medico_nombre,
                COALESCE(m.apellido, md.apellido, mt.apellido, '') AS medico_apellido,
                ras.estado AS ras_estado,
                ras.observacion AS ras_observacion,
                ras.intentos AS ras_intentos,
                ras.fecha_ultimo_contacto AS ras_fecha_ultimo_contacto,
                COALESCE(ras.turno_vigente, 0) AS correlativo_vigente_raw,
                {$selectCorrelativoAgenda} AS correlativo_estable,
                {$selectCorrelativoAgendaOriginal} AS correlativo_original
            FROM agenda_servicios_cotizacion a
            INNER JOIN pacientes p ON p.id = a.paciente_id
            LEFT JOIN cotizaciones_detalle cd ON cd.id = a.cotizacion_detalle_id
            LEFT JOIN tarifas t ON t.id = COALESCE(cd.servicio_id, a.servicio_id)
            LEFT JOIN (
                SELECT
                    cd2.cotizacion_id,
                    GROUP_CONCAT(DISTINCT LOWER(TRIM(COALESCE(cd2.servicio_tipo, ''))) ORDER BY cd2.servicio_tipo SEPARATOR ',') AS servicios_tipos
                FROM cotizaciones_detalle cd2
                WHERE 1=1
                GROUP BY cd2.cotizacion_id
            ) srv ON srv.cotizacion_id = a.cotizacion_id
            LEFT JOIN medicos m ON m.id = a.medico_id
            LEFT JOIN medicos md ON md.id = cd.medico_id
            LEFT JOIN medicos mt ON mt.id = t.medico_id
            LEFT JOIN cotizaciones cot ON cot.id = a.cotizacion_id
            LEFT JOIN recordatorios_agenda_servicios ras ON ras.cotizacion_id = a.cotizacion_id
            WHERE " . implode(' AND ', $agendaWhere) . "
            ORDER BY a.fecha_programada ASC, a.hora_programada ASC, a.id ASC";

        $stmtAgenda = $conn->prepare($agendaSql);
        if ($stmtAgenda) {
            $agendaTurnoCache = [];
            $stmtAgenda->bind_param($agendaTypes, ...$agendaParams);
            $stmtAgenda->execute();
            $resAgenda = $stmtAgenda->get_result();
            while ($row = $resAgenda->fetch_assoc()) {
                $cotizacionIdAgenda = isset($row['cotizacion_id']) && (int)$row['cotizacion_id'] > 0 ? (int)$row['cotizacion_id'] : 0;
                $correlativoEstable = (int)($row['correlativo_estable'] ?? 0);
                $correlativoVigenteRaw = (int)($row['correlativo_vigente_raw'] ?? 0);
                if ($correlativoVigenteRaw <= 0 && $cotizacionIdAgenda > 0 && $hasRasTurnoVigente) {
                    if (!array_key_exists($cotizacionIdAgenda, $agendaTurnoCache)) {
                        $agendaTurnoCache[$cotizacionIdAgenda] = rc_ensure_turno_vigente_agenda(
                            $conn,
                            $cotizacionIdAgenda,
                            (int)($row['medico_id'] ?? 0),
                            (string)($row['fecha_programada'] ?? ''),
                            (int)($_SESSION['usuario']['id'] ?? 0),
                            $hasRasTurnoOriginal,
                            $hasRasTurnoVigente
                        );
                    }
                    $correlativoEstable = max($correlativoEstable, (int)$agendaTurnoCache[$cotizacionIdAgenda]);
                }

                $agendaRows[] = [
                    'id' => (int)($row['id'] ?? 0),
                    'consulta_id_ref' => (int)($row['consulta_id_ref'] ?? 0),
                    'paciente_id' => (int)($row['paciente_id'] ?? 0),
                    'medico_id' => (int)($row['medico_id'] ?? 0),
                    'fecha' => (string)($row['fecha_programada'] ?? ''),
                    'hora' => (string)($row['hora_programada'] ?? ''),
                    'estado_consulta' => (string)($row['estado_evento'] ?? 'pendiente'),
                    'es_control' => 0,
                    'hc_origen_id' => 0,
                    'tipo_consulta' => 'programada',
                    'origen_consulta' => 'agenda_servicio',
                    'recordatorio_tipo' => 'cita',
                    'servicio_tipo' => rc_servicio_label((string)($row['servicio_tipo'] ?? 'otros')),
                    'servicios_label' => rc_servicios_label((string)($row['servicios_tipos'] ?? ''), (string)($row['servicio_tipo'] ?? 'otros')),
                    'hc_tiene_registro' => 0,
                    'hc_ultima_actualizacion' => null,
                    'paciente_nombre' => (string)($row['paciente_nombre'] ?? ''),
                    'paciente_apellido' => (string)($row['paciente_apellido'] ?? ''),
                    'paciente_dni' => (string)($row['paciente_dni'] ?? ''),
                    'paciente_telefono' => (string)($row['paciente_telefono'] ?? ''),
                    'medico_nombre' => (string)($row['medico_nombre'] ?? ''),
                    'medico_apellido' => (string)($row['medico_apellido'] ?? ''),
                    'estado_gestion' => (string)($row['ras_estado'] ?? 'pendiente'),
                    'observacion' => rc_resolver_observacion_agenda_recordatorio(
                        $row['ras_observacion'] ?? '',
                        $row['observaciones'] ?? '',
                        $row['titulo_evento'] ?? ''
                    ),
                    'fecha_proximo_contacto' => null,
                    'fecha_ultimo_contacto' => $row['ras_fecha_ultimo_contacto'] ?? null,
                    'intentos' => (int)($row['ras_intentos'] ?? 0),
                    'gestion_updated_at' => null,
                    'cotizacion_id' => $cotizacionIdAgenda > 0 ? $cotizacionIdAgenda : null,
                    'cotizacion_estado' => !empty($row['cotizacion_estado']) ? (string)$row['cotizacion_estado'] : null,
                    'saldo_pendiente' => isset($row['saldo_pendiente']) ? round((float)$row['saldo_pendiente'], 2) : null,
                    'correlativo_estable' => $correlativoEstable > 0 ? $correlativoEstable : null,
                    'correlativo_original' => (int)($row['correlativo_original'] ?? 0) > 0 ? (int)$row['correlativo_original'] : null,
                ];
            }
            $stmtAgenda->close();
        }
    }

    if (!empty($agendaRows)) {
        $items = array_merge($items, $agendaRows);
        usort($items, function ($a, $b) {
            $fa = (string)($a['fecha'] ?? '');
            $fb = (string)($b['fecha'] ?? '');
            if ($fa !== $fb) return strcmp($fa, $fb);
            $ha = (string)($a['hora'] ?? '');
            $hb = (string)($b['hora'] ?? '');
            if ($ha !== $hb) return strcmp($ha, $hb);
            return ((int)($a['id'] ?? 0)) <=> ((int)($b['id'] ?? 0));
        });
    }

    if ($tipoRecordatorio === 'citas') {
        rc_reasignar_correlativo_unificado($items);
    }

    $colaMap = rc_cola_map_for_items($conn, $items);
    rc_attach_cola_to_items($items, $colaMap);

    if ($considerarAgendaEnListado || !$usarPaginacion) {
        $totalItems = count($items);
    }
    if ($aplicarPaginacionEnMemoria) {
        $offset = max(0, ($page - 1) * $perPage);
        $items = array_slice($items, $offset, $perPage);
    }

    $response = [
        'success' => true,
        'dias' => $dias,
        'tipo_recordatorio' => $tipoRecordatorio,
        'count' => count($items),
        'total' => $totalItems,
        'stats' => [
            'urgentes' => (int)($statsRow['urgentes'] ?? 0),
            'hoy' => (int)($statsRow['hoy'] ?? 0),
            'sin_telefono' => (int)($statsRow['sin_telefono'] ?? 0),
            'confirmadas' => (int)($statsRow['confirmadas'] ?? 0),
            'atendidas' => (int)($statsRow['atendidas'] ?? 0),
        ],
        'prioridad' => [
            'critico' => $prCritico,
            'alto' => $prAlto,
            'normal' => $prNormal,
            'bajo' => $prBajo,
            'atendido' => $prAtendido,
            'resuelto' => $prResuelto,
        ],
        'items' => $items,
    ];
    if ($aplicarPaginacionEnMemoria) {
        $response['pagination'] = [
            'page' => $page,
            'per_page' => $perPage,
            'total' => $totalItems,
            'total_pages' => max(1, (int)ceil($totalItems / $perPage)),
        ];
    }

    echo json_encode($response);
    exit;
}

if ($method === 'POST' || $method === 'PUT') {
    rc_require_session_roles(['administrador', 'recepcionista']);
    rc_require_schema($conn);
    rc_ensure_cola_medico_schema($conn);
    $hasRasTurnoOriginal = rc_table_exists($conn, 'recordatorios_agenda_servicios')
        && rc_column_exists($conn, 'recordatorios_agenda_servicios', 'turno_original');
    $hasRasTurnoVigente = rc_table_exists($conn, 'recordatorios_agenda_servicios')
        && rc_column_exists($conn, 'recordatorios_agenda_servicios', 'turno_vigente');

    $payload = json_decode(file_get_contents('php://input'), true);
    if (!is_array($payload)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'JSON invalido']);
        exit;
    }

    // ── Acción especial: crear cotización para consulta falta_cancelar ──
    $accion = trim((string)($payload['action'] ?? ''));
    if ($accion === 'actualizar_cola_medico') {
        $consultaId = (int)($payload['consulta_id'] ?? 0);
        $cotizacionId = (int)($payload['cotizacion_id'] ?? 0);
        $medicoId = (int)($payload['medico_id'] ?? 0);
        $fechaAtencion = trim((string)($payload['fecha'] ?? ''));
        $estadoCola = strtolower(trim((string)($payload['estado_cola'] ?? 'pendiente')));
        $prioridadCola = strtolower(trim((string)($payload['prioridad_cola'] ?? 'normal')));
        $prioridadDetalle = trim((string)($payload['prioridad_detalle'] ?? ''));
        $esSiguiente = !empty($payload['es_siguiente']) ? 1 : 0;

        $sourceKey = rc_cola_source_key($consultaId, $cotizacionId);
        if ($sourceKey === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'consulta_id o cotizacion_id es requerido']);
            exit;
        }
        if ($medicoId <= 0 || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $fechaAtencion)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'medico_id y fecha (YYYY-MM-DD) son requeridos']);
            exit;
        }

        $estadosPermitidos = ['pendiente', 'llego', 'en_sala', 'llamando', 'en_atencion', 'retirado'];
        if (!in_array($estadoCola, $estadosPermitidos, true)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'estado_cola no permitido']);
            exit;
        }

        $prioridadesPermitidas = ['normal', 'adulto_mayor', 'nino', 'embarazada', 'urgente'];
        if (!in_array($prioridadCola, $prioridadesPermitidas, true)) {
            $prioridadCola = 'normal';
        }

        $usuarioId = (int)($_SESSION['usuario']['id'] ?? 0);
        $correlativo = 0;
        $stmtActual = $conn->prepare('SELECT correlativo_cola FROM recordatorios_cola_medico WHERE source_key = ? LIMIT 1');
        if ($stmtActual) {
            $stmtActual->bind_param('s', $sourceKey);
            $stmtActual->execute();
            $rowActual = $stmtActual->get_result()->fetch_assoc();
            $stmtActual->close();
            $correlativo = (int)($rowActual['correlativo_cola'] ?? 0);
        }
        if ($estadoCola === 'en_sala' && $correlativo <= 0) {
            $correlativo = rc_cola_siguiente_correlativo($conn, $medicoId, $fechaAtencion);
        }

        if ($esSiguiente === 1) {
            $stmtClear = $conn->prepare('UPDATE recordatorios_cola_medico SET es_siguiente = 0 WHERE medico_id = ? AND fecha_atencion = ? AND source_key <> ?');
            if ($stmtClear) {
                $stmtClear->bind_param('iss', $medicoId, $fechaAtencion, $sourceKey);
                $stmtClear->execute();
                $stmtClear->close();
            }
        }

        if ($estadoCola === 'en_atencion') {
            $esSiguiente = 0;
        }

        $stmtUp = $conn->prepare(
            'INSERT INTO recordatorios_cola_medico
            (source_key, consulta_id, cotizacion_id, medico_id, fecha_atencion, estado_cola, correlativo_cola, es_siguiente, prioridad_cola, prioridad_detalle, actualizado_por)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              consulta_id = VALUES(consulta_id),
              cotizacion_id = VALUES(cotizacion_id),
              medico_id = VALUES(medico_id),
              fecha_atencion = VALUES(fecha_atencion),
              estado_cola = VALUES(estado_cola),
              correlativo_cola = CASE
                WHEN VALUES(correlativo_cola) > 0 THEN VALUES(correlativo_cola)
                ELSE correlativo_cola
              END,
              es_siguiente = VALUES(es_siguiente),
              prioridad_cola = VALUES(prioridad_cola),
              prioridad_detalle = VALUES(prioridad_detalle),
              actualizado_por = VALUES(actualizado_por),
              updated_at = CURRENT_TIMESTAMP'
        );

        if (!$stmtUp) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'No se pudo preparar actualización de cola']);
            exit;
        }

        $stmtUp->bind_param(
            'siiissiissi',
            $sourceKey,
            $consultaId,
            $cotizacionId,
            $medicoId,
            $fechaAtencion,
            $estadoCola,
            $correlativo,
            $esSiguiente,
            $prioridadCola,
            $prioridadDetalle,
            $usuarioId
        );
        $ok = $stmtUp->execute();
        $stmtUp->close();

        if (!$ok) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'No se pudo actualizar cola médica']);
            exit;
        }

        echo json_encode([
            'success' => true,
            'cola' => [
                'source_key' => $sourceKey,
                'consulta_id' => $consultaId,
                'cotizacion_id' => $cotizacionId,
                'medico_id' => $medicoId,
                'fecha_atencion' => $fechaAtencion,
                'estado_cola' => $estadoCola,
                'correlativo_cola' => $correlativo,
                'es_siguiente' => $esSiguiente,
                'prioridad_cola' => $prioridadCola,
                'prioridad_detalle' => $prioridadDetalle,
            ],
        ]);
        exit;
    }

    if ($accion === 'crear_cotizacion') {
        $consultaId = (int)($payload['consulta_id'] ?? 0);
        if ($consultaId <= 0) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'consulta_id requerido']);
            exit;
        }

        $stmtC = $conn->prepare('SELECT id, paciente_id, medico_id, es_control FROM consultas WHERE id = ? LIMIT 1');
        $stmtC->bind_param('i', $consultaId);
        $stmtC->execute();
        $consultaRow = $stmtC->get_result()->fetch_assoc();
        $stmtC->close();

        if (!$consultaRow) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Consulta no encontrada']);
            exit;
        }

        if ((int)($consultaRow['es_control'] ?? 0) === 1) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'La cita está marcada como control sin costo y no requiere cobro']);
            exit;
        }

        $pacienteId = (int)$consultaRow['paciente_id'];
        $medicoId   = (int)$consultaRow['medico_id'];

        // Verificar si ya existe cotización vinculada
        $stmtExist = $conn->prepare(
            'SELECT cd.cotizacion_id FROM cotizaciones_detalle cd'
            . ' INNER JOIN cotizaciones ct ON ct.id = cd.cotizacion_id'
            . ' WHERE cd.consulta_id = ? AND ct.estado NOT IN ("anulado")'
            . ' ORDER BY cd.cotizacion_id DESC LIMIT 1'
        );
        $stmtExist->bind_param('i', $consultaId);
        $stmtExist->execute();
        $existRow = $stmtExist->get_result()->fetch_assoc();
        $stmtExist->close();

        if ($existRow) {
            echo json_encode(['success' => true, 'cotizacion_id' => (int)$existRow['cotizacion_id'], 'ya_existia' => true]);
            exit;
        }

        // Buscar tarifa de consulta para el médico
        $tarifaId     = 0;
        $tarifaPrecio = 0.0;
        $tarifaDesc   = 'Consulta médica';

        $stmtTar = $conn->prepare('SELECT id, precio_particular, descripcion FROM tarifas WHERE servicio_tipo = "consulta" AND activo = 1 AND medico_id = ? ORDER BY id DESC LIMIT 1');
        if ($stmtTar) {
            $stmtTar->bind_param('i', $medicoId);
            $stmtTar->execute();
            $tarRow = $stmtTar->get_result()->fetch_assoc();
            $stmtTar->close();
            if ($tarRow) {
                $tarifaId     = (int)$tarRow['id'];
                $tarifaPrecio = round((float)$tarRow['precio_particular'], 2);
                $tarifaDesc   = trim((string)($tarRow['descripcion'] ?? 'Consulta médica'));
            }
        }
        if ($tarifaId <= 0) {
            $stmtTar2 = $conn->prepare('SELECT id, precio_particular, descripcion FROM tarifas WHERE servicio_tipo = "consulta" AND activo = 1 AND (medico_id IS NULL OR medico_id = 0) ORDER BY id DESC LIMIT 1');
            if ($stmtTar2) {
                $stmtTar2->execute();
                $tarRow2 = $stmtTar2->get_result()->fetch_assoc();
                $stmtTar2->close();
                if ($tarRow2) {
                    $tarifaId     = (int)$tarRow2['id'];
                    $tarifaPrecio = round((float)$tarRow2['precio_particular'], 2);
                    $tarifaDesc   = trim((string)($tarRow2['descripcion'] ?? 'Consulta médica'));
                }
            }
        }

        if ($tarifaId <= 0 || $tarifaPrecio <= 0) {
            http_response_code(422);
            echo json_encode(['success' => false, 'error' => 'No se encontró tarifa de consulta activa para este médico']);
            exit;
        }

        $usuarioId = (int)($_SESSION['usuario']['id'] ?? 1);
        $obs = 'Próxima cita desde Historia Clínica';
        $stmtCot = $conn->prepare('INSERT INTO cotizaciones (paciente_id, usuario_id, total, saldo_pendiente, estado, observaciones) VALUES (?, ?, ?, ?, "pendiente", ?)');
        if (!$stmtCot) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'No se pudo crear cotización']);
            exit;
        }
        $stmtCot->bind_param('iidds', $pacienteId, $usuarioId, $tarifaPrecio, $tarifaPrecio, $obs);
        $stmtCot->execute();
        $cotizacionId = (int)$stmtCot->insert_id;
        $stmtCot->close();

        if ($cotizacionId <= 0) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Error al insertar cotización']);
            exit;
        }

        $stmtDet = $conn->prepare('INSERT INTO cotizaciones_detalle (cotizacion_id, servicio_tipo, servicio_id, descripcion, cantidad, precio_unitario, subtotal, medico_id, consulta_id) VALUES (?, "consulta", ?, ?, 1, ?, ?, ?, ?)');
        if ($stmtDet) {
            $stmtDet->bind_param('iisddii', $cotizacionId, $tarifaId, $tarifaDesc, $tarifaPrecio, $tarifaPrecio, $medicoId, $consultaId);
            $stmtDet->execute();
            $stmtDet->close();
        }

        echo json_encode(['success' => true, 'cotizacion_id' => $cotizacionId, 'ya_existia' => false]);
        exit;
    }

    // ── Acción nueva: guardar gestión para servicios agendados (agenda_servicios_cotizacion) ──
    if ($accion === 'guardar_gestion_agenda') {
        $cotizacionId = (int)($payload['cotizacion_id'] ?? 0);
        $estado = trim((string)($payload['estado'] ?? ''));
        $observacion = trim((string)($payload['observacion'] ?? ''));
        $fechaProximoContacto = trim((string)($payload['fecha_proximo_contacto'] ?? ''));

        if ($cotizacionId <= 0 || $estado === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'cotizacion_id y estado son requeridos']);
            exit;
        }

        $estadosPermitidos = ['pendiente', 'contactado', 'confirmado', 'no_contesta', 'reprogramar', 'cancelado'];
        if (!in_array($estado, $estadosPermitidos, true)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Estado de gestion no permitido']);
            exit;
        }

        // Verificar que la cotización existe
        $stmtCot = $conn->prepare('SELECT id FROM cotizaciones WHERE id = ? LIMIT 1');
        $stmtCot->bind_param('i', $cotizacionId);
        $stmtCot->execute();
        $cotizacionExiste = $stmtCot->get_result()->fetch_assoc();
        $stmtCot->close();

        if (!$cotizacionExiste) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Cotización no encontrada']);
            exit;
        }

        // Verificar que existen items pendiente/confirmado de agenda para esa cotización
        $stmtAgenda = $conn->prepare('SELECT id FROM agenda_servicios_cotizacion WHERE cotizacion_id = ? AND estado_evento IN ("pendiente", "confirmado") LIMIT 1');
        $stmtAgenda->bind_param('i', $cotizacionId);
        $stmtAgenda->execute();
        $agendaExiste = $stmtAgenda->get_result()->fetch_assoc();
        $stmtAgenda->close();

        if (!$agendaExiste) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'No hay servicios agendados pendientes para esta cotización']);
            exit;
        }

        $usuarioId = (int)($_SESSION['usuario']['id'] ?? 0);
        rc_ensure_turno_original_agenda($conn, $cotizacionId, $usuarioId, $hasRasTurnoOriginal);
        $fechaProximoValue = null;
        if ($fechaProximoContacto !== '') {
            $ts = strtotime($fechaProximoContacto);
            if ($ts !== false) {
                $fechaProximoValue = date('Y-m-d H:i:s', $ts);
            }
        }

        $sumarIntento = in_array($estado, ['contactado', 'confirmado', 'no_contesta', 'reprogramar'], true) ? 1 : 0;

        $sql = 'INSERT INTO recordatorios_agenda_servicios (cotizacion_id, estado, observacion, fecha_proximo_contacto, fecha_ultimo_contacto, intentos, actualizado_por)
                VALUES (?, ?, ?, ?, NOW(), ?, ?)
                ON DUPLICATE KEY UPDATE
                  estado = VALUES(estado),
                  observacion = VALUES(observacion),
                  fecha_proximo_contacto = VALUES(fecha_proximo_contacto),
                  fecha_ultimo_contacto = NOW(),
                  intentos = intentos + VALUES(intentos),
                  actualizado_por = VALUES(actualizado_por),
                  updated_at = CURRENT_TIMESTAMP';

        $stmt = $conn->prepare($sql);
        if (!$stmt) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'No se pudo preparar actualizacion']);
            exit;
        }

        $stmt->bind_param('isssii', $cotizacionId, $estado, $observacion, $fechaProximoValue, $sumarIntento, $usuarioId);
        $ok = $stmt->execute();
        $stmt->close();

        if (!$ok) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'No se pudo guardar gestion']);
            exit;
        }

        echo json_encode([
            'success' => true,
            'saved' => [
                'cotizacion_id' => $cotizacionId,
                'estado' => $estado,
                'observacion' => $observacion,
                'fecha_proximo_contacto' => $fechaProximoValue,
                'sumar_intento' => $sumarIntento,
            ],
        ]);
        exit;
    }

    // ── Acción nueva: reprogramar servicios agendados a nueva fecha/hora ──
    if ($accion === 'reprogramar_agenda_servicio') {
        $cotizacionId = (int)($payload['cotizacion_id'] ?? 0);
        $nuevaFecha = trim((string)($payload['nueva_fecha'] ?? ''));
        $nuevaHora = trim((string)($payload['nueva_hora'] ?? ''));

        if ($cotizacionId <= 0 || $nuevaFecha === '' || $nuevaHora === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'cotizacion_id, nueva_fecha y nueva_hora son requeridos']);
            exit;
        }

        // Validar formato de fecha
        $dateCheck = \DateTime::createFromFormat('Y-m-d', $nuevaFecha);
        if (!$dateCheck || $dateCheck->format('Y-m-d') !== $nuevaFecha) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Formato de fecha inválido (esperado: YYYY-MM-DD)']);
            exit;
        }

        // Normalizar hora: si es "HH:MM", agregar ":00"
        if (strlen($nuevaHora) === 5 && substr_count($nuevaHora, ':') === 1) {
            $nuevaHora = $nuevaHora . ':00';
        }

        // Validar formato de hora
        $timeCheck = \DateTime::createFromFormat('H:i:s', $nuevaHora);
        if (!$timeCheck || $timeCheck->format('H:i:s') !== $nuevaHora) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Formato de hora inválido (esperado: HH:MM:SS)']);
            exit;
        }

                // Verificar que existen items pendiente/confirmado para esa cotización y resolver médico real
                $stmtAgenda = $conn->prepare(
                        'SELECT COALESCE(a.medico_id, cd.medico_id, t.medico_id, 0) AS medico_id
                         FROM agenda_servicios_cotizacion a
                         LEFT JOIN cotizaciones_detalle cd ON cd.id = a.cotizacion_detalle_id
                         LEFT JOIN tarifas t ON t.id = COALESCE(cd.servicio_id, a.servicio_id)
                         WHERE a.cotizacion_id = ?
                             AND a.estado_evento IN ("pendiente", "confirmado")
                         ORDER BY a.fecha_programada ASC, a.hora_programada ASC, a.id ASC
                         LIMIT 1'
                );
        $stmtAgenda->bind_param('i', $cotizacionId);
        $stmtAgenda->execute();
        $agendaRow = $stmtAgenda->get_result()->fetch_assoc();
        $stmtAgenda->close();

        if (!$agendaRow) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'No hay servicios agendados pendientes para esta cotización']);
            exit;
        }

        $medicoId = (int)($agendaRow['medico_id'] ?? 0);

        // Detectar conflicto: si hay médico asignado, verificar que no hay otra cita a esa hora
        if ($medicoId > 0) {
            $stmtConflicto = $conn->prepare(
                'SELECT id FROM agenda_servicios_cotizacion 
                 WHERE medico_id = ? 
                 AND fecha_programada = ? 
                 AND hora_programada = ? 
                 AND cotizacion_id <> ? 
                 AND estado_evento NOT IN ("cancelado", "no_asistio") 
                 LIMIT 1'
            );
            $stmtConflicto->bind_param('issi', $medicoId, $nuevaFecha, $nuevaHora, $cotizacionId);
            $stmtConflicto->execute();
            $conflicto = $stmtConflicto->get_result()->fetch_assoc();
            $stmtConflicto->close();

            if ($conflicto) {
                echo json_encode([
                    'success' => false,
                    'error' => 'El médico ya tiene una cita en ese horario',
                ]);
                exit;
            }
        }

        $usuarioId = (int)($_SESSION['usuario']['id'] ?? 0);
        $turnoOriginal = rc_ensure_turno_original_agenda($conn, $cotizacionId, $usuarioId, $hasRasTurnoOriginal);
        $turnoAntes = $turnoOriginal;
        if ($hasRasTurnoOriginal || $hasRasTurnoVigente) {
            $sqlTurnoAntes = 'SELECT '
                . ($hasRasTurnoVigente ? 'COALESCE(turno_vigente, 0)' : '0') . ' AS turno_vigente, '
                . ($hasRasTurnoOriginal ? 'COALESCE(turno_original, 0)' : '0') . ' AS turno_original '
                . 'FROM recordatorios_agenda_servicios WHERE cotizacion_id = ? LIMIT 1';
            $stmtTurnoAntes = $conn->prepare($sqlTurnoAntes);
            if ($stmtTurnoAntes) {
                $stmtTurnoAntes->bind_param('i', $cotizacionId);
                $stmtTurnoAntes->execute();
                $turnoRow = $stmtTurnoAntes->get_result()->fetch_assoc();
                $stmtTurnoAntes->close();
                $vig = (int)($turnoRow['turno_vigente'] ?? 0);
                $ori = (int)($turnoRow['turno_original'] ?? 0);
                $turnoAntes = $vig > 0 ? $vig : ($ori > 0 ? $ori : $turnoOriginal);
            }
        }

        $turnoVigenteNuevo = rc_calcular_siguiente_turno_vigente_agenda(
            $conn,
            $medicoId,
            $nuevaFecha,
            $cotizacionId,
            $hasRasTurnoOriginal,
            $hasRasTurnoVigente
        );
        if ($turnoVigenteNuevo <= 0) {
            $turnoVigenteNuevo = max(1, (int)$turnoAntes);
        }

        // Actualizar los items de agenda
        $stmtUpdate = $conn->prepare(
            'UPDATE agenda_servicios_cotizacion 
             SET fecha_programada = ?, hora_programada = ?, estado_evento = "pendiente", updated_by = ? 
             WHERE cotizacion_id = ? AND estado_evento IN ("pendiente", "confirmado")'
        );
        $stmtUpdate->bind_param('ssii', $nuevaFecha, $nuevaHora, $usuarioId, $cotizacionId);
        $ok = $stmtUpdate->execute();
        $stmtUpdate->close();

        if (!$ok) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'No se pudo actualizar la programación']);
            exit;
        }

        // UPSERT en recordatorios_agenda_servicios con trazabilidad de turno
        $observacionReprog = sprintf(
            'Cita reprogramada para %s a las %s. Turno: Antes N°%d -> Ahora N°%d.',
            $nuevaFecha,
            substr($nuevaHora, 0, 5),
            max(1, (int)$turnoAntes),
            max(1, (int)$turnoVigenteNuevo)
        );
        $stmtRecordatorio = null;
        if ($hasRasTurnoOriginal && $hasRasTurnoVigente) {
            $stmtRecordatorio = $conn->prepare(
                'INSERT INTO recordatorios_agenda_servicios (cotizacion_id, estado, observacion, fecha_ultimo_contacto, intentos, actualizado_por, turno_original, turno_vigente)
                 VALUES (?, "pendiente", ?, NOW(), 1, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                   estado = "pendiente",
                   observacion = VALUES(observacion),
                   fecha_ultimo_contacto = NOW(),
                   actualizado_por = VALUES(actualizado_por),
                   turno_original = COALESCE(NULLIF(turno_original, 0), VALUES(turno_original)),
                   turno_vigente = VALUES(turno_vigente),
                   updated_at = CURRENT_TIMESTAMP'
            );
            if ($stmtRecordatorio) {
                $turnoOriginalFinal = max(1, (int)$turnoOriginal);
                $turnoVigenteFinal = max(1, (int)$turnoVigenteNuevo);
                $stmtRecordatorio->bind_param('isiii', $cotizacionId, $observacionReprog, $usuarioId, $turnoOriginalFinal, $turnoVigenteFinal);
            }
        } elseif ($hasRasTurnoOriginal) {
            $stmtRecordatorio = $conn->prepare(
                'INSERT INTO recordatorios_agenda_servicios (cotizacion_id, estado, observacion, fecha_ultimo_contacto, intentos, actualizado_por, turno_original)
                 VALUES (?, "pendiente", ?, NOW(), 1, ?, ?)
                 ON DUPLICATE KEY UPDATE
                   estado = "pendiente",
                   observacion = VALUES(observacion),
                   fecha_ultimo_contacto = NOW(),
                   actualizado_por = VALUES(actualizado_por),
                   turno_original = COALESCE(NULLIF(turno_original, 0), VALUES(turno_original)),
                   updated_at = CURRENT_TIMESTAMP'
            );
            if ($stmtRecordatorio) {
                $turnoOriginalFinal = max(1, (int)$turnoOriginal);
                $stmtRecordatorio->bind_param('isii', $cotizacionId, $observacionReprog, $usuarioId, $turnoOriginalFinal);
            }
        } else {
            $stmtRecordatorio = $conn->prepare(
                'INSERT INTO recordatorios_agenda_servicios (cotizacion_id, estado, observacion, fecha_ultimo_contacto, intentos, actualizado_por)
                 VALUES (?, "pendiente", ?, NOW(), 1, ?)
                 ON DUPLICATE KEY UPDATE
                   estado = "pendiente",
                   observacion = VALUES(observacion),
                   fecha_ultimo_contacto = NOW(),
                   actualizado_por = VALUES(actualizado_por),
                   updated_at = CURRENT_TIMESTAMP'
            );
            if ($stmtRecordatorio) {
                $stmtRecordatorio->bind_param('isi', $cotizacionId, $observacionReprog, $usuarioId);
            }
        }

        if (!$stmtRecordatorio) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'No se pudo preparar actualización del recordatorio']);
            exit;
        }
        $okRec = $stmtRecordatorio->execute();
        $stmtRecordatorio->close();

        if (!$okRec) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Se actualizó la programación pero no se pudo guardar el recordatorio']);
            exit;
        }

        echo json_encode([
            'success' => true,
            'reprogramada_fecha' => $nuevaFecha,
            'reprogramada_hora' => substr($nuevaHora, 0, 5),
            'observacion' => $observacionReprog,
            'turno_antes' => max(1, (int)$turnoAntes),
            'turno_ahora' => max(1, (int)$turnoVigenteNuevo),
        ]);
        exit;
    }

    // ── Flujo normal: guardar gestión de recordatorio para CONSULTAS ──
    $consultaId = (int)($payload['consulta_id'] ?? 0);
    $estado = trim((string)($payload['estado'] ?? ''));
    $observacion = trim((string)($payload['observacion'] ?? ''));
    $fechaProximoContacto = trim((string)($payload['fecha_proximo_contacto'] ?? ''));

    if ($consultaId <= 0 || $estado === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'consulta_id y estado son requeridos']);
        exit;
    }

    $estadosPermitidos = ['pendiente', 'contactado', 'confirmado', 'no_contesta', 'reprogramar', 'cancelado'];
    if (!in_array($estado, $estadosPermitidos, true)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Estado de gestion no permitido']);
        exit;
    }

    $stmtConsulta = $conn->prepare('SELECT id FROM consultas WHERE id = ? LIMIT 1');
    $stmtConsulta->bind_param('i', $consultaId);
    $stmtConsulta->execute();
    $consultaExiste = $stmtConsulta->get_result()->fetch_assoc();
    $stmtConsulta->close();

    if (!$consultaExiste) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Consulta no encontrada']);
        exit;
    }

    $usuarioId = (int)($_SESSION['usuario']['id'] ?? 0);
    $fechaProximoValue = null;
    if ($fechaProximoContacto !== '') {
        $ts = strtotime($fechaProximoContacto);
        if ($ts !== false) {
            $fechaProximoValue = date('Y-m-d H:i:s', $ts);
        }
    }

    $sumarIntento = in_array($estado, ['contactado', 'confirmado', 'no_contesta', 'reprogramar'], true) ? 1 : 0;

    $sql = 'INSERT INTO recordatorios_consultas (consulta_id, estado, observacion, fecha_proximo_contacto, fecha_ultimo_contacto, intentos, actualizado_por)
            VALUES (?, ?, ?, ?, NOW(), ?, ?)
            ON DUPLICATE KEY UPDATE
              estado = VALUES(estado),
              observacion = VALUES(observacion),
              fecha_proximo_contacto = VALUES(fecha_proximo_contacto),
              fecha_ultimo_contacto = NOW(),
              intentos = intentos + VALUES(intentos),
              actualizado_por = VALUES(actualizado_por),
              updated_at = CURRENT_TIMESTAMP';

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'No se pudo preparar actualizacion']);
        exit;
    }

    $stmt->bind_param('isssii', $consultaId, $estado, $observacion, $fechaProximoValue, $sumarIntento, $usuarioId);
    $ok = $stmt->execute();
    $stmt->close();

    if (!$ok) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'No se pudo guardar gestion']);
        exit;
    }

    echo json_encode([
        'success' => true,
        'saved' => [
            'consulta_id' => $consultaId,
            'estado' => $estado,
            'observacion' => $observacion,
            'fecha_proximo_contacto' => $fechaProximoValue,
            'sumar_intento' => $sumarIntento,
        ],
    ]);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'error' => 'Metodo no permitido']);
