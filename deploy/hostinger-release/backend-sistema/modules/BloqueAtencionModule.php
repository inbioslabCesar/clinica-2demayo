<?php

require_once __DIR__ . '/CorrelativoOperativoModule.php';

if (!function_exists('bloque_atencion_table_exists')) {
    function bloque_atencion_table_exists($conn, $table)
    {
        static $cache = [];
        if (isset($cache[$table])) {
            return $cache[$table];
        }

        $stmt = $conn->prepare('SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1');
        if (!$stmt) {
            $cache[$table] = false;
            return false;
        }
        $stmt->bind_param('s', $table);
        $stmt->execute();
        $res = $stmt->get_result();
        $exists = $res && $res->num_rows > 0;
        $stmt->close();

        $cache[$table] = $exists;
        return $exists;
    }
}

if (!function_exists('bloque_atencion_column_exists')) {
    function bloque_atencion_column_exists($conn, $table, $column)
    {
        static $cache = [];
        $key = $table . '.' . $column;
        if (isset($cache[$key])) {
            return $cache[$key];
        }

        $stmt = $conn->prepare('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1');
        if (!$stmt) {
            $cache[$key] = false;
            return false;
        }
        $stmt->bind_param('ss', $table, $column);
        $stmt->execute();
        $res = $stmt->get_result();
        $exists = $res && $res->num_rows > 0;
        $stmt->close();

        $cache[$key] = $exists;
        return $exists;
    }
}

if (!function_exists('bloque_atencion_ensure_tables')) {
    function bloque_atencion_ensure_tables($conn)
    {
        $okBloques = $conn->query(
            "CREATE TABLE IF NOT EXISTS bloques_atencion (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                paciente_id INT NOT NULL,
                consulta_origen_id INT NULL,
                fecha_base DATE NULL,
                hora_objetivo TIME NULL,
                estado_global VARCHAR(24) NOT NULL DEFAULT 'pendiente_pago',
                total_global_estimado DECIMAL(12,2) NOT NULL DEFAULT 0,
                total_global_pagado DECIMAL(12,2) NOT NULL DEFAULT 0,
                saldo_global DECIMAL(12,2) NOT NULL DEFAULT 0,
                origen VARCHAR(40) NOT NULL DEFAULT 'cotizacion',
                created_by INT NULL,
                updated_by INT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_ba_paciente_fecha (paciente_id, fecha_base),
                KEY idx_ba_consulta (consulta_origen_id),
                KEY idx_ba_estado (estado_global)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
        );

        $okLinks = $conn->query(
            "CREATE TABLE IF NOT EXISTS bloques_atencion_cotizaciones (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                bloque_id BIGINT UNSIGNED NOT NULL,
                cotizacion_id INT NOT NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                UNIQUE KEY uk_bac_cotizacion (cotizacion_id),
                KEY idx_bac_bloque (bloque_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
        );

        return (bool)$okBloques && (bool)$okLinks;
    }
}

if (!function_exists('bloque_atencion_estado_desde_finanzas')) {
    function bloque_atencion_estado_desde_finanzas($total, $pagado, $saldo)
    {
        $total = max(0.0, (float)$total);
        $pagado = max(0.0, (float)$pagado);
        $saldo = max(0.0, (float)$saldo);

        if ($total > 0.00001 && $saldo <= 0.00001) {
            return 'confirmado';
        }
        if ($pagado > 0.00001) {
            return 'parcial';
        }
        return 'pendiente_pago';
    }
}

if (!function_exists('bloque_atencion_resolver_consulta_ref')) {
    function bloque_atencion_resolver_consulta_ref($conn, $cotizacionId)
    {
        $cotizacionId = (int)$cotizacionId;
        if ($cotizacionId <= 0) return 0;

        if (bloque_atencion_column_exists($conn, 'cotizaciones_detalle', 'consulta_id')) {
            $stmt = $conn->prepare('SELECT consulta_id FROM cotizaciones_detalle WHERE cotizacion_id = ? AND consulta_id > 0 ORDER BY id ASC LIMIT 1');
            if ($stmt) {
                $stmt->bind_param('i', $cotizacionId);
                $stmt->execute();
                $row = $stmt->get_result()->fetch_assoc();
                $stmt->close();
                $cid = (int)($row['consulta_id'] ?? 0);
                if ($cid > 0) return $cid;
            }
        }

        if (bloque_atencion_table_exists($conn, 'consultas') && bloque_atencion_column_exists($conn, 'consultas', 'cotizacion_id')) {
            $stmt = $conn->prepare('SELECT id FROM consultas WHERE cotizacion_id = ? ORDER BY id ASC LIMIT 1');
            if ($stmt) {
                $stmt->bind_param('i', $cotizacionId);
                $stmt->execute();
                $row = $stmt->get_result()->fetch_assoc();
                $stmt->close();
                return (int)($row['id'] ?? 0);
            }
        }

        return 0;
    }
}

if (!function_exists('bloque_atencion_vincular_cotizacion')) {
    function bloque_atencion_vincular_cotizacion($conn, $cotizacionId, $usuarioId = 0, $ctx = [])
    {
        $cotizacionId = (int)$cotizacionId;
        $usuarioId = (int)$usuarioId;
        if ($cotizacionId <= 0) {
            return 0;
        }
        if (!bloque_atencion_ensure_tables($conn)) {
            return 0;
        }

        $stmtLink = $conn->prepare('SELECT bloque_id FROM bloques_atencion_cotizaciones WHERE cotizacion_id = ? LIMIT 1');
        if ($stmtLink) {
            $stmtLink->bind_param('i', $cotizacionId);
            $stmtLink->execute();
            $rowLink = $stmtLink->get_result()->fetch_assoc();
            $stmtLink->close();
            $bloqueIdExistente = (int)($rowLink['bloque_id'] ?? 0);
            if ($bloqueIdExistente > 0) {
                bloque_atencion_recalcular($conn, $bloqueIdExistente, $usuarioId);
                return $bloqueIdExistente;
            }
        }

        $stmtCot = $conn->prepare('SELECT id, paciente_id, fecha, total, COALESCE(total_pagado,0) AS total_pagado, COALESCE(saldo_pendiente,0) AS saldo_pendiente FROM cotizaciones WHERE id = ? LIMIT 1');
        if (!$stmtCot) {
            return 0;
        }
        $stmtCot->bind_param('i', $cotizacionId);
        $stmtCot->execute();
        $cot = $stmtCot->get_result()->fetch_assoc();
        $stmtCot->close();
        if (!$cot) {
            return 0;
        }

        $pacienteId = (int)($cot['paciente_id'] ?? 0);
        if ($pacienteId <= 0) {
            return 0;
        }

        $consultaOrigen = (int)($ctx['consulta_origen_id'] ?? 0);
        if ($consultaOrigen <= 0) {
            $consultaOrigen = bloque_atencion_resolver_consulta_ref($conn, $cotizacionId);
        }

        $fechaBase = trim((string)($ctx['fecha_base'] ?? ''));
        if ($fechaBase === '') {
            $fechaRaw = trim((string)($cot['fecha'] ?? ''));
            $fechaBase = $fechaRaw !== '' ? substr($fechaRaw, 0, 10) : date('Y-m-d');
        }
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fechaBase)) {
            $fechaBase = date('Y-m-d');
        }

        $horaObjetivo = trim((string)($ctx['hora_objetivo'] ?? ''));
        if ($horaObjetivo === '') {
            $fechaRaw = trim((string)($cot['fecha'] ?? ''));
            if (strlen($fechaRaw) >= 16) {
                $horaObjetivo = substr($fechaRaw, 11, 8);
            }
        }
        if ($horaObjetivo !== '' && preg_match('/^\d{2}:\d{2}$/', $horaObjetivo)) {
            $horaObjetivo .= ':00';
        }
        if ($horaObjetivo !== '' && !preg_match('/^\d{2}:\d{2}:\d{2}$/', $horaObjetivo)) {
            $horaObjetivo = null;
        }

        $stmtFind = null;
        if ($consultaOrigen > 0) {
            $stmtFind = $conn->prepare('SELECT id FROM bloques_atencion WHERE paciente_id = ? AND consulta_origen_id = ? AND fecha_base = ? ORDER BY id DESC LIMIT 1');
            if ($stmtFind) {
                $stmtFind->bind_param('iis', $pacienteId, $consultaOrigen, $fechaBase);
            }
        } else {
            $stmtFind = $conn->prepare('SELECT id FROM bloques_atencion WHERE paciente_id = ? AND consulta_origen_id IS NULL AND fecha_base = ? ORDER BY id DESC LIMIT 1');
            if ($stmtFind) {
                $stmtFind->bind_param('is', $pacienteId, $fechaBase);
            }
        }

        $bloqueId = 0;
        if ($stmtFind) {
            $stmtFind->execute();
            $rowFind = $stmtFind->get_result()->fetch_assoc();
            $stmtFind->close();
            $bloqueId = (int)($rowFind['id'] ?? 0);
        }

        if ($bloqueId <= 0) {
            $total = (float)($cot['total'] ?? 0);
            $pagado = (float)($cot['total_pagado'] ?? 0);
            $saldo = (float)($cot['saldo_pendiente'] ?? max(0, $total - $pagado));
            $estado = bloque_atencion_estado_desde_finanzas($total, $pagado, $saldo);

            $stmtIns = $conn->prepare('INSERT INTO bloques_atencion (paciente_id, consulta_origen_id, fecha_base, hora_objetivo, estado_global, total_global_estimado, total_global_pagado, saldo_global, origen, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, "cotizacion", ?, ?)');
            if (!$stmtIns) {
                return 0;
            }
            $consultaParam = $consultaOrigen > 0 ? $consultaOrigen : null;
            $stmtIns->bind_param('iisssdddii', $pacienteId, $consultaParam, $fechaBase, $horaObjetivo, $estado, $total, $pagado, $saldo, $usuarioId, $usuarioId);
            if (!$stmtIns->execute()) {
                $stmtIns->close();
                return 0;
            }
            $bloqueId = (int)$conn->insert_id;
            $stmtIns->close();
        }

        if ($bloqueId <= 0) {
            return 0;
        }

        $stmtLinkIns = $conn->prepare('INSERT INTO bloques_atencion_cotizaciones (bloque_id, cotizacion_id) VALUES (?, ?)');
        if ($stmtLinkIns) {
            $stmtLinkIns->bind_param('ii', $bloqueId, $cotizacionId);
            $stmtLinkIns->execute();
            $stmtLinkIns->close();
        }

        bloque_atencion_recalcular($conn, $bloqueId, $usuarioId);
        return $bloqueId;
    }
}

if (!function_exists('bloque_atencion_recalcular')) {
    function bloque_atencion_recalcular($conn, $bloqueId, $usuarioId = 0)
    {
        $bloqueId = (int)$bloqueId;
        $usuarioId = (int)$usuarioId;
        if ($bloqueId <= 0 || !bloque_atencion_ensure_tables($conn)) {
            return false;
        }

        $stmt = $conn->prepare(
            'SELECT
                COALESCE(SUM(COALESCE(c.total,0)),0) AS total_estimado,
                COALESCE(SUM(COALESCE(c.total_pagado,0)),0) AS total_pagado,
                COALESCE(SUM(COALESCE(c.saldo_pendiente,0)),0) AS saldo_total
             FROM bloques_atencion_cotizaciones bc
             INNER JOIN cotizaciones c ON c.id = bc.cotizacion_id
             WHERE bc.bloque_id = ?'
        );
        if (!$stmt) {
            return false;
        }
        $stmt->bind_param('i', $bloqueId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        $total = (float)($row['total_estimado'] ?? 0);
        $pagado = (float)($row['total_pagado'] ?? 0);
        $saldo = (float)($row['saldo_total'] ?? 0);
        $estado = bloque_atencion_estado_desde_finanzas($total, $pagado, $saldo);

        $stmtUp = $conn->prepare('UPDATE bloques_atencion SET total_global_estimado = ?, total_global_pagado = ?, saldo_global = ?, estado_global = ?, updated_by = ? WHERE id = ?');
        if (!$stmtUp) {
            return false;
        }
        $stmtUp->bind_param('dddssi', $total, $pagado, $saldo, $estado, $usuarioId, $bloqueId);
        $ok = $stmtUp->execute();
        $stmtUp->close();
        return (bool)$ok;
    }
}

if (!function_exists('bloque_atencion_resumen_por_id')) {
    function bloque_atencion_resumen_por_id($conn, $bloqueId)
    {
        $bloqueId = (int)$bloqueId;
        if ($bloqueId <= 0 || !bloque_atencion_ensure_tables($conn)) {
            return null;
        }

        $stmtBloque = $conn->prepare('SELECT * FROM bloques_atencion WHERE id = ? LIMIT 1');
        if (!$stmtBloque) {
            return null;
        }
        $stmtBloque->bind_param('i', $bloqueId);
        $stmtBloque->execute();
        $bloque = $stmtBloque->get_result()->fetch_assoc();
        $stmtBloque->close();
        if (!$bloque) {
            return null;
        }

        $stmtCots = $conn->prepare(
            'SELECT c.id, c.numero_comprobante, c.estado, c.total, COALESCE(c.total_pagado,0) AS total_pagado, COALESCE(c.saldo_pendiente,0) AS saldo_pendiente, c.fecha
             FROM bloques_atencion_cotizaciones bc
             INNER JOIN cotizaciones c ON c.id = bc.cotizacion_id
             WHERE bc.bloque_id = ?
             ORDER BY c.id ASC'
        );
        $cotizaciones = [];
        if ($stmtCots) {
            $stmtCots->bind_param('i', $bloqueId);
            $stmtCots->execute();
            $cotizaciones = $stmtCots->get_result()->fetch_all(MYSQLI_ASSOC);
            $stmtCots->close();
        }

        $subBloques = [];
        $eventosOperativos = [];
        if (bloque_atencion_table_exists($conn, 'agenda_servicios_cotizacion')
            && bloque_atencion_column_exists($conn, 'agenda_servicios_cotizacion', 'cotizacion_id')
            && bloque_atencion_column_exists($conn, 'agenda_servicios_cotizacion', 'medico_id')
            && bloque_atencion_column_exists($conn, 'agenda_servicios_cotizacion', 'fecha_programada')
            && bloque_atencion_column_exists($conn, 'agenda_servicios_cotizacion', 'hora_programada')) {
            $stmtEventos = $conn->prepare(
                'SELECT a.id AS agenda_id,
                        a.cotizacion_id,
                        a.cotizacion_detalle_id,
                        a.medico_id,
                        COALESCE(m.nombre, "") AS medico_nombre,
                        COALESCE(m.apellido, "") AS medico_apellido,
                        a.servicio_tipo,
                        a.titulo_evento,
                        a.fecha_programada,
                        a.hora_programada,
                        LOWER(TRIM(COALESCE(a.estado_evento, ""))) AS estado_evento,
                        LOWER(TRIM(COALESCE(c.estado, ""))) AS estado_cotizacion
                 FROM agenda_servicios_cotizacion a
                 INNER JOIN bloques_atencion_cotizaciones bc ON bc.cotizacion_id = a.cotizacion_id
                 LEFT JOIN cotizaciones c ON c.id = a.cotizacion_id
                 LEFT JOIN medicos m ON m.id = a.medico_id
                 WHERE bc.bloque_id = ?
                   AND LOWER(TRIM(COALESCE(a.estado_evento, ""))) NOT IN ("cancelado", "no_asistio")
                 ORDER BY a.fecha_programada ASC, COALESCE(a.hora_programada, "") ASC, a.id ASC'
            );
            if ($stmtEventos) {
                $stmtEventos->bind_param('i', $bloqueId);
                $stmtEventos->execute();
                $rowsEventos = $stmtEventos->get_result()->fetch_all(MYSQLI_ASSOC);
                $stmtEventos->close();

                $pares = [];
                foreach ($rowsEventos as $rowEvento) {
                    $medicoId = (int)($rowEvento['medico_id'] ?? 0);
                    $fechaProg = trim((string)($rowEvento['fecha_programada'] ?? ''));
                    if ($medicoId > 0 && preg_match('/^\d{4}-\d{2}-\d{2}$/', $fechaProg)) {
                        $pares[$medicoId . '|' . $fechaProg] = [
                            'medico_id' => $medicoId,
                            'fecha' => $fechaProg,
                        ];
                    }
                }

                $rankByAgendaId = [];
                if (!empty($pares) && function_exists('correlativo_operativo_rank_maps')) {
                    $rankMaps = correlativo_operativo_rank_maps($conn, array_values($pares));
                    $rankByAgendaId = is_array($rankMaps['agenda'] ?? null) ? $rankMaps['agenda'] : [];
                }

                $subBloquesTmp = [];
                foreach ($rowsEventos as $rowEvento) {
                    $agendaId = (int)($rowEvento['agenda_id'] ?? 0);
                    $medicoId = (int)($rowEvento['medico_id'] ?? 0);
                    $fechaProg = trim((string)($rowEvento['fecha_programada'] ?? ''));
                    $horaProg = trim((string)($rowEvento['hora_programada'] ?? ''));
                    $estadoEvento = strtolower(trim((string)($rowEvento['estado_evento'] ?? '')));
                    $estadoCotizacion = strtolower(trim((string)($rowEvento['estado_cotizacion'] ?? '')));

                    $estadoOperativo = $estadoEvento;
                    if ($estadoOperativo === 'pendiente' && in_array($estadoCotizacion, ['parcial', 'pagado', 'pagada', 'completado', 'completada', 'control', 'contrato'], true)) {
                        $estadoOperativo = 'confirmado';
                    }

                    $cuentaCorrelativo = in_array($estadoOperativo, ['confirmado', 'atendido', 'espontaneo', 'completado', 'pagado'], true);
                    $correlativo = ($cuentaCorrelativo && $agendaId > 0) ? (int)($rankByAgendaId[$agendaId] ?? 0) : 0;

                    $medicoNombre = trim((string)($rowEvento['medico_nombre'] ?? '') . ' ' . (string)($rowEvento['medico_apellido'] ?? ''));
                    if ($medicoNombre === '') {
                        $medicoNombre = $medicoId > 0 ? ('Medico #' . $medicoId) : 'Sin medico';
                    }

                    $eventosOperativos[] = [
                        'agenda_id' => $agendaId,
                        'cotizacion_id' => (int)($rowEvento['cotizacion_id'] ?? 0),
                        'cotizacion_detalle_id' => (int)($rowEvento['cotizacion_detalle_id'] ?? 0),
                        'medico_id' => $medicoId,
                        'medico_nombre' => $medicoNombre,
                        'servicio_tipo' => (string)($rowEvento['servicio_tipo'] ?? ''),
                        'titulo_evento' => (string)($rowEvento['titulo_evento'] ?? ''),
                        'fecha_programada' => $fechaProg,
                        'hora_programada' => $horaProg,
                        'estado_evento' => $estadoEvento,
                        'estado_operativo' => $estadoOperativo,
                        'correlativo_operativo' => $correlativo,
                    ];

                    $keyGrupo = $medicoId . '|' . $fechaProg;
                    if (!isset($subBloquesTmp[$keyGrupo])) {
                        $subBloquesTmp[$keyGrupo] = [
                            'medico_id' => $medicoId,
                            'medico_nombre' => $medicoNombre,
                            'fecha_programada' => $fechaProg,
                            'hora_inicio' => $horaProg,
                            'hora_fin' => $horaProg,
                            'total_items' => 0,
                            'correlativos' => [],
                        ];
                    }

                    $subBloquesTmp[$keyGrupo]['total_items']++;
                    if ($horaProg !== '' && ($subBloquesTmp[$keyGrupo]['hora_inicio'] === '' || $horaProg < $subBloquesTmp[$keyGrupo]['hora_inicio'])) {
                        $subBloquesTmp[$keyGrupo]['hora_inicio'] = $horaProg;
                    }
                    if ($horaProg !== '' && ($subBloquesTmp[$keyGrupo]['hora_fin'] === '' || $horaProg > $subBloquesTmp[$keyGrupo]['hora_fin'])) {
                        $subBloquesTmp[$keyGrupo]['hora_fin'] = $horaProg;
                    }
                    if ($correlativo > 0) {
                        $subBloquesTmp[$keyGrupo]['correlativos'][$correlativo] = $correlativo;
                    }
                }

                $subBloques = array_values(array_map(function ($grupo) {
                    $correlativos = array_values($grupo['correlativos']);
                    sort($correlativos, SORT_NUMERIC);
                    $grupo['correlativos'] = $correlativos;
                    return $grupo;
                }, $subBloquesTmp));

                usort($subBloques, function ($a, $b) {
                    $fa = (string)($a['fecha_programada'] ?? '');
                    $fb = (string)($b['fecha_programada'] ?? '');
                    if ($fa !== $fb) return strcmp($fa, $fb);
                    $ha = (string)($a['hora_inicio'] ?? '');
                    $hb = (string)($b['hora_inicio'] ?? '');
                    if ($ha !== $hb) return strcmp($ha, $hb);
                    return (int)($a['medico_id'] ?? 0) <=> (int)($b['medico_id'] ?? 0);
                });
            }
        }

        return [
            'bloque' => $bloque,
            'cotizaciones' => $cotizaciones,
            'subbloques_operativos' => $subBloques,
            'eventos_operativos' => $eventosOperativos,
        ];
    }
}

if (!function_exists('bloque_atencion_resumen_por_cotizacion')) {
    function bloque_atencion_resumen_por_cotizacion($conn, $cotizacionId, $usuarioId = 0)
    {
        $bloqueId = bloque_atencion_vincular_cotizacion($conn, (int)$cotizacionId, (int)$usuarioId);
        if ($bloqueId <= 0) {
            return null;
        }
        return bloque_atencion_resumen_por_id($conn, $bloqueId);
    }
}

if (!function_exists('bloque_atencion_map_por_cotizaciones')) {
    function bloque_atencion_map_por_cotizaciones($conn, $cotizacionIds, $usuarioId = 0)
    {
        $out = [];
        if (!is_array($cotizacionIds) || empty($cotizacionIds)) {
            return $out;
        }

        if (!bloque_atencion_ensure_tables($conn)) {
            return $out;
        }

        $ids = [];
        foreach ($cotizacionIds as $id) {
            $idInt = (int)$id;
            if ($idInt > 0) {
                $ids[$idInt] = $idInt;
            }
        }
        $ids = array_values($ids);
        if (empty($ids)) {
            return $out;
        }

        foreach ($ids as $cid) {
            bloque_atencion_vincular_cotizacion($conn, $cid, (int)$usuarioId);
        }

        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $sql = 'SELECT bc.cotizacion_id, b.id AS bloque_id, b.estado_global, b.fecha_base, b.hora_objetivo, b.total_global_estimado, b.total_global_pagado, b.saldo_global
                FROM bloques_atencion_cotizaciones bc
                INNER JOIN bloques_atencion b ON b.id = bc.bloque_id
                WHERE bc.cotizacion_id IN (' . $placeholders . ')';
        $stmt = $conn->prepare($sql);
        if (!$stmt) {
            return $out;
        }

        $types = str_repeat('i', count($ids));
        $stmt->bind_param($types, ...$ids);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();

        foreach ($rows as $row) {
            $cid = (int)($row['cotizacion_id'] ?? 0);
            if ($cid <= 0) continue;
            $out[$cid] = [
                'bloque_id' => (int)($row['bloque_id'] ?? 0),
                'estado_global' => (string)($row['estado_global'] ?? ''),
                'fecha_base' => (string)($row['fecha_base'] ?? ''),
                'hora_objetivo' => (string)($row['hora_objetivo'] ?? ''),
                'total_global_estimado' => (float)($row['total_global_estimado'] ?? 0),
                'total_global_pagado' => (float)($row['total_global_pagado'] ?? 0),
                'saldo_global' => (float)($row['saldo_global'] ?? 0),
            ];
        }

        return $out;
    }
}

if (!function_exists('bloque_atencion_time_to_minutes')) {
    function bloque_atencion_time_to_minutes($time)
    {
        $t = trim((string)$time);
        if ($t === '') return null;
        if (preg_match('/^(\d{2}):(\d{2})(?::\d{2})?$/', $t, $m)) {
            return ((int)$m[1]) * 60 + (int)$m[2];
        }
        return null;
    }
}

if (!function_exists('bloque_atencion_minutes_to_time')) {
    function bloque_atencion_minutes_to_time($minutes)
    {
        $m = max(0, (int)$minutes);
        $h = (int)floor($m / 60);
        $mm = $m % 60;
        if ($h > 23) {
            $h = 23;
            $mm = 59;
        }
        return sprintf('%02d:%02d:00', $h, $mm);
    }
}

if (!function_exists('bloque_atencion_hora_base_default')) {
    function bloque_atencion_hora_base_default($horaObjetivo = '')
    {
        $mins = bloque_atencion_time_to_minutes($horaObjetivo);
        if ($mins === null) {
            return '08:00:00';
        }
        return bloque_atencion_minutes_to_time($mins);
    }
}

if (!function_exists('bloque_atencion_existe_ocupado_en_hora')) {
    function bloque_atencion_existe_ocupado_en_hora($conn, $medicoId, $fechaYmd, $horaHms, $excludeAgendaIds = [])
    {
        $medicoId = (int)$medicoId;
        if ($medicoId <= 0 || $fechaYmd === '' || $horaHms === '') return false;

        $excluidos = [];
        foreach ((array)$excludeAgendaIds as $aid) {
            $aidInt = (int)$aid;
            if ($aidInt > 0) $excluidos[$aidInt] = $aidInt;
        }

        $ocupadoAgenda = false;
        if (bloque_atencion_table_exists($conn, 'agenda_servicios_cotizacion')
            && bloque_atencion_column_exists($conn, 'agenda_servicios_cotizacion', 'medico_id')
            && bloque_atencion_column_exists($conn, 'agenda_servicios_cotizacion', 'fecha_programada')
            && bloque_atencion_column_exists($conn, 'agenda_servicios_cotizacion', 'hora_programada')
            && bloque_atencion_column_exists($conn, 'agenda_servicios_cotizacion', 'estado_evento')) {

            $sql = 'SELECT id FROM agenda_servicios_cotizacion
                    WHERE medico_id = ?
                      AND fecha_programada = ?
                      AND COALESCE(hora_programada, "") = ?
                      AND LOWER(TRIM(COALESCE(estado_evento, ""))) NOT IN ("cancelado", "no_asistio")';

            $params = [$medicoId, $fechaYmd, $horaHms];
            $types = 'iss';

            if (!empty($excluidos)) {
                $ph = implode(',', array_fill(0, count($excluidos), '?'));
                $sql .= ' AND id NOT IN (' . $ph . ')';
                $types .= str_repeat('i', count($excluidos));
                foreach ($excluidos as $eid) {
                    $params[] = $eid;
                }
            }

            $sql .= ' LIMIT 1';
            $stmt = $conn->prepare($sql);
            if ($stmt) {
                $stmt->bind_param($types, ...$params);
                $stmt->execute();
                $row = $stmt->get_result()->fetch_assoc();
                $stmt->close();
                $ocupadoAgenda = !empty($row);
            }
        }

        if ($ocupadoAgenda) return true;

        if (bloque_atencion_table_exists($conn, 'consultas')
            && bloque_atencion_column_exists($conn, 'consultas', 'medico_id')
            && bloque_atencion_column_exists($conn, 'consultas', 'fecha')
            && bloque_atencion_column_exists($conn, 'consultas', 'hora')
            && bloque_atencion_column_exists($conn, 'consultas', 'estado')) {
            $stmtCon = $conn->prepare('SELECT id FROM consultas WHERE medico_id = ? AND fecha = ? AND COALESCE(hora, "") = ? AND LOWER(TRIM(COALESCE(estado, ""))) <> "cancelada" LIMIT 1');
            if ($stmtCon) {
                $stmtCon->bind_param('iss', $medicoId, $fechaYmd, $horaHms);
                $stmtCon->execute();
                $rowCon = $stmtCon->get_result()->fetch_assoc();
                $stmtCon->close();
                if (!empty($rowCon)) {
                    return true;
                }
            }
        }

        return false;
    }
}

if (!function_exists('bloque_atencion_resolver_hora_disponible')) {
    function bloque_atencion_resolver_hora_disponible($conn, $medicoId, $fechaYmd, $horaBaseHms, $excludeAgendaIds = [], $reservadasLocales = [])
    {
        $baseMin = bloque_atencion_time_to_minutes($horaBaseHms);
        if ($baseMin === null) {
            $baseMin = 8 * 60;
        }

        $reservadasMap = [];
        foreach ((array)$reservadasLocales as $h) {
            $hm = bloque_atencion_time_to_minutes($h);
            if ($hm !== null) {
                $reservadasMap[$hm] = true;
            }
        }

        for ($i = 0; $i <= 48; $i++) {
            $candMin = $baseMin + ($i * 30);
            if ($candMin > ((23 * 60) + 59)) {
                break;
            }
            if (isset($reservadasMap[$candMin])) {
                continue;
            }

            $candHora = bloque_atencion_minutes_to_time($candMin);
            if (!bloque_atencion_existe_ocupado_en_hora($conn, $medicoId, $fechaYmd, $candHora, $excludeAgendaIds)) {
                return $candHora;
            }
        }

        return bloque_atencion_minutes_to_time(min((23 * 60) + 59, $baseMin));
    }
}

if (!function_exists('bloque_atencion_optimizar_agenda')) {
    function bloque_atencion_optimizar_agenda($conn, $bloqueId, $usuarioId = 0)
    {
        $bloqueId = (int)$bloqueId;
        $usuarioId = (int)$usuarioId;
        if ($bloqueId <= 0 || !bloque_atencion_ensure_tables($conn)) {
            return ['ok' => false, 'updated' => 0, 'reason' => 'bloque_invalido'];
        }

        if (!bloque_atencion_table_exists($conn, 'agenda_servicios_cotizacion')
            || !bloque_atencion_column_exists($conn, 'agenda_servicios_cotizacion', 'id')
            || !bloque_atencion_column_exists($conn, 'agenda_servicios_cotizacion', 'cotizacion_id')
            || !bloque_atencion_column_exists($conn, 'agenda_servicios_cotizacion', 'medico_id')
            || !bloque_atencion_column_exists($conn, 'agenda_servicios_cotizacion', 'fecha_programada')
            || !bloque_atencion_column_exists($conn, 'agenda_servicios_cotizacion', 'hora_programada')) {
            return ['ok' => true, 'updated' => 0, 'reason' => 'sin_tabla_agenda'];
        }

        $stmtBloque = $conn->prepare('SELECT id, fecha_base, hora_objetivo FROM bloques_atencion WHERE id = ? LIMIT 1');
        if (!$stmtBloque) {
            return ['ok' => false, 'updated' => 0, 'reason' => 'error_bloque'];
        }
        $stmtBloque->bind_param('i', $bloqueId);
        $stmtBloque->execute();
        $bloque = $stmtBloque->get_result()->fetch_assoc();
        $stmtBloque->close();
        if (!$bloque) {
            return ['ok' => false, 'updated' => 0, 'reason' => 'bloque_no_existe'];
        }

        $fechaBase = trim((string)($bloque['fecha_base'] ?? ''));
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $fechaBase)) {
            $fechaBase = date('Y-m-d');
        }
        $horaBase = bloque_atencion_hora_base_default((string)($bloque['hora_objetivo'] ?? ''));

        $hasFechaDetalle = bloque_atencion_column_exists($conn, 'cotizaciones_detalle', 'fecha_programada');
        $selectFechaDetalle = $hasFechaDetalle ? ', cd.fecha_programada AS fecha_programada_detalle' : ', NULL AS fecha_programada_detalle';
        $sqlRows = 'SELECT a.id, a.cotizacion_id, a.cotizacion_detalle_id, a.medico_id, a.fecha_programada, a.hora_programada'
            . $selectFechaDetalle
            . ' FROM agenda_servicios_cotizacion a'
            . ' INNER JOIN bloques_atencion_cotizaciones bc ON bc.cotizacion_id = a.cotizacion_id'
            . ($hasFechaDetalle ? ' LEFT JOIN cotizaciones_detalle cd ON cd.id = a.cotizacion_detalle_id' : '')
            . ' WHERE bc.bloque_id = ?'
            . ' AND LOWER(TRIM(COALESCE(a.estado_evento, ""))) NOT IN ("cancelado", "no_asistio")'
            . ' ORDER BY a.fecha_programada ASC, COALESCE(a.hora_programada, "") ASC, a.id ASC';

        $stmtRows = $conn->prepare($sqlRows);
        if (!$stmtRows) {
            return ['ok' => false, 'updated' => 0, 'reason' => 'error_rows'];
        }
        $stmtRows->bind_param('i', $bloqueId);
        $stmtRows->execute();
        $rows = $stmtRows->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmtRows->close();

        if (empty($rows)) {
            return ['ok' => true, 'updated' => 0, 'reason' => 'sin_rows'];
        }

        $agendaIdsBloque = array_values(array_filter(array_map(function ($r) {
            return (int)($r['id'] ?? 0);
        }, $rows), function ($id) {
            return $id > 0;
        }));

        $fechasValidas = [];
        foreach ($rows as $r) {
            $f = trim((string)($r['fecha_programada'] ?? ''));
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $f)) {
                $fechasValidas[$f] = true;
            }
        }
        $multiplesFechas = count($fechasValidas) > 1;

        $reservadasLocales = [];
        $updates = [];
        foreach ($rows as $row) {
            $agendaId = (int)($row['id'] ?? 0);
            $medicoId = (int)($row['medico_id'] ?? 0);
            if ($agendaId <= 0 || $medicoId <= 0) {
                continue;
            }

            $fechaOriginal = trim((string)($row['fecha_programada'] ?? ''));
            $fechaDetalle = trim((string)($row['fecha_programada_detalle'] ?? ''));

            // Politica hibrida robusta:
            // - si detalle tiene fecha explicita, respetarla
            // - si ya existen multiples fechas en el bloque, preservar fecha original
            // - solo usar fecha_base como fallback cuando no haya fecha valida
            $fechaObjetivo = $fechaBase;
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $fechaDetalle)) {
                $fechaObjetivo = $fechaDetalle;
            } elseif (preg_match('/^\d{4}-\d{2}-\d{2}$/', $fechaOriginal)) {
                $fechaObjetivo = $fechaOriginal;
            } elseif ($multiplesFechas && preg_match('/^\d{4}-\d{2}-\d{2}$/', $fechaOriginal)) {
                $fechaObjetivo = $fechaOriginal;
            }

            $grupo = $medicoId . '|' . $fechaObjetivo;
            if (!isset($reservadasLocales[$grupo])) {
                $reservadasLocales[$grupo] = [];
            }

            $horaOriginal = trim((string)($row['hora_programada'] ?? ''));
            $horaSeed = $horaOriginal !== '' ? $horaOriginal : $horaBase;
            $horaNueva = bloque_atencion_resolver_hora_disponible(
                $conn,
                $medicoId,
                $fechaObjetivo,
                $horaSeed,
                $agendaIdsBloque,
                $reservadasLocales[$grupo]
            );
            $reservadasLocales[$grupo][] = $horaNueva;

            if ($fechaOriginal !== $fechaObjetivo || $horaOriginal !== $horaNueva) {
                $updates[] = [
                    'id' => $agendaId,
                    'fecha' => $fechaObjetivo,
                    'hora' => $horaNueva,
                    'cotizacion_detalle_id' => (int)($row['cotizacion_detalle_id'] ?? 0),
                ];
            }
        }

        if (empty($updates)) {
            return ['ok' => true, 'updated' => 0, 'reason' => 'sin_cambios'];
        }

        $hasUpdatedByAgenda = bloque_atencion_column_exists($conn, 'agenda_servicios_cotizacion', 'updated_by');
        $hasHoraDetalle = bloque_atencion_column_exists($conn, 'cotizaciones_detalle', 'hora_programada');

        foreach ($updates as $chg) {
            $agendaId = (int)$chg['id'];
            $fechaNueva = (string)$chg['fecha'];
            $horaNueva = (string)$chg['hora'];

            if ($hasUpdatedByAgenda) {
                $stmtUp = $conn->prepare('UPDATE agenda_servicios_cotizacion SET fecha_programada = ?, hora_programada = ?, updated_by = ? WHERE id = ?');
                if ($stmtUp) {
                    $stmtUp->bind_param('ssii', $fechaNueva, $horaNueva, $usuarioId, $agendaId);
                    $stmtUp->execute();
                    $stmtUp->close();
                }
            } else {
                $stmtUp = $conn->prepare('UPDATE agenda_servicios_cotizacion SET fecha_programada = ?, hora_programada = ? WHERE id = ?');
                if ($stmtUp) {
                    $stmtUp->bind_param('ssi', $fechaNueva, $horaNueva, $agendaId);
                    $stmtUp->execute();
                    $stmtUp->close();
                }
            }

            $detalleId = (int)($chg['cotizacion_detalle_id'] ?? 0);
            if ($detalleId > 0 && ($hasFechaDetalle || $hasHoraDetalle)) {
                $sets = [];
                $types = '';
                $params = [];
                if ($hasFechaDetalle) {
                    $sets[] = 'fecha_programada = ?';
                    $types .= 's';
                    $params[] = $fechaNueva;
                }
                if ($hasHoraDetalle) {
                    $sets[] = 'hora_programada = ?';
                    $types .= 's';
                    $params[] = $horaNueva;
                }
                if (!empty($sets)) {
                    $sqlDet = 'UPDATE cotizaciones_detalle SET ' . implode(', ', $sets) . ' WHERE id = ?';
                    $types .= 'i';
                    $params[] = $detalleId;
                    $stmtDet = $conn->prepare($sqlDet);
                    if ($stmtDet) {
                        $stmtDet->bind_param($types, ...$params);
                        $stmtDet->execute();
                        $stmtDet->close();
                    }
                }
            }
        }

        return ['ok' => true, 'updated' => count($updates), 'reason' => 'aplicado'];
    }
}

if (!function_exists('bloque_atencion_conflictos_map_por_cotizaciones')) {
    function bloque_atencion_conflictos_map_por_cotizaciones($conn, $cotizacionIds, $usuarioId = 0)
    {
        $out = [];
        $cotizacionIds = is_array($cotizacionIds) ? $cotizacionIds : [];
        if (empty($cotizacionIds)) {
            return $out;
        }

        $mapBloques = bloque_atencion_map_por_cotizaciones($conn, $cotizacionIds, (int)$usuarioId);
        if (empty($mapBloques)) {
            return $out;
        }

        $bloquesProcesados = [];
        $conflictoPorBloque = [];

        foreach ($mapBloques as $cid => $metaBloque) {
            $bloqueId = (int)($metaBloque['bloque_id'] ?? 0);
            if ($bloqueId <= 0 || isset($bloquesProcesados[$bloqueId])) {
                continue;
            }
            $bloquesProcesados[$bloqueId] = true;

            $resumen = bloque_atencion_resumen_por_id($conn, $bloqueId);
            $eventos = is_array($resumen['eventos_operativos'] ?? null) ? $resumen['eventos_operativos'] : [];

            $totalEventos = count($eventos);
            $totalConflictos = 0;

            foreach ($eventos as $evento) {
                $medicoId = (int)($evento['medico_id'] ?? 0);
                $correlativo = (int)($evento['correlativo_operativo'] ?? 0);
                if ($medicoId <= 0 || $correlativo <= 0) {
                    $totalConflictos++;
                }
            }

            if ($totalEventos === 0) {
                $stmtProg = $conn->prepare(
                    "SELECT COUNT(*) AS total_programables
                     FROM bloques_atencion_cotizaciones bc
                     INNER JOIN cotizaciones_detalle cd ON cd.cotizacion_id = bc.cotizacion_id
                     WHERE bc.bloque_id = ?
                       AND LOWER(TRIM(COALESCE(cd.servicio_tipo, ''))) IN ('ecografia', 'rayosx', 'rayos_x', 'rayos x', 'rx', 'tomografia', 'procedimiento', 'procedimientos', 'operacion', 'operaciones')
                       AND (cd.estado_item IS NULL OR LOWER(TRIM(cd.estado_item)) <> 'eliminado')"
                );
                if ($stmtProg) {
                    $stmtProg->bind_param('i', $bloqueId);
                    $stmtProg->execute();
                    $rowProg = $stmtProg->get_result()->fetch_assoc();
                    $stmtProg->close();
                    $totalProgramables = (int)($rowProg['total_programables'] ?? 0);
                    if ($totalProgramables > 0) {
                        $totalConflictos = max(1, $totalConflictos);
                    }
                }
            }

            $conflictoPorBloque[$bloqueId] = [
                'bloque_conflicto' => $totalConflictos > 0 ? 1 : 0,
                'bloque_conflicto_items' => $totalConflictos,
                'bloque_eventos_items' => $totalEventos,
            ];
        }

        foreach ($mapBloques as $cid => $metaBloque) {
            $cotizacionId = (int)$cid;
            $bloqueId = (int)($metaBloque['bloque_id'] ?? 0);
            $metaConflicto = $conflictoPorBloque[$bloqueId] ?? [
                'bloque_conflicto' => 0,
                'bloque_conflicto_items' => 0,
                'bloque_eventos_items' => 0,
            ];

            $out[$cotizacionId] = [
                'bloque_conflicto' => (int)($metaConflicto['bloque_conflicto'] ?? 0),
                'bloque_conflicto_items' => (int)($metaConflicto['bloque_conflicto_items'] ?? 0),
                'bloque_eventos_items' => (int)($metaConflicto['bloque_eventos_items'] ?? 0),
            ];
        }

        return $out;
    }
}
