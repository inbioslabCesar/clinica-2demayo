<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/auth_check.php';
require_once __DIR__ . '/config.php';

function contratos_table_exists($conn, $table) {
    $stmt = $conn->prepare('SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1');
    if (!$stmt) return false;
    $stmt->bind_param('s', $table);
    $stmt->execute();
    $res = $stmt->get_result();
    $ok = $res && $res->num_rows > 0;
    $stmt->close();
    return $ok;
}

function contratos_column_exists($conn, $table, $column) {
    $stmt = $conn->prepare('SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1');
    if (!$stmt) return false;
    $stmt->bind_param('ss', $table, $column);
    $stmt->execute();
    $res = $stmt->get_result();
    $ok = $res && $res->num_rows > 0;
    $stmt->close();
    return $ok;
}

function contratos_require_schema($conn) {
    $requiredTables = [
        'contratos_plantillas',
        'contratos_plantillas_items',
        'contratos_paciente',
        'contratos_paciente_servicios',
        'agenda_contrato',
        'paciente_seguimiento_pagos'
    ];
    $missing = [];
    foreach ($requiredTables as $table) {
        if (!contratos_table_exists($conn, $table)) {
            $missing[] = $table;
        }
    }

    if (!empty($missing)) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Esquema de contratos incompleto',
            'missing_tables' => $missing,
            'hint' => 'Ejecuta sql/flujo-contrato/01_schema_contratos.sql y 02_alter_cotizaciones_detalle_contrato.sql'
        ]);
        exit;
    }
}

function contratos_responder($payload, $status = 200) {
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

function contratos_normalizar_estado_pago($montoProgramado, $montoPagado) {
    $prog = (float)$montoProgramado;
    $pag = (float)$montoPagado;
    if ($pag <= 0.00001) return 'pendiente';
    if ($pag + 0.00001 < $prog) return 'parcial';
    return 'pagado';
}

function contratos_normalizar_servicio_tipo($value) {
    $tipo = strtolower(trim((string)$value));
    if ($tipo === 'rayos x' || $tipo === 'rayos_x' || $tipo === 'rx') return 'rayosx';
    if ($tipo === 'operaciones') return 'operacion';
    if ($tipo === 'procedimientos') return 'procedimiento';
    return $tipo;
}

function contratos_servicio_es_consulta($servicioTipo) {
    return contratos_normalizar_servicio_tipo($servicioTipo) === 'consulta';
}

function contratos_resolver_consulta_ancla_previa($conn, array $evento) {
    $eventoId = (int)($evento['id'] ?? 0);
    $contratoPacienteId = (int)($evento['contrato_paciente_id'] ?? 0);
    $fechaProgramada = trim((string)($evento['fecha_programada'] ?? ''));
    if ($eventoId <= 0 || $contratoPacienteId <= 0 || $fechaProgramada === '') {
        return 0;
    }

    $stmt = $conn->prepare(
        'SELECT ac.consulta_id
         FROM agenda_contrato ac
         WHERE ac.contrato_paciente_id = ?
           AND ac.id <> ?
           AND ac.consulta_id IS NOT NULL
           AND ac.consulta_id > 0
           AND LOWER(TRIM(ac.servicio_tipo)) = "consulta"
           AND (ac.fecha_programada < ? OR (ac.fecha_programada = ? AND ac.id < ?))
         ORDER BY ac.fecha_programada DESC, ac.id DESC
         LIMIT 1'
    );
    if (!$stmt) {
        return 0;
    }
    $stmt->bind_param('iissi', $contratoPacienteId, $eventoId, $fechaProgramada, $fechaProgramada, $eventoId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    return (int)($row['consulta_id'] ?? 0);
}

function contratos_resolver_fecha_programada($fechaInicio, $orden = 1) {
    $base = strtotime((string)$fechaInicio ?: date('Y-m-d'));
    if (!$base) $base = time();
    $delta = max(0, ((int)$orden - 1) * 7);
    return date('Y-m-d 09:00:00', strtotime('+' . $delta . ' day', $base));
}

/**
 * Resuelve la fecha de un evento de agenda usando anchor clínico y offset.
 * - offset_tipo='relativo_anchor': anchor_fecha + offset_valor * offset_unidad
 * - offset_tipo='semana_gestacional': FUR + semanas (solo si anchor_tipo='fur')
 * - Fallback: comportamiento original (orden * 7 días desde fecha_inicio)
 */
function contratos_resolver_fecha_con_offset(
    $fechaInicio, $anchorFecha, $anchorTipo,
    $offsetTipo, $offsetValor, $offsetUnidad, $orden = 1
) {
    if ($offsetTipo === 'relativo_anchor') {
        $base = (!empty($anchorFecha) ? strtotime((string)$anchorFecha) : null)
              ?: strtotime((string)$fechaInicio ?: date('Y-m-d'));
        $valor = max(0, (int)$offsetValor);
        if ($offsetUnidad === 'dias') {
            $ts = strtotime("+{$valor} day", $base);
        } elseif ($offsetUnidad === 'meses') {
            $ts = strtotime("+{$valor} month", $base);
        } else { // semanas
            $delta = $valor * 7;
            $ts = strtotime("+{$delta} day", $base);
        }
        return date('Y-m-d 09:00:00', $ts ?: $base);
    }
    if ($offsetTipo === 'semana_gestacional' && $anchorTipo === 'fur' && !empty($anchorFecha)) {
        $fur = strtotime((string)$anchorFecha);
        if ($fur) {
            $semanas = max(0, (int)$offsetValor);
            return date('Y-m-d 09:00:00', strtotime("+{$semanas} week", $fur));
        }
    }
    return contratos_resolver_fecha_programada($fechaInicio, $orden);
}

function contratos_resolver_tipo_orden_imagen($servicioTipo, $descripcion = '') {
    $tipo = strtolower(trim((string)$servicioTipo));
    $desc = strtolower(trim((string)$descripcion));
    if ($tipo === 'rayosx' || $tipo === 'rayos_x' || $tipo === 'rayos x' || $tipo === 'rx') return 'rx';
    if ($tipo === 'ecografia') return 'ecografia';
    if ($tipo === 'tomografia') return 'tomografia';
    if ($tipo === 'procedimiento' || $tipo === 'procedimientos') {
        if (preg_match('/tomograf|\btac\b/u', $desc)) return 'tomografia';
        if (preg_match('/rayos\s*x|\brx\b/u', $desc)) return 'rx';
        if (preg_match('/ecograf/i', $desc)) return 'ecografia';
    }
    return null;
}

function contratos_resolver_medico_por_servicio($conn, $servicioTipo, $servicioId) {
    $servicioTipo = contratos_normalizar_servicio_tipo($servicioTipo);
    $servicioId = (int)$servicioId;
    if ($servicioId <= 0 || !contratos_table_exists($conn, 'tarifas') || !contratos_column_exists($conn, 'tarifas', 'medico_id')) {
        return 0;
    }
    if (!in_array($servicioTipo, ['consulta', 'ecografia', 'rayosx', 'procedimiento', 'operacion'], true)) {
        return 0;
    }
    $stmt = $conn->prepare('SELECT medico_id FROM tarifas WHERE id = ? AND LOWER(servicio_tipo) = ? LIMIT 1');
    if (!$stmt) return 0;
    $stmt->bind_param('is', $servicioId, $servicioTipo);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return (int)($row['medico_id'] ?? 0);
}

function contratos_resolver_medico_evento($conn, $eventoId, $servicioTipo, $servicioId) {
    if (contratos_table_exists($conn, 'agenda_contrato_medicos')) {
        $stmt = $conn->prepare('SELECT medico_id FROM agenda_contrato_medicos WHERE agenda_contrato_id = ? AND activo = 1 ORDER BY prioridad ASC, id ASC LIMIT 1');
        if ($stmt) {
            $stmt->bind_param('i', $eventoId);
            $stmt->execute();
            $row = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            $m = (int)($row['medico_id'] ?? 0);
            if ($m > 0) return $m;
        }
    }
    return contratos_resolver_medico_por_servicio($conn, $servicioTipo, $servicioId);
}

function contratos_resolver_medico_respaldo($conn, $pacienteId = 0) {
    $pacienteId = (int)$pacienteId;

    // 1) Preferir el último médico usado por el paciente.
    if ($pacienteId > 0 && contratos_table_exists($conn, 'consultas')) {
        $stmt = $conn->prepare('SELECT medico_id FROM consultas WHERE paciente_id = ? AND medico_id IS NOT NULL AND medico_id > 0 ORDER BY fecha DESC, id DESC LIMIT 1');
        if ($stmt) {
            $stmt->bind_param('i', $pacienteId);
            $stmt->execute();
            $row = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            $m = (int)($row['medico_id'] ?? 0);
            if ($m > 0) return $m;
        }
    }

    // 2) Fallback general: primer médico activo/disponible.
    if (contratos_table_exists($conn, 'medicos')) {
        $where = [];
        if (contratos_column_exists($conn, 'medicos', 'activo')) {
            $where[] = 'activo = 1';
        }
        if (contratos_column_exists($conn, 'medicos', 'estado')) {
            $where[] = "LOWER(TRIM(COALESCE(estado, ''))) IN ('activo','habilitado')";
        }
        $sql = 'SELECT id FROM medicos';
        if (!empty($where)) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }
        $sql .= ' ORDER BY id ASC LIMIT 1';

        $res = $conn->query($sql);
        if ($res) {
            $row = $res->fetch_assoc();
            $res->free();
            $m = (int)($row['id'] ?? 0);
            if ($m > 0) return $m;
        }
    }

    return 0;
}

function contratos_evento_es_primero($conn, $contratoPacienteId, $eventoId) {
    $contratoPacienteId = (int)$contratoPacienteId;
    $eventoId = (int)$eventoId;
    if ($contratoPacienteId <= 0 || $eventoId <= 0) return true;

    $stmt = $conn->prepare('SELECT id FROM agenda_contrato WHERE contrato_paciente_id = ? ORDER BY fecha_programada ASC, id ASC LIMIT 1');
    if (!$stmt) return true;
    $stmt->bind_param('i', $contratoPacienteId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    $firstId = (int)($row['id'] ?? 0);
    if ($firstId <= 0) return true;
    return $firstId === $eventoId;
}

function contratos_resolver_hc_origen_evento($conn, $contratoPacienteId, $eventoId, $fechaProgramada) {
    $contratoPacienteId = (int)$contratoPacienteId;
    $eventoId = (int)$eventoId;
    $fechaProgramada = trim((string)$fechaProgramada);
    if ($contratoPacienteId <= 0 || $eventoId <= 0 || $fechaProgramada === '') return 0;

    // Normalización canónica: hc_origen_id SIEMPRE almacena consultas.id del evento previo.
    // Esto garantiza que frontend (hc_origen_id === consulta_id) y backend (WHERE consulta_id = ?)
    // operen con el mismo identificador en toda la cadena A→B→C→D.
    $stmt = $conn->prepare(
        'SELECT ag.consulta_id
         FROM agenda_contrato ag
         INNER JOIN historia_clinica h ON h.consulta_id = ag.consulta_id
         WHERE ag.contrato_paciente_id = ?
           AND ag.id <> ?
           AND ag.consulta_id IS NOT NULL
           AND ag.consulta_id > 0
           AND (ag.fecha_programada < ? OR (ag.fecha_programada = ? AND ag.id < ?))
           AND (h.chain_status IS NULL OR h.chain_status <> ?)
         ORDER BY ag.fecha_programada DESC, ag.id DESC
         LIMIT 1'
    );
    if (!$stmt) return 0;
    $anulada = 'anulada';
    $stmt->bind_param('iissis', $contratoPacienteId, $eventoId, $fechaProgramada, $fechaProgramada, $eventoId, $anulada);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    $consultaIdPrevio = (int)($row['consulta_id'] ?? 0);
    if ($consultaIdPrevio > 0) {
        return $consultaIdPrevio;
    }

    // Fallback: evento previo existe en contrato pero aún no tiene HC guardada.
    // Devuelve el consulta_id del evento anterior para que cuando se cree la HC
    // el enlace quede listo en cuanto la HC previa se registre.
    $stmtFallback = $conn->prepare(
        'SELECT ag.consulta_id
         FROM agenda_contrato ag
         WHERE ag.contrato_paciente_id = ?
           AND ag.id <> ?
           AND ag.consulta_id IS NOT NULL
           AND ag.consulta_id > 0
           AND (ag.fecha_programada < ? OR (ag.fecha_programada = ? AND ag.id < ?))
         ORDER BY ag.fecha_programada DESC, ag.id DESC
         LIMIT 1'
    );
    if (!$stmtFallback) return 0;
    $stmtFallback->bind_param('iissi', $contratoPacienteId, $eventoId, $fechaProgramada, $fechaProgramada, $eventoId);
    $stmtFallback->execute();
    $rowFallback = $stmtFallback->get_result()->fetch_assoc();
    $stmtFallback->close();

    return (int)($rowFallback['consulta_id'] ?? 0);
}

function contratos_obtener_precio_servicio($conn, $servicioTipo, $servicioId) {
    $servicioTipo = contratos_normalizar_servicio_tipo($servicioTipo);
    $servicioId = (int)$servicioId;
    if ($servicioId <= 0) return 0.0;

    if (in_array($servicioTipo, ['consulta', 'ecografia', 'rayosx', 'procedimiento', 'operacion'], true) && contratos_table_exists($conn, 'tarifas')) {
        $stmt = $conn->prepare('SELECT precio_particular FROM tarifas WHERE id = ? AND LOWER(servicio_tipo) = ? LIMIT 1');
        if ($stmt) {
            $stmt->bind_param('is', $servicioId, $servicioTipo);
            $stmt->execute();
            $row = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            return (float)($row['precio_particular'] ?? 0);
        }
    }

    if ($servicioTipo === 'laboratorio' && contratos_table_exists($conn, 'examenes_laboratorio')) {
        $stmt = $conn->prepare('SELECT COALESCE(precio_publico, precio_convenio, 0) AS precio FROM examenes_laboratorio WHERE id = ? LIMIT 1');
        if ($stmt) {
            $stmt->bind_param('i', $servicioId);
            $stmt->execute();
            $row = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            return (float)($row['precio'] ?? 0);
        }
    }

    if ($servicioTipo === 'farmacia' && contratos_table_exists($conn, 'medicamentos')) {
        $stmt = $conn->prepare('SELECT precio_compra, margen_ganancia FROM medicamentos WHERE id = ? LIMIT 1');
        if ($stmt) {
            $stmt->bind_param('i', $servicioId);
            $stmt->execute();
            $row = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            $compra = (float)($row['precio_compra'] ?? 0);
            $margen = (float)($row['margen_ganancia'] ?? 0);
            return round($compra * (1 + ($margen / 100)), 2);
        }
    }

    return 0.0;
}

function contratos_cargar_subservicios_evento($conn, $eventoId, $plantillaItemId) {
    $eventoId = (int)$eventoId;
    $plantillaItemId = (int)$plantillaItemId;
    $rows = [];

    if ($eventoId > 0 && contratos_table_exists($conn, 'agenda_contrato_subservicios_snapshot')) {
        $stmt = $conn->prepare('SELECT servicio_tipo, servicio_id, descripcion_snapshot, cantidad, orden_inyeccion, origen_cobro_default, requiere_orden, laboratorio_referencia, tipo_derivacion, valor_derivacion FROM agenda_contrato_subservicios_snapshot WHERE agenda_evento_id = ? ORDER BY orden_inyeccion ASC, id ASC');
        if ($stmt) {
            $stmt->bind_param('i', $eventoId);
            $stmt->execute();
            $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
            $stmt->close();
        }
    }

    if (!empty($rows)) return $rows;

    if ($plantillaItemId > 0 && contratos_table_exists($conn, 'contratos_plantillas_evento_subservicios')) {
        $stmt = $conn->prepare("SELECT servicio_tipo, servicio_id, descripcion_snapshot, cantidad, orden_inyeccion, origen_cobro_default, requiere_orden, laboratorio_referencia, tipo_derivacion, valor_derivacion FROM contratos_plantillas_evento_subservicios WHERE plantilla_item_id = ? AND estado = 'activo' ORDER BY orden_inyeccion ASC, id ASC");
        if ($stmt) {
            $stmt->bind_param('i', $plantillaItemId);
            $stmt->execute();
            $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
            $stmt->close();
        }
    }

    return is_array($rows) ? $rows : [];
}

function contratos_buscar_preconsumo_servicio($conn, $contratoPacienteId, $pacienteId, $servicioTipo, $servicioId, $fechaRef) {
    $contratoPacienteId = (int)$contratoPacienteId;
    $pacienteId = (int)$pacienteId;
    $servicioId = (int)$servicioId;
    $servicioTipo = contratos_normalizar_servicio_tipo($servicioTipo);
    if ($contratoPacienteId <= 0 || $pacienteId <= 0 || $servicioId <= 0 || $servicioTipo === '') return null;

    if (!contratos_table_exists($conn, 'contratos_consumos') || !contratos_table_exists($conn, 'cotizaciones_detalle')) {
        return null;
    }

    $hasFechaConsumo = contratos_column_exists($conn, 'contratos_consumos', 'fecha_consumo');
    $fecha = date('Y-m-d', strtotime((string)$fechaRef ?: date('Y-m-d')));

    $sql = "SELECT cc.id,
                   cc.contrato_paciente_servicio_id,
                   cc.cotizacion_id,
                   cc.cotizacion_detalle_id,
                   cc.consulta_id,
                   cc.modo_cobertura
            FROM contratos_consumos cc
            INNER JOIN cotizaciones_detalle cd ON cd.id = cc.cotizacion_detalle_id
            WHERE cc.contrato_paciente_id = ?
              AND cc.paciente_id = ?
              AND LOWER(TRIM(cd.servicio_tipo)) = ?
              AND cd.servicio_id = ?
              AND LOWER(TRIM(COALESCE(cc.modo_cobertura, 'regular'))) = 'contrato'";
    if ($hasFechaConsumo) {
        $sql .= " AND DATE(cc.fecha_consumo) = ?";
    }
    $sql .= " ORDER BY cc.id DESC LIMIT 1";

    $stmt = $conn->prepare($sql);
    if (!$stmt) return null;
    if ($hasFechaConsumo) {
        $stmt->bind_param('iisis', $contratoPacienteId, $pacienteId, $servicioTipo, $servicioId, $fecha);
    } else {
        $stmt->bind_param('iisi', $contratoPacienteId, $pacienteId, $servicioTipo, $servicioId);
    }
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    return $row ?: null;
}

function contratos_autocerrar_eventos_preconsumidos($conn, $contratoPacienteId, $usuarioId = 0) {
    $contratoPacienteId = (int)$contratoPacienteId;
    $usuarioId = (int)$usuarioId;
    if ($contratoPacienteId <= 0) return 0;

    if (!contratos_table_exists($conn, 'agenda_contrato') || !contratos_table_exists($conn, 'contratos_paciente')) {
        return 0;
    }

    $hasConsulta = contratos_column_exists($conn, 'agenda_contrato', 'consulta_id');
    $hasCotEjec = contratos_column_exists($conn, 'agenda_contrato', 'cotizacion_id_ejecucion');
    $hasEjecEstado = contratos_column_exists($conn, 'agenda_contrato', 'ejecucion_estado');
    $hasToken = contratos_column_exists($conn, 'agenda_contrato', 'ejecucion_token');
    $hasEjecutadoEn = contratos_column_exists($conn, 'agenda_contrato', 'ejecutado_en');
    $hasEjecutadoPor = contratos_column_exists($conn, 'agenda_contrato', 'ejecutado_por');

    $stmt = $conn->prepare("SELECT ac.id, ac.contrato_paciente_id, ac.servicio_tipo, ac.servicio_id, ac.fecha_programada, cp.paciente_id,
                                   " . ($hasConsulta ? "ac.consulta_id" : "0 AS consulta_id") . ",
                                   " . ($hasCotEjec ? "ac.cotizacion_id_ejecucion" : "0 AS cotizacion_id_ejecucion") . "
                            FROM agenda_contrato ac
                            INNER JOIN contratos_paciente cp ON cp.id = ac.contrato_paciente_id
                            WHERE ac.contrato_paciente_id = ?
                              AND LOWER(TRIM(ac.estado_evento)) IN ('pendiente', 'confirmado')
                            ORDER BY ac.fecha_programada ASC, ac.id ASC");
    if (!$stmt) return 0;
    $stmt->bind_param('i', $contratoPacienteId);
    $stmt->execute();
    $eventos = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();

    $actualizados = 0;
    foreach ($eventos as $ev) {
        $eventoId = (int)($ev['id'] ?? 0);
        $pacienteId = (int)($ev['paciente_id'] ?? 0);
        $servicioTipo = (string)($ev['servicio_tipo'] ?? '');
        $servicioId = (int)($ev['servicio_id'] ?? 0);
        $fechaRef = !empty($ev['fecha_programada']) ? date('Y-m-d', strtotime((string)$ev['fecha_programada'])) : date('Y-m-d');
        if ($eventoId <= 0 || $pacienteId <= 0 || $servicioId <= 0 || trim($servicioTipo) === '') continue;

        $pre = contratos_buscar_preconsumo_servicio($conn, $contratoPacienteId, $pacienteId, $servicioTipo, $servicioId, $fechaRef);
        if (!is_array($pre) || empty($pre)) continue;

        $consultaId = (int)($ev['consulta_id'] ?? 0);
        if ($consultaId <= 0) {
            $consultaId = (int)($pre['consulta_id'] ?? 0);
        }

        $cotizacionId = (int)($ev['cotizacion_id_ejecucion'] ?? 0);
        if ($cotizacionId <= 0) {
            $cotizacionId = (int)($pre['cotizacion_id'] ?? 0);
        }

        // Integridad de cadena: no autocerrar como atendido si no hay consulta vinculada.
        // Cuando detectamos preconsumo, resolvemos (o creamos) la consulta del evento.
        if ($hasConsulta && $consultaId <= 0) {
            $asegurar = contratos_asegurar_consulta_evento($conn, [
                'id' => $eventoId,
                'contrato_paciente_id' => (int)($ev['contrato_paciente_id'] ?? $contratoPacienteId),
                'paciente_id' => $pacienteId,
                'servicio_tipo' => $servicioTipo,
                'servicio_id' => $servicioId,
                'fecha_programada' => (string)($ev['fecha_programada'] ?? ''),
                'consulta_id' => 0,
            ], $usuarioId, true);
            if (!($asegurar['success'] ?? false)) {
                continue;
            }
            $consultaId = (int)($asegurar['consulta_id'] ?? 0);
            if ($consultaId <= 0) {
                continue;
            }
        }

        $sets = ['estado_evento = ?'];
        $types = 's';
        $params = ['atendido'];

        if ($hasEjecEstado) {
            $sets[] = 'ejecucion_estado = ?';
            $types .= 's';
            $params[] = 'ejecutado';
        }
        if ($hasToken) {
            $sets[] = 'ejecucion_token = ?';
            $types .= 's';
            $params[] = hash('sha256', 'agenda:' . $eventoId . ':autocierre_preconsumo');
        }
        if ($hasEjecutadoEn) {
            $sets[] = 'ejecutado_en = NOW()';
        }
        if ($hasEjecutadoPor) {
            $sets[] = 'ejecutado_por = ?';
            $types .= 'i';
            $params[] = $usuarioId;
        }
        if ($hasConsulta && $consultaId > 0) {
            $sets[] = 'consulta_id = ?';
            $types .= 'i';
            $params[] = $consultaId;
        }
        if ($hasCotEjec && $cotizacionId > 0) {
            $sets[] = 'cotizacion_id_ejecucion = ?';
            $types .= 'i';
            $params[] = $cotizacionId;
        }

        $sets[] = 'updated_by = ?';
        $types .= 'i';
        $params[] = $usuarioId;

        $params[] = $eventoId;
        $types .= 'i';

        $sqlUp = 'UPDATE agenda_contrato SET ' . implode(', ', $sets) . " WHERE id = ? AND LOWER(TRIM(estado_evento)) IN ('pendiente', 'confirmado')";
        $stmtUp = $conn->prepare($sqlUp);
        if (!$stmtUp) continue;
        $stmtUp->bind_param($types, ...$params);
        $stmtUp->execute();
        if ($stmtUp->affected_rows > 0) {
            $actualizados++;
        }
        $stmtUp->close();
    }

    return $actualizados;
}

function contratos_asegurar_consulta_evento($conn, array $evento, $usuarioId = 0, $forzarControl = false) {
    $consultaIdActual = (int)($evento['consulta_id'] ?? 0);
    $forzarControl = (bool)$forzarControl;
    if ($consultaIdActual > 0) {
        if ($forzarControl && contratos_column_exists($conn, 'consultas', 'es_control')) {
            $stmtCtrl = $conn->prepare('UPDATE consultas SET es_control = 1, estado = CASE WHEN estado = "falta_cancelar" THEN "pendiente" ELSE estado END WHERE id = ? LIMIT 1');
            if ($stmtCtrl) {
                $stmtCtrl->bind_param('i', $consultaIdActual);
                $stmtCtrl->execute();
                $stmtCtrl->close();
            }
        }
        return ['success' => true, 'consulta_id' => $consultaIdActual, 'ya_existia' => true];
    }

    $eventoId = (int)($evento['id'] ?? 0);
    $contratoPacienteId = (int)($evento['contrato_paciente_id'] ?? 0);
    $pacienteId = (int)($evento['paciente_id'] ?? 0);
    $servicioTipo = (string)($evento['servicio_tipo'] ?? '');
    $servicioId = (int)($evento['servicio_id'] ?? 0);
    $fechaBase = !empty($evento['fecha_programada']) ? date('Y-m-d', strtotime((string)$evento['fecha_programada'])) : date('Y-m-d');
    $hora = !empty($evento['fecha_programada']) ? date('H:i:s', strtotime((string)$evento['fecha_programada'])) : date('H:i:s');
    $medicoId = contratos_resolver_medico_evento($conn, $eventoId, $servicioTipo, $servicioId);
    if ($medicoId <= 0) {
        $medicoId = contratos_resolver_medico_respaldo($conn, $pacienteId);
    }
    if ($pacienteId <= 0 || $medicoId <= 0) {
        return ['success' => false, 'error' => 'No se pudo resolver medico/paciente para crear consulta'];
    }

    $esPrimerEvento = contratos_evento_es_primero($conn, $contratoPacienteId, $eventoId);
    $hcOrigenId = 0;
    if (!$esPrimerEvento) {
        $hcOrigenId = contratos_resolver_hc_origen_evento($conn, $contratoPacienteId, $eventoId, (string)($evento['fecha_programada'] ?? $fechaBase));
    }

    // Reutilizar solo una consulta estrictamente equivalente para evitar mezclar eventos
    // distintos del mismo día (causa arrastre y duplicidad de contexto clínico).
    $stmtExist = $conn->prepare(
        'SELECT id
         FROM consultas
         WHERE paciente_id = ?
           AND medico_id = ?
           AND fecha = ?
           AND hora = ?
           AND LOWER(TRIM(COALESCE(origen_creacion, ""))) IN ("contrato_agenda", "hc_proxima")
         ORDER BY id DESC
         LIMIT 1'
    );
    if ($stmtExist) {
        $stmtExist->bind_param('iiss', $pacienteId, $medicoId, $fechaBase, $hora);
        $stmtExist->execute();
        $existRow = $stmtExist->get_result()->fetch_assoc();
        $stmtExist->close();
        if ($existRow) {
            $consultaId = (int)$existRow['id'];
            if ($forzarControl && contratos_column_exists($conn, 'consultas', 'es_control')) {
                $stmtCtrl = $conn->prepare('UPDATE consultas SET es_control = 1, estado = CASE WHEN estado = "falta_cancelar" THEN "pendiente" ELSE estado END WHERE id = ? LIMIT 1');
                if ($stmtCtrl) {
                    $stmtCtrl->bind_param('i', $consultaId);
                    $stmtCtrl->execute();
                    $stmtCtrl->close();
                }
            }
            if ($eventoId > 0 && contratos_column_exists($conn, 'agenda_contrato', 'consulta_id')) {
                $stmtUpExist = $conn->prepare('UPDATE agenda_contrato SET consulta_id = ?, updated_by = ? WHERE id = ?');
                if ($stmtUpExist) {
                    $stmtUpExist->bind_param('iii', $consultaId, $usuarioId, $eventoId);
                    $stmtUpExist->execute();
                    $stmtUpExist->close();
                }
            }
            return ['success' => true, 'consulta_id' => $consultaId, 'ya_existia' => true];
        }
    }

    $tipoConsulta = 'programada';
    $hasOrigenCreacion = contratos_column_exists($conn, 'consultas', 'origen_creacion');
    $hasHcOrigenId = contratos_column_exists($conn, 'consultas', 'hc_origen_id');
    $hasEsControl = contratos_column_exists($conn, 'consultas', 'es_control');
    $hasEstado = contratos_column_exists($conn, 'consultas', 'estado');
    $origen = (!$esPrimerEvento && $hcOrigenId > 0) ? 'hc_proxima' : 'contrato_agenda';
    $cols = ['paciente_id', 'medico_id', 'fecha', 'hora', 'tipo_consulta'];
    $vals = ['?', '?', '?', '?', '?'];
    $types = 'iisss';
    $params = [$pacienteId, $medicoId, $fechaBase, $hora, $tipoConsulta];

    if ($hasEstado) {
        $cols[] = 'estado';
        $vals[] = '?';
        $types .= 's';
        $params[] = $forzarControl ? 'pendiente' : 'pendiente';
    }
    if ($hasHcOrigenId) {
        $cols[] = 'hc_origen_id';
        $vals[] = '?';
        $types .= 'i';
        $params[] = $hcOrigenId;
    }
    if ($hasOrigenCreacion) {
        $cols[] = 'origen_creacion';
        $vals[] = '?';
        $types .= 's';
        $params[] = $origen;
    }
    if ($hasEsControl) {
        $cols[] = 'es_control';
        $vals[] = '?';
        $types .= 'i';
        $params[] = $forzarControl ? 1 : 0;
    }

    $sqlIns = 'INSERT INTO consultas (' . implode(', ', $cols) . ') VALUES (' . implode(', ', $vals) . ')';
    $stmtIns = $conn->prepare($sqlIns);
    if (!$stmtIns) return ['success' => false, 'error' => 'No se pudo preparar insercion de consulta'];
    $stmtIns->bind_param($types, ...$params);
    $ok = $stmtIns->execute();
    $consultaId = $ok ? (int)$stmtIns->insert_id : 0;
    $stmtIns->close();

    if (!$ok || $consultaId <= 0) {
        return ['success' => false, 'error' => 'No se pudo crear consulta'];
    }

    if ($eventoId > 0 && contratos_column_exists($conn, 'agenda_contrato', 'consulta_id')) {
        $stmtUp = $conn->prepare('UPDATE agenda_contrato SET consulta_id = ?, updated_by = ? WHERE id = ?');
        if ($stmtUp) {
            $stmtUp->bind_param('iii', $consultaId, $usuarioId, $eventoId);
            $stmtUp->execute();
            $stmtUp->close();
        }
    }

    return ['success' => true, 'consulta_id' => $consultaId, 'ya_existia' => false];
}

function contratos_crear_cotizacion_ejecucion($conn, $pacienteId, $usuarioId, $eventoId, array $detalles) {
    if (!contratos_table_exists($conn, 'cotizaciones') || !contratos_table_exists($conn, 'cotizaciones_detalle')) {
        return ['success' => false, 'error' => 'Tablas de cotizacion no disponibles'];
    }

    $total = 0.0;
    $soloContrato = !empty($detalles);
    foreach ($detalles as $d) {
        $total += (float)($d['subtotal'] ?? 0);
        $origenItem = strtolower(trim((string)($d['origen_cobro'] ?? 'regular')));
        if ($origenItem !== 'contrato') {
            $soloContrato = false;
        }
    }
    $total = round($total, 2);

    $hasSaldoV2 = contratos_column_exists($conn, 'cotizaciones', 'total_pagado') && contratos_column_exists($conn, 'cotizaciones', 'saldo_pendiente');
    $hasFechaVenc = contratos_column_exists($conn, 'cotizaciones', 'fecha_vencimiento');
    $esControlContrato = $total <= 0.00001 && $soloContrato;
    $estado = $esControlContrato ? 'CONTROL' : ($total <= 0.00001 ? 'pagado' : 'pendiente');
    $obs = $esControlContrato
        ? ('Cotización automática CONTROL (sin costo) - Evento de contrato #' . (int)$eventoId)
        : ('Ejecucion agenda contrato evento #' . (int)$eventoId);
    $fechaVenc = $hasFechaVenc && $estado === 'pendiente' ? date('Y-m-d H:i:s', strtotime('+24 hours')) : null;

    if ($hasSaldoV2) {
        $totalPagado = $estado === 'pagado' ? $total : 0.0;
        $saldo = max(0.0, $total - $totalPagado);
        if ($hasFechaVenc) {
            $stmt = $conn->prepare('INSERT INTO cotizaciones (paciente_id, usuario_id, total, total_pagado, saldo_pendiente, estado, observaciones, fecha_vencimiento) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
            if (!$stmt) return ['success' => false, 'error' => 'No se pudo preparar cotizacion'];
            $stmt->bind_param('iidddsss', $pacienteId, $usuarioId, $total, $totalPagado, $saldo, $estado, $obs, $fechaVenc);
        } else {
            $stmt = $conn->prepare('INSERT INTO cotizaciones (paciente_id, usuario_id, total, total_pagado, saldo_pendiente, estado, observaciones) VALUES (?, ?, ?, ?, ?, ?, ?)');
            if (!$stmt) return ['success' => false, 'error' => 'No se pudo preparar cotizacion'];
            $stmt->bind_param('iidddss', $pacienteId, $usuarioId, $total, $totalPagado, $saldo, $estado, $obs);
        }
    } else {
        if ($hasFechaVenc) {
            $stmt = $conn->prepare('INSERT INTO cotizaciones (paciente_id, usuario_id, total, estado, observaciones, fecha_vencimiento) VALUES (?, ?, ?, ?, ?, ?)');
            if (!$stmt) return ['success' => false, 'error' => 'No se pudo preparar cotizacion'];
            $stmt->bind_param('iidsss', $pacienteId, $usuarioId, $total, $estado, $obs, $fechaVenc);
        } else {
            $stmt = $conn->prepare('INSERT INTO cotizaciones (paciente_id, usuario_id, total, estado, observaciones) VALUES (?, ?, ?, ?, ?)');
            if (!$stmt) return ['success' => false, 'error' => 'No se pudo preparar cotizacion'];
            $stmt->bind_param('iidss', $pacienteId, $usuarioId, $total, $estado, $obs);
        }
    }

    $ok = $stmt->execute();
    $cotizacionId = $ok ? (int)$stmt->insert_id : 0;
    $stmt->close();
    if (!$ok || $cotizacionId <= 0) {
        return ['success' => false, 'error' => 'No se pudo crear cotizacion de ejecucion'];
    }

    if (contratos_column_exists($conn, 'cotizaciones', 'numero_comprobante')) {
        $numero = sprintf('Q%06d', $cotizacionId);
        $stmtNum = $conn->prepare('UPDATE cotizaciones SET numero_comprobante = ? WHERE id = ?');
        if ($stmtNum) {
            $stmtNum->bind_param('si', $numero, $cotizacionId);
            $stmtNum->execute();
            $stmtNum->close();
        }
    }

    $hasConsultaId = contratos_column_exists($conn, 'cotizaciones_detalle', 'consulta_id');
    $hasMedicoId = contratos_column_exists($conn, 'cotizaciones_detalle', 'medico_id');
    $hasContratoPacienteId = contratos_column_exists($conn, 'cotizaciones_detalle', 'contrato_paciente_id');
    $hasContratoPacienteServicioId = contratos_column_exists($conn, 'cotizaciones_detalle', 'contrato_paciente_servicio_id');
    $hasOrigenCobro = contratos_column_exists($conn, 'cotizaciones_detalle', 'origen_cobro');
    $hasMontoListaReferencial = contratos_column_exists($conn, 'cotizaciones_detalle', 'monto_lista_referencial');

    foreach ($detalles as $det) {
        $cols = ['cotizacion_id', 'servicio_tipo', 'servicio_id', 'descripcion', 'cantidad', 'precio_unitario', 'subtotal'];
        $vals = ['?', '?', '?', '?', '?', '?', '?'];
        $types = 'isisddd';
        $params = [
            $cotizacionId,
            (string)($det['servicio_tipo'] ?? ''),
            (int)($det['servicio_id'] ?? 0),
            (string)($det['descripcion'] ?? 'Servicio contrato'),
            (float)($det['cantidad'] ?? 1),
            (float)($det['precio_unitario'] ?? 0),
            (float)($det['subtotal'] ?? 0),
        ];

        if ($hasConsultaId) {
            $cols[] = 'consulta_id';
            $vals[] = '?';
            $types .= 'i';
            $params[] = (int)($det['consulta_id'] ?? 0);
        }
        if ($hasMedicoId) {
            $cols[] = 'medico_id';
            $vals[] = '?';
            $types .= 'i';
            $params[] = (int)($det['medico_id'] ?? 0);
        }
        if ($hasContratoPacienteId) {
            $cols[] = 'contrato_paciente_id';
            $vals[] = '?';
            $types .= 'i';
            $params[] = (int)($det['contrato_paciente_id'] ?? 0);
        }
        if ($hasContratoPacienteServicioId) {
            $cols[] = 'contrato_paciente_servicio_id';
            $vals[] = '?';
            $types .= 'i';
            $params[] = (int)($det['contrato_paciente_servicio_id'] ?? 0);
        }
        if ($hasOrigenCobro) {
            $cols[] = 'origen_cobro';
            $vals[] = '?';
            $types .= 's';
            $params[] = (string)($det['origen_cobro'] ?? 'normal');
        }
        if ($hasMontoListaReferencial) {
            $cols[] = 'monto_lista_referencial';
            $vals[] = '?';
            $types .= 'd';
            $params[] = (float)($det['monto_lista_referencial'] ?? ($det['subtotal'] ?? 0));
        }

        $sql = 'INSERT INTO cotizaciones_detalle (' . implode(', ', $cols) . ') VALUES (' . implode(', ', $vals) . ')';
        $stmtDet = $conn->prepare($sql);
        if (!$stmtDet) {
            return ['success' => false, 'error' => 'No se pudo preparar detalle de cotizacion'];
        }
        $stmtDet->bind_param($types, ...$params);
        if (!$stmtDet->execute()) {
            $stmtDet->close();
            return ['success' => false, 'error' => 'No se pudo guardar detalle de cotizacion'];
        }
        $stmtDet->close();
    }

    return ['success' => true, 'cotizacion_id' => $cotizacionId, 'total' => $total, 'estado' => $estado];
}

function contratos_crear_ordenes_laboratorio_ejecucion($conn, $cotizacionId, $pacienteId, array $detalles, $consultaId = 0) {
    if (!contratos_table_exists($conn, 'ordenes_laboratorio')) return [];
    $examIds = [];
    foreach ($detalles as $det) {
        if (strtolower(trim((string)($det['servicio_tipo'] ?? ''))) !== 'laboratorio') continue;
        $sId = (int)($det['servicio_id'] ?? 0);
        if ($sId > 0) $examIds[] = $sId;
    }
    $examIds = array_values(array_unique($examIds));
    if (empty($examIds)) return [];

    $json = json_encode($examIds);
    $hasCotizacionId = contratos_column_exists($conn, 'ordenes_laboratorio', 'cotizacion_id');
    $hasConsultaId = contratos_column_exists($conn, 'ordenes_laboratorio', 'consulta_id');
    $ordenId = 0;

    // Aislamiento por evento: cada evento de contrato recibe su propio INSERT limpio.
    // NO se reutilizan ni se actualizan órdenes de eventos anteriores aunque compartan
    // cotizacion_id o fecha. Esto previene que la consulta B herede los análisis de A.

    if ($hasCotizacionId && $hasConsultaId) {
        $stmt = $conn->prepare('INSERT INTO ordenes_laboratorio (cotizacion_id, examenes, paciente_id, consulta_id) VALUES (?, ?, ?, ?)');
        if ($stmt) {
            $consultaIns = $consultaId > 0 ? $consultaId : null;
            $stmt->bind_param('isii', $cotizacionId, $json, $pacienteId, $consultaIns);
            $stmt->execute();
            $ordenId = (int)$stmt->insert_id;
            $stmt->close();
        }
    } elseif ($hasCotizacionId) {
        $stmt = $conn->prepare('INSERT INTO ordenes_laboratorio (cotizacion_id, examenes, paciente_id) VALUES (?, ?, ?)');
        if ($stmt) {
            $stmt->bind_param('isi', $cotizacionId, $json, $pacienteId);
            $stmt->execute();
            $ordenId = (int)$stmt->insert_id;
            $stmt->close();
        }
    } elseif ($hasConsultaId) {
        $stmt = $conn->prepare('INSERT INTO ordenes_laboratorio (examenes, paciente_id, consulta_id) VALUES (?, ?, ?)');
        if ($stmt) {
            $consultaIns = $consultaId > 0 ? $consultaId : null;
            $stmt->bind_param('sii', $json, $pacienteId, $consultaIns);
            $stmt->execute();
            $ordenId = (int)$stmt->insert_id;
            $stmt->close();
        }
    } else {
        $stmt = $conn->prepare('INSERT INTO ordenes_laboratorio (examenes, paciente_id) VALUES (?, ?)');
        if ($stmt) {
            $stmt->bind_param('si', $json, $pacienteId);
            $stmt->execute();
            $ordenId = (int)$stmt->insert_id;
            $stmt->close();
        }
    }

    return $ordenId > 0 ? [$ordenId] : [];
}

function contratos_crear_ordenes_imagen_ejecucion($conn, $cotizacionId, $pacienteId, array $detalles, $consultaId = 0) {
    if (!contratos_table_exists($conn, 'ordenes_imagen')) return [];
    $tipos = [];
    foreach ($detalles as $det) {
        $tipo = contratos_resolver_tipo_orden_imagen($det['servicio_tipo'] ?? '', $det['descripcion'] ?? '');
        if ($tipo) $tipos[$tipo] = true;
    }
    if (empty($tipos)) return [];

    $hasCotizacionId = contratos_column_exists($conn, 'ordenes_imagen', 'cotizacion_id');
    $hasSolicitadoPor = contratos_column_exists($conn, 'ordenes_imagen', 'solicitado_por');
    $hasCargaAnticipada = contratos_column_exists($conn, 'ordenes_imagen', 'carga_anticipada');
    $hasConsultaId = contratos_column_exists($conn, 'ordenes_imagen', 'consulta_id');
    $usuarioId = (int)($_SESSION['usuario']['id'] ?? 0);
    $ids = [];

    foreach (array_keys($tipos) as $tipoOrden) {
        if ($hasCotizacionId) {
            $stmtChk = $conn->prepare('SELECT id FROM ordenes_imagen WHERE cotizacion_id = ? AND tipo = ? LIMIT 1');
            if ($stmtChk) {
                $stmtChk->bind_param('is', $cotizacionId, $tipoOrden);
                $stmtChk->execute();
                $exists = $stmtChk->get_result()->fetch_assoc();
                $stmtChk->close();
                if ($exists) {
                    $ordenId = (int)($exists['id'] ?? 0);
                    if ($ordenId > 0 && $hasConsultaId && $consultaId > 0) {
                        $stmtUpd = $conn->prepare('UPDATE ordenes_imagen SET consulta_id = CASE WHEN consulta_id IS NULL OR consulta_id = 0 THEN ? ELSE consulta_id END WHERE id = ?');
                        if ($stmtUpd) {
                            $stmtUpd->bind_param('ii', $consultaId, $ordenId);
                            $stmtUpd->execute();
                            $stmtUpd->close();
                        }
                    }
                    if ($ordenId > 0) $ids[] = $ordenId;
                    continue;
                }
            }
        }

        $cols = ['consulta_id', 'paciente_id', 'tipo', 'indicaciones', 'estado'];
        $vals = ['?', '?', '?', '?', "'pendiente'"];
        $types = 'iiss';
        $params = [$consultaId > 0 ? $consultaId : 0, $pacienteId, $tipoOrden, 'Orden creada desde agenda contrato #' . (int)$cotizacionId];

        if ($hasSolicitadoPor) {
            $cols[] = 'solicitado_por';
            $vals[] = '?';
            $types .= 'i';
            $params[] = $usuarioId;
        }
        if ($hasCotizacionId) {
            $cols[] = 'cotizacion_id';
            $vals[] = '?';
            $types .= 'i';
            $params[] = $cotizacionId;
        }
        if ($hasCargaAnticipada) {
            $cols[] = 'carga_anticipada';
            $vals[] = '?';
            $types .= 'i';
            $params[] = 0;
        }

        $sql = 'INSERT INTO ordenes_imagen (' . implode(', ', $cols) . ') VALUES (' . implode(', ', $vals) . ')';
        $stmtIns = $conn->prepare($sql);
        if ($stmtIns) {
            $stmtIns->bind_param($types, ...$params);
            $stmtIns->execute();
            $newId = (int)$stmtIns->insert_id;
            $stmtIns->close();
            if ($newId > 0) $ids[] = $newId;
        }
    }

    return $ids;
}

function contratos_generar_agenda_auto($conn, $contratoId, $plantillaId, $fechaInicio, $usuarioId, $forzar = false, $anchorTipo = 'ninguno', $anchorFecha = null) {
    $contratoId = (int)$contratoId;
    $plantillaId = (int)$plantillaId;
    if ($contratoId <= 0 || $plantillaId <= 0) return 0;

    $stmtCount = $conn->prepare('SELECT COUNT(*) AS total FROM agenda_contrato WHERE contrato_paciente_id = ?');
    $stmtCount->bind_param('i', $contratoId);
    $stmtCount->execute();
    $totalAgenda = (int)($stmtCount->get_result()->fetch_assoc()['total'] ?? 0);
    $stmtCount->close();

    if ($totalAgenda > 0 && !$forzar) {
        return 0;
    }

    if ($totalAgenda > 0 && $forzar) {
        $stmtDel = $conn->prepare('DELETE FROM agenda_contrato WHERE contrato_paciente_id = ?');
        $stmtDel->bind_param('i', $contratoId);
        $stmtDel->execute();
        $stmtDel->close();
    }

    $stmtItems = $conn->prepare('SELECT id, servicio_tipo, servicio_id, descripcion_snapshot, orden_programado, regla_uso, offset_tipo, offset_valor, offset_unidad FROM contratos_plantillas_items WHERE plantilla_id = ? AND activo = 1 ORDER BY orden_programado ASC, id ASC');
    $stmtItems->bind_param('i', $plantillaId);
    $stmtItems->execute();
    $items = $stmtItems->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmtItems->close();

    $insertados = 0;
    foreach ($items as $it) {
        $plantillaItemId = (int)($it['id'] ?? 0);
        $servicioTipo = contratos_normalizar_servicio_tipo($it['servicio_tipo'] ?? '');
        $servicioId = (int)($it['servicio_id'] ?? 0);
        $ordenProgramado = (int)($it['orden_programado'] ?? 1);
        $descripcion = trim((string)($it['descripcion_snapshot'] ?? 'Servicio de contrato'));
        if ($plantillaItemId <= 0 || $servicioTipo === '' || $servicioId <= 0) continue;

        $offsetTipo   = (string)($it['offset_tipo']   ?? 'ninguno');
        $offsetValor  = (int)($it['offset_valor']  ?? 0);
        $offsetUnidad = (string)($it['offset_unidad'] ?? 'semanas');
        $fechaProgramada = contratos_resolver_fecha_con_offset(
            $fechaInicio, $anchorFecha, $anchorTipo,
            $offsetTipo, $offsetValor, $offsetUnidad, $ordenProgramado
        );
        $estadoEvento = 'pendiente';
        $stmtIns = $conn->prepare('INSERT INTO agenda_contrato (contrato_paciente_id, plantilla_hito_id, plantilla_item_id, servicio_tipo, servicio_id, titulo_evento, fecha_programada, estado_evento, semana_gestacional_objetivo, tolerancia_desde, tolerancia_hasta, observaciones, created_by, updated_by) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?)');
        $obs = 'Generado automaticamente desde plantilla';
        $stmtIns->bind_param('iisissssii', $contratoId, $plantillaItemId, $servicioTipo, $servicioId, $descripcion, $fechaProgramada, $estadoEvento, $obs, $usuarioId, $usuarioId);
        $stmtIns->execute();
        $stmtIns->close();
        $insertados++;
    }

    return $insertados;
}

if (!isset($_SESSION['usuario'])) {
    contratos_responder(['success' => false, 'error' => 'No autenticado'], 401);
}

$method = $_SERVER['REQUEST_METHOD'];
$usuarioId = (int)($_SESSION['usuario']['id'] ?? 0);

contratos_require_schema($conn);

try {
    if ($method === 'GET') {
        $accion = strtolower(trim((string)($_GET['accion'] ?? 'estado_cuenta')));

        if ($accion === 'estado_cuenta') {
            $pacienteId = (int)($_GET['paciente_id'] ?? 0);
            if ($pacienteId <= 0) {
                contratos_responder(['success' => false, 'error' => 'paciente_id requerido'], 422);
            }

            $stmt = $conn->prepare("SELECT cp.*, p.nombre AS plantilla_nombre, p.codigo AS plantilla_codigo
                                   FROM contratos_paciente cp
                                   INNER JOIN contratos_plantillas p ON p.id = cp.plantilla_id
                                   WHERE cp.paciente_id = ?
                                   ORDER BY cp.id DESC");
            $stmt->bind_param('i', $pacienteId);
            $stmt->execute();
            $contratos = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
            $stmt->close();

            foreach ($contratos as &$c) {
                $contratoId = (int)($c['id'] ?? 0);

                // Reconciliación automática: si ya existe consumo contractual del día para un evento pendiente,
                // se autocierra como atendido para evitar omisiones manuales en la agenda.
                if ($contratoId > 0) {
                    contratos_autocerrar_eventos_preconsumidos($conn, $contratoId, $usuarioId);
                }

                $stmtPagos = $conn->prepare("SELECT id, nro_cuota, fecha_programada, monto_programado, monto_pagado, fecha_pago, estado, metodo_pago, cobro_id, observaciones, created_at
                                             FROM paciente_seguimiento_pagos
                                             WHERE contrato_paciente_id = ?
                                             ORDER BY created_at ASC, id ASC");
                $stmtPagos->bind_param('i', $contratoId);
                $stmtPagos->execute();
                $pagos = $stmtPagos->get_result()->fetch_all(MYSQLI_ASSOC);
                $stmtPagos->close();
                $c['pagos'] = $pagos;

                $totalAbonado = 0.0;
                foreach ($pagos as $p) {
                    $totalAbonado += (float)($p['monto_pagado'] ?? 0);
                }
                $c['total_abonado'] = $totalAbonado;

                $stmtSrv = $conn->prepare("SELECT cantidad_total, cantidad_consumida
                                           FROM contratos_paciente_servicios
                                           WHERE contrato_paciente_id = ?");
                $stmtSrv->bind_param('i', $contratoId);
                $stmtSrv->execute();
                $servicios = $stmtSrv->get_result()->fetch_all(MYSQLI_ASSOC);
                $stmtSrv->close();

                $servTotales = 0.0;
                $servConsumidos = 0.0;
                foreach ($servicios as $s) {
                    $servTotales += (float)($s['cantidad_total'] ?? 0);
                    $servConsumidos += (float)($s['cantidad_consumida'] ?? 0);
                }
                $c['servicios_totales'] = $servTotales;
                $c['servicios_consumidos'] = $servConsumidos;
                $c['servicios_pendientes'] = max(0.0, $servTotales - $servConsumidos);

                $stmtAgenda = $conn->prepare("SELECT id, estado_evento, fecha_programada
                                              FROM agenda_contrato
                                              WHERE contrato_paciente_id = ?");
                $stmtAgenda->bind_param('i', $contratoId);
                $stmtAgenda->execute();
                $agenda = $stmtAgenda->get_result()->fetch_all(MYSQLI_ASSOC);
                $stmtAgenda->close();

                $totEventos = count($agenda);
                $consumidosAgenda = 0;
                $pendientesAgenda = 0;
                $activos = [];
                foreach ($agenda as $a) {
                    $estadoEvento = strtolower((string)($a['estado_evento'] ?? ''));
                    if (in_array($estadoEvento, ['atendido', 'espontaneo'], true)) {
                        $consumidosAgenda++;
                    }
                    if (in_array($estadoEvento, ['pendiente', 'confirmado', 'reprogramado'], true)) {
                        $pendientesAgenda++;
                    }
                    if ($estadoEvento !== 'cancelado') $activos[] = $a;
                }
                $restantes = $pendientesAgenda;
                $c['agenda_total'] = $totEventos;
                $c['agenda_restantes'] = $restantes;
                $c['agenda_consumidos'] = $consumidosAgenda;

                usort($activos, function ($a, $b) {
                    $fa = strtotime((string)($a['fecha_programada'] ?? '')) ?: 0;
                    $fb = strtotime((string)($b['fecha_programada'] ?? '')) ?: 0;
                    return $fa <=> $fb;
                });

                $penultimaFecha = null;
                $totalActivos = count($activos);
                if ($totalActivos >= 2) {
                    $penultimaFecha = (string)($activos[$totalActivos - 2]['fecha_programada'] ?? '');
                } elseif ($totalActivos === 1) {
                    $penultimaFecha = (string)($activos[0]['fecha_programada'] ?? '');
                }

                $fechaAlerta = null;
                $alertaCritica = 0;
                $alertaVencida = 0;
                $saldoPendiente = (float)($c['saldo_pendiente'] ?? 0);
                if ($penultimaFecha) {
                    $tsPenultima = strtotime($penultimaFecha) ?: 0;
                    if ($tsPenultima > 0) {
                        $tsAlerta = strtotime('-7 day', $tsPenultima);
                        $fechaAlerta = date('Y-m-d H:i:s', $tsAlerta);
                        $hoy = strtotime(date('Y-m-d')) ?: time();
                        $penultimaDia = strtotime(date('Y-m-d', $tsPenultima)) ?: $tsPenultima;
                        $alertaDia = strtotime(date('Y-m-d', $tsAlerta)) ?: $tsAlerta;
                        if ($saldoPendiente > 0.00001 && $hoy >= $alertaDia && $hoy <= $penultimaDia) {
                            $alertaCritica = 1;
                        }
                        if ($saldoPendiente > 0.00001 && $hoy > $penultimaDia) {
                            $alertaVencida = 1;
                        }
                    }
                }

                $c['penultima_fecha_programada'] = $penultimaFecha;
                $c['fecha_alerta_liquidacion'] = $fechaAlerta;
                $c['alerta_liquidacion_critica'] = $alertaCritica;
                $c['alerta_liquidacion_vencida'] = $alertaVencida;
                $c['alerta_penultima'] = ($alertaCritica === 1 || $alertaVencida === 1) ? 1 : 0;
            }
            unset($c);

            contratos_responder(['success' => true, 'contratos' => $contratos]);
        }

        if ($accion === 'plantillas') {
            $includeItems = (int)($_GET['include_items'] ?? 0) === 1;
            $q = trim((string)($_GET['q'] ?? ''));
            $estado = trim((string)($_GET['estado'] ?? ''));
            $page = max(1, (int)($_GET['page'] ?? 1));
            $limit = max(1, min(100, (int)($_GET['limit'] ?? 20)));
            $offset = ($page - 1) * $limit;

            $where = [];
            $types = '';
            $params = [];

            if ($q !== '') {
                $where[] = '(p.codigo LIKE ? OR p.nombre LIKE ?)';
                $types .= 'ss';
                $like = '%' . $q . '%';
                $params[] = $like;
                $params[] = $like;
            }
            if ($estado !== '') {
                $where[] = 'p.estado = ?';
                $types .= 's';
                $params[] = $estado;
            }

            $whereSql = !empty($where) ? ('WHERE ' . implode(' AND ', $where)) : '';
            $sql = "SELECT p.id, p.codigo, p.nombre, p.descripcion, p.estado, p.duracion_dias, p.pago_unico_monto, p.dias_anticipacion_liquidacion, p.created_at, p.updated_at
                    FROM contratos_plantillas p
                    {$whereSql}
                    ORDER BY p.updated_at DESC, p.id DESC
                    LIMIT ? OFFSET ?";

            $stmt = $conn->prepare($sql);
            $typesList = $types . 'ii';
            $paramsList = $params;
            $paramsList[] = $limit;
            $paramsList[] = $offset;
            if (!empty($paramsList)) {
                $stmt->bind_param($typesList, ...$paramsList);
            }
            $stmt->execute();
            $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
            $stmt->close();

            $sqlCount = "SELECT COUNT(*) AS total FROM contratos_plantillas p {$whereSql}";
            $stmtCount = $conn->prepare($sqlCount);
            if (!empty($params)) {
                $stmtCount->bind_param($types, ...$params);
            }
            $stmtCount->execute();
            $total = (int)($stmtCount->get_result()->fetch_assoc()['total'] ?? 0);
            $stmtCount->close();

            if ($includeItems && !empty($rows)) {
                $ids = array_map(fn($r) => (int)($r['id'] ?? 0), $rows);
                $ids = array_values(array_filter($ids, fn($v) => $v > 0));
                if (!empty($ids)) {
                    $placeholders = implode(',', array_fill(0, count($ids), '?'));
                    $typesIds = str_repeat('i', count($ids));
                    $stmtItems = $conn->prepare("SELECT * FROM contratos_plantillas_items WHERE plantilla_id IN ($placeholders) AND activo = 1 ORDER BY orden_programado ASC, id ASC");
                    $stmtItems->bind_param($typesIds, ...$ids);
                    $stmtItems->execute();
                    $itemsRows = $stmtItems->get_result()->fetch_all(MYSQLI_ASSOC);
                    $stmtItems->close();

                    $itemsByPlantilla = [];
                    foreach ($itemsRows as $it) {
                        $pid = (int)($it['plantilla_id'] ?? 0);
                        if ($pid <= 0) continue;
                        if (!isset($itemsByPlantilla[$pid])) $itemsByPlantilla[$pid] = [];
                        $itemsByPlantilla[$pid][] = $it;
                    }

                    foreach ($rows as &$row) {
                        $pid = (int)($row['id'] ?? 0);
                        $row['items'] = $itemsByPlantilla[$pid] ?? [];
                    }
                    unset($row);
                }
            }

            contratos_responder([
                'success' => true,
                'rows' => $rows,
                'total' => $total,
                'page' => $page,
                'limit' => $limit,
            ]);
        }

        if ($accion === 'contratos_paciente') {
            $pacienteId = (int)($_GET['paciente_id'] ?? 0);
            $qContrato = trim((string)($_GET['q'] ?? ''));
            $page = max(1, (int)($_GET['page'] ?? 1));
            $limit = max(1, min(100, (int)($_GET['limit'] ?? 20)));
            $offset = ($page - 1) * $limit;

            $where = [];
            $types = '';
            $params = [];

            if ($pacienteId > 0) {
                $where[] = 'cp.paciente_id = ?';
                $types .= 'i';
                $params[] = $pacienteId;
            }
            if ($qContrato !== '') {
                $where[] = '(CAST(cp.id AS CHAR) LIKE ? OR CAST(cp.paciente_id AS CHAR) LIKE ? OR pa.nombre LIKE ? OR pa.apellido LIKE ? OR p.nombre LIKE ? OR p.codigo LIKE ?)';
                $like = '%' . $qContrato . '%';
                $types .= 'ssssss';
                $params[] = $like;
                $params[] = $like;
                $params[] = $like;
                $params[] = $like;
                $params[] = $like;
                $params[] = $like;
            }

            $whereSql = !empty($where) ? ('WHERE ' . implode(' AND ', $where)) : '';
            $sql = "SELECT cp.*, p.nombre AS plantilla_nombre, p.codigo AS plantilla_codigo,
                           pa.nombre AS paciente_nombre, pa.apellido AS paciente_apellido,
                           (SELECT COUNT(*) FROM agenda_contrato ag WHERE ag.contrato_paciente_id = cp.id) AS agenda_total,
                           (SELECT COUNT(*) FROM historia_clinica hc
                            WHERE hc.contrato_paciente_id = cp.id
                              AND hc.chain_status != 'anulada') AS hc_nodos_completados
                    FROM contratos_paciente cp
                    INNER JOIN contratos_plantillas p ON p.id = cp.plantilla_id
                    LEFT JOIN pacientes pa ON pa.id = cp.paciente_id
                    {$whereSql}
                    ORDER BY cp.id DESC
                    LIMIT ? OFFSET ?";

            $stmt = $conn->prepare($sql);
            $typesList = $types . 'ii';
            $paramsList = $params;
            $paramsList[] = $limit;
            $paramsList[] = $offset;
            $stmt->bind_param($typesList, ...$paramsList);
            $stmt->execute();
            $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
            $stmt->close();

            $sqlCount = "SELECT COUNT(*) AS total
                         FROM contratos_paciente cp
                         INNER JOIN contratos_plantillas p ON p.id = cp.plantilla_id
                         LEFT JOIN pacientes pa ON pa.id = cp.paciente_id
                         {$whereSql}";
            $stmtCount = $conn->prepare($sqlCount);
            if (!empty($params)) {
                $stmtCount->bind_param($types, ...$params);
            }
            $stmtCount->execute();
            $total = (int)($stmtCount->get_result()->fetch_assoc()['total'] ?? 0);
            $stmtCount->close();

            contratos_responder([
                'success' => true,
                'rows' => $rows,
                'total' => $total,
                'page' => $page,
                'limit' => $limit,
            ]);
        }

        if ($accion === 'catalogo_servicios') {
            $servicioTipo = contratos_normalizar_servicio_tipo($_GET['servicio_tipo'] ?? '');
            $q = trim((string)($_GET['q'] ?? ''));
            $limit = max(1, min(100, (int)($_GET['limit'] ?? 30)));
            if ($servicioTipo === '') {
                contratos_responder(['success' => false, 'error' => 'servicio_tipo requerido'], 422);
            }

            $rows = [];
            if (in_array($servicioTipo, ['consulta', 'ecografia', 'rayosx', 'procedimiento', 'operacion'], true)) {
                $whereExtra = '';
                $tiposCompat = [strtolower($servicioTipo)];
                if ($servicioTipo === 'procedimiento') {
                    $tiposCompat[] = 'procedimientos';
                }
                if ($servicioTipo === 'rayosx') {
                    $tiposCompat[] = 'rayos x';
                    $tiposCompat[] = 'rayos_x';
                }
                $whereTipo = 'LOWER(t.servicio_tipo) IN (' . implode(',', array_fill(0, count($tiposCompat), '?')) . ')';
                $params = $tiposCompat;
                $types = str_repeat('s', count($tiposCompat));
                $hasMedicoId = contratos_column_exists($conn, 'tarifas', 'medico_id');
                if ($q !== '') {
                    $qNorm = strtolower(trim($q));
                    $searchTerms = [$qNorm];

                    // Soporte de variantes comunes de busqueda.
                    if ($servicioTipo === 'rayosx' && strpos($qNorm, 'rayos') !== false) {
                        $searchTerms[] = 'rx';
                    }
                    if (substr($qNorm, -2) === 'es' && strlen($qNorm) > 3) {
                        $searchTerms[] = substr($qNorm, 0, -2);
                    } elseif (substr($qNorm, -1) === 's' && strlen($qNorm) > 2) {
                        $searchTerms[] = substr($qNorm, 0, -1);
                    }

                    $searchTerms = array_values(array_unique(array_filter($searchTerms, function ($t) {
                        return $t !== '';
                    })));

                    $filtrosBusqueda = [];
                    foreach ($searchTerms as $term) {
                        $like = '%' . $term . '%';
                        $filtrosBusqueda[] = 'LOWER(t.descripcion) LIKE ?';
                        $params[] = $like;
                        $types .= 's';

                        if ($hasMedicoId) {
                            $filtrosBusqueda[] = 'LOWER(m.nombre) LIKE ?';
                            $filtrosBusqueda[] = 'LOWER(m.apellido) LIKE ?';
                            $params[] = $like;
                            $params[] = $like;
                            $types .= 's';
                            $types .= 's';
                        }
                    }

                    if (!empty($filtrosBusqueda)) {
                        $whereExtra .= ' AND (' . implode(' OR ', $filtrosBusqueda) . ')';
                    }
                }

                $selectMedico = $hasMedicoId
                    ? "m.id AS medico_id, m.nombre AS medico_nombre, m.apellido AS medico_apellido,"
                    : "NULL AS medico_id, NULL AS medico_nombre, NULL AS medico_apellido,";
                $joinMedico = $hasMedicoId ? "LEFT JOIN medicos m ON m.id = t.medico_id" : "LEFT JOIN medicos m ON 1 = 0";

                $sql = "SELECT t.id, t.descripcion, t.precio_particular,
                               {$selectMedico}
                               t.servicio_tipo
                        FROM tarifas t
                        {$joinMedico}
                    WHERE t.activo = 1 AND {$whereTipo} {$whereExtra}
                        ORDER BY t.descripcion ASC
                        LIMIT ?";
                $types .= 'i';
                $params[] = $limit;

                $stmt = $conn->prepare($sql);
                $stmt->bind_param($types, ...$params);
                $stmt->execute();
                $found = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
                $stmt->close();

                foreach ($found as $f) {
                    $nombreMedico = trim(((string)($f['medico_nombre'] ?? '')) . ' ' . ((string)($f['medico_apellido'] ?? '')));
                    $rows[] = [
                        'id' => (int)($f['id'] ?? 0),
                        'descripcion' => (string)($f['descripcion'] ?? ''),
                        'servicio_tipo' => $servicioTipo,
                        'fuente' => 'tarifas',
                        'medico_id' => (int)($f['medico_id'] ?? 0),
                        'medico_nombre' => (string)($f['medico_nombre'] ?? ''),
                        'medico_apellido' => (string)($f['medico_apellido'] ?? ''),
                        'medico_nombre_completo' => $nombreMedico,
                        'precio_particular' => isset($f['precio_particular']) ? (float)$f['precio_particular'] : null,
                    ];
                }
            } elseif ($servicioTipo === 'laboratorio') {
                $whereExtra = '';
                $params = [];
                $types = '';
                if ($q !== '') {
                    $whereExtra .= ' AND nombre LIKE ?';
                    $types .= 's';
                    $params[] = '%' . $q . '%';
                }
                $sql = "SELECT id, nombre, precio_publico, precio_convenio FROM examenes_laboratorio WHERE activo = 1 {$whereExtra} ORDER BY nombre ASC LIMIT ?";
                $types .= 'i';
                $params[] = $limit;
                $stmt = $conn->prepare($sql);
                $stmt->bind_param($types, ...$params);
                $stmt->execute();
                $found = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
                $stmt->close();

                foreach ($found as $f) {
                    $rows[] = [
                        'id' => (int)($f['id'] ?? 0),
                        'descripcion' => (string)($f['nombre'] ?? ''),
                        'servicio_tipo' => $servicioTipo,
                        'fuente' => 'examenes_laboratorio',
                        'medico_id' => 0,
                        'medico_nombre' => '',
                        'medico_apellido' => '',
                        'medico_nombre_completo' => '',
                        'precio_particular' => isset($f['precio_publico']) ? (float)$f['precio_publico'] : null,
                        'precio_convenio' => isset($f['precio_convenio']) ? (float)$f['precio_convenio'] : null,
                    ];
                }
            } elseif ($servicioTipo === 'farmacia') {
                $whereExtra = "WHERE estado = 'activo'";
                $params = [];
                $types = '';
                if ($q !== '') {
                    $whereExtra .= ' AND (nombre LIKE ? OR codigo LIKE ?)';
                    $types .= 'ss';
                    $like = '%' . $q . '%';
                    $params[] = $like;
                    $params[] = $like;
                }
                $sql = "SELECT id, codigo, nombre, presentacion, concentracion, precio_compra, margen_ganancia
                        FROM medicamentos
                        {$whereExtra}
                        ORDER BY nombre ASC
                        LIMIT ?";
                $types .= 'i';
                $params[] = $limit;
                $stmt = $conn->prepare($sql);
                $stmt->bind_param($types, ...$params);
                $stmt->execute();
                $found = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
                $stmt->close();

                foreach ($found as $f) {
                    $desc = trim((string)($f['nombre'] ?? ''));
                    $pres = trim((string)($f['presentacion'] ?? ''));
                    $conc = trim((string)($f['concentracion'] ?? ''));
                    $precioCompra = (float)($f['precio_compra'] ?? 0);
                    $margen = (float)($f['margen_ganancia'] ?? 0);
                    $precioVenta = round($precioCompra * (1 + ($margen / 100)), 2);
                    if ($pres !== '') $desc .= ' - ' . $pres;
                    if ($conc !== '') $desc .= ' (' . $conc . ')';
                    $rows[] = [
                        'id' => (int)($f['id'] ?? 0),
                        'descripcion' => $desc,
                        'servicio_tipo' => $servicioTipo,
                        'fuente' => 'medicamentos',
                        'medico_id' => 0,
                        'medico_nombre' => '',
                        'medico_apellido' => '',
                        'medico_nombre_completo' => '',
                        'precio_particular' => $precioVenta,
                    ];
                }
            } else {
                contratos_responder(['success' => false, 'error' => 'servicio_tipo no soportado'], 422);
            }

            contratos_responder(['success' => true, 'rows' => $rows]);
        }

        if ($accion === 'validar_cobertura') {
            require_once __DIR__ . '/modules/ContratoModule.php';
            $pacienteId = (int)($_GET['paciente_id'] ?? 0);
            $servicioTipo = (string)($_GET['servicio_tipo'] ?? '');
            $servicioId = (int)($_GET['servicio_id'] ?? 0);
            $cantidad = (float)($_GET['cantidad'] ?? 1);
            $fechaRef = (string)($_GET['fecha_ref'] ?? '');
            $meta = ContratoModule::validarCoberturaServicio($conn, $pacienteId, $servicioTipo, $servicioId, $cantidad, $fechaRef ?: null);
            contratos_responder(['success' => true, 'cobertura' => $meta]);
        }

        if ($accion === 'validar_cobertura_lote') {
            require_once __DIR__ . '/modules/ContratoModule.php';
            $pacienteId = (int)($_GET['paciente_id'] ?? 0);
            $servicioTipo = (string)($_GET['servicio_tipo'] ?? '');
            $cantidad = (float)($_GET['cantidad'] ?? 1);
            $fechaRef = (string)($_GET['fecha_ref'] ?? '');
            $servicioIdsRaw = (string)($_GET['servicio_ids'] ?? '');

            if ($pacienteId <= 0 || trim($servicioTipo) === '' || trim($servicioIdsRaw) === '') {
                contratos_responder(['success' => false, 'error' => 'paciente_id, servicio_tipo y servicio_ids requeridos'], 422);
            }

            $ids = array_values(array_unique(array_filter(array_map('intval', preg_split('/[\s,]+/', $servicioIdsRaw)), function ($v) {
                return $v > 0;
            })));

            if (empty($ids)) {
                contratos_responder(['success' => false, 'error' => 'servicio_ids inválidos'], 422);
            }

            $coberturas = [];
            foreach ($ids as $sid) {
                $meta = ContratoModule::validarCoberturaServicio($conn, $pacienteId, $servicioTipo, (int)$sid, $cantidad, $fechaRef ?: null);
                $coberturas[(string)$sid] = $meta;
            }

            contratos_responder(['success' => true, 'coberturas' => $coberturas]);
        }

        // -------------------------------------------------------
        // GET agenda_contrato: eventos de agenda de un contrato
        // -------------------------------------------------------
        if ($accion === 'agenda_contrato') {
            $contratoId = (int)($_GET['contrato_paciente_id'] ?? 0);
            if ($contratoId <= 0) {
                contratos_responder(['success' => false, 'error' => 'contrato_paciente_id requerido'], 422);
            }

            // Reconciliación previa de eventos para reflejar consumos contractuales ya registrados.
            contratos_autocerrar_eventos_preconsumidos($conn, $contratoId, $usuarioId);

            $stmt = $conn->prepare(
                "SELECT ac.id, ac.plantilla_item_id, ac.servicio_tipo, ac.servicio_id,
                        ac.titulo_evento, ac.fecha_programada, ac.estado_evento,
                        ac.semana_gestacional_objetivo, ac.tolerancia_desde, ac.tolerancia_hasta,
                        ac.observaciones, ac.created_at,
                        cpi.offset_tipo, cpi.offset_valor, cpi.offset_unidad, cpi.orden_programado
                 FROM agenda_contrato ac
                 LEFT JOIN contratos_plantillas_items cpi ON cpi.id = ac.plantilla_item_id
                 WHERE ac.contrato_paciente_id = ?
                 ORDER BY ac.fecha_programada ASC, ac.id ASC"
            );
            $stmt->bind_param('i', $contratoId);
            $stmt->execute();
            $eventos = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
            $stmt->close();

            contratos_responder(['success' => true, 'eventos' => $eventos, 'total' => count($eventos)]);
        }

        if ($accion === 'detalle_ejecucion_evento') {
            $eventoId = (int)($_GET['agenda_evento_id'] ?? 0);
            if ($eventoId <= 0) {
                contratos_responder(['success' => false, 'error' => 'agenda_evento_id requerido'], 422);
            }

            $hasEjecucionEstado = contratos_column_exists($conn, 'agenda_contrato', 'ejecucion_estado');
            $hasEjecutadoEn = contratos_column_exists($conn, 'agenda_contrato', 'ejecutado_en');
            $hasCotEjec = contratos_column_exists($conn, 'agenda_contrato', 'cotizacion_id_ejecucion');
            $hasConsulta = contratos_column_exists($conn, 'agenda_contrato', 'consulta_id');
            $extraCols = [];
            if ($hasEjecucionEstado) $extraCols[] = 'ac.ejecucion_estado';
            if ($hasEjecutadoEn) $extraCols[] = 'ac.ejecutado_en';
            if ($hasCotEjec) $extraCols[] = 'ac.cotizacion_id_ejecucion';
            if ($hasConsulta) $extraCols[] = 'ac.consulta_id';
            $selectExtra = empty($extraCols) ? '' : ', ' . implode(', ', $extraCols);

            $stmtEv = $conn->prepare("SELECT ac.id, ac.estado_evento{$selectExtra} FROM agenda_contrato ac WHERE ac.id = ? LIMIT 1");
            $stmtEv->bind_param('i', $eventoId);
            $stmtEv->execute();
            $evento = $stmtEv->get_result()->fetch_assoc();
            $stmtEv->close();
            if (!$evento) {
                contratos_responder(['success' => false, 'error' => 'Evento no encontrado'], 404);
            }

            $cotizacionId = (int)($evento['cotizacion_id_ejecucion'] ?? 0);
            $detalles = [];
            if ($cotizacionId > 0 && contratos_table_exists($conn, 'cotizaciones_detalle')) {
                $selectDet = 'servicio_tipo, servicio_id, descripcion, subtotal';
                if (contratos_column_exists($conn, 'cotizaciones_detalle', 'origen_cobro')) {
                    $selectDet .= ', origen_cobro';
                }
                $stmtDet = $conn->prepare("SELECT {$selectDet} FROM cotizaciones_detalle WHERE cotizacion_id = ?");
                $stmtDet->bind_param('i', $cotizacionId);
                $stmtDet->execute();
                $detalles = $stmtDet->get_result()->fetch_all(MYSQLI_ASSOC);
                $stmtDet->close();
            }

            contratos_responder([
                'success' => true,
                'evento' => [
                    'id' => (int)$evento['id'],
                    'estado_evento' => (string)($evento['estado_evento'] ?? ''),
                    'ejecucion_estado' => (string)($evento['ejecucion_estado'] ?? 'pendiente'),
                    'ejecutado_en' => $evento['ejecutado_en'] ?? null,
                ],
                'vinculos' => [
                    'consulta_id' => (int)($evento['consulta_id'] ?? 0),
                    'cotizacion_id' => $cotizacionId,
                ],
                'detalles' => $detalles,
            ]);
        }

        contratos_responder(['success' => false, 'error' => 'Acción GET no soportada'], 400);
    }

    if ($method === 'POST') {
        $data = json_decode(file_get_contents('php://input'), true) ?: [];
        $accion = strtolower(trim((string)($data['accion'] ?? '')));

        if ($accion === 'registrar_abono') {
            $contratoId = (int)($data['contrato_paciente_id'] ?? 0);
            $monto = (float)($data['monto'] ?? 0);
            $metodo = trim((string)($data['metodo_pago'] ?? 'manual'));
            $obs = trim((string)($data['observaciones'] ?? ''));

            if ($contratoId <= 0 || $monto <= 0) {
                contratos_responder(['success' => false, 'error' => 'contrato_paciente_id y monto son requeridos'], 422);
            }

            // Seguridad financiera: no permitir registrar dinero sin caja abierta.
            $stmtCajaActiva = $conn->prepare('SELECT id, turno FROM cajas WHERE usuario_id = ? AND estado = "abierta" ORDER BY created_at DESC LIMIT 1');
            if (!$stmtCajaActiva) {
                throw new Exception('Error preparando consulta de caja: ' . $conn->error);
            }
            $stmtCajaActiva->bind_param('i', $usuarioId);
            $stmtCajaActiva->execute();
            $cajaAbono = $stmtCajaActiva->get_result()->fetch_assoc();
            $stmtCajaActiva->close();

            if (!$cajaAbono) {
                contratos_responder([
                    'success' => false,
                    'error' => 'Error: Debe abrir caja antes de registrar un movimiento'
                ], 403);
            }

            $conn->begin_transaction();
            $stmtC = $conn->prepare('SELECT id, paciente_id, monto_total, saldo_pendiente FROM contratos_paciente WHERE id = ? FOR UPDATE');
            $stmtC->bind_param('i', $contratoId);
            $stmtC->execute();
            $contrato = $stmtC->get_result()->fetch_assoc();
            $stmtC->close();
            if (!$contrato) {
                throw new Exception('Contrato no encontrado');
            }

            $saldoAnterior = (float)($contrato['saldo_pendiente'] ?? 0);
            $montoAplicado = min($monto, max(0.0, $saldoAnterior));
            if ($montoAplicado <= 0) {
                throw new Exception('El contrato no tiene saldo pendiente');
            }

            $stmtIns = $conn->prepare('INSERT INTO paciente_seguimiento_pagos (contrato_paciente_id, nro_cuota, fecha_programada, monto_programado, monto_pagado, fecha_pago, estado, metodo_pago, observaciones, created_by) VALUES (?, 0, CURDATE(), ?, ?, NOW(), ?, ?, ?, ?)');
            $estado = contratos_normalizar_estado_pago($montoAplicado, $montoAplicado);
            $stmtIns->bind_param('iddsssi', $contratoId, $montoAplicado, $montoAplicado, $estado, $metodo, $obs, $usuarioId);
            $stmtIns->execute();
            $seguimientoId = (int)$conn->insert_id;
            $stmtIns->close();

            $nuevoSaldo = max(0.0, $saldoAnterior - $montoAplicado);
            $nuevoEstado = $nuevoSaldo <= 0.00001 ? 'liquidado' : 'activo';
            $stmtUp = $conn->prepare('UPDATE contratos_paciente SET saldo_pendiente = ?, estado = ? WHERE id = ?');
            $stmtUp->bind_param('dsi', $nuevoSaldo, $nuevoEstado, $contratoId);
            $stmtUp->execute();
            $stmtUp->close();

            // Registrar en ingresos_diarios para cuadre de caja (DENTRO de transacción, ANTES del commit)
            $pacienteIdAbono = (int)($contrato['paciente_id'] ?? 0);
            $nombrePacienteAbono = '';
            if ($pacienteIdAbono > 0) {
                $stmtPacAbono = $conn->prepare('SELECT CONCAT(nombre, " ", apellido) AS n FROM pacientes WHERE id = ? LIMIT 1');
                if ($stmtPacAbono) {
                    $stmtPacAbono->bind_param('i', $pacienteIdAbono);
                    $stmtPacAbono->execute();
                    $rowPacAbono = $stmtPacAbono->get_result()->fetch_assoc();
                    $stmtPacAbono->close();
                    $nombrePacienteAbono = $rowPacAbono['n'] ?? '';
                }
            }

            $caja_id_ingreso = (int)$cajaAbono['id'];
            $turno_ingreso = (string)($cajaAbono['turno'] ?? '');
            $tipo_ingreso = 'contrato_abono';
            $area_ingreso = 'Contratos';
            $desc_ingreso = 'Abono contrato #' . $contratoId;

            $stmtIngresoDirecto = $conn->prepare('
                INSERT INTO ingresos_diarios (
                    caja_id, tipo_ingreso, area, descripcion, monto, metodo_pago, 
                    referencia_id, referencia_tabla, paciente_id, paciente_nombre, 
                    usuario_id, turno, honorario_movimiento_id, cobrado_por, liquidado_por, 
                    fecha_liquidacion, fecha_hora
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ');
            if (!$stmtIngresoDirecto) {
                throw new Exception('Error preparando registro de ingreso diario: ' . $conn->error);
            }

            $honor_mov_id = 0;
            $liqui_por = 0;
            $fecha_liqui = null;
            $referenciaTablaAbono = 'paciente_seguimiento_pagos';

            $stmtIngresoDirecto->bind_param(
                'isssdsisisisiiis',
                $caja_id_ingreso,
                $tipo_ingreso,
                $area_ingreso,
                $desc_ingreso,
                $montoAplicado,
                $metodo,
                $seguimientoId,
                $referenciaTablaAbono,
                $pacienteIdAbono,
                $nombrePacienteAbono,
                $usuarioId,
                $turno_ingreso,
                $honor_mov_id,
                $usuarioId,
                $liqui_por,
                $fecha_liqui
            );

            $okIngresoAbono = $stmtIngresoDirecto->execute();
            $ingresoIdAbono = $okIngresoAbono ? (int)$conn->insert_id : 0;
            $stmtIngresoDirecto->close();

            if (!$okIngresoAbono) {
                // Reintentar como "otros" si tipo_ingreso no existe.
                $tipo_ingreso_fallback = 'otros';
                $stmtIngresoFallback = $conn->prepare('
                    INSERT INTO ingresos_diarios (
                        caja_id, tipo_ingreso, area, descripcion, monto, metodo_pago, 
                        referencia_id, referencia_tabla, paciente_id, paciente_nombre, 
                        usuario_id, turno, honorario_movimiento_id, cobrado_por, liquidado_por, 
                        fecha_liquidacion, fecha_hora
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                ');
                if (!$stmtIngresoFallback) {
                    throw new Exception('Error preparando registro de ingreso diario (fallback): ' . $conn->error);
                }

                $stmtIngresoFallback->bind_param(
                    'isssdsisisisiiis',
                    $caja_id_ingreso,
                    $tipo_ingreso_fallback,
                    $area_ingreso,
                    $desc_ingreso,
                    $montoAplicado,
                    $metodo,
                    $seguimientoId,
                    $referenciaTablaAbono,
                    $pacienteIdAbono,
                    $nombrePacienteAbono,
                    $usuarioId,
                    $turno_ingreso,
                    $honor_mov_id,
                    $usuarioId,
                    $liqui_por,
                    $fecha_liqui
                );
                $okIngresoAbono = $stmtIngresoFallback->execute();
                $ingresoIdAbono = $okIngresoAbono ? (int)$conn->insert_id : 0;
                $stmtIngresoFallback->close();
            }

            if (!$okIngresoAbono) {
                throw new Exception('No se pudo registrar el movimiento en ingresos_diarios.');
            }

            $conn->commit();

            contratos_responder([
                'success' => true,
                'abono_registrado' => $montoAplicado,
                'saldo_anterior' => $saldoAnterior,
                'saldo_nuevo' => $nuevoSaldo,
                'estado_contrato' => $nuevoEstado,
                'ingreso_id' => $ingresoIdAbono,
            ]);
        }

        if ($accion === 'guardar_plantilla') {
            $id = (int)($data['id'] ?? 0);
            $codigo = strtoupper(trim((string)($data['codigo'] ?? '')));
            $nombre = trim((string)($data['nombre'] ?? ''));
            $descripcion = trim((string)($data['descripcion'] ?? ''));
            $estado = trim((string)($data['estado'] ?? 'borrador'));
            $duracionDias = (int)($data['duracion_dias'] ?? 0);
            $pagoUnico = (float)($data['pago_unico_monto'] ?? 0);
            $diasAnt = (int)($data['dias_anticipacion_liquidacion'] ?? 7);
            $items = is_array($data['items'] ?? null) ? $data['items'] : [];

            if ($nombre === '') {
                contratos_responder(['success' => false, 'error' => 'nombre requerido'], 422);
            }
            if ($codigo === '') {
                $codigo = 'CTR-' . date('YmdHis');
            }

            $conn->begin_transaction();
            if ($id > 0) {
                $stmt = $conn->prepare('UPDATE contratos_plantillas SET codigo=?, nombre=?, descripcion=?, estado=?, duracion_dias=?, pago_unico_monto=?, dias_anticipacion_liquidacion=?, updated_by=? WHERE id=?');
                $stmt->bind_param('ssssidiii', $codigo, $nombre, $descripcion, $estado, $duracionDias, $pagoUnico, $diasAnt, $usuarioId, $id);
                $stmt->execute();
                $stmt->close();
            } else {
                $stmt = $conn->prepare('INSERT INTO contratos_plantillas (codigo, nombre, descripcion, estado, duracion_dias, pago_unico_monto, dias_anticipacion_liquidacion, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
                $stmt->bind_param('ssssidiii', $codigo, $nombre, $descripcion, $estado, $duracionDias, $pagoUnico, $diasAnt, $usuarioId, $usuarioId);
                $stmt->execute();
                $id = (int)$conn->insert_id;
                $stmt->close();
            }

            $insertados = 0;
            $actualizados = 0;
            $eliminados = 0;

            $existingIds = [];
            if ($id > 0) {
                $stmtExisting = $conn->prepare('SELECT id FROM contratos_plantillas_items WHERE plantilla_id = ?');
                $stmtExisting->bind_param('i', $id);
                $stmtExisting->execute();
                $rowsExisting = $stmtExisting->get_result()->fetch_all(MYSQLI_ASSOC);
                $stmtExisting->close();
                foreach ($rowsExisting as $er) {
                    $eid = (int)($er['id'] ?? 0);
                    if ($eid > 0) $existingIds[$eid] = true;
                }
            }

            $keptIds = [];
            foreach ($items as $idx => $it) {
                $itemId = (int)($it['id'] ?? 0);
                $servicioTipo = contratos_normalizar_servicio_tipo($it['servicio_tipo'] ?? '');
                $servicioId = (int)($it['servicio_id'] ?? 0);
                $descripcionSnapshot = trim((string)($it['descripcion_snapshot'] ?? ''));
                $cantidadIncluida = (float)($it['cantidad_incluida'] ?? 1);
                $ordenProgramado = (int)($it['orden_programado'] ?? ($idx + 1));
                $reglaUso = trim((string)($it['regla_uso'] ?? 'programado'));
                $offsetTipoItem   = trim((string)($it['offset_tipo']   ?? 'ninguno'));
                $offsetValorItem  = max(0, (int)($it['offset_valor']  ?? 0));
                $offsetUnidadItem = trim((string)($it['offset_unidad'] ?? 'semanas'));
                if (!in_array($offsetTipoItem, ['ninguno','relativo_anchor','semana_gestacional'], true)) $offsetTipoItem = 'ninguno';
                if (!in_array($offsetUnidadItem, ['dias','semanas','meses'], true)) $offsetUnidadItem = 'semanas';
                if ($servicioTipo === '' || $servicioId <= 0 || $descripcionSnapshot === '') continue;

                if ($itemId > 0 && isset($existingIds[$itemId])) {
                    $stmtUpIt = $conn->prepare('UPDATE contratos_plantillas_items SET servicio_tipo=?, servicio_id=?, descripcion_snapshot=?, cantidad_incluida=?, orden_programado=?, regla_uso=?, offset_tipo=?, offset_valor=?, offset_unidad=?, activo=1, updated_at=NOW() WHERE id=? AND plantilla_id=?');
                    $stmtUpIt->bind_param('sisdissisii', $servicioTipo, $servicioId, $descripcionSnapshot, $cantidadIncluida, $ordenProgramado, $reglaUso, $offsetTipoItem, $offsetValorItem, $offsetUnidadItem, $itemId, $id);
                    $stmtUpIt->execute();
                    $stmtUpIt->close();
                    $keptIds[$itemId] = true;
                    $actualizados++;
                } else {
                    $stmtIt = $conn->prepare('INSERT INTO contratos_plantillas_items (plantilla_id, servicio_tipo, servicio_id, descripcion_snapshot, cantidad_incluida, orden_programado, regla_uso, offset_tipo, offset_valor, offset_unidad, activo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)');
                    $stmtIt->bind_param('isisdissis', $id, $servicioTipo, $servicioId, $descripcionSnapshot, $cantidadIncluida, $ordenProgramado, $reglaUso, $offsetTipoItem, $offsetValorItem, $offsetUnidadItem);
                    $stmtIt->execute();
                    $newItemId = (int)$conn->insert_id;
                    $stmtIt->close();
                    if ($newItemId > 0) $keptIds[$newItemId] = true;
                    $insertados++;
                }
            }

            foreach ($existingIds as $existingId => $_) {
                if (isset($keptIds[$existingId])) continue;

                $stmtRef = $conn->prepare('SELECT COUNT(*) AS total FROM contratos_paciente_servicios WHERE plantilla_item_id = ?');
                $stmtRef->bind_param('i', $existingId);
                $stmtRef->execute();
                $refCount = (int)($stmtRef->get_result()->fetch_assoc()['total'] ?? 0);
                $stmtRef->close();

                if ($refCount > 0) {
                    throw new Exception('No se puede eliminar el item #' . $existingId . ' porque ya esta en uso por contratos de pacientes.');
                }

                $stmtHard = $conn->prepare('DELETE FROM contratos_plantillas_items WHERE id = ?');
                $stmtHard->bind_param('i', $existingId);
                $stmtHard->execute();
                $stmtHard->close();
                $eliminados++;
            }

            $conn->commit();

            contratos_responder([
                'success' => true,
                'id' => $id,
                'items_insertados' => $insertados,
                'items_actualizados' => $actualizados,
                'items_eliminados' => $eliminados,
            ]);
        }

        if ($accion === 'guardar_contrato_paciente') {
            $id = (int)($data['id'] ?? 0);
            $pacienteId = (int)($data['paciente_id'] ?? 0);
            $plantillaId = (int)($data['plantilla_id'] ?? 0);
            $fechaInicio = trim((string)($data['fecha_inicio'] ?? ''));
            $fechaFin = trim((string)($data['fecha_fin'] ?? ''));
            $montoTotal = (float)($data['monto_total'] ?? 0);
            $saldoPendiente = isset($data['saldo_pendiente']) ? (float)$data['saldo_pendiente'] : $montoTotal;
            $estado = trim((string)($data['estado'] ?? 'activo'));
            $observaciones = trim((string)($data['observaciones'] ?? ''));
            $regenerarAgenda = (int)($data['regenerar_agenda'] ?? 0) === 1;
            $diasAnt = isset($data['dias_anticipacion_liquidacion']) ? max(0, (int)$data['dias_anticipacion_liquidacion']) : 7;
            $anchorTiposValidos = ['ninguno','fur','fecha_cirugia','fecha_parto_estimada','fecha_inicio_tratamiento'];
            $anchorTipo = trim((string)($data['anchor_tipo'] ?? 'ninguno'));
            if (!in_array($anchorTipo, $anchorTiposValidos, true)) $anchorTipo = 'ninguno';
            $anchorFecha = ($anchorTipo !== 'ninguno' && !empty($data['anchor_fecha']))
                ? trim((string)$data['anchor_fecha'])
                : null;

            if ($plantillaId > 0 && !isset($data['dias_anticipacion_liquidacion'])) {
                $stmtTpl = $conn->prepare('SELECT dias_anticipacion_liquidacion FROM contratos_plantillas WHERE id = ? LIMIT 1');
                $stmtTpl->bind_param('i', $plantillaId);
                $stmtTpl->execute();
                $tplRow = $stmtTpl->get_result()->fetch_assoc();
                $stmtTpl->close();
                if ($tplRow) {
                    $diasAnt = max(0, (int)($tplRow['dias_anticipacion_liquidacion'] ?? 7));
                }
            }

            $fechaLimiteLiquidacion = $fechaFin !== ''
                ? date('Y-m-d', strtotime($fechaFin . ' -' . $diasAnt . ' day'))
                : null;

            if ($pacienteId <= 0 || $plantillaId <= 0 || $fechaInicio === '' || $fechaFin === '') {
                contratos_responder(['success' => false, 'error' => 'paciente_id, plantilla_id, fecha_inicio y fecha_fin son requeridos'], 422);
            }

            $conn->begin_transaction();
            if ($id > 0) {
                $stmtUp = $conn->prepare('UPDATE contratos_paciente SET paciente_id=?, plantilla_id=?, fecha_inicio=?, fecha_fin=?, monto_total=?, saldo_pendiente=?, estado=?, observaciones=?, fecha_limite_liquidacion=?, anchor_tipo=?, anchor_fecha=?, updated_by=? WHERE id=?');
                $stmtUp->bind_param('iissddsssssii', $pacienteId, $plantillaId, $fechaInicio, $fechaFin, $montoTotal, $saldoPendiente, $estado, $observaciones, $fechaLimiteLiquidacion, $anchorTipo, $anchorFecha, $usuarioId, $id);
                $stmtUp->execute();
                $stmtUp->close();

                $stmtDel = $conn->prepare('DELETE FROM contratos_paciente_servicios WHERE contrato_paciente_id = ?');
                $stmtDel->bind_param('i', $id);
                $stmtDel->execute();
                $stmtDel->close();
            } else {
                $stmtIns = $conn->prepare('INSERT INTO contratos_paciente (paciente_id, plantilla_id, fecha_inicio, fecha_fin, monto_total, saldo_pendiente, estado, observaciones, fecha_limite_liquidacion, anchor_tipo, anchor_fecha, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                $stmtIns->bind_param('iissddsssssii', $pacienteId, $plantillaId, $fechaInicio, $fechaFin, $montoTotal, $saldoPendiente, $estado, $observaciones, $fechaLimiteLiquidacion, $anchorTipo, $anchorFecha, $usuarioId, $usuarioId);
                $stmtIns->execute();
                $id = (int)$conn->insert_id;
                $stmtIns->close();
            }

            $stmtTplItems = $conn->prepare('SELECT id, servicio_tipo, servicio_id, cantidad_incluida FROM contratos_plantillas_items WHERE plantilla_id = ? AND activo = 1');
            $stmtTplItems->bind_param('i', $plantillaId);
            $stmtTplItems->execute();
            $tplItems = $stmtTplItems->get_result()->fetch_all(MYSQLI_ASSOC);
            $stmtTplItems->close();

            foreach ($tplItems as $tplIt) {
                $plantillaItemId = (int)($tplIt['id'] ?? 0);
                $servicioTipo = contratos_normalizar_servicio_tipo($tplIt['servicio_tipo'] ?? '');
                $servicioId = (int)($tplIt['servicio_id'] ?? 0);
                $cantidadTotal = (float)($tplIt['cantidad_incluida'] ?? 1);
                if ($plantillaItemId <= 0 || $servicioTipo === '' || $servicioId <= 0) continue;

                $stmtSrv = $conn->prepare('INSERT INTO contratos_paciente_servicios (contrato_paciente_id, plantilla_item_id, servicio_tipo, servicio_id, cantidad_total, cantidad_consumida, estado) VALUES (?, ?, ?, ?, ?, 0, ? )');
                $estadoSrv = 'pendiente';
                $stmtSrv->bind_param('iisids', $id, $plantillaItemId, $servicioTipo, $servicioId, $cantidadTotal, $estadoSrv);
                $stmtSrv->execute();
                $stmtSrv->close();
            }

            $agendaInsertada = contratos_generar_agenda_auto($conn, $id, $plantillaId, $fechaInicio, $usuarioId, $regenerarAgenda, $anchorTipo, $anchorFecha);

            $conn->commit();
            contratos_responder(['success' => true, 'id' => $id, 'agenda_insertada' => $agendaInsertada, 'fecha_limite_liquidacion' => $fechaLimiteLiquidacion, 'anchor_tipo' => $anchorTipo, 'anchor_fecha' => $anchorFecha]);
        }

        if ($accion === 'estado_plantilla') {
            $id = (int)($data['id'] ?? 0);
            $estado = trim((string)($data['estado'] ?? ''));
            if ($id <= 0 || $estado === '') {
                contratos_responder(['success' => false, 'error' => 'id y estado requeridos'], 422);
            }
            $stmt = $conn->prepare('UPDATE contratos_plantillas SET estado = ?, updated_by = ? WHERE id = ?');
            $stmt->bind_param('sii', $estado, $usuarioId, $id);
            $stmt->execute();
            $stmt->close();
            contratos_responder(['success' => true]);
        }

        if ($accion === 'estado_contrato_paciente') {
            $id = (int)($data['id'] ?? 0);
            $estado = strtolower(trim((string)($data['estado'] ?? '')));
            if ($id <= 0 || $estado === '') {
                contratos_responder(['success' => false, 'error' => 'id y estado requeridos'], 422);
            }
            $permitidos = ['pendiente', 'activo', 'finalizado', 'liquidado', 'cancelado'];
            if (!in_array($estado, $permitidos, true)) {
                contratos_responder(['success' => false, 'error' => 'estado no permitido'], 422);
            }

            $conn->begin_transaction();
            $stmt = $conn->prepare('UPDATE contratos_paciente SET estado = ?, updated_by = ? WHERE id = ?');
            $stmt->bind_param('sii', $estado, $usuarioId, $id);
            $stmt->execute();
            $stmt->close();

            if ($estado === 'cancelado') {
                $stmtAgenda = $conn->prepare("UPDATE agenda_contrato SET estado_evento = 'cancelado', updated_by = ? WHERE contrato_paciente_id = ? AND estado_evento IN ('pendiente','confirmado','reprogramado')");
                $stmtAgenda->bind_param('ii', $usuarioId, $id);
                $stmtAgenda->execute();
                $stmtAgenda->close();
            }

            $conn->commit();
            contratos_responder(['success' => true]);
        }

        if ($accion === 'guardar_agenda') {
            $contratoId = (int)($data['contrato_paciente_id'] ?? 0);
            $eventos = is_array($data['eventos'] ?? null) ? $data['eventos'] : [];
            if ($contratoId <= 0 || empty($eventos)) {
                contratos_responder(['success' => false, 'error' => 'contrato_paciente_id y eventos son requeridos'], 422);
            }

            $conn->begin_transaction();
            $insertados = 0;
            foreach ($eventos as $ev) {
                $servicioTipo = strtolower(trim((string)($ev['servicio_tipo'] ?? '')));
                $servicioId = (int)($ev['servicio_id'] ?? 0);
                $titulo = trim((string)($ev['titulo_evento'] ?? 'Evento de contrato'));
                $fechaProgramada = trim((string)($ev['fecha_programada'] ?? ''));
                if ($servicioTipo === '' || $servicioId <= 0 || $fechaProgramada === '') continue;

                $stmtEv = $conn->prepare('INSERT INTO agenda_contrato (contrato_paciente_id, plantilla_hito_id, plantilla_item_id, servicio_tipo, servicio_id, titulo_evento, fecha_programada, estado_evento, semana_gestacional_objetivo, tolerancia_desde, tolerancia_hasta, observaciones, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                $plantillaHitoId = (int)($ev['plantilla_hito_id'] ?? 0) ?: null;
                $plantillaItemId = (int)($ev['plantilla_item_id'] ?? 0) ?: null;
                $estadoEvento = strtolower(trim((string)($ev['estado_evento'] ?? 'pendiente')));
                $semanaObj = isset($ev['semana_gestacional_objetivo']) ? (float)$ev['semana_gestacional_objetivo'] : null;
                $tolDesde = !empty($ev['tolerancia_desde']) ? (string)$ev['tolerancia_desde'] : null;
                $tolHasta = !empty($ev['tolerancia_hasta']) ? (string)$ev['tolerancia_hasta'] : null;
                $obs = trim((string)($ev['observaciones'] ?? ''));
                $stmtEv->bind_param('iiisisssdsssii', $contratoId, $plantillaHitoId, $plantillaItemId, $servicioTipo, $servicioId, $titulo, $fechaProgramada, $estadoEvento, $semanaObj, $tolDesde, $tolHasta, $obs, $usuarioId, $usuarioId);
                $stmtEv->execute();
                $agendaId = (int)$conn->insert_id;
                $stmtEv->close();
                if ($agendaId <= 0) continue;
                $insertados++;

                $medicos = is_array($ev['medicos'] ?? null) ? $ev['medicos'] : [];
                foreach ($medicos as $m) {
                    $medicoId = (int)($m['medico_id'] ?? 0);
                    if ($medicoId <= 0) continue;
                    $rolMed = trim((string)($m['rol_medico'] ?? 'rotativo'));
                    $prioridad = (int)($m['prioridad'] ?? 1);
                    $stmtMed = $conn->prepare('INSERT INTO agenda_contrato_medicos (agenda_contrato_id, medico_id, rol_medico, prioridad, activo) VALUES (?, ?, ?, ?, 1) ON DUPLICATE KEY UPDATE rol_medico = VALUES(rol_medico), prioridad = VALUES(prioridad), activo = 1');
                    $stmtMed->bind_param('iisi', $agendaId, $medicoId, $rolMed, $prioridad);
                    $stmtMed->execute();
                    $stmtMed->close();
                }
            }

            $conn->commit();
            contratos_responder(['success' => true, 'eventos_insertados' => $insertados]);
        }

        // -------------------------------------------------------
        // POST actualizar_evento_agenda: cambia estado de un evento
        // -------------------------------------------------------
        if ($accion === 'actualizar_evento_agenda') {
            $eventoId = (int)($data['id'] ?? 0);
            if ($eventoId <= 0) {
                contratos_responder(['success' => false, 'error' => 'id del evento requerido'], 422);
            }
            $estadosPermitidos = ['pendiente', 'confirmado', 'atendido', 'reprogramado', 'cancelado', 'espontaneo', 'no_asistio_justificado'];
            $nuevoEstado = strtolower(trim((string)($data['estado_evento'] ?? '')));
            if (!in_array($nuevoEstado, $estadosPermitidos, true)) {
                contratos_responder(['success' => false, 'error' => 'estado_evento no válido'], 422);
            }
            $permitirExtra = (int)($data['permitir_extra'] ?? 0) === 1;
            $nuevaFecha   = !empty($data['fecha_programada']) ? trim((string)$data['fecha_programada']) : null;
            $observaciones = trim((string)($data['observaciones'] ?? ''));

            $hasCotEjec = contratos_column_exists($conn, 'agenda_contrato', 'cotizacion_id_ejecucion');
            $hasToken = contratos_column_exists($conn, 'agenda_contrato', 'ejecucion_token');
            $hasEjecEstado = contratos_column_exists($conn, 'agenda_contrato', 'ejecucion_estado');
            $hasEjecError = contratos_column_exists($conn, 'agenda_contrato', 'ejecucion_error');
            $hasEjecutadoEn = contratos_column_exists($conn, 'agenda_contrato', 'ejecutado_en');
            $hasEjecutadoPor = contratos_column_exists($conn, 'agenda_contrato', 'ejecutado_por');

            $conn->begin_transaction();
            $extraSelect = [];
            if ($hasToken) $extraSelect[] = 'ac.ejecucion_token';
            if ($hasEjecEstado) $extraSelect[] = 'ac.ejecucion_estado';
            if ($hasCotEjec) $extraSelect[] = 'ac.cotizacion_id_ejecucion';
            if (contratos_column_exists($conn, 'agenda_contrato', 'consulta_id')) $extraSelect[] = 'ac.consulta_id';
            $selectExtraSql = empty($extraSelect) ? '' : (', ' . implode(', ', $extraSelect));

            $stmtEv = $conn->prepare("SELECT ac.id, ac.contrato_paciente_id, ac.plantilla_item_id, ac.servicio_tipo, ac.servicio_id, ac.titulo_evento, ac.fecha_programada, ac.estado_evento, cp.paciente_id, cp.estado AS contrato_estado{$selectExtraSql} FROM agenda_contrato ac INNER JOIN contratos_paciente cp ON cp.id = ac.contrato_paciente_id WHERE ac.id = ? LIMIT 1 FOR UPDATE");
            $stmtEv->bind_param('i', $eventoId);
            $stmtEv->execute();
            $evRow = $stmtEv->get_result()->fetch_assoc();
            $stmtEv->close();
            if (!$evRow) {
                contratos_responder(['success' => false, 'error' => 'Evento no encontrado'], 404);
            }

            $estadoContrato = strtolower(trim((string)($evRow['contrato_estado'] ?? '')));
            if (in_array($estadoContrato, ['finalizado', 'liquidado', 'cancelado'], true)) {
                contratos_responder([
                    'success' => false,
                    'error' => 'No se puede actualizar agenda en contratos cerrados',
                    'contrato_estado' => $estadoContrato,
                ], 422);
            }

            $estadoAnterior = strtolower((string)($evRow['estado_evento'] ?? ''));
            $esTransicionConsumo = in_array($nuevoEstado, ['atendido', 'espontaneo'], true)
                && !in_array($estadoAnterior, ['atendido', 'espontaneo'], true);
            $tokenEjecucion = hash('sha256', 'agenda:' . $eventoId . ':ejecucion');

            $ejecucionYaHecha = $hasEjecEstado
                && strtolower((string)($evRow['ejecucion_estado'] ?? '')) === 'ejecutado'
                && (((int)($evRow['consulta_id'] ?? 0)) > 0 || ((int)($evRow['cotizacion_id_ejecucion'] ?? 0)) > 0);

            if ($esTransicionConsumo && $ejecucionYaHecha) {
                $sets = 'estado_evento = ?, updated_by = ?';
                $params = [$nuevoEstado, $usuarioId];
                $types = 'si';
                if ($nuevaFecha !== null) {
                    $sets .= ', fecha_programada = ?';
                    $types .= 's';
                    $params[] = $nuevaFecha;
                }
                if ($observaciones !== '') {
                    $sets .= ', observaciones = ?';
                    $types .= 's';
                    $params[] = $observaciones;
                }
                $params[] = $eventoId;
                $types .= 'i';
                $stmt = $conn->prepare("UPDATE agenda_contrato SET {$sets} WHERE id = ?");
                $stmt->bind_param($types, ...$params);
                $stmt->execute();
                $stmt->close();

                $conn->commit();
                contratos_responder([
                    'success' => true,
                    'modo' => 'idempotente',
                    'idempotente' => true,
                    'evento' => [
                        'id' => $eventoId,
                        'estado_evento' => $nuevoEstado,
                        'ejecucion_estado' => 'ejecutado',
                    ],
                    'vinculos' => [
                        'consulta_id' => (int)($evRow['consulta_id'] ?? 0),
                        'cotizacion_id' => (int)($evRow['cotizacion_id_ejecucion'] ?? 0),
                        'ordenes_laboratorio' => [],
                        'ordenes_imagen' => [],
                    ],
                ]);
            }

            $cobertura = null;
            $preconsumoDetectado = false;
            $preconsumoRow = null;
            if ($esTransicionConsumo) {
                require_once __DIR__ . '/modules/ContratoModule.php';
                $fechaRefEvento = !empty($evRow['fecha_programada'])
                    ? date('Y-m-d', strtotime((string)$evRow['fecha_programada']))
                    : date('Y-m-d');

                $preconsumoRow = contratos_buscar_preconsumo_servicio(
                    $conn,
                    (int)($evRow['contrato_paciente_id'] ?? 0),
                    (int)($evRow['paciente_id'] ?? 0),
                    (string)($evRow['servicio_tipo'] ?? ''),
                    (int)($evRow['servicio_id'] ?? 0),
                    $fechaRefEvento
                );
                $preconsumoDetectado = is_array($preconsumoRow) && !empty($preconsumoRow);

                $cobertura = ContratoModule::validarCoberturaServicio(
                    $conn,
                    (int)($evRow['paciente_id'] ?? 0),
                    (string)($evRow['servicio_tipo'] ?? ''),
                    (int)($evRow['servicio_id'] ?? 0),
                    1.0,
                    $fechaRefEvento
                );

                if (!($cobertura['aplica_contrato'] ?? false) && $preconsumoDetectado) {
                    $cobertura = [
                        'aplica_contrato' => true,
                        'origen_cobro' => 'contrato',
                        'contrato_paciente_id' => (int)($evRow['contrato_paciente_id'] ?? 0),
                        'contrato_paciente_servicio_id' => (int)($preconsumoRow['contrato_paciente_servicio_id'] ?? 0),
                        'motivo' => 'preconsumido_por_cotizacion',
                        'consumo_previamente_registrado' => true,
                    ];
                }

                if (!($cobertura['aplica_contrato'] ?? false) && !$permitirExtra) {
                    contratos_responder([
                        'success' => false,
                        'error' => 'Servicio sin cobertura de contrato. Confirma cobro extra para continuar.',
                        'requiere_confirmacion_extra' => true,
                        'cobertura' => $cobertura,
                    ], 422);
                }
            }

            $ordenesLabIds = [];
            $ordenesImagenIds = [];
            $cotizacionEjecucionId = (int)($evRow['cotizacion_id_ejecucion'] ?? 0);
            $consultaIdEjecucion = (int)($evRow['consulta_id'] ?? 0);
            $servicioTipoEvento = contratos_normalizar_servicio_tipo((string)($evRow['servicio_tipo'] ?? ''));
            $eventoEsConsulta = contratos_servicio_es_consulta($servicioTipoEvento);

            $esTransicionProgramacion = $nuevoEstado === 'confirmado'
                && in_array($estadoAnterior, ['pendiente', 'reprogramado'], true);
            $resumenItems = ['items_inyectados' => 0, 'items_contrato' => 0, 'items_extra' => 0];

            if ($esTransicionProgramacion && $consultaIdEjecucion <= 0 && $eventoEsConsulta) {
                $consultaProgRes = contratos_asegurar_consulta_evento($conn, $evRow, $usuarioId, true);
                if (!($consultaProgRes['success'] ?? false)) {
                    throw new Exception((string)($consultaProgRes['error'] ?? 'No se pudo programar consulta para evento confirmado'));
                }
                $consultaIdEjecucion = (int)($consultaProgRes['consulta_id'] ?? 0);
            }

            if ($esTransicionConsumo && $preconsumoDetectado) {
                $cotizacionEjecucionId = (int)($preconsumoRow['cotizacion_id'] ?? 0);
                $consultaIdEjecucion = (int)($preconsumoRow['consulta_id'] ?? 0);

                if (!$eventoEsConsulta) {
                    $consultaAncla = contratos_resolver_consulta_ancla_previa($conn, $evRow);
                    if ($consultaAncla > 0) {
                        $consultaIdEjecucion = $consultaAncla;
                    }
                }

                if ($consultaIdEjecucion <= 0 && $cotizacionEjecucionId > 0 && contratos_column_exists($conn, 'cotizaciones_detalle', 'consulta_id')) {
                    $stmtConsDet = $conn->prepare("SELECT consulta_id
                                                  FROM cotizaciones_detalle
                                                  WHERE cotizacion_id = ?
                                                    AND LOWER(TRIM(servicio_tipo)) = ?
                                                    AND servicio_id = ?
                                                    AND consulta_id IS NOT NULL
                                                    AND consulta_id > 0
                                                  ORDER BY id DESC
                                                  LIMIT 1");
                    if ($stmtConsDet) {
                        $srvTipo = strtolower(trim((string)($evRow['servicio_tipo'] ?? '')));
                        $srvId = (int)($evRow['servicio_id'] ?? 0);
                        $stmtConsDet->bind_param('isi', $cotizacionEjecucionId, $srvTipo, $srvId);
                        $stmtConsDet->execute();
                        $rowConsDet = $stmtConsDet->get_result()->fetch_assoc();
                        $stmtConsDet->close();
                        $consultaIdEjecucion = (int)($rowConsDet['consulta_id'] ?? 0);
                    }
                }

                if ($consultaIdEjecucion <= 0) {
                    $consultaRes = contratos_asegurar_consulta_evento($conn, $evRow, $usuarioId, true);
                    if (!($consultaRes['success'] ?? false)) {
                        throw new Exception((string)($consultaRes['error'] ?? 'No se pudo asegurar consulta para evento preconsumido'));
                    }
                    $consultaIdEjecucion = (int)($consultaRes['consulta_id'] ?? 0);
                }

                $resumenItems['items_inyectados'] = 0;
                $resumenItems['items_contrato'] = 1;
                $resumenItems['items_extra'] = 0;
            } elseif ($esTransicionConsumo) {
                $subservicios = contratos_cargar_subservicios_evento($conn, $eventoId, (int)($evRow['plantilla_item_id'] ?? 0));

                $itemsEjecucion = [];
                $mainTipo = contratos_normalizar_servicio_tipo((string)($evRow['servicio_tipo'] ?? ''));
                $mainId = (int)($evRow['servicio_id'] ?? 0);
                $mainDesc = trim((string)($evRow['titulo_evento'] ?? ''));
                $mainPrecioLista = contratos_obtener_precio_servicio($conn, $mainTipo, $mainId);
                $mainOrigen = (($cobertura['aplica_contrato'] ?? false) ? 'contrato' : ($permitirExtra ? 'extra' : 'regular'));
                $mainPrecioUnit = $mainOrigen === 'contrato' ? 0.0 : $mainPrecioLista;
                $mainSubtotal = $mainPrecioUnit;
                $mainMedico = contratos_resolver_medico_evento($conn, $eventoId, $mainTipo, $mainId);
                $itemsEjecucion[] = [
                    'servicio_tipo' => $mainTipo,
                    'servicio_id' => $mainId,
                    'descripcion' => $mainDesc !== '' ? $mainDesc : 'Servicio principal de evento',
                    'cantidad' => 1.0,
                    'precio_unitario' => $mainPrecioUnit,
                    'subtotal' => $mainSubtotal,
                    'origen_cobro' => $mainOrigen,
                    'monto_lista_referencial' => $mainPrecioLista,
                    'contrato_paciente_id' => (int)($cobertura['contrato_paciente_id'] ?? (int)($evRow['contrato_paciente_id'] ?? 0)),
                    'contrato_paciente_servicio_id' => (int)($cobertura['contrato_paciente_servicio_id'] ?? 0),
                    'medico_id' => $mainMedico,
                ];

                foreach ($subservicios as $sub) {
                    $subTipo = contratos_normalizar_servicio_tipo((string)($sub['servicio_tipo'] ?? ''));
                    $subId = (int)($sub['servicio_id'] ?? 0);
                    if ($subTipo === '' || $subId <= 0) continue;
                    $cantidadSub = max(0.01, (float)($sub['cantidad'] ?? 1));
                    $origenDefault = strtolower(trim((string)($sub['origen_cobro_default'] ?? 'contrato')));
                    if (!in_array($origenDefault, ['contrato', 'extra'], true)) $origenDefault = 'contrato';
                    $precioLista = contratos_obtener_precio_servicio($conn, $subTipo, $subId);
                    $precioSub = $origenDefault === 'contrato' ? 0.0 : $precioLista;
                    $itemsEjecucion[] = [
                        'servicio_tipo' => $subTipo,
                        'servicio_id' => $subId,
                        'descripcion' => trim((string)($sub['descripcion_snapshot'] ?? 'Sub-servicio de evento')),
                        'cantidad' => $cantidadSub,
                        'precio_unitario' => $precioSub,
                        'subtotal' => round($precioSub * $cantidadSub, 2),
                        'origen_cobro' => $origenDefault,
                        'monto_lista_referencial' => $precioLista,
                        'contrato_paciente_id' => (int)($evRow['contrato_paciente_id'] ?? 0),
                        'contrato_paciente_servicio_id' => 0,
                        'medico_id' => contratos_resolver_medico_evento($conn, $eventoId, $subTipo, $subId),
                    ];
                }

                $forzarControlConsulta = (($cobertura['aplica_contrato'] ?? false) && !$permitirExtra);
                if ($eventoEsConsulta) {
                    $consultaRes = contratos_asegurar_consulta_evento($conn, $evRow, $usuarioId, $forzarControlConsulta);
                    if (!($consultaRes['success'] ?? false)) {
                        throw new Exception((string)($consultaRes['error'] ?? 'No se pudo asegurar consulta para evento'));
                    }
                    $consultaIdEjecucion = (int)($consultaRes['consulta_id'] ?? 0);
                } else {
                    $consultaIdEjecucion = contratos_resolver_consulta_ancla_previa($conn, $evRow);
                    if ($consultaIdEjecucion <= 0) {
                        $consultaRes = contratos_asegurar_consulta_evento($conn, $evRow, $usuarioId, $forzarControlConsulta);
                        if (!($consultaRes['success'] ?? false)) {
                            throw new Exception((string)($consultaRes['error'] ?? 'No se pudo asegurar consulta ancla para evento'));
                        }
                        $consultaIdEjecucion = (int)($consultaRes['consulta_id'] ?? 0);
                    }
                }

                foreach ($itemsEjecucion as &$itemE) {
                    $itemE['consulta_id'] = $consultaIdEjecucion;
                }
                unset($itemE);

                $cotRes = contratos_crear_cotizacion_ejecucion($conn, (int)($evRow['paciente_id'] ?? 0), $usuarioId, $eventoId, $itemsEjecucion);
                if (!($cotRes['success'] ?? false)) {
                    throw new Exception((string)($cotRes['error'] ?? 'No se pudo crear cotizacion de ejecucion'));
                }
                $cotizacionEjecucionId = (int)($cotRes['cotizacion_id'] ?? 0);

                $ordenesLabIds = contratos_crear_ordenes_laboratorio_ejecucion($conn, $cotizacionEjecucionId, (int)($evRow['paciente_id'] ?? 0), $itemsEjecucion, $consultaIdEjecucion);
                $ordenesImagenIds = contratos_crear_ordenes_imagen_ejecucion($conn, $cotizacionEjecucionId, (int)($evRow['paciente_id'] ?? 0), $itemsEjecucion, $consultaIdEjecucion);

                $resumenItems['items_inyectados'] = count($itemsEjecucion);
                foreach ($itemsEjecucion as $ix) {
                    $ori = strtolower(trim((string)($ix['origen_cobro'] ?? 'regular')));
                    if ($ori === 'contrato') $resumenItems['items_contrato']++;
                    if ($ori === 'extra') $resumenItems['items_extra']++;
                }
            }

            $sets = 'estado_evento = ?, updated_by = ?';
            $params = [$nuevoEstado, $usuarioId];
            $types = 'si';
            if ($nuevaFecha !== null) {
                $sets .= ', fecha_programada = ?';
                $types .= 's';
                $params[] = $nuevaFecha;
            }
            if ($observaciones !== '') {
                $sets .= ', observaciones = ?';
                $types .= 's';
                $params[] = $observaciones;
            }
            if ($esTransicionConsumo && $hasToken) {
                $sets .= ', ejecucion_token = ?';
                $types .= 's';
                $params[] = $tokenEjecucion;
            }
            if ($esTransicionConsumo && $hasEjecEstado) {
                $sets .= ', ejecucion_estado = ?';
                $types .= 's';
                $params[] = 'ejecutado';
            }
            if ($esTransicionConsumo && $hasEjecError) {
                $sets .= ', ejecucion_error = NULL';
            }
            if ($esTransicionConsumo && $hasEjecutadoEn) {
                $sets .= ', ejecutado_en = NOW()';
            }
            if ($esTransicionConsumo && $hasEjecutadoPor) {
                $sets .= ', ejecutado_por = ?';
                $types .= 'i';
                $params[] = $usuarioId;
            }
            if (($esTransicionConsumo || $esTransicionProgramacion) && contratos_column_exists($conn, 'agenda_contrato', 'consulta_id') && $consultaIdEjecucion > 0) {
                $sets .= ', consulta_id = ?';
                $types .= 'i';
                $params[] = $consultaIdEjecucion;
            }
            if ($esTransicionConsumo && $hasCotEjec && $cotizacionEjecucionId > 0) {
                $sets .= ', cotizacion_id_ejecucion = ?';
                $types .= 'i';
                $params[] = $cotizacionEjecucionId;
            }
            $params[] = $eventoId;
            $types .= 'i';
            $stmt = $conn->prepare("UPDATE agenda_contrato SET {$sets} WHERE id = ?");
            $stmt->bind_param($types, ...$params);
            $stmt->execute();
            $affected = $stmt->affected_rows;
            $stmt->close();

            // Consumir solo una vez por transición a atendido/espontaneo.
            if ($esTransicionConsumo && $affected > 0 && !$preconsumoDetectado) {
                $aplica = (bool)($cobertura['aplica_contrato'] ?? false);
                if ($aplica) {
                    $contratoPacienteId = (int)($cobertura['contrato_paciente_id'] ?? 0);
                    $cpsId = (int)($cobertura['contrato_paciente_servicio_id'] ?? 0);
                    if ($contratoPacienteId > 0 && $cpsId > 0) {
                        $stmtCons = $conn->prepare(
                            'UPDATE contratos_paciente_servicios
                             SET cantidad_consumida = cantidad_consumida + 1,
                                 estado = IF(cantidad_consumida + 1 >= cantidad_total, "agotado", "en_uso")
                             WHERE id = ? AND contrato_paciente_id = ?'
                        );
                        $stmtCons->bind_param('ii', $cpsId, $contratoPacienteId);
                        $stmtCons->execute();
                        $stmtCons->close();

                        $stmtLedger = $conn->prepare('INSERT INTO contratos_consumos (contrato_paciente_id, contrato_paciente_servicio_id, paciente_id, consulta_id, cantidad_consumida, modo_cobertura, monto_cubierto, monto_cobrado_extra, usuario_id, observaciones) VALUES (?, ?, ?, ?, 1, ?, 0, 0, ?, ?)');
                        if ($stmtLedger) {
                            $modo = 'contrato';
                            $obsLedger = 'Consumo desde agenda evento #' . $eventoId . ' (' . $nuevoEstado . ')';
                            $pid = (int)($evRow['paciente_id'] ?? 0);
                            $stmtLedger->bind_param('iiiisis', $contratoPacienteId, $cpsId, $pid, $consultaIdEjecucion, $modo, $usuarioId, $obsLedger);
                            $stmtLedger->execute();
                            $stmtLedger->close();
                        }
                    }
                } elseif ($permitirExtra) {
                    $contratoPacienteId = (int)($evRow['contrato_paciente_id'] ?? 0);
                    $cpsId = (int)($cobertura['contrato_paciente_servicio_id'] ?? 0);
                    if ($contratoPacienteId > 0 && $cpsId > 0) {
                        $stmtLedger = $conn->prepare('INSERT INTO contratos_consumos (contrato_paciente_id, contrato_paciente_servicio_id, paciente_id, consulta_id, cantidad_consumida, modo_cobertura, monto_cubierto, monto_cobrado_extra, usuario_id, observaciones) VALUES (?, ?, ?, ?, 1, ?, 0, 0, ?, ?)');
                        if ($stmtLedger) {
                            $modo = 'extra';
                            $obsLedger = 'Consumo extra desde agenda evento #' . $eventoId . ' (' . $nuevoEstado . ')';
                            $pid = (int)($evRow['paciente_id'] ?? 0);
                            $stmtLedger->bind_param('iiiisis', $contratoPacienteId, $cpsId, $pid, $consultaIdEjecucion, $modo, $usuarioId, $obsLedger);
                            $stmtLedger->execute();
                            $stmtLedger->close();
                        }
                    }
                }
            }

            $conn->commit();
            contratos_responder([
                'success' => true,
                'modo' => $esTransicionConsumo ? 'ejecucion' : 'estado',
                'idempotente' => false,
                'afectados' => $affected,
                'estado_anterior' => $estadoAnterior,
                'cobertura' => $cobertura,
                'permitir_extra' => $permitirExtra,
                'evento' => [
                    'id' => $eventoId,
                    'estado_evento' => $nuevoEstado,
                    'ejecucion_estado' => $esTransicionConsumo ? 'ejecutado' : null,
                ],
                'vinculos' => [
                    'consulta_id' => $consultaIdEjecucion,
                    'cotizacion_id' => $cotizacionEjecucionId,
                    'ordenes_laboratorio' => $ordenesLabIds,
                    'ordenes_imagen' => $ordenesImagenIds,
                ],
                'resumen' => $resumenItems,
            ]);
        }

        // -------------------------------------------------------
        // POST recalcular_agenda: regenera agenda con nuevo anchor
        // -------------------------------------------------------
        if ($accion === 'recalcular_agenda') {
            $contratoId = (int)($data['contrato_paciente_id'] ?? 0);
            if ($contratoId <= 0) {
                contratos_responder(['success' => false, 'error' => 'contrato_paciente_id requerido'], 422);
            }

            // Leer contrato + plantilla
            $stmtC = $conn->prepare(
                 'SELECT cp.plantilla_id, cp.fecha_inicio, cp.anchor_tipo, cp.anchor_fecha, cp.estado
                 FROM contratos_paciente cp WHERE cp.id = ? LIMIT 1'
            );
            $stmtC->bind_param('i', $contratoId);
            $stmtC->execute();
            $cRow = $stmtC->get_result()->fetch_assoc();
            $stmtC->close();
            if (!$cRow) {
                contratos_responder(['success' => false, 'error' => 'Contrato no encontrado'], 404);
            }

            $estadoContrato = strtolower(trim((string)($cRow['estado'] ?? '')));
            if (in_array($estadoContrato, ['finalizado', 'liquidado', 'cancelado'], true)) {
                contratos_responder([
                    'success' => false,
                    'error' => 'No se puede recalcular agenda en contratos cerrados',
                    'contrato_estado' => $estadoContrato,
                ], 422);
            }

            // Si viene nuevo anchor en el payload → actualizar el contrato
            $anchorTiposValidos = ['ninguno','fur','fecha_cirugia','fecha_parto_estimada','fecha_inicio_tratamiento'];
            $anchorTipo  = array_key_exists('anchor_tipo', $data)  ? trim((string)$data['anchor_tipo'])  : (string)($cRow['anchor_tipo'] ?? 'ninguno');
            $anchorFecha = array_key_exists('anchor_fecha', $data) ? trim((string)$data['anchor_fecha']) : (string)($cRow['anchor_fecha'] ?? '');
            if (!in_array($anchorTipo, $anchorTiposValidos, true)) $anchorTipo = 'ninguno';
            if ($anchorTipo === 'ninguno') $anchorFecha = null;
            elseif ($anchorFecha === '') $anchorFecha = null;

            $conn->begin_transaction();
            if (array_key_exists('anchor_tipo', $data)) {
                $stmtUpAnchor = $conn->prepare('UPDATE contratos_paciente SET anchor_tipo=?, anchor_fecha=?, updated_by=? WHERE id=?');
                $stmtUpAnchor->bind_param('ssii', $anchorTipo, $anchorFecha, $usuarioId, $contratoId);
                $stmtUpAnchor->execute();
                $stmtUpAnchor->close();
            }

            // Forzar regeneración (elimina y re-crea todos los pendientes/reprogramados)
            $stmtDelEv = $conn->prepare(
                "DELETE FROM agenda_contrato WHERE contrato_paciente_id = ? AND estado_evento IN ('pendiente','reprogramado')"
            );
            $stmtDelEv->bind_param('i', $contratoId);
            $stmtDelEv->execute();
            $eliminados = $stmtDelEv->affected_rows;
            $stmtDelEv->close();

            // Re-insertar solo los items que aún no tienen evento atendido/confirmado
            $stmtItems = $conn->prepare(
                'SELECT cpi.id, cpi.servicio_tipo, cpi.servicio_id, cpi.descripcion_snapshot,
                        cpi.orden_programado, cpi.offset_tipo, cpi.offset_valor, cpi.offset_unidad
                 FROM contratos_plantillas_items cpi
                 WHERE cpi.plantilla_id = ? AND cpi.activo = 1
                   AND NOT EXISTS (
                       SELECT 1 FROM agenda_contrato ac
                       WHERE ac.contrato_paciente_id = ? AND ac.plantilla_item_id = cpi.id
                                                 AND ac.estado_evento IN (\'atendido\',\'confirmado\',\'espontaneo\',\'no_asistio_justificado\')
                   )
                 ORDER BY cpi.orden_programado ASC, cpi.id ASC'
            );
            $plantillaId = (int)($cRow['plantilla_id'] ?? 0);
            $fechaInicio = (string)($cRow['fecha_inicio'] ?? '');
            $stmtItems->bind_param('ii', $plantillaId, $contratoId);
            $stmtItems->execute();
            $items = $stmtItems->get_result()->fetch_all(MYSQLI_ASSOC);
            $stmtItems->close();

            $insertados = 0;
            foreach ($items as $it) {
                $pItemId    = (int)($it['id'] ?? 0);
                $sTipo      = contratos_normalizar_servicio_tipo($it['servicio_tipo'] ?? '');
                $sId        = (int)($it['servicio_id'] ?? 0);
                $orden      = (int)($it['orden_programado'] ?? 1);
                $desc       = trim((string)($it['descripcion_snapshot'] ?? 'Servicio de contrato'));
                if ($pItemId <= 0 || $sTipo === '' || $sId <= 0) continue;

                $oTipo   = (string)($it['offset_tipo']   ?? 'ninguno');
                $oValor  = (int)($it['offset_valor']  ?? 0);
                $oUnidad = (string)($it['offset_unidad'] ?? 'semanas');
                $fechaEv = contratos_resolver_fecha_con_offset($fechaInicio, $anchorFecha, $anchorTipo, $oTipo, $oValor, $oUnidad, $orden);

                $stmtIns = $conn->prepare(
                    'INSERT INTO agenda_contrato (contrato_paciente_id, plantilla_hito_id, plantilla_item_id, servicio_tipo, servicio_id, titulo_evento, fecha_programada, estado_evento, observaciones, created_by, updated_by)
                     VALUES (?, NULL, ?, ?, ?, ?, ?, \'pendiente\', \'Regenerado por cambio de anchor\', ?, ?)'
                );
                $stmtIns->bind_param('iisissii', $contratoId, $pItemId, $sTipo, $sId, $desc, $fechaEv, $usuarioId, $usuarioId);
                $stmtIns->execute();
                $stmtIns->close();
                $insertados++;
            }

            $conn->commit();
            contratos_responder([
                'success'     => true,
                'eliminados'  => $eliminados,
                'insertados'  => $insertados,
                'anchor_tipo' => $anchorTipo,
                'anchor_fecha'=> $anchorFecha,
            ]);
        }

        contratos_responder(['success' => false, 'error' => 'Acción POST no soportada'], 400);
    }

    contratos_responder(['success' => false, 'error' => 'Método no soportado'], 405);
} catch (Throwable $e) {
    if ($conn && $conn->errno === 0) {
        try { $conn->rollback(); } catch (Throwable $ignore) {}
    }
    contratos_responder(['success' => false, 'error' => $e->getMessage()], 500);
}
