<?php
// Episodio de atención: conjunto de cotizaciones encadenadas por adendas (misma fecha operativa).
// Cuando la consulta se agrega después (adenda) de servicios ya cotizados, esta lógica la convierte
// en el ancla del episodio: los servicios huérfanos pasan a asociarse a esa consulta.

if (!function_exists('episodio_columna_existe')) {
    function episodio_columna_existe($conn, $tabla, $columna)
    {
        static $cache = [];
        $key = $tabla . '.' . $columna;
        if (!array_key_exists($key, $cache)) {
            $stmt = $conn->prepare('SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1');
            $existe = false;
            if ($stmt) {
                $stmt->bind_param('ss', $tabla, $columna);
                $stmt->execute();
                $existe = (bool)$stmt->get_result()->fetch_assoc();
                $stmt->close();
            }
            $cache[$key] = $existe;
        }
        return $cache[$key];
    }
}

if (!function_exists('episodio_cotizaciones_cadena_ids')) {
    function episodio_cotizaciones_cadena_ids($conn, $cotizacionId)
    {
        $cotizacionId = (int)$cotizacionId;
        if ($cotizacionId <= 0) {
            return [];
        }
        if (!episodio_columna_existe($conn, 'cotizaciones', 'cotizacion_padre_id')) {
            return [$cotizacionId];
        }

        $raiz = $cotizacionId;
        $vistos = [];
        while ($raiz > 0 && !isset($vistos[$raiz])) {
            $vistos[$raiz] = true;
            $stmt = $conn->prepare('SELECT cotizacion_padre_id FROM cotizaciones WHERE id = ? LIMIT 1');
            if (!$stmt) {
                break;
            }
            $stmt->bind_param('i', $raiz);
            $stmt->execute();
            $row = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            $padre = (int)($row['cotizacion_padre_id'] ?? 0);
            if ($padre <= 0) {
                break;
            }
            $raiz = $padre;
        }

        $ids = [$raiz => true];
        $pendientes = [$raiz];
        while (!empty($pendientes)) {
            $actual = (int)array_shift($pendientes);
            $stmt = $conn->prepare('SELECT id FROM cotizaciones WHERE cotizacion_padre_id = ?');
            if (!$stmt) {
                continue;
            }
            $stmt->bind_param('i', $actual);
            $stmt->execute();
            $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
            $stmt->close();
            foreach ($rows as $row) {
                $hijo = (int)($row['id'] ?? 0);
                if ($hijo > 0 && !isset($ids[$hijo])) {
                    $ids[$hijo] = true;
                    $pendientes[] = $hijo;
                }
            }
        }

        return array_map('intval', array_keys($ids));
    }
}

if (!function_exists('episodio_bloque_fecha_base_sin_consulta')) {
    // Fecha base del bloque (sin consulta de origen) al que ya pertenece la cotización; '' si no existe.
    function episodio_bloque_fecha_base_sin_consulta($conn, $cotizacionId)
    {
        $cotizacionId = (int)$cotizacionId;
        if ($cotizacionId <= 0
            || !episodio_columna_existe($conn, 'bloques_atencion', 'fecha_base')
            || !episodio_columna_existe($conn, 'bloques_atencion_cotizaciones', 'bloque_id')) {
            return '';
        }
        $stmt = $conn->prepare(
            'SELECT b.fecha_base FROM bloques_atencion b
             INNER JOIN bloques_atencion_cotizaciones bc ON bc.bloque_id = b.id
             WHERE bc.cotizacion_id = ? AND b.consulta_origen_id IS NULL
             ORDER BY b.id DESC LIMIT 1'
        );
        if (!$stmt) {
            return '';
        }
        $stmt->bind_param('i', $cotizacionId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return substr(trim((string)($row['fecha_base'] ?? '')), 0, 10);
    }
}

if (!function_exists('episodio_adoptar_servicios_en_consulta')) {
    // Asocia a $consultaId los servicios clínicos del episodio que aún no tienen consulta.
    // Solo toca registros huérfanos (consulta_id NULL/0): nunca reasigna servicios de otra consulta.
    function episodio_adoptar_servicios_en_consulta($conn, $cotizacionId, $consultaId)
    {
        $cotizacionId = (int)$cotizacionId;
        $consultaId = (int)$consultaId;
        $resultado = ['detalles' => 0, 'ordenes' => 0, 'bloques' => 0];
        if ($cotizacionId <= 0 || $consultaId <= 0) {
            return $resultado;
        }

        $cadena = episodio_cotizaciones_cadena_ids($conn, $cotizacionId);
        if (count($cadena) < 2) {
            return $resultado;
        }
        $inCadena = implode(',', array_map('intval', $cadena));

        if (episodio_columna_existe($conn, 'cotizaciones_detalle', 'consulta_id')) {
            $filtroEstado = episodio_columna_existe($conn, 'cotizaciones_detalle', 'estado_item')
                ? " AND (estado_item IS NULL OR estado_item <> 'eliminado')"
                : '';
            $stmt = $conn->prepare(
                "UPDATE cotizaciones_detalle SET consulta_id = ?
                 WHERE cotizacion_id IN ($inCadena)
                   AND (consulta_id IS NULL OR consulta_id = 0)
                   AND LOWER(TRIM(COALESCE(servicio_tipo, ''))) IN ('laboratorio', 'ecografia', 'rayosx', 'rayos_x', 'rayos x', 'rx', 'tomografia', 'imagen', 'imagenologia', 'procedimiento', 'procedimientos', 'operacion', 'operaciones', 'hospitalizacion')"
                . $filtroEstado
            );
            if ($stmt) {
                $stmt->bind_param('i', $consultaId);
                $stmt->execute();
                $resultado['detalles'] = max(0, (int)$stmt->affected_rows);
                $stmt->close();
            }
        }

        foreach (['ordenes_imagen', 'ordenes_laboratorio', 'ordenes_procedimientos'] as $tabla) {
            if (!episodio_columna_existe($conn, $tabla, 'consulta_id') || !episodio_columna_existe($conn, $tabla, 'cotizacion_id')) {
                continue;
            }
            $stmt = $conn->prepare(
                "UPDATE $tabla SET consulta_id = ?
                 WHERE cotizacion_id IN ($inCadena) AND (consulta_id IS NULL OR consulta_id = 0)"
            );
            if ($stmt) {
                $stmt->bind_param('i', $consultaId);
                $stmt->execute();
                $resultado['ordenes'] += max(0, (int)$stmt->affected_rows);
                $stmt->close();
            }
        }

        // Los bloques de la cadena sin consulta de origen pasan a tener esta consulta como ancla.
        if (episodio_columna_existe($conn, 'bloques_atencion', 'consulta_origen_id')
            && episodio_columna_existe($conn, 'bloques_atencion_cotizaciones', 'bloque_id')) {
            $stmt = $conn->prepare(
                "UPDATE bloques_atencion SET consulta_origen_id = ?
                 WHERE consulta_origen_id IS NULL
                   AND id IN (SELECT bloque_id FROM bloques_atencion_cotizaciones WHERE cotizacion_id IN ($inCadena))"
            );
            if ($stmt) {
                $stmt->bind_param('i', $consultaId);
                $stmt->execute();
                $resultado['bloques'] = max(0, (int)$stmt->affected_rows);
                $stmt->close();
            }
        }

        return $resultado;
    }
}

if (!function_exists('episodio_marcar_agenda_imagen_atendida')) {
    // Al completar el informe de una orden de imagen, su servicio en la agenda pasa a "atendido".
    // La orden guarda cotizacion y tipo, pero no el detalle: se empareja la n-esima orden con el n-esimo servicio de la cadena.
    // Devuelve 1 si actualizo un servicio de agenda, 0 en otro caso (incluye "ya estaba atendido").
    function episodio_marcar_agenda_imagen_atendida($conn, $ordenId, $usuarioId = 0)
    {
        $ordenId = (int)$ordenId;
        $usuarioId = (int)$usuarioId;
        if ($ordenId <= 0) {
            return 0;
        }

        $stmt = $conn->prepare('SELECT cotizacion_id, LOWER(TRIM(COALESCE(tipo, ""))) AS tipo FROM ordenes_imagen WHERE id = ? LIMIT 1');
        if (!$stmt) {
            return 0;
        }
        $stmt->bind_param('i', $ordenId);
        $stmt->execute();
        $orden = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        $cotizacionId = (int)($orden['cotizacion_id'] ?? 0);
        $tipoOrden = (string)($orden['tipo'] ?? '');
        if ($cotizacionId <= 0) {
            return 0;
        }

        $tiposAgenda = [];
        if ($tipoOrden === 'rx') {
            $tiposAgenda = ['rayosx', 'rayos_x', 'rayos x', 'rx'];
        } elseif ($tipoOrden === 'ecografia') {
            $tiposAgenda = ['ecografia'];
        }
        $cadena = episodio_cotizaciones_cadena_ids($conn, $cotizacionId);
        if (empty($tiposAgenda) || empty($cadena)) {
            return 0;
        }

        $phCadena = implode(',', array_fill(0, count($cadena), '?'));
        $typesCadena = str_repeat('i', count($cadena));

        $stmt = $conn->prepare(
            "SELECT id FROM ordenes_imagen
             WHERE cotizacion_id IN ($phCadena)
               AND LOWER(TRIM(COALESCE(tipo, ''))) = ?
               AND LOWER(TRIM(COALESCE(estado, ''))) NOT IN ('cancelado', 'cancelada')
             ORDER BY id ASC"
        );
        if (!$stmt) {
            return 0;
        }
        $stmt->bind_param($typesCadena . 's', ...array_merge($cadena, [$tipoOrden]));
        $stmt->execute();
        $posicion = -1;
        $idx = 0;
        $resOrdenes = $stmt->get_result();
        while ($row = $resOrdenes->fetch_assoc()) {
            if ((int)$row['id'] === $ordenId) {
                $posicion = $idx;
                break;
            }
            $idx++;
        }
        $stmt->close();
        if ($posicion < 0) {
            return 0;
        }

        $phTipos = implode(',', array_fill(0, count($tiposAgenda), '?'));
        $stmt = $conn->prepare(
            "SELECT id, LOWER(TRIM(COALESCE(estado_evento, ''))) AS estado_evento
             FROM agenda_servicios_cotizacion
             WHERE cotizacion_id IN ($phCadena)
               AND LOWER(TRIM(COALESCE(servicio_tipo, ''))) IN ($phTipos)
               AND LOWER(TRIM(COALESCE(estado_evento, ''))) NOT IN ('cancelado', 'no_asistio')
             ORDER BY id ASC"
        );
        if (!$stmt) {
            return 0;
        }
        $stmt->bind_param($typesCadena . str_repeat('s', count($tiposAgenda)), ...array_merge($cadena, $tiposAgenda));
        $stmt->execute();
        $eventos = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();

        $evento = $eventos[$posicion] ?? null;
        if (!$evento || !in_array((string)$evento['estado_evento'], ['pendiente', 'confirmado'], true)) {
            return 0;
        }

        $stmt = $conn->prepare("UPDATE agenda_servicios_cotizacion SET estado_evento = 'atendido', updated_by = ? WHERE id = ? AND estado_evento IN ('pendiente', 'confirmado')");
        if (!$stmt) {
            return 0;
        }
        $eventoId = (int)$evento['id'];
        $stmt->bind_param('ii', $usuarioId, $eventoId);
        $stmt->execute();
        $afectadas = (int)$stmt->affected_rows;
        $stmt->close();

        return $afectadas > 0 ? 1 : 0;
    }
}
