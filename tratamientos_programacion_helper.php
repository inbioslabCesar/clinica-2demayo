<?php

if (function_exists('tph_ensure_multidia_tables')) {
    return;
}

function tph_table_exists($conn, $tableName) {
    $stmt = $conn->prepare('SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1');
    if (!$stmt) {
        return false;
    }
    $stmt->bind_param('s', $tableName);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_row();
    $stmt->close();
    return !empty($row);
}

function tph_column_exists($conn, $tableName, $columnName) {
    $stmt = $conn->prepare('SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1');
    if (!$stmt) {
        return false;
    }
    $stmt->bind_param('ss', $tableName, $columnName);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_row();
    $stmt->close();
    return !empty($row);
}

function tph_index_exists($conn, $tableName, $indexName) {
    $stmt = $conn->prepare('SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1');
    if (!$stmt) {
        return false;
    }
    $stmt->bind_param('ss', $tableName, $indexName);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_row();
    $stmt->close();
    return !empty($row);
}

function tph_ensure_column($conn, $tableName, $columnName, $alterSql) {
    if (!tph_column_exists($conn, $tableName, $columnName)) {
        $conn->query($alterSql);
    }
}

function tph_ensure_index($conn, $tableName, $indexName, $alterSql) {
    if (!tph_index_exists($conn, $tableName, $indexName)) {
        $conn->query($alterSql);
    }
}

function tph_ensure_multidia_tables($conn) {
    $conn->query(
        "CREATE TABLE IF NOT EXISTS tratamientos_enfermeria_items (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            tratamiento_id INT NOT NULL,
            item_idx INT NOT NULL DEFAULT 0,
            medicamento_codigo VARCHAR(64) NULL,
            medicamento_nombre VARCHAR(255) NOT NULL,
            dosis_texto VARCHAR(255) NULL,
            frecuencia_texto VARCHAR(255) NULL,
            frecuencia_tipo VARCHAR(32) NULL,
            frecuencia_valor INT NULL,
            frecuencia_horas_json JSON NULL,
            duracion_texto VARCHAR(255) NULL,
            duracion_valor INT NULL,
            duracion_unidad VARCHAR(16) NULL,
            duracion_dias INT NOT NULL DEFAULT 1,
            observaciones TEXT NULL,
            iniciado_en DATETIME NULL,
            completado_en DATETIME NULL,
            orden INT NOT NULL DEFAULT 0,
            creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_te_items_tratamiento (tratamiento_id),
            INDEX idx_te_items_orden (tratamiento_id, orden),
            CONSTRAINT fk_te_items_tratamiento
              FOREIGN KEY (tratamiento_id) REFERENCES tratamientos_enfermeria(id)
              ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $conn->query(
        "CREATE TABLE IF NOT EXISTS tratamientos_ejecucion_diaria (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            tratamiento_id INT NOT NULL,
            tratamiento_item_id BIGINT UNSIGNED NOT NULL,
            dia_nro INT NOT NULL,
            fecha_programada DATE NOT NULL,
            dosis_planificadas INT NOT NULL DEFAULT 1,
            dosis_administradas INT NOT NULL DEFAULT 0,
            estado_dia ENUM('pendiente','parcial','completo','omitido') NOT NULL DEFAULT 'pendiente',
            notas_dia TEXT NULL,
            actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uk_te_dia_item (tratamiento_item_id, dia_nro),
            INDEX idx_te_dia_tratamiento_estado (tratamiento_id, estado_dia),
            INDEX idx_te_dia_tratamiento_numero (tratamiento_id, dia_nro),
            CONSTRAINT fk_te_dia_tratamiento
              FOREIGN KEY (tratamiento_id) REFERENCES tratamientos_enfermeria(id)
              ON DELETE CASCADE,
            CONSTRAINT fk_te_dia_item
              FOREIGN KEY (tratamiento_item_id) REFERENCES tratamientos_enfermeria_items(id)
              ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $conn->query(
        "CREATE TABLE IF NOT EXISTS tratamientos_ejecucion_dosis (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            tratamiento_id INT NOT NULL,
            tratamiento_item_id BIGINT UNSIGNED NOT NULL,
            ejecucion_diaria_id BIGINT UNSIGNED NOT NULL,
            dia_nro INT NOT NULL,
            dosis_nro INT NOT NULL DEFAULT 1,
            fecha_hora_programada DATETIME NOT NULL,
            estado_dosis ENUM('pendiente','administrada','omitida') NOT NULL DEFAULT 'pendiente',
            fecha_hora_ejecucion DATETIME NULL,
            observacion TEXT NULL,
            creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uk_te_dosis_item_dia_nro (tratamiento_item_id, dia_nro, dosis_nro),
            INDEX idx_te_dosis_tratamiento_fecha (tratamiento_id, fecha_hora_programada),
            INDEX idx_te_dosis_diaria_estado (ejecucion_diaria_id, estado_dosis),
            CONSTRAINT fk_te_dosis_tratamiento
              FOREIGN KEY (tratamiento_id) REFERENCES tratamientos_enfermeria(id)
              ON DELETE CASCADE,
            CONSTRAINT fk_te_dosis_item
              FOREIGN KEY (tratamiento_item_id) REFERENCES tratamientos_enfermeria_items(id)
              ON DELETE CASCADE,
            CONSTRAINT fk_te_dosis_diaria
              FOREIGN KEY (ejecucion_diaria_id) REFERENCES tratamientos_ejecucion_diaria(id)
              ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    $conn->query(
        "CREATE TABLE IF NOT EXISTS tratamientos_ejecucion_eventos (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            ejecucion_diaria_id BIGINT UNSIGNED NOT NULL,
            tratamiento_id INT NOT NULL,
            dosis_programada_id BIGINT UNSIGNED NULL,
            tipo_evento ENUM('administrada','omitida','reprogramada','observacion') NOT NULL DEFAULT 'administrada',
            cantidad DECIMAL(10,2) NOT NULL DEFAULT 1.00,
            fecha_hora_evento DATETIME NOT NULL,
            usuario_id INT NULL,
            observacion TEXT NULL,
            metadata_json JSON NULL,
            creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_te_evt_dia_fecha (ejecucion_diaria_id, fecha_hora_evento),
            INDEX idx_te_evt_trat_fecha (tratamiento_id, fecha_hora_evento),
            INDEX idx_te_evt_dosis (dosis_programada_id),
            CONSTRAINT fk_te_evt_dia
              FOREIGN KEY (ejecucion_diaria_id) REFERENCES tratamientos_ejecucion_diaria(id)
              ON DELETE CASCADE,
            CONSTRAINT fk_te_evt_trat
              FOREIGN KEY (tratamiento_id) REFERENCES tratamientos_enfermeria(id)
              ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    tph_ensure_column($conn, 'tratamientos_enfermeria_items', 'frecuencia_tipo', 'ALTER TABLE tratamientos_enfermeria_items ADD COLUMN frecuencia_tipo VARCHAR(32) NULL AFTER frecuencia_texto');
    tph_ensure_column($conn, 'tratamientos_enfermeria_items', 'frecuencia_valor', 'ALTER TABLE tratamientos_enfermeria_items ADD COLUMN frecuencia_valor INT NULL AFTER frecuencia_tipo');
    tph_ensure_column($conn, 'tratamientos_enfermeria_items', 'frecuencia_horas_json', 'ALTER TABLE tratamientos_enfermeria_items ADD COLUMN frecuencia_horas_json JSON NULL AFTER frecuencia_valor');
    tph_ensure_column($conn, 'tratamientos_enfermeria_items', 'duracion_valor', 'ALTER TABLE tratamientos_enfermeria_items ADD COLUMN duracion_valor INT NULL AFTER duracion_texto');
    tph_ensure_column($conn, 'tratamientos_enfermeria_items', 'duracion_unidad', 'ALTER TABLE tratamientos_enfermeria_items ADD COLUMN duracion_unidad VARCHAR(16) NULL AFTER duracion_valor');
    tph_ensure_column($conn, 'tratamientos_enfermeria_items', 'iniciado_en', 'ALTER TABLE tratamientos_enfermeria_items ADD COLUMN iniciado_en DATETIME NULL AFTER observaciones');
    tph_ensure_column($conn, 'tratamientos_enfermeria_items', 'completado_en', 'ALTER TABLE tratamientos_enfermeria_items ADD COLUMN completado_en DATETIME NULL AFTER iniciado_en');

    tph_ensure_column($conn, 'tratamientos_ejecucion_eventos', 'dosis_programada_id', 'ALTER TABLE tratamientos_ejecucion_eventos ADD COLUMN dosis_programada_id BIGINT UNSIGNED NULL AFTER tratamiento_id');
    tph_ensure_index($conn, 'tratamientos_ejecucion_eventos', 'idx_te_evt_dosis', 'ALTER TABLE tratamientos_ejecucion_eventos ADD INDEX idx_te_evt_dosis (dosis_programada_id)');
}

function tph_parse_duracion_dias($duracionTexto) {
    $txt = mb_strtolower(trim((string)$duracionTexto), 'UTF-8');
    if ($txt === '') {
        return 1;
    }
    if (preg_match('/(\d+)\s*(dia|dias|días)/u', $txt, $m)) {
        return max(1, (int)$m[1]);
    }
    if (preg_match('/(\d+)\s*(semana|semanas)/u', $txt, $m)) {
        return max(1, (int)$m[1] * 7);
    }
    if (preg_match('/\b(\d{1,2})\b/u', $txt, $m)) {
        return max(1, (int)$m[1]);
    }
    return 1;
}

function tph_parse_time_list($value) {
    $times = [];
    if (is_array($value)) {
        $rawParts = $value;
    } else {
        $raw = trim((string)$value);
        if ($raw === '') {
            return [];
        }
        $rawParts = preg_split('/\s*,\s*/', $raw);
    }

    foreach ($rawParts as $part) {
        $part = trim((string)$part);
        if ($part === '') {
            continue;
        }
        if (preg_match('/^(\d{1,2}):(\d{2})$/', $part, $m)) {
            $hour = (int)$m[1];
            $minute = (int)$m[2];
            if ($hour >= 0 && $hour <= 23 && $minute >= 0 && $minute <= 59) {
                $times[] = sprintf('%02d:%02d', $hour, $minute);
            }
        }
    }

    $times = array_values(array_unique($times));
    sort($times);
    return $times;
}

function tph_build_frecuencia_texto($tipo, $valor, $horas) {
    $tipo = trim((string)$tipo);
    $valor = (int)$valor;
    $horas = tph_parse_time_list($horas);

    if ($tipo === 'intervalo_horas' && $valor > 0) {
        return 'Cada ' . $valor . ' horas';
    }
    if ($tipo === 'veces_dia' && $valor > 0) {
        return $valor . ' veces al día';
    }
    if ($tipo === 'horarios_fijos' && !empty($horas)) {
        return 'Horarios fijos: ' . implode(', ', $horas);
    }
    if ($tipo === 'prn') {
        return 'Según indicación / PRN';
    }
    return '';
}

function tph_build_duracion_texto($valor, $unidad) {
    $valor = max(1, (int)$valor);
    $unidad = trim((string)$unidad);
    if ($unidad === 'semanas') {
        return $valor . ' semana' . ($valor === 1 ? '' : 's');
    }
    return $valor . ' día' . ($valor === 1 ? '' : 's');
}

function tph_parse_legacy_frequency($texto) {
    $txt = mb_strtolower(trim((string)$texto), 'UTF-8');
    if ($txt === '') {
        return ['tipo' => 'intervalo_horas', 'valor' => 24, 'horas' => []];
    }
    if (preg_match('/cada\s*(\d+)\s*(h|hora|horas)/u', $txt, $m)) {
        return ['tipo' => 'intervalo_horas', 'valor' => max(1, (int)$m[1]), 'horas' => []];
    }
    if (preg_match('/c\/?\s*(\d+)\s*h/u', $txt, $m)) {
        return ['tipo' => 'intervalo_horas', 'valor' => max(1, (int)$m[1]), 'horas' => []];
    }
    if (preg_match('/(\d+)\s*veces\s*al\s*d[ií]a/u', $txt, $m)) {
        return ['tipo' => 'veces_dia', 'valor' => max(1, (int)$m[1]), 'horas' => []];
    }
    if (strpos($txt, '12h') !== false) {
        return ['tipo' => 'intervalo_horas', 'valor' => 12, 'horas' => []];
    }
    if (strpos($txt, '8h') !== false) {
        return ['tipo' => 'intervalo_horas', 'valor' => 8, 'horas' => []];
    }
    if (strpos($txt, '6h') !== false) {
        return ['tipo' => 'intervalo_horas', 'valor' => 6, 'horas' => []];
    }
    if (strpos($txt, 'prn') !== false || strpos($txt, 'sos') !== false) {
        return ['tipo' => 'prn', 'valor' => null, 'horas' => []];
    }
    return ['tipo' => 'intervalo_horas', 'valor' => 24, 'horas' => []];
}

function tph_normalize_prescripcion_item($item, $fallbackIndex = 0) {
    if (!is_array($item)) {
        $item = [];
    }

    $nombre = trim((string)($item['nombre'] ?? $item['medicamento_nombre'] ?? ''));
    if ($nombre === '') {
        $nombre = 'Medicamento ' . ((int)$fallbackIndex + 1);
    }

    $codigo = trim((string)($item['codigo'] ?? $item['medicamento_codigo'] ?? ''));
    $dosis = trim((string)($item['dosis'] ?? $item['dosis_texto'] ?? ''));
    $obs = trim((string)($item['observaciones'] ?? ''));
    if ($obs === '') {
        $obs = trim((string)($item['observaciones_texto'] ?? ''));
    }

    $frecuenciaTipo = trim((string)($item['frecuencia_tipo'] ?? ''));
    $frecuenciaValor = isset($item['frecuencia_valor']) ? (int)$item['frecuencia_valor'] : 0;
    $frecuenciaHoras = tph_parse_time_list($item['frecuencia_horas'] ?? $item['frecuencia_horas_json'] ?? []);
    $frecuenciaTexto = trim((string)($item['frecuencia'] ?? $item['frecuencia_texto'] ?? ''));

    if ($frecuenciaTipo === '') {
        $legacyFreq = tph_parse_legacy_frequency($frecuenciaTexto);
        $frecuenciaTipo = $legacyFreq['tipo'];
        $frecuenciaValor = (int)($legacyFreq['valor'] ?? 0);
        if (empty($frecuenciaHoras)) {
            $frecuenciaHoras = tph_parse_time_list($legacyFreq['horas'] ?? []);
        }
    }

    $duracionValor = isset($item['duracion_valor']) ? (int)$item['duracion_valor'] : 0;
    $duracionUnidad = trim((string)($item['duracion_unidad'] ?? ''));
    $duracionTexto = trim((string)($item['duracion'] ?? $item['duracion_texto'] ?? ''));

    if ($duracionValor <= 0) {
        if ($duracionUnidad === 'semanas' && preg_match('/(\d+)/', $duracionTexto, $m)) {
            $duracionValor = max(1, (int)$m[1]);
        } elseif (preg_match('/(\d+)/', $duracionTexto, $m)) {
            $duracionValor = max(1, (int)$m[1]);
        } else {
            $duracionValor = max(1, tph_parse_duracion_dias($duracionTexto));
        }
    }
    if ($duracionUnidad === '') {
        $duracionUnidad = preg_match('/semana/u', mb_strtolower($duracionTexto, 'UTF-8')) ? 'semanas' : 'dias';
    }

    if ($frecuenciaTexto === '') {
        $frecuenciaTexto = tph_build_frecuencia_texto($frecuenciaTipo, $frecuenciaValor, $frecuenciaHoras);
    }
    if ($duracionTexto === '') {
        $duracionTexto = tph_build_duracion_texto($duracionValor, $duracionUnidad);
    }

    $duracionDias = $duracionUnidad === 'semanas'
        ? max(1, $duracionValor * 7)
        : max(1, $duracionValor);

    $dosisDia = 1;
    if ($frecuenciaTipo === 'intervalo_horas' && $frecuenciaValor > 0) {
        $dosisDia = max(1, (int)ceil((24 * 60) / ($frecuenciaValor * 60)));
    } elseif ($frecuenciaTipo === 'veces_dia' && $frecuenciaValor > 0) {
        $dosisDia = max(1, $frecuenciaValor);
    } elseif ($frecuenciaTipo === 'horarios_fijos') {
        $dosisDia = count($frecuenciaHoras);
    } elseif ($frecuenciaTipo === 'prn') {
        $dosisDia = 0;
    }

    return [
        'codigo' => $codigo,
        'nombre' => $nombre,
        'dosis' => $dosis,
        'frecuencia_texto' => $frecuenciaTexto,
        'frecuencia_tipo' => $frecuenciaTipo,
        'frecuencia_valor' => $frecuenciaValor > 0 ? $frecuenciaValor : null,
        'frecuencia_horas' => $frecuenciaHoras,
        'duracion_texto' => $duracionTexto,
        'duracion_valor' => max(1, $duracionValor),
        'duracion_unidad' => $duracionUnidad === 'semanas' ? 'semanas' : 'dias',
        'duracion_dias' => $duracionDias,
        'observaciones' => $obs,
        'dosis_dia' => $dosisDia,
    ];
}

function tph_delete_plan($conn, $tratamientoId) {
    $stmt = $conn->prepare('DELETE FROM tratamientos_ejecucion_eventos WHERE tratamiento_id = ?');
    if ($stmt) {
        $stmt->bind_param('i', $tratamientoId);
        $stmt->execute();
        $stmt->close();
    }
    $stmt = $conn->prepare('DELETE FROM tratamientos_ejecucion_dosis WHERE tratamiento_id = ?');
    if ($stmt) {
        $stmt->bind_param('i', $tratamientoId);
        $stmt->execute();
        $stmt->close();
    }
    $stmt = $conn->prepare('DELETE FROM tratamientos_ejecucion_diaria WHERE tratamiento_id = ?');
    if ($stmt) {
        $stmt->bind_param('i', $tratamientoId);
        $stmt->execute();
        $stmt->close();
    }
    $stmt = $conn->prepare('DELETE FROM tratamientos_enfermeria_items WHERE tratamiento_id = ?');
    if ($stmt) {
        $stmt->bind_param('i', $tratamientoId);
        $stmt->execute();
        $stmt->close();
    }
}

function tph_rebuild_plan_multidia($conn, $tratamientoId, $receta) {
    $tratamientoId = (int)$tratamientoId;
    if ($tratamientoId <= 0) {
        return;
    }

    tph_ensure_multidia_tables($conn);

    $stmtBase = $conn->prepare('SELECT creado_en, iniciado_en FROM tratamientos_enfermeria WHERE id = ? LIMIT 1');
    if (!$stmtBase) {
        return;
    }
    $stmtBase->bind_param('i', $tratamientoId);
    $stmtBase->execute();
    $rowBase = $stmtBase->get_result()->fetch_assoc();
    $stmtBase->close();

    $fechaBase = !empty($rowBase['creado_en']) ? substr((string)$rowBase['creado_en'], 0, 10) : date('Y-m-d');
    tph_delete_plan($conn, $tratamientoId);

    if (!is_array($receta) || empty($receta)) {
        return;
    }

        $itemIniciadoEn = !empty($rowBase['iniciado_en']) ? (string)$rowBase['iniciado_en'] : null;
        $itemCompletadoEn = null;

        $stmtItem = $conn->prepare(
        'INSERT INTO tratamientos_enfermeria_items
                    (tratamiento_id, item_idx, medicamento_codigo, medicamento_nombre, dosis_texto, frecuencia_texto, frecuencia_tipo, frecuencia_valor, frecuencia_horas_json, duracion_texto, duracion_valor, duracion_unidad, duracion_dias, observaciones, iniciado_en, completado_en, orden)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $stmtDia = $conn->prepare(
        'INSERT INTO tratamientos_ejecucion_diaria
            (tratamiento_id, tratamiento_item_id, dia_nro, fecha_programada, dosis_planificadas, dosis_administradas, estado_dia)
         VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    if (!$stmtItem || !$stmtDia) {
        if ($stmtItem) $stmtItem->close();
        if ($stmtDia) $stmtDia->close();
        return;
    }

    foreach ($receta as $idx => $item) {
        $norm = tph_normalize_prescripcion_item($item, $idx);
        $orden = (int)$idx + 1;
        $codigo = $norm['codigo'];
        $nombre = $norm['nombre'];
        $dosis = $norm['dosis'];
        $frecuenciaTexto = $norm['frecuencia_texto'];
        $frecuenciaTipo = $norm['frecuencia_tipo'];
        $horasJson = !empty($norm['frecuencia_horas']) ? json_encode(array_values($norm['frecuencia_horas']), JSON_UNESCAPED_UNICODE) : null;
        $frecuenciaValor = isset($norm['frecuencia_valor']) ? (int)$norm['frecuencia_valor'] : null;
        $duracionTexto = $norm['duracion_texto'];
        $duracionValor = (int)$norm['duracion_valor'];
        $duracionUnidad = $norm['duracion_unidad'];
        $duracionDias = (int)$norm['duracion_dias'];
        $observaciones = $norm['observaciones'];
        $stmtItem->bind_param(
            'iisssssissisisssi',
            $tratamientoId,
            $idx,
            $codigo,
            $nombre,
            $dosis,
            $frecuenciaTexto,
            $frecuenciaTipo,
            $frecuenciaValor,
            $horasJson,
            $duracionTexto,
            $duracionValor,
            $duracionUnidad,
            $duracionDias,
            $observaciones,
            $itemIniciadoEn,
            $itemCompletadoEn,
            $orden
        );
        $okItem = $stmtItem->execute();
        $itemId = $okItem ? (int)$stmtItem->insert_id : 0;
        if ($itemId <= 0) {
            continue;
        }

        for ($dia = 1; $dia <= (int)$norm['duracion_dias']; $dia++) {
            $fechaProgramada = date('Y-m-d', strtotime($fechaBase . ' +' . ($dia - 1) . ' day'));
            $estadoDia = 'pendiente';
            $dosisAdministradas = 0;
            $dosisPlanificadas = (int)$norm['dosis_dia'];
            $stmtDia->bind_param('iiisiis', $tratamientoId, $itemId, $dia, $fechaProgramada, $dosisPlanificadas, $dosisAdministradas, $estadoDia);
            $stmtDia->execute();
        }
    }

    $stmtItem->close();
    $stmtDia->close();

    if (!empty($rowBase['iniciado_en'])) {
        tph_regenerar_dosis_programadas($conn, $tratamientoId, $rowBase['iniciado_en']);
    }
}

function tph_seed_plan_from_snapshot($conn, $tratamientoId) {
    $tratamientoId = (int)$tratamientoId;
    if ($tratamientoId <= 0) {
        return;
    }

    tph_ensure_multidia_tables($conn);

    $stmtCount = $conn->prepare('SELECT COUNT(*) AS c FROM tratamientos_enfermeria_items WHERE tratamiento_id = ?');
    if (!$stmtCount) {
        return;
    }
    $stmtCount->bind_param('i', $tratamientoId);
    $stmtCount->execute();
    $existing = (int)($stmtCount->get_result()->fetch_assoc()['c'] ?? 0);
    $stmtCount->close();
    if ($existing > 0) {
        return;
    }

    $stmtBase = $conn->prepare('SELECT receta_snapshot FROM tratamientos_enfermeria WHERE id = ? LIMIT 1');
    if (!$stmtBase) {
        return;
    }
    $stmtBase->bind_param('i', $tratamientoId);
    $stmtBase->execute();
    $base = $stmtBase->get_result()->fetch_assoc();
    $stmtBase->close();
    if (!$base) {
        return;
    }

    $receta = [];
    if (isset($base['receta_snapshot']) && is_string($base['receta_snapshot'])) {
        $decoded = json_decode($base['receta_snapshot'], true);
        if (is_array($decoded)) {
            $receta = $decoded;
        }
    }

    tph_rebuild_plan_multidia($conn, $tratamientoId, $receta);
}

function tph_fetch_day_map($conn, $tratamientoId) {
    $map = [];
    $stmt = $conn->prepare('SELECT id, tratamiento_item_id, dia_nro FROM tratamientos_ejecucion_diaria WHERE tratamiento_id = ?');
    if (!$stmt) {
        return $map;
    }
    $stmt->bind_param('i', $tratamientoId);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();
    foreach ($rows as $row) {
        $key = (int)$row['tratamiento_item_id'] . ':' . (int)$row['dia_nro'];
        $map[$key] = (int)$row['id'];
    }
    return $map;
}

function tph_backfill_item_inicio_desde_cabecera($conn, $tratamientoId) {
    $tratamientoId = (int)$tratamientoId;
    if ($tratamientoId <= 0) {
        return;
    }

    $stmtCount = $conn->prepare(
        'SELECT
            COUNT(*) AS total_items,
            SUM(CASE WHEN iniciado_en IS NOT NULL THEN 1 ELSE 0 END) AS items_iniciados
         FROM tratamientos_enfermeria_items
         WHERE tratamiento_id = ?'
    );
    if (!$stmtCount) {
        return;
    }
    $stmtCount->bind_param('i', $tratamientoId);
    $stmtCount->execute();
    $itemAgg = $stmtCount->get_result()->fetch_assoc();
    $stmtCount->close();

    $totalItems = (int)($itemAgg['total_items'] ?? 0);
    $itemsIniciados = (int)($itemAgg['items_iniciados'] ?? 0);
    if ($totalItems <= 0 || $itemsIniciados > 0) {
        return;
    }

    $stmt = $conn->prepare('SELECT iniciado_en, completado_en FROM tratamientos_enfermeria WHERE id = ? LIMIT 1');
    if (!$stmt) {
        return;
    }
    $stmt->bind_param('i', $tratamientoId);
    $stmt->execute();
    $cab = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    $cabIniciadoEn = trim((string)($cab['iniciado_en'] ?? ''));
    if ($cabIniciadoEn === '') {
        return;
    }

    $cabCompletadoEn = !empty($cab['completado_en']) ? (string)$cab['completado_en'] : null;
    $stmtUpd = $conn->prepare(
        'UPDATE tratamientos_enfermeria_items
         SET iniciado_en = COALESCE(iniciado_en, ?),
             completado_en = CASE
                 WHEN ? IS NOT NULL THEN COALESCE(completado_en, ?)
                 ELSE completado_en
             END
         WHERE tratamiento_id = ?'
    );
    if (!$stmtUpd) {
        return;
    }
    $stmtUpd->bind_param('sssi', $cabIniciadoEn, $cabCompletadoEn, $cabCompletadoEn, $tratamientoId);
    $stmtUpd->execute();
    $stmtUpd->close();
}

function tph_insert_dosis_programada($stmtDosis, $tratamientoId, $itemId, $ejecucionDiariaId, $diaNro, $dosisNro, $fechaHoraProgramada) {
    $estado = 'pendiente';
    $fechaHoraEjecucion = null;
    $observacion = null;
    $stmtDosis->bind_param(
           'iiiiissss',
        $tratamientoId,
        $itemId,
        $ejecucionDiariaId,
        $diaNro,
        $dosisNro,
        $fechaHoraProgramada,
        $estado,
        $fechaHoraEjecucion,
        $observacion
    );
    $stmtDosis->execute();
}

function tph_regenerar_dosis_programadas($conn, $tratamientoId, $inicioReal = null) {
    $tratamientoId = (int)$tratamientoId;
    if ($tratamientoId <= 0) {
        return false;
    }

    tph_ensure_multidia_tables($conn);
    tph_seed_plan_from_snapshot($conn, $tratamientoId);

    $stmtCab = $conn->prepare('SELECT iniciado_en FROM tratamientos_enfermeria WHERE id = ? LIMIT 1');
    if (!$stmtCab) {
        return false;
    }
    $stmtCab->bind_param('i', $tratamientoId);
    $stmtCab->execute();
    $cab = $stmtCab->get_result()->fetch_assoc();
    $stmtCab->close();

    $inicioBase = trim((string)($inicioReal ?: ($cab['iniciado_en'] ?? '')));
    if ($inicioBase === '') {
        return false;
    }

    $stmtDel = $conn->prepare('DELETE FROM tratamientos_ejecucion_dosis WHERE tratamiento_id = ?');
    if ($stmtDel) {
        $stmtDel->bind_param('i', $tratamientoId);
        $stmtDel->execute();
        $stmtDel->close();
    }

    $dayMap = tph_fetch_day_map($conn, $tratamientoId);

    $stmtItems = $conn->prepare('SELECT * FROM tratamientos_enfermeria_items WHERE tratamiento_id = ? ORDER BY orden ASC, id ASC');
    if (!$stmtItems) {
        return false;
    }
    $stmtItems->bind_param('i', $tratamientoId);
    $stmtItems->execute();
    $items = $stmtItems->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmtItems->close();

    $stmtDosis = $conn->prepare(
        'INSERT INTO tratamientos_ejecucion_dosis
            (tratamiento_id, tratamiento_item_id, ejecucion_diaria_id, dia_nro, dosis_nro, fecha_hora_programada, estado_dosis, fecha_hora_ejecucion, observacion)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    if (!$stmtDosis) {
        return false;
    }

    foreach ($items as $idx => $item) {
        $norm = tph_normalize_prescripcion_item($item, $idx);
        $itemId = (int)$item['id'];
        $startTs = strtotime($inicioBase);
        if ($startTs === false) {
            continue;
        }

        if ($norm['frecuencia_tipo'] === 'intervalo_horas' && !empty($norm['frecuencia_valor'])) {
            $intervalSeconds = (int)$norm['frecuencia_valor'] * 3600;
            $finishTs = $startTs + ((int)$norm['duracion_dias'] * 86400);
            $currentTs = $startTs;
            $perDayCounter = [];
            while ($currentTs < $finishTs) {
                $dayNumber = (int)floor(($currentTs - $startTs) / 86400) + 1;
                if ($dayNumber > (int)$norm['duracion_dias']) {
                    break;
                }
                $key = $itemId . ':' . $dayNumber;
                $ejecucionDiariaId = isset($dayMap[$key]) ? (int)$dayMap[$key] : 0;
                if ($ejecucionDiariaId > 0) {
                    $perDayCounter[$dayNumber] = (int)($perDayCounter[$dayNumber] ?? 0) + 1;
                    tph_insert_dosis_programada($stmtDosis, $tratamientoId, $itemId, $ejecucionDiariaId, $dayNumber, $perDayCounter[$dayNumber], date('Y-m-d H:i:s', $currentTs));
                }
                $currentTs += $intervalSeconds;
            }
        } elseif ($norm['frecuencia_tipo'] === 'veces_dia' && !empty($norm['frecuencia_valor'])) {
            $spacingSeconds = (int)round(86400 / max(1, (int)$norm['frecuencia_valor']));
            for ($dayNumber = 1; $dayNumber <= (int)$norm['duracion_dias']; $dayNumber++) {
                $key = $itemId . ':' . $dayNumber;
                $ejecucionDiariaId = isset($dayMap[$key]) ? (int)$dayMap[$key] : 0;
                if ($ejecucionDiariaId <= 0) {
                    continue;
                }
                $baseDayTs = $startTs + (($dayNumber - 1) * 86400);
                for ($doseNumber = 1; $doseNumber <= (int)$norm['frecuencia_valor']; $doseNumber++) {
                    $doseTs = $baseDayTs + (($doseNumber - 1) * $spacingSeconds);
                    tph_insert_dosis_programada($stmtDosis, $tratamientoId, $itemId, $ejecucionDiariaId, $dayNumber, $doseNumber, date('Y-m-d H:i:s', $doseTs));
                }
            }
        } elseif ($norm['frecuencia_tipo'] === 'horarios_fijos' && !empty($norm['frecuencia_horas'])) {
            $startDate = date('Y-m-d', $startTs);
            foreach ($norm['frecuencia_horas'] as $dayTimeIndex => $clock) {
                $norm['frecuencia_horas'][$dayTimeIndex] = $clock;
            }
            for ($dayNumber = 1; $dayNumber <= (int)$norm['duracion_dias']; $dayNumber++) {
                $key = $itemId . ':' . $dayNumber;
                $ejecucionDiariaId = isset($dayMap[$key]) ? (int)$dayMap[$key] : 0;
                if ($ejecucionDiariaId <= 0) {
                    continue;
                }
                $fechaBase = date('Y-m-d', strtotime($startDate . ' +' . ($dayNumber - 1) . ' day'));
                $doseNumber = 0;
                foreach ($norm['frecuencia_horas'] as $clock) {
                    $doseTs = strtotime($fechaBase . ' ' . $clock . ':00');
                    if ($doseTs === false) {
                        continue;
                    }
                    if ($dayNumber === 1 && $doseTs < $startTs) {
                        continue;
                    }
                    $doseNumber++;
                    tph_insert_dosis_programada($stmtDosis, $tratamientoId, $itemId, $ejecucionDiariaId, $dayNumber, $doseNumber, date('Y-m-d H:i:s', $doseTs));
                }
            }
        }
    }

    $stmtDosis->close();
    tph_recalcular_resumen_dias_desde_dosis($conn, $tratamientoId);
    return true;
}

function tph_regenerar_dosis_programadas_item($conn, $tratamientoId, $itemId, $inicioReal = null) {
    $tratamientoId = (int)$tratamientoId;
    $itemId = (int)$itemId;
    if ($tratamientoId <= 0 || $itemId <= 0) {
        return false;
    }

    tph_ensure_multidia_tables($conn);
    tph_seed_plan_from_snapshot($conn, $tratamientoId);

    $stmtItem = $conn->prepare(
        'SELECT i.*, te.iniciado_en AS tratamiento_iniciado_en
         FROM tratamientos_enfermeria_items i
         INNER JOIN tratamientos_enfermeria te ON te.id = i.tratamiento_id
         WHERE i.id = ? AND i.tratamiento_id = ?
         LIMIT 1'
    );
    if (!$stmtItem) {
        return false;
    }
    $stmtItem->bind_param('ii', $itemId, $tratamientoId);
    $stmtItem->execute();
    $item = $stmtItem->get_result()->fetch_assoc();
    $stmtItem->close();

    if (!$item) {
        return false;
    }

    $inicioBase = trim((string)($inicioReal ?: ($item['iniciado_en'] ?? $item['tratamiento_iniciado_en'] ?? '')));
    if ($inicioBase === '') {
        return false;
    }

    $stmtDel = $conn->prepare('DELETE FROM tratamientos_ejecucion_dosis WHERE tratamiento_id = ? AND tratamiento_item_id = ?');
    if ($stmtDel) {
        $stmtDel->bind_param('ii', $tratamientoId, $itemId);
        $stmtDel->execute();
        $stmtDel->close();
    }

    $dayMap = tph_fetch_day_map($conn, $tratamientoId);
    $stmtDosis = $conn->prepare(
        'INSERT INTO tratamientos_ejecucion_dosis
            (tratamiento_id, tratamiento_item_id, ejecucion_diaria_id, dia_nro, dosis_nro, fecha_hora_programada, estado_dosis, fecha_hora_ejecucion, observacion)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    if (!$stmtDosis) {
        return false;
    }

    $norm = tph_normalize_prescripcion_item($item, (int)($item['item_idx'] ?? 0));
    $startTs = strtotime($inicioBase);
    if ($startTs === false) {
        $stmtDosis->close();
        return false;
    }

    if ($norm['frecuencia_tipo'] === 'intervalo_horas' && !empty($norm['frecuencia_valor'])) {
        $intervalSeconds = (int)$norm['frecuencia_valor'] * 3600;
        $finishTs = $startTs + ((int)$norm['duracion_dias'] * 86400);
        $currentTs = $startTs;
        $perDayCounter = [];
        while ($currentTs < $finishTs) {
            $dayNumber = (int)floor(($currentTs - $startTs) / 86400) + 1;
            if ($dayNumber > (int)$norm['duracion_dias']) {
                break;
            }
            $key = $itemId . ':' . $dayNumber;
            $ejecucionDiariaId = isset($dayMap[$key]) ? (int)$dayMap[$key] : 0;
            if ($ejecucionDiariaId > 0) {
                $perDayCounter[$dayNumber] = (int)($perDayCounter[$dayNumber] ?? 0) + 1;
                tph_insert_dosis_programada($stmtDosis, $tratamientoId, $itemId, $ejecucionDiariaId, $dayNumber, $perDayCounter[$dayNumber], date('Y-m-d H:i:s', $currentTs));
            }
            $currentTs += $intervalSeconds;
        }
    } elseif ($norm['frecuencia_tipo'] === 'veces_dia' && !empty($norm['frecuencia_valor'])) {
        $spacingSeconds = (int)round(86400 / max(1, (int)$norm['frecuencia_valor']));
        for ($dayNumber = 1; $dayNumber <= (int)$norm['duracion_dias']; $dayNumber++) {
            $key = $itemId . ':' . $dayNumber;
            $ejecucionDiariaId = isset($dayMap[$key]) ? (int)$dayMap[$key] : 0;
            if ($ejecucionDiariaId <= 0) {
                continue;
            }
            $baseDayTs = $startTs + (($dayNumber - 1) * 86400);
            for ($doseNumber = 1; $doseNumber <= (int)$norm['frecuencia_valor']; $doseNumber++) {
                $doseTs = $baseDayTs + (($doseNumber - 1) * $spacingSeconds);
                tph_insert_dosis_programada($stmtDosis, $tratamientoId, $itemId, $ejecucionDiariaId, $dayNumber, $doseNumber, date('Y-m-d H:i:s', $doseTs));
            }
        }
    } elseif ($norm['frecuencia_tipo'] === 'horarios_fijos' && !empty($norm['frecuencia_horas'])) {
        $startDate = date('Y-m-d', $startTs);
        for ($dayNumber = 1; $dayNumber <= (int)$norm['duracion_dias']; $dayNumber++) {
            $key = $itemId . ':' . $dayNumber;
            $ejecucionDiariaId = isset($dayMap[$key]) ? (int)$dayMap[$key] : 0;
            if ($ejecucionDiariaId <= 0) {
                continue;
            }
            $fechaBase = date('Y-m-d', strtotime($startDate . ' +' . ($dayNumber - 1) . ' day'));
            $doseNumber = 0;
            foreach ($norm['frecuencia_horas'] as $clock) {
                $doseTs = strtotime($fechaBase . ' ' . $clock . ':00');
                if ($doseTs === false) {
                    continue;
                }
                if ($dayNumber === 1 && $doseTs < $startTs) {
                    continue;
                }
                $doseNumber++;
                tph_insert_dosis_programada($stmtDosis, $tratamientoId, $itemId, $ejecucionDiariaId, $dayNumber, $doseNumber, date('Y-m-d H:i:s', $doseTs));
            }
        }
    }

    $stmtDosis->close();
    tph_recalcular_resumen_dias_desde_dosis($conn, $tratamientoId);
    return true;
}

function tph_regenerar_items_iniciados_sin_dosis($conn, $tratamientoId) {
    $tratamientoId = (int)$tratamientoId;
    if ($tratamientoId <= 0) {
        return;
    }

    $stmt = $conn->prepare(
        'SELECT i.id
         FROM tratamientos_enfermeria_items i
         LEFT JOIN tratamientos_ejecucion_dosis d ON d.tratamiento_item_id = i.id
         WHERE i.tratamiento_id = ?
           AND i.iniciado_en IS NOT NULL
         GROUP BY i.id
         HAVING COUNT(d.id) = 0'
    );
    if (!$stmt) {
        return;
    }
    $stmt->bind_param('i', $tratamientoId);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();

    foreach ($rows as $row) {
        tph_regenerar_dosis_programadas_item($conn, $tratamientoId, (int)$row['id']);
    }
}

function tph_recalcular_resumen_dias_desde_dosis($conn, $tratamientoId) {
    $stmtDays = $conn->prepare('SELECT id FROM tratamientos_ejecucion_diaria WHERE tratamiento_id = ?');
    if (!$stmtDays) {
        return;
    }
    $stmtDays->bind_param('i', $tratamientoId);
    $stmtDays->execute();
    $dias = $stmtDays->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmtDays->close();

    $stmtAgg = $conn->prepare(
        'SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN estado_dosis = "administrada" THEN 1 ELSE 0 END) AS administradas,
            SUM(CASE WHEN estado_dosis = "omitida" THEN 1 ELSE 0 END) AS omitidas
         FROM tratamientos_ejecucion_dosis
         WHERE ejecucion_diaria_id = ?'
    );
    $stmtUpd = $conn->prepare('UPDATE tratamientos_ejecucion_diaria SET dosis_planificadas = ?, dosis_administradas = ?, estado_dia = ? WHERE id = ? LIMIT 1');
    if (!$stmtAgg || !$stmtUpd) {
        if ($stmtAgg) $stmtAgg->close();
        if ($stmtUpd) $stmtUpd->close();
        return;
    }

    foreach ($dias as $dia) {
        $diaId = (int)$dia['id'];
        $stmtAgg->bind_param('i', $diaId);
        $stmtAgg->execute();
        $agg = $stmtAgg->get_result()->fetch_assoc();

        $total = (int)($agg['total'] ?? 0);
        $administradas = (int)($agg['administradas'] ?? 0);
        $omitidas = (int)($agg['omitidas'] ?? 0);

        $estado = 'pendiente';
        if ($total > 0 && $omitidas >= $total && $administradas === 0) {
            $estado = 'omitido';
        } elseif ($total > 0 && $administradas >= $total) {
            $estado = 'completo';
        } elseif ($administradas > 0 || $omitidas > 0) {
            $estado = 'parcial';
        }

        $stmtUpd->bind_param('iisi', $total, $administradas, $estado, $diaId);
        $stmtUpd->execute();
    }

    $stmtAgg->close();
    $stmtUpd->close();
}
