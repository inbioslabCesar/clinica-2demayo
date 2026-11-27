<?php
/**
 * Reglas de agenda para crear consultas, compartidas por api_consultas.php (recepción) y Seguimiento clínico.
 *
 * Las funciones consultas_* / columna_existe_local se movieron tal cual desde api_consultas.php (mismo nombre y mismo
 * comportamiento) para que una sola implementación decida cupos, conflictos y horarios.
 *
 * consultas_reservar_horario() es el núcleo de la validación atómica + inserción de la consulta (antes inline en el POST):
 *   - programada: bloquea el bloque de disponibilidad (FOR UPDATE), valida cupos y cuenta consultas activas y reevaluaciones;
 *   - espontánea / reservada sin turno: omite bloque y cupos, pero conserva el conflicto exacto de hora;
 *   - siempre: conflicto exacto de consulta, de servicio de agenda y de reevaluación.
 */
require_once __DIR__ . '/ReevaluacionModule.php';

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

function consultas_normalize_slot_minutes($value) {
    $slot = (int)$value;
    if ($slot <= 0) $slot = 30;
    if ($slot < 5) $slot = 5;
    if ($slot > 120) $slot = 120;
    return $slot;
}

function consultas_get_slot_minutes($conn) {
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }

    $cached = 30;
    if (!consultas_table_exists($conn, 'configuracion_clinica')
        || !consultas_column_exists($conn, 'configuracion_clinica', 'duracion_slot_min')) {
        return $cached;
    }

    $stmt = $conn->prepare('SELECT duracion_slot_min FROM configuracion_clinica ORDER BY id DESC LIMIT 1');
    if (!$stmt) {
        return $cached;
    }

    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    $cached = consultas_normalize_slot_minutes($row['duracion_slot_min'] ?? 30);
    return $cached;
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

function consultas_ensure_edad_snapshot_columns($conn) {
    $alterations = [];
    if (!columna_existe_local($conn, 'consultas', 'edad_snapshot_valor')) {
        $alterations[] = "ADD COLUMN edad_snapshot_valor INT NULL";
    }
    if (!columna_existe_local($conn, 'consultas', 'edad_snapshot_unidad')) {
        $alterations[] = "ADD COLUMN edad_snapshot_unidad VARCHAR(16) NULL";
    }
    if (!columna_existe_local($conn, 'consultas', 'edad_snapshot_es_estimada')) {
        $alterations[] = "ADD COLUMN edad_snapshot_es_estimada TINYINT(1) NOT NULL DEFAULT 0";
    }
    if (!columna_existe_local($conn, 'consultas', 'edad_snapshot_fecha_calculo')) {
        $alterations[] = "ADD COLUMN edad_snapshot_fecha_calculo DATE NULL";
    }

    foreach ($alterations as $sqlPart) {
        @mysqli_query($conn, "ALTER TABLE consultas " . $sqlPart);
    }
}

function consultas_parse_date_safe($value) {
    $raw = trim((string)$value);
    if ($raw === '') return null;
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $raw)) {
        $dt = DateTime::createFromFormat('Y-m-d H:i:s', $raw . ' 00:00:00');
        return ($dt instanceof DateTime) ? $dt : null;
    }
    $ts = strtotime($raw);
    if ($ts === false) return null;
    $dt = new DateTime();
    $dt->setTimestamp($ts);
    return $dt;
}

function consultas_normalizar_unidad_edad($unidad) {
    $u = strtolower(trim((string)$unidad));
    if ($u === '') return 'anios';
    if (in_array($u, ['anio', 'anios', 'años', 'year', 'years'], true)) return 'anios';
    if (in_array($u, ['mes', 'meses', 'month', 'months'], true)) return 'meses';
    if (in_array($u, ['dia', 'dias', 'días', 'day', 'days'], true)) return 'dias';
    return 'anios';
}

function consultas_resolver_edad_snapshot($conn, $pacienteId, $fechaReferenciaYmd) {
    $pacienteId = (int)$pacienteId;
    $fechaReferenciaYmd = trim((string)$fechaReferenciaYmd);
    if ($pacienteId <= 0 || $fechaReferenciaYmd === '') {
        return ['valor' => null, 'unidad' => null, 'es_estimada' => 0, 'fecha_calculo' => null];
    }

    $stmtPac = $conn->prepare('SELECT fecha_nacimiento, edad, edad_unidad, creado_en FROM pacientes WHERE id = ? LIMIT 1');
    if (!$stmtPac) {
        return ['valor' => null, 'unidad' => null, 'es_estimada' => 0, 'fecha_calculo' => null];
    }
    $stmtPac->bind_param('i', $pacienteId);
    $stmtPac->execute();
    $rowPac = $stmtPac->get_result()->fetch_assoc();
    $stmtPac->close();
    if (!$rowPac) {
        return ['valor' => null, 'unidad' => null, 'es_estimada' => 0, 'fecha_calculo' => null];
    }

    $fechaRef = consultas_parse_date_safe($fechaReferenciaYmd);
    if (!($fechaRef instanceof DateTime)) {
        return ['valor' => null, 'unidad' => null, 'es_estimada' => 0, 'fecha_calculo' => null];
    }
    $fechaRef->setTime(0, 0, 0);

    $fechaNac = consultas_parse_date_safe($rowPac['fecha_nacimiento'] ?? null);
    if ($fechaNac instanceof DateTime) {
        $fechaNac->setTime(0, 0, 0);
        $diff = $fechaNac->diff($fechaRef);
        $dias = max(0, (int)$diff->days);
        $meses = max(0, ((int)$diff->y * 12) + (int)$diff->m);
        $anios = max(0, (int)$diff->y);

        if ($dias <= 28) {
            return ['valor' => $dias, 'unidad' => 'dias', 'es_estimada' => 0, 'fecha_calculo' => $fechaRef->format('Y-m-d')];
        }
        if ($meses < 12) {
            return ['valor' => $meses, 'unidad' => 'meses', 'es_estimada' => 0, 'fecha_calculo' => $fechaRef->format('Y-m-d')];
        }
        return ['valor' => $anios, 'unidad' => 'años', 'es_estimada' => 0, 'fecha_calculo' => $fechaRef->format('Y-m-d')];
    }

    $edadBaseRaw = $rowPac['edad'] ?? null;
    if ($edadBaseRaw === null || $edadBaseRaw === '') {
        return ['valor' => null, 'unidad' => null, 'es_estimada' => 0, 'fecha_calculo' => $fechaRef->format('Y-m-d')];
    }

    $edadBase = max(0, (int)$edadBaseRaw);
    $unidadBase = consultas_normalizar_unidad_edad($rowPac['edad_unidad'] ?? 'anios');
    $fechaBase = consultas_parse_date_safe($rowPac['creado_en'] ?? null);
    if (!($fechaBase instanceof DateTime)) {
        return [
            'valor' => $edadBase,
            'unidad' => $unidadBase === 'anios' ? 'años' : ($unidadBase === 'meses' ? 'meses' : 'dias'),
            'es_estimada' => 1,
            'fecha_calculo' => $fechaRef->format('Y-m-d'),
        ];
    }

    $fechaBase->setTime(0, 0, 0);
    $diffBase = $fechaBase->diff($fechaRef);
    $aniosTrans = max(0, (int)$diffBase->y);
    $mesesTrans = max(0, ((int)$diffBase->y * 12) + (int)$diffBase->m);
    $diasTrans = max(0, (int)$diffBase->days);

    if ($unidadBase === 'dias') {
        $totalDias = $edadBase + $diasTrans;
        if ($totalDias <= 28) {
            return ['valor' => $totalDias, 'unidad' => 'dias', 'es_estimada' => 1, 'fecha_calculo' => $fechaRef->format('Y-m-d')];
        }
        return ['valor' => (int)floor($totalDias / 30), 'unidad' => 'meses', 'es_estimada' => 1, 'fecha_calculo' => $fechaRef->format('Y-m-d')];
    }
    if ($unidadBase === 'meses') {
        $totalMeses = $edadBase + $mesesTrans;
        if ($totalMeses < 12) {
            return ['valor' => $totalMeses, 'unidad' => 'meses', 'es_estimada' => 1, 'fecha_calculo' => $fechaRef->format('Y-m-d')];
        }
        return ['valor' => (int)floor($totalMeses / 12), 'unidad' => 'años', 'es_estimada' => 1, 'fecha_calculo' => $fechaRef->format('Y-m-d')];
    }

    return ['valor' => $edadBase + $aniosTrans, 'unidad' => 'años', 'es_estimada' => 1, 'fecha_calculo' => $fechaRef->format('Y-m-d')];
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

/**
 * Valida cupos y conflictos del horario e inserta la consulta.
 *
 * @param array $p paciente_id, medico_id, fecha (Y-m-d), hora (HH:MM:SS), tipo_consulta, origen_creacion,
 *                 omitir_validacion_disponibilidad (bool) y, opcional, estado (estado inicial; sin él se usa el predeterminado de la tabla)
 * @param bool $manejarTransaccion true = abre, confirma y revierte aquí (comportamiento de api_consultas.php);
 *                 false = el llamador ya abrió la transacción y decide el commit/rollback (Seguimiento: consulta + cotización juntas)
 * @return array payload listo para responder: ['success'=>true,'id'=>..,'cupos_restantes'=>..?] o ['success'=>false,'error'=>..]
 */
function consultas_reservar_horario($conn, array $p, bool $manejarTransaccion = true): array {
    $paciente_id = $p['paciente_id'];
    $medico_id = $p['medico_id'];
    $fecha = $p['fecha'];
    $hora = $p['hora'];
    $tipo_consulta = $p['tipo_consulta'];
    $origen_creacion = $p['origen_creacion'];
    $omitir_validacion_disponibilidad = !empty($p['omitir_validacion_disponibilidad']);
    $estadoInicial = isset($p['estado']) && $p['estado'] !== '' ? (string)$p['estado'] : null;

    $fallar = static function (array $payload) use ($conn, $manejarTransaccion): array {
        if ($manejarTransaccion) {
            $conn->rollback();
        }
        return $payload;
    };

    if ($manejarTransaccion) {
        $conn->begin_transaction();
    }
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
            return $fallar([
                'success' => false,
                'error' => 'No hay disponibilidad registrada para este médico en el horario seleccionado',
            ]);
        }

        // 2. Calcular capacidad total del bloque (intervalos según slot configurado).
        $slotMinutes = consultas_get_slot_minutes($conn);
        [$hIni, $mIni] = array_map('intval', explode(':', $bloque['hora_inicio']));
        [$hFin, $mFin] = array_map('intval', explode(':', $bloque['hora_fin']));
        $totalSlots = 0;
        $h = $hIni; $m = $mIni;
        while ($h < $hFin || ($h === $hFin && $m < $mFin)) {
            $totalSlots++;
            $m += $slotMinutes;
            if ($m >= 60) {
                $h += (int)floor($m / 60);
                $m = $m % 60;
            }
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
        // Cada reevaluación con hora fija dentro del bloque consume un cupo.
        $agendadas += rev_cupos_ocupados_en_bloque($conn, (int)$medico_id, (string)$fecha, (string)$bloque['hora_inicio'], (string)$bloque['hora_fin']);

        if ($agendadas >= $totalSlots) {
            return $fallar([
                'success' => false,
                'error' => 'Cupos agotados para este horario. No hay cupos disponibles.',
                'cupos_disponibles' => 0,
            ]);
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
        return $fallar([
            'success' => false,
            'error' => 'El médico ya tiene una consulta pendiente en ese horario',
            'detalle' => "Consulta ID {$conflicto['id']} con estado '{$conflicto['estado']}'",
        ]);
    }

    $conflictoAgenda = consultas_buscar_conflicto_agenda_horario($conn, (int)$medico_id, (string)$fecha, (string)$hora);
    if ($conflictoAgenda) {
        $agendaId = (int)($conflictoAgenda['id'] ?? 0);
        $agendaEstado = (string)($conflictoAgenda['estado_evento'] ?? 'pendiente');
        return $fallar([
            'success' => false,
            'error' => 'El médico ya tiene un servicio programado en ese horario',
            'detalle' => "Agenda ID {$agendaId} con estado '{$agendaEstado}'",
        ]);
    }

    $conflictoReev = rev_conflicto_reevaluacion($conn, (int)$medico_id, (string)$fecha, (string)$hora);
    if ($conflictoReev) {
        return $fallar([
            'success' => false,
            'error' => rev_mensaje_conflicto($conflictoReev),
            'detalle' => 'Reevaluación #' . (int)$conflictoReev['id'],
        ]);
    }

    // 5. Insertar la consulta dentro de la transacción
    consultas_ensure_edad_snapshot_columns($conn);
    $hasOrigenCreacion = columna_existe_local($conn, 'consultas', 'origen_creacion');
    $hasEdadSnapshotValor = columna_existe_local($conn, 'consultas', 'edad_snapshot_valor');
    $hasEdadSnapshotUnidad = columna_existe_local($conn, 'consultas', 'edad_snapshot_unidad');
    $hasEdadSnapshotEstimada = columna_existe_local($conn, 'consultas', 'edad_snapshot_es_estimada');
    $hasEdadSnapshotFecha = columna_existe_local($conn, 'consultas', 'edad_snapshot_fecha_calculo');
    $edadSnapshot = consultas_resolver_edad_snapshot($conn, (int)$paciente_id, (string)$fecha);

    $insertCols = ['paciente_id', 'medico_id', 'fecha', 'hora', 'tipo_consulta'];
    $insertTypes = 'iisss';
    $insertParams = [(int)$paciente_id, (int)$medico_id, (string)$fecha, (string)$hora, (string)$tipo_consulta];

    if ($hasOrigenCreacion) {
        $insertCols[] = 'origen_creacion';
        $insertTypes .= 's';
        $insertParams[] = (string)$origen_creacion;
    }

    if ($estadoInicial !== null) {
        $insertCols[] = 'estado';
        $insertTypes .= 's';
        $insertParams[] = $estadoInicial;
    }

    if (
        $hasEdadSnapshotValor
        && $hasEdadSnapshotUnidad
        && $hasEdadSnapshotEstimada
        && $hasEdadSnapshotFecha
        && $edadSnapshot['valor'] !== null
    ) {
        $insertCols[] = 'edad_snapshot_valor';
        $insertCols[] = 'edad_snapshot_unidad';
        $insertCols[] = 'edad_snapshot_es_estimada';
        $insertCols[] = 'edad_snapshot_fecha_calculo';
        $insertTypes .= 'isis';
        $insertParams[] = (int)$edadSnapshot['valor'];
        $insertParams[] = (string)$edadSnapshot['unidad'];
        $insertParams[] = (int)$edadSnapshot['es_estimada'];
        $insertParams[] = (string)$edadSnapshot['fecha_calculo'];
    }

    $placeholders = implode(', ', array_fill(0, count($insertCols), '?'));
    $sqlInsertConsulta = 'INSERT INTO consultas (' . implode(', ', $insertCols) . ') VALUES (' . $placeholders . ')';
    $stmtIns = $conn->prepare($sqlInsertConsulta);
    if (!$stmtIns) {
        return $fallar(['success' => false, 'error' => 'No se pudo preparar el registro de consulta']);
    }
    $stmtIns->bind_param($insertTypes, ...$insertParams);
    $ok = $stmtIns->execute();
    $nuevaId = $ok ? $stmtIns->insert_id : null;
    $stmtIns->close();

    if (!$ok) {
        return $fallar(['success' => false, 'error' => 'No se pudo registrar la consulta']);
    }

    if ($manejarTransaccion) {
        $conn->commit();
    }
    $responseOk = [
        'success'          => true,
        'id'               => $nuevaId,
    ];
    if (!$omitir_validacion_disponibilidad && $totalSlots !== null && $agendadas !== null) {
        $responseOk['cupos_restantes'] = $totalSlots - $agendadas - 1;
    }
    return $responseOk;
}
