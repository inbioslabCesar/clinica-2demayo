<?php

if (!function_exists('correlativo_operativo_column_exists')) {
    function correlativo_operativo_column_exists(mysqli $conn, string $table, string $column): bool {
        static $cache = [];
        $key = $table . '.' . $column;
        if (array_key_exists($key, $cache)) {
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

if (!function_exists('correlativo_operativo_table_exists')) {
    function correlativo_operativo_table_exists(mysqli $conn, string $table): bool {
        static $cache = [];
        if (array_key_exists($table, $cache)) {
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

if (!function_exists('correlativo_operativo_rank_maps')) {
    /**
     * Retorna correlativos operativos unificados para consultas y agenda.
     *
     * @param mysqli $conn
     * @param array<int,array{medico_id:int,fecha:string}> $pairs
     * @return array{consulta: array<int,int>, agenda: array<int,int>}
     */
    function correlativo_operativo_rank_maps(mysqli $conn, array $pairs): array {
        $out = ['consulta' => [], 'agenda' => []];

        if (empty($pairs)) {
            return $out;
        }

        $normalized = [];
        foreach ($pairs as $pair) {
            $medicoId = (int)($pair['medico_id'] ?? 0);
            $fecha = trim((string)($pair['fecha'] ?? ''));
            if ($medicoId <= 0 || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha)) {
                continue;
            }
            $normalized[$medicoId . '|' . $fecha] = ['medico_id' => $medicoId, 'fecha' => $fecha];
        }

        if (empty($normalized)) {
            return $out;
        }

        $whereConsultas = [];
        $params = [];
        $types = '';
        foreach ($normalized as $pair) {
            $whereConsultas[] = '(c.medico_id = ? AND c.fecha = ?)';
            $params[] = (int)$pair['medico_id'];
            $params[] = (string)$pair['fecha'];
            $types .= 'is';
        }

        $eventQueries = [];
        $eventQueries[] = 'SELECT c.id AS evento_id, c.medico_id, c.fecha AS fecha_evento, COALESCE(c.hora, "00:00:00") AS hora_evento, "consulta" AS tipo_evento'
            . ' FROM consultas c'
            . ' WHERE ' . implode(' OR ', $whereConsultas)
            . ' AND LOWER(TRIM(COALESCE(c.estado, ""))) <> "cancelada"';

        $canUseAgenda = correlativo_operativo_table_exists($conn, 'agenda_servicios_cotizacion')
            && correlativo_operativo_column_exists($conn, 'agenda_servicios_cotizacion', 'medico_id')
            && correlativo_operativo_column_exists($conn, 'agenda_servicios_cotizacion', 'fecha_programada')
            && correlativo_operativo_column_exists($conn, 'agenda_servicios_cotizacion', 'hora_programada')
            && correlativo_operativo_column_exists($conn, 'agenda_servicios_cotizacion', 'estado_evento')
            && correlativo_operativo_column_exists($conn, 'agenda_servicios_cotizacion', 'cotizacion_id')
            && correlativo_operativo_table_exists($conn, 'cotizaciones')
            && correlativo_operativo_column_exists($conn, 'cotizaciones', 'estado');

        if ($canUseAgenda) {
            $whereAgenda = [];
            foreach ($normalized as $pair) {
                $whereAgenda[] = '(a.medico_id = ? AND a.fecha_programada = ?)';
                $params[] = (int)$pair['medico_id'];
                $params[] = (string)$pair['fecha'];
                $types .= 'is';
            }

            $eventQueries[] = 'SELECT a.id AS evento_id, a.medico_id, a.fecha_programada AS fecha_evento, COALESCE(a.hora_programada, "00:00:00") AS hora_evento, "agenda" AS tipo_evento'
                . ' FROM agenda_servicios_cotizacion a'
                . ' LEFT JOIN cotizaciones ct ON ct.id = a.cotizacion_id'
                . ' WHERE ' . implode(' OR ', $whereAgenda)
                . ' AND LOWER(TRIM(COALESCE(a.estado_evento, ""))) NOT IN ("cancelado", "no_asistio")'
                . ' AND ('
                . '     LOWER(TRIM(COALESCE(a.estado_evento, ""))) IN ("confirmado", "atendido", "espontaneo", "completado", "pagado")'
                . '     OR ('
                . '         LOWER(TRIM(COALESCE(a.estado_evento, ""))) = "pendiente"'
                . '         AND LOWER(TRIM(COALESCE(ct.estado, ""))) IN ("parcial", "pagado", "pagada", "completado", "completada", "control", "contrato")'
                . '     )'
                . ' )';
        }

        $sql = implode(' UNION ALL ', $eventQueries)
            . ' ORDER BY medico_id ASC, fecha_evento ASC, hora_evento ASC, CASE WHEN tipo_evento = "agenda" THEN 0 ELSE 1 END ASC, evento_id ASC';

        $stmt = $conn->prepare($sql);
        if (!$stmt) {
            return $out;
        }

        $stmt->bind_param($types, ...$params);
        $stmt->execute();
        $res = $stmt->get_result();

        $counterByKey = [];
        while ($row = $res->fetch_assoc()) {
            $medicoId = (int)($row['medico_id'] ?? 0);
            $fecha = trim((string)($row['fecha_evento'] ?? ''));
            $eventoId = (int)($row['evento_id'] ?? 0);
            $tipo = strtolower(trim((string)($row['tipo_evento'] ?? '')));
            if ($medicoId <= 0 || $eventoId <= 0 || $fecha === '') {
                continue;
            }

            $key = $medicoId . '|' . $fecha;
            $counterByKey[$key] = (int)($counterByKey[$key] ?? 0) + 1;
            $rank = (int)$counterByKey[$key];

            if ($tipo === 'consulta') {
                $out['consulta'][$eventoId] = $rank;
            } elseif ($tipo === 'agenda') {
                $out['agenda'][$eventoId] = $rank;
            }
        }
        $stmt->close();

        return $out;
    }
}
