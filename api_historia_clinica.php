<?php
require_once __DIR__ . '/init_api.php';
// --- Verificación de sesión ---
require_once __DIR__ . '/auth_check.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/modules/HcTemplateResolver.php';
$tphPath = __DIR__ . '/tratamientos_programacion_helper.php';
if (!is_file($tphPath)) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Falta archivo requerido: tratamientos_programacion_helper.php',
        'detail' => 'Despliegue incompleto en servidor. Subir tratamientos_programacion_helper.php al directorio /sistema/.',
    ]);
    exit;
}
require_once $tphPath;

function hc_actor_label() {
    if (!isset($_SESSION['usuario']) || !is_array($_SESSION['usuario'])) {
        return 'sistema';
    }

    $u = $_SESSION['usuario'];
    $rol = trim((string)($u['rol'] ?? 'usuario'));
    $nombre = trim((string)($u['nombre'] ?? ''));
    $apellido = trim((string)($u['apellido'] ?? ''));
    $display = trim($nombre . ' ' . $apellido);
    if ($display === '') {
        $display = trim((string)($u['usuario'] ?? ''));
    }
    if ($display === '') {
        $display = 'usuario';
    }
    return $display . ' (' . $rol . ')';
}

function hc_append_proxima_historial($proximaCita, $evento) {
    if (!is_array($proximaCita)) {
        $proximaCita = [];
    }
    $historial = [];
    if (isset($proximaCita['historial']) && is_array($proximaCita['historial'])) {
        $historial = $proximaCita['historial'];
    }
    $historial[] = $evento;

    if (count($historial) > 20) {
        $historial = array_slice($historial, -20);
    }

    $proximaCita['historial'] = $historial;
    return $proximaCita;
}

function hc_normalizar_hora($horaRaw) {
    $hora = trim((string)$horaRaw);
    if ($hora === '') return '';
    if (strlen($hora) === 5 && substr_count($hora, ':') === 1) {
        $hora .= ':00';
    }
    return $hora;
}

function hc_normalizar_tipo_diagnostico($tipoRaw) {
    $tipo = mb_strtolower(trim((string)$tipoRaw), 'UTF-8');
    if ($tipo === '') {
        return 'principal';
    }

    $map = [
        'principal' => 'principal',
        'primario' => 'principal',
        'secundario' => 'secundario',
        'secundaria' => 'secundario',
        'presuntivo' => 'presuntivo',
        'presuntiva' => 'presuntivo',
        'definitivo' => 'definitivo',
        'definitiva' => 'definitivo',
    ];

    return $map[$tipo] ?? 'secundario';
}

function hc_sanitizar_diagnosticos($datos) {
    if (!is_array($datos) || !isset($datos['diagnosticos']) || !is_array($datos['diagnosticos'])) {
        return $datos;
    }

    $normalizados = [];
    foreach ($datos['diagnosticos'] as $item) {
        if (is_string($item)) {
            $texto = trim($item);
            if ($texto !== '') {
                $normalizados[] = $texto;
            }
            continue;
        }

        if (!is_array($item)) {
            continue;
        }

        $item['tipo'] = hc_normalizar_tipo_diagnostico($item['tipo'] ?? 'principal');
        $normalizados[] = $item;
    }

    $datos['diagnosticos'] = $normalizados;
    return $datos;
}

function hc_obtener_tarifa_consulta($conn, $medicoId) {
    $medicoId = intval($medicoId);
    if ($medicoId <= 0) {
        return null;
    }

    $stmt = $conn->prepare('SELECT id, precio_particular, descripcion FROM tarifas WHERE medico_id = ? AND servicio_tipo = "consulta" AND activo = 1 ORDER BY id DESC LIMIT 1');
    if (!$stmt) {
        return null;
    }
    $stmt->bind_param('i', $medicoId);
    $stmt->execute();
    $result = $stmt->get_result();
    $row = $result->fetch_assoc();
    $stmt->close();
    
    if ($row && isset($row['precio_particular'])) {
        return [
            'id' => (int)($row['id'] ?? 0),
            'precio' => round((float)$row['precio_particular'], 2),
            'descripcion' => trim((string)($row['descripcion'] ?? 'Consulta médica')),
        ];
    }

    // Fallback a tarifa general de consulta (sin médico específico).
    $stmt2 = $conn->prepare('SELECT id, precio_particular, descripcion FROM tarifas WHERE servicio_tipo = "consulta" AND activo = 1 AND (medico_id IS NULL OR medico_id = 0) ORDER BY id DESC LIMIT 1');
    if (!$stmt2) {
        return null;
    }
    $stmt2->execute();
    $row2 = $stmt2->get_result()->fetch_assoc();
    $stmt2->close();

    if ($row2 && isset($row2['precio_particular'])) {
        return [
            'id' => (int)($row2['id'] ?? 0),
            'precio' => round((float)$row2['precio_particular'], 2),
            'descripcion' => trim((string)($row2['descripcion'] ?? 'Consulta médica')),
        ];
    }

    return null;
}

function hc_crear_cotizacion_proxima_cita($conn, $pacienteId, $medicoId, $consultaId) {
    $pacienteId = intval($pacienteId);
    $medicoId = intval($medicoId);
    $consultaId = intval($consultaId);
    
    if ($pacienteId <= 0 || $medicoId <= 0 || $consultaId <= 0) {
        return null;
    }
    
    // Obtener tarifa de la consulta
    $tarifaInfo = hc_obtener_tarifa_consulta($conn, $medicoId);
    $tarifaId = (int)($tarifaInfo['id'] ?? 0);
    $tarifa = round((float)($tarifaInfo['precio'] ?? 0), 2);
    if ($tarifaId <= 0 || $tarifa <= 0) {
        // Si no hay tarifa, no crear cotización
        return null;
    }
    
    // Crear cotización
    $usuarioId = (int)($_SESSION['usuario']['id'] ?? 0);
    if ($usuarioId <= 0) {
        $usuarioId = 1;
    }

    $stmtCot = $conn->prepare('INSERT INTO cotizaciones (paciente_id, usuario_id, total, saldo_pendiente, estado, observaciones) VALUES (?, ?, ?, ?, "pendiente", ?)');
    if (!$stmtCot) {
        return null;
    }

    $obs = 'Cotización automática - Próxima cita desde Historia Clínica';
    $stmtCot->bind_param('iidds', $pacienteId, $usuarioId, $tarifa, $tarifa, $obs);
    $okCot = $stmtCot->execute();
    $cotizacionId = $okCot ? (int)$stmtCot->insert_id : 0;
    $stmtCot->close();
    
    if ($cotizacionId <= 0) {
        return null;
    }
    
    // Crear detalle de cotización
    $stmtDet = $conn->prepare('INSERT INTO cotizaciones_detalle (cotizacion_id, servicio_tipo, servicio_id, descripcion, cantidad, precio_unitario, subtotal, medico_id, consulta_id) VALUES (?, "consulta", ?, ?, 1, ?, ?, ?, ?)');
    if (!$stmtDet) {
        return null;
    }
    
    $servicioId = $medicoId;
    $desc = trim((string)($tarifaInfo['descripcion'] ?? 'Consulta médica'));
    $servicioId = $tarifaId;
    $stmtDet->bind_param('iisddii', $cotizacionId, $servicioId, $desc, $tarifa, $tarifa, $medicoId, $consultaId);
    $okDet = $stmtDet->execute();
    $stmtDet->close();
    
    if (!$okDet) {
        return null;
    }
    
    return [
        'cotizacion_id' => $cotizacionId,
        'total' => $tarifa,
        'estado' => 'pendiente'
    ];
}

function hc_asegurar_cotizacion_control($conn, $pacienteId, $medicoId, $consultaId) {
    $pacienteId = intval($pacienteId);
    $medicoId = intval($medicoId);
    $consultaId = intval($consultaId);

    if ($pacienteId <= 0 || $consultaId <= 0) {
        return null;
    }

    // Evitar duplicados: si ya existe cotización activa vinculada a la consulta, la reutiliza.
    $stmtExist = $conn->prepare(
        'SELECT cd.cotizacion_id FROM cotizaciones_detalle cd '
        . 'INNER JOIN cotizaciones ct ON ct.id = cd.cotizacion_id '
        . 'WHERE cd.consulta_id = ? AND LOWER(TRIM(ct.estado)) NOT IN ("anulado", "anulada") '
        . 'ORDER BY cd.cotizacion_id DESC LIMIT 1'
    );
    if ($stmtExist) {
        $stmtExist->bind_param('i', $consultaId);
        $stmtExist->execute();
        $rowExist = $stmtExist->get_result()->fetch_assoc();
        $stmtExist->close();

        if ($rowExist && intval($rowExist['cotizacion_id'] ?? 0) > 0) {
            $cotizacionId = intval($rowExist['cotizacion_id']);
            $stmtFix = $conn->prepare('UPDATE cotizaciones SET total = 0, saldo_pendiente = 0, estado = "CONTROL", observaciones = ? WHERE id = ? LIMIT 1');
            if ($stmtFix) {
                $obs = 'Cotización automática CONTROL (sin costo) - Próxima cita desde Historia Clínica';
                $stmtFix->bind_param('si', $obs, $cotizacionId);
                $stmtFix->execute();
                $stmtFix->close();
            }

            return [
                'cotizacion_id' => $cotizacionId,
                'total' => 0.0,
                'estado' => 'CONTROL',
            ];
        }
    }

    $usuarioId = (int)($_SESSION['usuario']['id'] ?? 0);
    if ($usuarioId <= 0) {
        $usuarioId = 1;
    }

    $stmtCot = $conn->prepare('INSERT INTO cotizaciones (paciente_id, usuario_id, total, saldo_pendiente, estado, observaciones) VALUES (?, ?, 0, 0, "CONTROL", ?)');
    if (!$stmtCot) {
        return null;
    }

    $obs = 'Cotización automática CONTROL (sin costo) - Próxima cita desde Historia Clínica';
    $stmtCot->bind_param('iis', $pacienteId, $usuarioId, $obs);
    $okCot = $stmtCot->execute();
    $cotizacionId = $okCot ? (int)$stmtCot->insert_id : 0;
    $stmtCot->close();

    if ($cotizacionId <= 0) {
        return null;
    }

    $servicioId = $medicoId > 0 ? $medicoId : 0;
    $descripcion = 'Consulta de control (sin costo)';
    $stmtDet = $conn->prepare('INSERT INTO cotizaciones_detalle (cotizacion_id, servicio_tipo, servicio_id, descripcion, cantidad, precio_unitario, subtotal, medico_id, consulta_id) VALUES (?, "consulta", ?, ?, 1, 0, 0, ?, ?)');
    if (!$stmtDet) {
        return null;
    }
    $stmtDet->bind_param('iisii', $cotizacionId, $servicioId, $descripcion, $medicoId, $consultaId);
    $okDet = $stmtDet->execute();
    $stmtDet->close();

    if (!$okDet) {
        return null;
    }

    return [
        'cotizacion_id' => $cotizacionId,
        'total' => 0.0,
        'estado' => 'CONTROL',
    ];
}

function hc_estado_proxima_cita($conn) {
    $valorDeseado = 'falta_cancelar';

    $stmt = $conn->prepare('SELECT data_type, column_type, character_maximum_length FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1');
    if (!$stmt) {
        return 'pendiente';
    }

    $tabla = 'consultas';
    $columna = 'estado';
    $stmt->bind_param('ss', $tabla, $columna);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$row) {
        return 'pendiente';
    }

    $dataType = strtolower((string)($row['data_type'] ?? ''));
    $columnType = strtolower((string)($row['column_type'] ?? ''));
    $maxLen = isset($row['character_maximum_length']) ? (int)$row['character_maximum_length'] : 0;

    if ($dataType === 'enum' && strpos($columnType, "'" . $valorDeseado . "'") === false) {
        return 'pendiente';
    }

    if (($dataType === 'varchar' || $dataType === 'char') && $maxLen > 0 && strlen($valorDeseado) > $maxLen) {
        return 'pendiente';
    }

    if ($dataType !== 'enum' && $dataType !== 'varchar' && $dataType !== 'char') {
        return 'pendiente';
    }

    return $valorDeseado;
}

function hc_ensure_consultas_estado_falta_cancelar($conn) {
    $res = $conn->query("SHOW COLUMNS FROM consultas LIKE 'estado'");
    if (!$res || $res->num_rows === 0) {
        return;
    }

    $row = $res->fetch_assoc();
    $type = strtolower((string)($row['Type'] ?? ''));
    if (strpos($type, 'enum(') !== 0) {
        return;
    }

    if (strpos($type, "'falta_cancelar'") !== false) {
        return;
    }

    $sql = "ALTER TABLE consultas MODIFY COLUMN estado ENUM('pendiente','falta_cancelar','completada','cancelada') DEFAULT 'pendiente'";
    $conn->query($sql);
}

function hc_ensure_consultas_hc_origen_column($conn) {
    $exists = $conn->query("SHOW COLUMNS FROM consultas LIKE 'hc_origen_id'");
    if ($exists && $exists->num_rows === 0) {
        $conn->query("ALTER TABLE consultas ADD COLUMN hc_origen_id INT NULL COMMENT 'ID de la Historia Clínica origen si vino de próxima cita'");
        $conn->query('ALTER TABLE consultas ADD INDEX idx_hc_origen (hc_origen_id)');
    }
}

function hc_ensure_consultas_origen_creacion_column($conn) {
    $exists = $conn->query("SHOW COLUMNS FROM consultas LIKE 'origen_creacion'");
    if ($exists && $exists->num_rows === 0) {
        $conn->query("ALTER TABLE consultas ADD COLUMN origen_creacion VARCHAR(20) NOT NULL DEFAULT 'agendada' COMMENT 'Origen del flujo: agendada|cotizador|hc_proxima'");
        $conn->query('ALTER TABLE consultas ADD INDEX idx_origen_creacion (origen_creacion)');
    }

    $conn->query(
        "UPDATE consultas c
         SET c.origen_creacion = CASE
             WHEN c.hc_origen_id IS NOT NULL AND c.hc_origen_id > 0 THEN 'hc_proxima'
             WHEN EXISTS (
                 SELECT 1 FROM cotizaciones_detalle cd
                 INNER JOIN cotizaciones ct ON ct.id = cd.cotizacion_id
                 WHERE cd.consulta_id = c.id AND ct.estado <> 'anulado'
                 LIMIT 1
             ) THEN 'cotizador'
             ELSE 'agendada'
         END
         WHERE c.origen_creacion IS NULL
            OR TRIM(c.origen_creacion) = ''
            OR c.origen_creacion NOT IN ('agendada', 'cotizador', 'hc_proxima')"
    );

    // Compatibilidad histórica: normalizar hc_origen_id legado cuando fue guardado como consulta_id.
    // Si hc_origen_id no existe como historia_clinica.id pero sí coincide con historia_clinica.consulta_id,
    // se reemplaza por el id real de historia_clinica.
    $conn->query(
        "UPDATE consultas c
         LEFT JOIN historia_clinica h_by_id ON h_by_id.id = c.hc_origen_id
         LEFT JOIN historia_clinica h_by_consulta ON h_by_consulta.consulta_id = c.hc_origen_id
         SET c.hc_origen_id = h_by_consulta.id
         WHERE c.hc_origen_id IS NOT NULL
           AND c.hc_origen_id > 0
           AND h_by_id.id IS NULL
           AND h_by_consulta.id IS NOT NULL"
    );
}

function hc_ensure_consultas_es_control_column($conn) {
    $exists = $conn->query("SHOW COLUMNS FROM consultas LIKE 'es_control'");
    if ($exists && $exists->num_rows === 0) {
        $conn->query("ALTER TABLE consultas ADD COLUMN es_control TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = cita de control sin costo'");
        $conn->query('ALTER TABLE consultas ADD INDEX idx_es_control (es_control)');
    }
}

function hc_consultas_has_es_control_column($conn) {
    $exists = $conn->query("SHOW COLUMNS FROM consultas LIKE 'es_control'");
    return $exists && $exists->num_rows > 0;
}

function hc_programar_proxima_cita($conn, $consultaIdActual, $proximaData, $hcOrigenIdActual = 0) {
    if (!is_array($proximaData)) {
        return null;
    }

    $programar = (bool)($proximaData['programar'] ?? false);
    if (!$programar) {
        return null;
    }

    hc_ensure_consultas_hc_origen_column($conn);
    hc_ensure_consultas_estado_falta_cancelar($conn);
    hc_ensure_consultas_origen_creacion_column($conn);
    hc_ensure_consultas_es_control_column($conn);
    $hasEsControlColumn = hc_consultas_has_es_control_column($conn);

    $fecha = trim((string)($proximaData['fecha'] ?? ''));
    $hora = hc_normalizar_hora($proximaData['hora'] ?? '');
    if ($fecha === '' || $hora === '') {
        throw new Exception('La próxima cita requiere fecha y hora');
    }

    $stmtBase = $conn->prepare('SELECT paciente_id, medico_id FROM consultas WHERE id = ? LIMIT 1');
    if (!$stmtBase) {
        throw new Exception('No se pudo preparar la validación de consulta base');
    }
    $stmtBase->bind_param('i', $consultaIdActual);
    $stmtBase->execute();
    $base = $stmtBase->get_result()->fetch_assoc();
    $stmtBase->close();

    if (!$base) {
        throw new Exception('No se encontró la consulta actual para programar la próxima cita');
    }

    $pacienteId = (int)($base['paciente_id'] ?? 0);
    $medicoIdDefault = (int)($base['medico_id'] ?? 0);
    $medicoId = (int)($proximaData['medico_id'] ?? $medicoIdDefault);
    if ($medicoId <= 0) {
        $medicoId = $medicoIdDefault;
    }

    $tipoConsulta = trim((string)($proximaData['tipo_consulta'] ?? 'programada'));
    if ($tipoConsulta === '') {
        $tipoConsulta = 'programada';
    }

    $consultaProgramadaId = (int)($proximaData['consulta_id'] ?? 0);
    $hcOrigenIdActual = (int)$hcOrigenIdActual;
    if ($hcOrigenIdActual <= 0) {
        // Fallback defensivo: si no llega explícito, intentar resolver por consulta actual.
        $stmtHc = $conn->prepare('SELECT id FROM historia_clinica WHERE consulta_id = ? LIMIT 1');
        if ($stmtHc) {
            $stmtHc->bind_param('i', $consultaIdActual);
            $stmtHc->execute();
            $rowHc = $stmtHc->get_result()->fetch_assoc();
            $stmtHc->close();
            $hcOrigenIdActual = (int)($rowHc['id'] ?? 0);
        }
    }
    // Usar estado de cobro solo si el esquema lo soporta (evita "Data truncated for column estado").
    $estadoFaltaCancelar = hc_estado_proxima_cita($conn);
    $esControl = !empty($proximaData['es_control']) ? 1 : 0;
    $estadoProgramado = $esControl === 1 ? 'pendiente' : $estadoFaltaCancelar;
    
    if ($consultaProgramadaId > 0) {
        $stmtUpd = $hasEsControlColumn
            ? $conn->prepare('UPDATE consultas SET paciente_id = ?, medico_id = ?, fecha = ?, hora = ?, tipo_consulta = ?, estado = ?, hc_origen_id = ?, origen_creacion = ?, es_control = ? WHERE id = ? LIMIT 1')
            : $conn->prepare('UPDATE consultas SET paciente_id = ?, medico_id = ?, fecha = ?, hora = ?, tipo_consulta = ?, estado = ?, hc_origen_id = ?, origen_creacion = ? WHERE id = ? LIMIT 1');
        if (!$stmtUpd) {
            throw new Exception('No se pudo preparar la actualización de próxima cita');
        }
        $hcOrigenId = $hcOrigenIdActual;
        $origenCreacion = 'hc_proxima';
        if ($hasEsControlColumn) {
            $stmtUpd->bind_param('iissssisii', $pacienteId, $medicoId, $fecha, $hora, $tipoConsulta, $estadoProgramado, $hcOrigenId, $origenCreacion, $esControl, $consultaProgramadaId);
        } else {
            $stmtUpd->bind_param('iissssisi', $pacienteId, $medicoId, $fecha, $hora, $tipoConsulta, $estadoProgramado, $hcOrigenId, $origenCreacion, $consultaProgramadaId);
        }
        $stmtUpd->execute();
        $stmtUpd->close();
    } else {
        $stmtFind = $conn->prepare('SELECT id FROM consultas WHERE paciente_id = ? AND medico_id = ? AND fecha = ? AND hora = ? AND estado IN ("pendiente", "falta_cancelar") LIMIT 1');
        if (!$stmtFind) {
            throw new Exception('No se pudo preparar la búsqueda de próxima cita existente');
        }
        $stmtFind->bind_param('iiss', $pacienteId, $medicoId, $fecha, $hora);
        $stmtFind->execute();
        $found = $stmtFind->get_result()->fetch_assoc();
        $stmtFind->close();

        if ($found) {
            $consultaProgramadaId = (int)($found['id'] ?? 0);

            $stmtUpdFound = $hasEsControlColumn
                ? $conn->prepare('UPDATE consultas SET paciente_id = ?, medico_id = ?, fecha = ?, hora = ?, tipo_consulta = ?, estado = ?, hc_origen_id = ?, origen_creacion = ?, es_control = ? WHERE id = ? LIMIT 1')
                : $conn->prepare('UPDATE consultas SET paciente_id = ?, medico_id = ?, fecha = ?, hora = ?, tipo_consulta = ?, estado = ?, hc_origen_id = ?, origen_creacion = ? WHERE id = ? LIMIT 1');
            if (!$stmtUpdFound) {
                throw new Exception('No se pudo preparar la actualización de próxima cita existente');
            }
            $hcOrigenId = $hcOrigenIdActual;
            $origenCreacion = 'hc_proxima';
            if ($hasEsControlColumn) {
                $stmtUpdFound->bind_param('iissssisii', $pacienteId, $medicoId, $fecha, $hora, $tipoConsulta, $estadoProgramado, $hcOrigenId, $origenCreacion, $esControl, $consultaProgramadaId);
            } else {
                $stmtUpdFound->bind_param('iissssisi', $pacienteId, $medicoId, $fecha, $hora, $tipoConsulta, $estadoProgramado, $hcOrigenId, $origenCreacion, $consultaProgramadaId);
            }
            $stmtUpdFound->execute();
            $stmtUpdFound->close();
        } else {
            // NUEVO: Insertar con estado='falta_cancelar' y hc_origen_id
            $stmtIns = $hasEsControlColumn
                ? $conn->prepare('INSERT INTO consultas (paciente_id, medico_id, fecha, hora, tipo_consulta, estado, hc_origen_id, origen_creacion, es_control) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
                : $conn->prepare('INSERT INTO consultas (paciente_id, medico_id, fecha, hora, tipo_consulta, estado, hc_origen_id, origen_creacion) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
            if (!$stmtIns) {
                throw new Exception('No se pudo preparar la creación de próxima cita');
            }
            $hcOrigenId = $hcOrigenIdActual;
            $origenCreacion = 'hc_proxima';
            if ($hasEsControlColumn) {
                $stmtIns->bind_param('iissssisi', $pacienteId, $medicoId, $fecha, $hora, $tipoConsulta, $estadoProgramado, $hcOrigenId, $origenCreacion, $esControl);
            } else {
                $stmtIns->bind_param('iissssis', $pacienteId, $medicoId, $fecha, $hora, $tipoConsulta, $estadoProgramado, $hcOrigenId, $origenCreacion);
            }
            $okIns = $stmtIns->execute();
            $consultaProgramadaId = $okIns ? (int)$stmtIns->insert_id : 0;
            $stmtIns->close();
            if (!$okIns || $consultaProgramadaId <= 0) {
                throw new Exception('No se pudo registrar la próxima cita');
            }
        }
    }

    $cotizacionControl = null;
    if ($esControl === 1 && $consultaProgramadaId > 0) {
        $cotizacionControl = hc_asegurar_cotizacion_control($conn, $pacienteId, $medicoId, $consultaProgramadaId);
    }
    
    return [
        'consulta_id' => $consultaProgramadaId,
        'fecha' => $fecha,
        'hora' => $hora,
        'medico_id' => $medicoId,
        'tipo_consulta' => $tipoConsulta,
        'estado' => $estadoProgramado,
        'es_control' => $esControl,
        'cotizacion_control' => $cotizacionControl,
        'hc_origen_id' => $hcOrigenIdActual,
    ];
}

// ============================================================
// CADENA CLINICA: resolver nodo padre canonico
// ============================================================

/**
 * Dado el hc_id de la HC recien guardada (nodo actual), resuelve:
 * - hc_parent_id: ultima HC ejecutada del mismo contrato/agenda o por hc_origen_id
 * - hc_root_id:   raiz de la cadena
 * - chain_depth:  profundidad del nodo
 * - contrato_paciente_id / agenda_contrato_id: contexto contrato si aplica
 *
 * No lanza excepciones; si algo falla devuelve null para no interrumpir el guardado.
 */
function hc_resolver_parent_canonico($conn, $hcId, $consultaId) {
    $hcId      = (int)$hcId;
    $consultaId = (int)$consultaId;
    if ($hcId <= 0 || $consultaId <= 0) return null;

    // 1. Leer contexto de la consulta actual
    $stmtC = $conn->prepare(
        'SELECT paciente_id, medico_id, fecha, hc_origen_id FROM consultas WHERE id = ? LIMIT 1'
    );
    if (!$stmtC) return null;
    $stmtC->bind_param('i', $consultaId);
    $stmtC->execute();
    $consulta = $stmtC->get_result()->fetch_assoc();
    $stmtC->close();
    if (!$consulta) return null;

    $pacienteId  = (int)($consulta['paciente_id'] ?? 0);
    $hcOrigenId  = (int)($consulta['hc_origen_id'] ?? 0);
    $fechaActual = (string)($consulta['fecha'] ?? '');

    // 2. Intentar vincular con agenda_contrato (evento ejecutado en esta consulta)
    $contratoPacienteId  = 0;
    $agendaContratoId    = 0;
    $stmtAg = $conn->prepare(
        'SELECT id, contrato_paciente_id FROM agenda_contrato WHERE consulta_id = ? LIMIT 1'
    );
    if ($stmtAg) {
        $stmtAg->bind_param('i', $consultaId);
        $stmtAg->execute();
        $ag = $stmtAg->get_result()->fetch_assoc();
        $stmtAg->close();
        if ($ag) {
            $agendaContratoId   = (int)($ag['id'] ?? 0);
            $contratoPacienteId = (int)($ag['contrato_paciente_id'] ?? 0);
        }
    }

    // 3. Resolver parent
    $parentHcId = 0;

    // 3a. Si viene de proxima cita de HC anterior → hc_origen_id almacena consultas.id del evento padre
    //     (normalización canónica: hc_origen_id es siempre consultas.id, nunca historia_clinica.id).
    //     Buscamos la HC cuya consulta_id coincida con hc_origen_id.
    if ($hcOrigenId > 0) {
        $stmtP = $conn->prepare('SELECT id FROM historia_clinica WHERE consulta_id = ? LIMIT 1');
        if ($stmtP) {
            $stmtP->bind_param('i', $hcOrigenId);
            $stmtP->execute();
            $rP = $stmtP->get_result()->fetch_assoc();
            $stmtP->close();
            $candidato = (int)($rP['id'] ?? 0);
            if ($candidato > 0 && $candidato !== $hcId) {
                $parentHcId = $candidato;
            }
        }
    }

    // 3b. Si viene de contrato y no hay parent aun, buscar ultima HC del mismo contrato
    //     con fecha anterior a la actual (ultimo nodo ejecutado en la cadena)
    if ($parentHcId <= 0 && $contratoPacienteId > 0) {
        $stmtLast = $conn->prepare(
            'SELECT h.id
             FROM historia_clinica h
             INNER JOIN consultas c ON c.id = h.consulta_id
             INNER JOIN agenda_contrato ag ON ag.consulta_id = c.id
             WHERE ag.contrato_paciente_id = ?
               AND h.id != ?
               AND h.chain_status != ?
               AND (c.fecha < ? OR (c.fecha = ? AND h.id < ?))
             ORDER BY c.fecha DESC, h.id DESC
             LIMIT 1'
        );
        if ($stmtLast) {
            $anulada = 'anulada';
            $stmtLast->bind_param(
                'iisssi',
                $contratoPacienteId,
                $hcId,
                $anulada,
                $fechaActual, $fechaActual, $hcId
            );
            $stmtLast->execute();
            $rLast = $stmtLast->get_result()->fetch_assoc();
            $stmtLast->close();
            if ($rLast) $parentHcId = (int)($rLast['id'] ?? 0);
        }
    }

    // 4. Resolver root y depth a partir del parent
    $rootHcId   = $hcId;    // por defecto es raiz de si mismo
    $chainDepth = 0;
    if ($parentHcId > 0 && $parentHcId !== $hcId) {
        $stmtPar = $conn->prepare(
            'SELECT hc_root_id, chain_depth FROM historia_clinica WHERE id = ? LIMIT 1'
        );
        if ($stmtPar) {
            $stmtPar->bind_param('i', $parentHcId);
            $stmtPar->execute();
            $rPar = $stmtPar->get_result()->fetch_assoc();
            $stmtPar->close();
            if ($rPar) {
                $rootHcId   = (int)($rPar['hc_root_id'] ?? 0) > 0
                    ? (int)$rPar['hc_root_id']
                    : $parentHcId;
                $chainDepth = (int)($rPar['chain_depth'] ?? 0) + 1;
            }
        }
    }

    return [
        'hc_parent_id'        => $parentHcId > 0 ? $parentHcId : null,
        'hc_root_id'          => $rootHcId,
        'chain_depth'         => $chainDepth,
        'contrato_paciente_id'=> $contratoPacienteId > 0 ? $contratoPacienteId : null,
        'agenda_contrato_id'  => $agendaContratoId > 0 ? $agendaContratoId : null,
    ];
}

/**
 * Persiste los campos de cadena en historia_clinica para el nodo dado.
 * Solo actualiza si la columna hc_parent_id existe (migración 18 aplicada).
 * Silencia errores para no interrumpir el guardado principal.
 */
function hc_actualizar_cadena_hc($conn, $hcId, $consultaId) {
    $hcId = (int)$hcId;
    if ($hcId <= 0) return;

    // Verificar que la migración 18 fue aplicada
    $chk = $conn->query("SHOW COLUMNS FROM historia_clinica LIKE 'hc_parent_id'");
    if (!$chk || $chk->num_rows === 0) return;

    $cadena = hc_resolver_parent_canonico($conn, $hcId, $consultaId);
    if (!is_array($cadena)) return;

    $parentId    = $cadena['hc_parent_id'];
    $rootId      = (int)($cadena['hc_root_id'] ?? $hcId);
    $depth       = (int)($cadena['chain_depth'] ?? 0);
    $contratoId  = $cadena['contrato_paciente_id'];
    $agendaId    = $cadena['agenda_contrato_id'];

    $stmt = $conn->prepare(
        'UPDATE historia_clinica
         SET hc_parent_id        = ?,
             hc_root_id          = ?,
             chain_depth         = ?,
             contrato_paciente_id= ?,
             agenda_contrato_id  = ?,
             updated_seq         = updated_seq + 1
         WHERE id = ? LIMIT 1'
    );
    if (!$stmt) return;
    $stmt->bind_param('iiiiii', $parentId, $rootId, $depth, $contratoId, $agendaId, $hcId);
    $stmt->execute();
    $stmt->close();
}

/**
 * Al guardar la HC de la consulta actual (consulta_id_actual), busca en agenda_contrato
 * el evento inmediatamente siguiente del mismo contrato que ya tenga una consulta asignada
 * y cuya consulta aún tenga hc_origen_id = 0 o NULL.
 * En ese caso actualiza esa consulta para que hc_origen_id = consulta_id_actual,
 * cerrando el timing gap que ocurre cuando el contrato programó el evento B antes de
 * que la HC de A existiera.
 */
function hc_retrovincular_siguiente_evento_contrato($conn, $consultaIdActual) {
    $consultaIdActual = (int)$consultaIdActual;
    if ($consultaIdActual <= 0) return;

    // Verificar que agenda_contrato existe
    $chk = $conn->query("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'agenda_contrato' LIMIT 1");
    if (!$chk || $chk->num_rows === 0) return;

    // Obtener fecha y contrato_paciente_id del evento actual
    $stmtSelf = $conn->prepare(
        'SELECT ag.id AS evento_id, ag.contrato_paciente_id, ag.fecha_programada
         FROM agenda_contrato ag
         WHERE ag.consulta_id = ?
         LIMIT 1'
    );
    if (!$stmtSelf) return;
    $stmtSelf->bind_param('i', $consultaIdActual);
    $stmtSelf->execute();
    $self = $stmtSelf->get_result()->fetch_assoc();
    $stmtSelf->close();

    if (!$self) return;

    $contratoPacienteId = (int)($self['contrato_paciente_id'] ?? 0);
    $eventoActualId     = (int)($self['evento_id'] ?? 0);
    $fechaActual        = (string)($self['fecha_programada'] ?? '');
    if ($contratoPacienteId <= 0 || $eventoActualId <= 0 || $fechaActual === '') return;

    // Buscar el evento siguiente del mismo contrato con consulta asignada
    $stmtNext = $conn->prepare(
        'SELECT ag.consulta_id
         FROM agenda_contrato ag
         WHERE ag.contrato_paciente_id = ?
           AND ag.id <> ?
           AND ag.consulta_id IS NOT NULL
           AND ag.consulta_id > 0
           AND (ag.fecha_programada > ? OR (ag.fecha_programada = ? AND ag.id > ?))
         ORDER BY ag.fecha_programada ASC, ag.id ASC
         LIMIT 1'
    );
    if (!$stmtNext) return;
    $stmtNext->bind_param('iissi', $contratoPacienteId, $eventoActualId, $fechaActual, $fechaActual, $eventoActualId);
    $stmtNext->execute();
    $next = $stmtNext->get_result()->fetch_assoc();
    $stmtNext->close();

    $consultaIdSiguiente = (int)($next['consulta_id'] ?? 0);
    if ($consultaIdSiguiente <= 0 || $consultaIdSiguiente === $consultaIdActual) return;

    // Solo actualizar si hc_origen_id aún no apunta al nodo correcto
    $stmtUpd = $conn->prepare(
        'UPDATE consultas
         SET hc_origen_id = ?,
             origen_creacion = CASE WHEN origen_creacion IN ("contrato_agenda", "agendada", "") OR origen_creacion IS NULL THEN "hc_proxima" ELSE origen_creacion END
         WHERE id = ?
           AND (hc_origen_id IS NULL OR hc_origen_id = 0 OR hc_origen_id <> ?)
         LIMIT 1'
    );
    if (!$stmtUpd) return;
    $stmtUpd->bind_param('iii', $consultaIdActual, $consultaIdSiguiente, $consultaIdActual);
    $stmtUpd->execute();
    $stmtUpd->close();
}

/**
 * Para el GET de HC: resuelve si la consulta actual pertenece a un contrato y si
 * tiene un evento siguiente programado. Devuelve los datos del próximo evento
 * para que el frontend pueda pre-activar la sección "Próxima cita" sin esperar
 * el guardado manual del médico.
 */
function hc_resolver_proxima_cita_contrato($conn, $consultaId) {
    $consultaId = (int)$consultaId;
    if ($consultaId <= 0) return null;

    $chk = $conn->query("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'agenda_contrato' LIMIT 1");
    if (!$chk || $chk->num_rows === 0) return null;

    // Obtener el evento actual y su contrato
    $stmtSelf = $conn->prepare(
        'SELECT ag.id AS evento_id, ag.contrato_paciente_id, ag.fecha_programada
         FROM agenda_contrato ag
         WHERE ag.consulta_id = ?
         LIMIT 1'
    );
    if (!$stmtSelf) return null;
    $stmtSelf->bind_param('i', $consultaId);
    $stmtSelf->execute();
    $self = $stmtSelf->get_result()->fetch_assoc();
    $stmtSelf->close();
    if (!$self) return null;

    $contratoPacienteId = (int)($self['contrato_paciente_id'] ?? 0);
    $eventoActualId     = (int)($self['evento_id'] ?? 0);
    $fechaActual        = (string)($self['fecha_programada'] ?? '');
    if ($contratoPacienteId <= 0 || $eventoActualId <= 0 || $fechaActual === '') return null;

    // Buscar el siguiente evento con consulta ya asignada
    $stmtNext = $conn->prepare(
        'SELECT ag.consulta_id, ag.fecha_programada,
                c.medico_id, c.es_control
         FROM agenda_contrato ag
         INNER JOIN consultas c ON c.id = ag.consulta_id
         WHERE ag.contrato_paciente_id = ?
           AND ag.id <> ?
           AND ag.consulta_id IS NOT NULL
           AND ag.consulta_id > 0
           AND (ag.fecha_programada > ? OR (ag.fecha_programada = ? AND ag.id > ?))
         ORDER BY ag.fecha_programada ASC, ag.id ASC
         LIMIT 1'
    );
    if (!$stmtNext) return null;
    $stmtNext->bind_param('iissi', $contratoPacienteId, $eventoActualId, $fechaActual, $fechaActual, $eventoActualId);
    $stmtNext->execute();
    $next = $stmtNext->get_result()->fetch_assoc();
    $stmtNext->close();
    if (!$next) return null;

    $fechaProg    = (string)($next['fecha_programada'] ?? '');
    $fechaSolo    = strlen($fechaProg) >= 10 ? substr($fechaProg, 0, 10) : $fechaProg;
    $horaSolo     = strlen($fechaProg) >= 16 ? substr($fechaProg, 11, 5) : '00:00';

    return [
        'consulta_id'        => (int)($next['consulta_id'] ?? 0),
        'fecha'              => $fechaSolo,
        'hora'               => $horaSolo,
        'medico_id'          => (int)($next['medico_id'] ?? 0),
        'es_control'         => (int)($next['es_control'] ?? 1) === 1,
        'origen'             => 'contrato_agenda',
        'contrato_paciente_id' => $contratoPacienteId,
    ];
}

function hc_bool_query_param($key, $default = false) {
    if (!isset($_GET[$key])) return $default;
    $raw = strtolower(trim((string)$_GET[$key]));
    return in_array($raw, ['1', 'true', 'yes', 'on'], true);
}

function hc_base_url() {
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    return $scheme . '://' . $_SERVER['HTTP_HOST'] . rtrim(dirname($_SERVER['SCRIPT_NAME']), '/\\') . '/';
}

function hc_table_exists($conn, $tableName) {
    $stmt = $conn->prepare('SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1');
    if (!$stmt) return false;
    $stmt->bind_param('s', $tableName);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_row();
    $stmt->close();
    return !empty($row);
}

function hc_get_consulta_meta($conn, $consultaId) {
    $consultaId = (int)$consultaId;
    if ($consultaId <= 0) return null;

    $stmt = $conn->prepare('SELECT id, paciente_id, fecha, hora, medico_id, hc_origen_id FROM consultas WHERE id = ? LIMIT 1');
    if (!$stmt) return null;
    $stmt->bind_param('i', $consultaId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row ?: null;
}

function hc_get_hc_row_resolved($conn, $hcRef) {
    $hcRef = (int)$hcRef;
    if ($hcRef <= 0) return null;

    $stmt = $conn->prepare('SELECT id, consulta_id, datos, fecha_registro FROM historia_clinica WHERE id = ? LIMIT 1');
    if (!$stmt) return null;
    $stmt->bind_param('i', $hcRef);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if ($row) {
        $row['_resolved_by'] = 'hc_id';
        return $row;
    }

    // Compatibilidad histórica: hc_origen_id antiguo pudo guardar consulta_id.
    $stmtLegacy = $conn->prepare('SELECT id, consulta_id, datos, fecha_registro FROM historia_clinica WHERE consulta_id = ? LIMIT 1');
    if (!$stmtLegacy) return null;
    $stmtLegacy->bind_param('i', $hcRef);
    $stmtLegacy->execute();
    $legacyRow = $stmtLegacy->get_result()->fetch_assoc();
    $stmtLegacy->close();

    if ($legacyRow) {
        $legacyRow['_resolved_by'] = 'consulta_id_legacy';
    }
    return $legacyRow ?: null;
}

function hc_guess_file_kind($mime, $filename = '') {
    $mime = strtolower(trim((string)$mime));
    $filename = strtolower(trim((string)$filename));

    if (strpos($mime, 'image/') === 0) return 'imagen';
    if ($mime === 'application/pdf') return 'pdf';
    if (preg_match('/\.(png|jpg|jpeg|gif|webp|bmp)$/', $filename)) return 'imagen';
    if (preg_match('/\.pdf$/', $filename)) return 'pdf';
    return 'archivo';
}

function hc_get_adjuntos_por_consulta($conn, $consultaId, $baseUrl) {
    $consultaId = (int)$consultaId;
    if ($consultaId <= 0) return [];

    $hasOrdenesLab = hc_table_exists($conn, 'ordenes_laboratorio');
    $hasDocsPac = hc_table_exists($conn, 'documentos_externos_paciente');
    $hasDocsArc = hc_table_exists($conn, 'documentos_externos_archivos');
    if (!$hasOrdenesLab || !$hasDocsPac || !$hasDocsArc) {
        return [];
    }

    // Esta fuente corresponde a resultados/adjuntos externos ligados a la consulta.
    $sql = 'SELECT
                dep.id AS documento_id,
                dep.tipo,
                dep.titulo,
                dep.descripcion,
                dep.fecha AS documento_fecha,
                dep.orden_id,
                dea.id AS archivo_id,
                dea.nombre_original,
                dea.mime_type,
                dea.tamano
            FROM documentos_externos_paciente dep
            INNER JOIN documentos_externos_archivos dea ON dea.documento_id = dep.id
            WHERE (
                dep.orden_id IN (SELECT id FROM ordenes_laboratorio WHERE consulta_id = ?)
                OR dep.cotizacion_id IN (
                    SELECT cotizacion_id FROM ordenes_laboratorio WHERE consulta_id = ? AND cotizacion_id IS NOT NULL
                )
            )
            ORDER BY dep.fecha DESC, dep.id DESC, dea.id ASC';

    $stmt = $conn->prepare($sql);
    if (!$stmt) return [];
    $stmt->bind_param('ii', $consultaId, $consultaId);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();

    if (empty($rows)) return [];

    $bucket = [];
    foreach ($rows as $row) {
        $docId = (int)($row['documento_id'] ?? 0);
        if ($docId <= 0) continue;

        if (!isset($bucket[$docId])) {
            $bucket[$docId] = [
                'documento_id' => $docId,
                'tipo' => (string)($row['tipo'] ?? ''),
                'titulo' => (string)($row['titulo'] ?? ''),
                'descripcion' => (string)($row['descripcion'] ?? ''),
                'fecha' => (string)($row['documento_fecha'] ?? ''),
                'orden_id' => (int)($row['orden_id'] ?? 0),
                'archivos' => [],
            ];
        }

        $archivoId = (int)($row['archivo_id'] ?? 0);
        if ($archivoId <= 0) continue;

        $mime = (string)($row['mime_type'] ?? 'application/octet-stream');
        $nombre = (string)($row['nombre_original'] ?? 'archivo');
        $bucket[$docId]['archivos'][] = [
            'archivo_id' => $archivoId,
            'nombre_original' => $nombre,
            'mime_type' => $mime,
            'tamano' => (int)($row['tamano'] ?? 0),
            'kind' => hc_guess_file_kind($mime, $nombre),
            'url' => $baseUrl . 'api_resultados_laboratorio.php?action=view_archivo&consulta_id=' . $consultaId . '&archivo_id=' . $archivoId,
        ];
    }

    return array_values($bucket);
}

function hc_get_apoyo_resumen_por_consultas($conn, $consultaIds) {
    $ids = array_values(array_unique(array_filter(array_map('intval', (array)$consultaIds), function ($id) {
        return $id > 0;
    })));

    if (empty($ids)) {
        return [];
    }

    $resumen = [];
    foreach ($ids as $cid) {
        $resumen[$cid] = [
            'laboratorio' => [
                'has_resultados' => false,
                'ordenes' => 0,
                'resultados' => 0,
                'documentos' => 0,
                'consulta_id' => $cid,
                'target' => '/resultados-laboratorio/' . $cid,
            ],
            'ecografia' => [
                'has_resultados' => false,
                'ordenes' => 0,
                'archivos' => 0,
                'ultima_orden_id' => null,
                'target' => null,
            ],
        ];
    }

    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $types = str_repeat('i', count($ids));
    $hasOrdenesLab = hc_table_exists($conn, 'ordenes_laboratorio');
    $hasResultadosLab = hc_table_exists($conn, 'resultados_laboratorio');
    $hasDocsPac = hc_table_exists($conn, 'documentos_externos_paciente');
    $hasDocsArc = hc_table_exists($conn, 'documentos_externos_archivos');
    $hasOrdenesImg = hc_table_exists($conn, 'ordenes_imagen');
    $hasOrdenesImgArch = hc_table_exists($conn, 'ordenes_imagen_archivos');

    // Resumen de órdenes de laboratorio por consulta.
    if ($hasOrdenesLab) {
        $stmtOrdenesLab = $conn->prepare(
            "SELECT consulta_id, COUNT(*) AS total_ordenes
             FROM ordenes_laboratorio
             WHERE consulta_id IN ($placeholders)
             GROUP BY consulta_id"
        );
        if ($stmtOrdenesLab) {
            $stmtOrdenesLab->bind_param($types, ...$ids);
            $stmtOrdenesLab->execute();
            $rows = $stmtOrdenesLab->get_result()->fetch_all(MYSQLI_ASSOC);
            $stmtOrdenesLab->close();
            foreach ($rows as $row) {
                $cid = (int)($row['consulta_id'] ?? 0);
                if ($cid > 0 && isset($resumen[$cid])) {
                    $resumen[$cid]['laboratorio']['ordenes'] = (int)($row['total_ordenes'] ?? 0);
                }
            }
        }
    }

    // Resultados de laboratorio por consulta directa.
    if ($hasResultadosLab) {
        $stmtResultadosLab = $conn->prepare(
            "SELECT consulta_id, COUNT(*) AS total_resultados
             FROM resultados_laboratorio
             WHERE consulta_id IN ($placeholders)
             GROUP BY consulta_id"
        );
        if ($stmtResultadosLab) {
            $stmtResultadosLab->bind_param($types, ...$ids);
            $stmtResultadosLab->execute();
            $rows = $stmtResultadosLab->get_result()->fetch_all(MYSQLI_ASSOC);
            $stmtResultadosLab->close();
            foreach ($rows as $row) {
                $cid = (int)($row['consulta_id'] ?? 0);
                if ($cid > 0 && isset($resumen[$cid])) {
                    $resumen[$cid]['laboratorio']['resultados'] += (int)($row['total_resultados'] ?? 0);
                }
            }
        }

        // Resultados asociados por orden_id sin duplicar los que ya traen consulta_id.
        if ($hasOrdenesLab) {
            $stmtResultadosPorOrden = $conn->prepare(
                "SELECT ol.consulta_id, COUNT(rl.id) AS total_resultados
                 FROM ordenes_laboratorio ol
                 INNER JOIN resultados_laboratorio rl ON rl.orden_id = ol.id
                 WHERE ol.consulta_id IN ($placeholders)
                   AND (rl.consulta_id IS NULL OR rl.consulta_id = 0)
                 GROUP BY ol.consulta_id"
            );
            if ($stmtResultadosPorOrden) {
                $stmtResultadosPorOrden->bind_param($types, ...$ids);
                $stmtResultadosPorOrden->execute();
                $rows = $stmtResultadosPorOrden->get_result()->fetch_all(MYSQLI_ASSOC);
                $stmtResultadosPorOrden->close();
                foreach ($rows as $row) {
                    $cid = (int)($row['consulta_id'] ?? 0);
                    if ($cid > 0 && isset($resumen[$cid])) {
                        $resumen[$cid]['laboratorio']['resultados'] += (int)($row['total_resultados'] ?? 0);
                    }
                }
            }
        }
    }

    // Documentos externos vinculados a órdenes de laboratorio (adjuntos PDF/imagen).
    if ($hasOrdenesLab && $hasDocsPac && $hasDocsArc) {
        $stmtDocs = $conn->prepare(
            "SELECT ol.consulta_id, COUNT(dea.id) AS total_documentos
             FROM ordenes_laboratorio ol
             INNER JOIN documentos_externos_paciente dep ON dep.orden_id = ol.id
             INNER JOIN documentos_externos_archivos dea ON dea.documento_id = dep.id
             WHERE ol.consulta_id IN ($placeholders)
             GROUP BY ol.consulta_id"
        );
        if ($stmtDocs) {
            $stmtDocs->bind_param($types, ...$ids);
            $stmtDocs->execute();
            $rows = $stmtDocs->get_result()->fetch_all(MYSQLI_ASSOC);
            $stmtDocs->close();
            foreach ($rows as $row) {
                $cid = (int)($row['consulta_id'] ?? 0);
                if ($cid > 0 && isset($resumen[$cid])) {
                    $resumen[$cid]['laboratorio']['documentos'] = (int)($row['total_documentos'] ?? 0);
                }
            }
        }
    }

    // Ecografías: última orden con archivos y total de órdenes/archivos por consulta.
    if ($hasOrdenesImg && $hasOrdenesImgArch) {
        $stmtEco = $conn->prepare(
            "SELECT oi.consulta_id,
                    COUNT(DISTINCT oi.id) AS total_ordenes,
                    COUNT(oia.id) AS total_archivos,
                    MAX(CASE WHEN oia.id IS NOT NULL THEN oi.id ELSE NULL END) AS ultima_orden_con_archivo
             FROM ordenes_imagen oi
             LEFT JOIN ordenes_imagen_archivos oia ON oia.orden_id = oi.id
             WHERE oi.consulta_id IN ($placeholders)
               AND LOWER(COALESCE(oi.tipo, '')) = 'ecografia'
             GROUP BY oi.consulta_id"
        );
        if ($stmtEco) {
            $stmtEco->bind_param($types, ...$ids);
            $stmtEco->execute();
            $rows = $stmtEco->get_result()->fetch_all(MYSQLI_ASSOC);
            $stmtEco->close();
            foreach ($rows as $row) {
                $cid = (int)($row['consulta_id'] ?? 0);
                if ($cid > 0 && isset($resumen[$cid])) {
                    $archivos = (int)($row['total_archivos'] ?? 0);
                    $ultimaOrden = (int)($row['ultima_orden_con_archivo'] ?? 0);
                    $resumen[$cid]['ecografia']['ordenes'] = (int)($row['total_ordenes'] ?? 0);
                    $resumen[$cid]['ecografia']['archivos'] = $archivos;
                    $resumen[$cid]['ecografia']['ultima_orden_id'] = $ultimaOrden > 0 ? $ultimaOrden : null;
                    $resumen[$cid]['ecografia']['target'] = $ultimaOrden > 0 ? ('/visor-imagen/' . $ultimaOrden) : null;
                }
            }
        }
    }

    foreach ($resumen as $cid => &$item) {
        $lab = $item['laboratorio'];
        $eco = $item['ecografia'];

        $item['laboratorio']['has_resultados'] = (
            (int)($lab['resultados'] ?? 0) > 0
            || (int)($lab['documentos'] ?? 0) > 0
        );

        $item['ecografia']['has_resultados'] = (int)($eco['archivos'] ?? 0) > 0;
    }
    unset($item);

    return $resumen;
}

function hc_resolve_template_for_hc($conn, $consultaId, $datos) {
    $templateMeta = null;
    $templateResolution = null;
    $templateId = '';
    $templateVersion = '';

    if (is_array($datos) && isset($datos['template']) && is_array($datos['template'])) {
        $templateId = trim((string)($datos['template']['id'] ?? ''));
        $templateVersion = trim((string)($datos['template']['version'] ?? ''));
    }

    $resolved = hc_resolve_template($conn, [
        'consulta_id' => (int)$consultaId,
        'template_id' => $templateId,
        'version' => $templateVersion,
    ]);

    if (is_array($resolved) && ($resolved['success'] ?? false)) {
        $templateMeta = $resolved['template'] ?? null;
        $templateResolution = $resolved['resolution'] ?? null;
    }

    return [$templateMeta, $templateResolution];
}

function hc_get_historial_cadena_previas($conn, $consultaIdActual, $maxDepth = 30) {
    $consultaIdActual = (int)$consultaIdActual;
    if ($consultaIdActual <= 0) return [];

    $baseUrl = hc_base_url();
    $consultaActual = hc_get_consulta_meta($conn, $consultaIdActual);
    if (!$consultaActual) return [];

    // Obtener la HC del nodo actual para intentar usar hc_parent_id
    $stmtSelf = $conn->prepare(
        'SELECT id, hc_parent_id, hc_root_id, chain_depth, chain_status, contrato_paciente_id, agenda_contrato_id
         FROM historia_clinica WHERE consulta_id = ? LIMIT 1'
    );
    $selfHcRow = null;
    if ($stmtSelf) {
        $stmtSelf->bind_param('i', $consultaIdActual);
        $stmtSelf->execute();
        $selfHcRow = $stmtSelf->get_result()->fetch_assoc();
        $stmtSelf->close();
    }

    // Estrategia 1: usar hc_parent_id si la migracion 18 esta aplicada
    $useNewChain = $selfHcRow !== null && isset($selfHcRow['hc_parent_id']);

    $historial = [];
    $visited   = [];
    $depth     = 0;

    if ($useNewChain) {
        // Caminar hacia atras por hc_parent_id
        $currentParentId = (int)($selfHcRow['hc_parent_id'] ?? 0);

        while ($currentParentId > 0 && $depth < $maxDepth) {
            if (isset($visited[$currentParentId])) break;
            $visited[$currentParentId] = true;

            $stmtHcP = $conn->prepare(
                'SELECT id, consulta_id, datos, fecha_registro,
                        hc_parent_id, hc_root_id, chain_depth, chain_status,
                        contrato_paciente_id, agenda_contrato_id
                 FROM historia_clinica WHERE id = ? LIMIT 1'
            );
            if (!$stmtHcP) break;
            $stmtHcP->bind_param('i', $currentParentId);
            $stmtHcP->execute();
            $hcRow = $stmtHcP->get_result()->fetch_assoc();
            $stmtHcP->close();
            if (!$hcRow) break;

            $hcId      = (int)($hcRow['id'] ?? 0);
            $consultaId = (int)($hcRow['consulta_id'] ?? 0);
            $datos     = json_decode((string)($hcRow['datos'] ?? '{}'), true);
            if (!is_array($datos)) $datos = [];

            [$templateMeta, $templateResolution] = hc_resolve_template_for_hc($conn, $consultaId, $datos);
            $consultaMeta = hc_get_consulta_meta($conn, $consultaId);
            $adjuntos     = hc_get_adjuntos_por_consulta($conn, $consultaId, $baseUrl);

            $historial[] = [
                'hc_id'               => $hcId,
                'consulta_id'         => $consultaId,
                'fecha_registro'      => (string)($hcRow['fecha_registro'] ?? ''),
                'fecha_consulta'      => (string)($consultaMeta['fecha'] ?? ''),
                'hora_consulta'       => (string)($consultaMeta['hora'] ?? ''),
                'datos'               => $datos,
                'template'            => $templateMeta,
                'template_resolution' => $templateResolution,
                'adjuntos'            => $adjuntos,
                'resolved_by'         => 'hc_parent_id',
                'chain_depth'         => (int)($hcRow['chain_depth'] ?? 0),
                'chain_status'        => (string)($hcRow['chain_status'] ?? 'activa'),
                'hc_root_id'          => (int)($hcRow['hc_root_id'] ?? 0),
                'contrato_paciente_id'=> (int)($hcRow['contrato_paciente_id'] ?? 0) ?: null,
                'agenda_contrato_id'  => (int)($hcRow['agenda_contrato_id'] ?? 0) ?: null,
            ];

            $currentParentId = (int)($hcRow['hc_parent_id'] ?? 0);
            $depth++;
        }
    } else {
        // Estrategia 2 (legacy): caminar por hc_origen_id
        $currentRef = (int)($consultaActual['hc_origen_id'] ?? 0);

        while ($currentRef > 0 && $depth < $maxDepth) {
            if (isset($visited[$currentRef])) break;
            $visited[$currentRef] = true;

            $hcRow = hc_get_hc_row_resolved($conn, $currentRef);
            if (!$hcRow) break;

            $hcId      = (int)($hcRow['id'] ?? 0);
            $consultaId = (int)($hcRow['consulta_id'] ?? 0);
            $datos     = json_decode((string)($hcRow['datos'] ?? '{}'), true);
            if (!is_array($datos)) $datos = [];

            [$templateMeta, $templateResolution] = hc_resolve_template_for_hc($conn, $consultaId, $datos);
            $consultaMeta = hc_get_consulta_meta($conn, $consultaId);
            $adjuntos     = hc_get_adjuntos_por_consulta($conn, $consultaId, $baseUrl);

            $historial[] = [
                'hc_id'               => $hcId,
                'consulta_id'         => $consultaId,
                'fecha_registro'      => (string)($hcRow['fecha_registro'] ?? ''),
                'fecha_consulta'      => (string)($consultaMeta['fecha'] ?? ''),
                'hora_consulta'       => (string)($consultaMeta['hora'] ?? ''),
                'datos'               => $datos,
                'template'            => $templateMeta,
                'template_resolution' => $templateResolution,
                'adjuntos'            => $adjuntos,
                'resolved_by'         => (string)($hcRow['_resolved_by'] ?? 'hc_id'),
                'chain_depth'         => null,
                'chain_status'        => 'activa',
                'hc_root_id'          => null,
                'contrato_paciente_id'=> null,
                'agenda_contrato_id'  => null,
            ];

            $nextRef = (int)($consultaMeta['hc_origen_id'] ?? 0);
            if ($nextRef > 0 && $nextRef === $currentRef && $hcId > 0 && $hcId !== $currentRef) {
                $nextRef = $hcId;
            }
            $currentRef = $nextRef;
            $depth++;
        }
    }

    $consultaIdsHistorial = array_values(array_unique(array_filter(array_map(function ($item) {
        return (int)($item['consulta_id'] ?? 0);
    }, $historial), function ($id) {
        return $id > 0;
    })));

    $apoyoResumen = hc_get_apoyo_resumen_por_consultas($conn, $consultaIdsHistorial);

    foreach ($historial as &$item) {
        $cid = (int)($item['consulta_id'] ?? 0);
        $item['apoyo_diagnostico'] = $apoyoResumen[$cid] ?? [
            'laboratorio' => [
                'has_resultados' => false,
                'ordenes' => 0,
                'resultados' => 0,
                'documentos' => 0,
                'consulta_id' => $cid,
                'target' => $cid > 0 ? '/resultados-laboratorio/' . $cid : null,
            ],
            'ecografia' => [
                'has_resultados' => false,
                'ordenes' => 0,
                'archivos' => 0,
                'ultima_orden_id' => null,
                'target' => null,
            ],
        ];
    }
    unset($item);

    return $historial;
}

function hc_ensure_tratamientos_enfermeria_table($conn) {
    $conn->query(
        "CREATE TABLE IF NOT EXISTS tratamientos_enfermeria (
            id               INT AUTO_INCREMENT PRIMARY KEY,
            consulta_id      INT          NOT NULL COMMENT 'FK a consultas.id',
            paciente_id      INT          NOT NULL COMMENT 'Copia desnormalizada para consultas rápidas',
            receta_snapshot  JSON                  COMMENT 'Copia de historia_clinica.datos.receta al momento del guardado',
            tratamiento_texto TEXT                 COMMENT 'Copia de historia_clinica.datos.tratamiento',
            estado           ENUM('pendiente','en_ejecucion','completado','suspendido') NOT NULL DEFAULT 'pendiente',
            version_num      INT          NOT NULL DEFAULT 1 COMMENT 'Versión incremental por consulta',
            origen_tratamiento_id INT     NULL COMMENT 'Registro anterior del cual deriva esta versión',
            creado_en        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
            iniciado_en      DATETIME     NULL,
            completado_en    DATETIME     NULL,
            notas_enfermeria TEXT         NULL,
            INDEX idx_te_estado   (estado),
            INDEX idx_te_paciente (paciente_id),
            INDEX idx_te_consulta_version (consulta_id, version_num),
            CONSTRAINT fk_te_consulta FOREIGN KEY (consulta_id) REFERENCES consultas(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
    );

    // Migración compatible con instalaciones previas (idempotente).
    $idxLegacy = $conn->query("SHOW INDEX FROM tratamientos_enfermeria WHERE Key_name = 'uk_te_consulta'");
    if ($idxLegacy && $idxLegacy->num_rows > 0) {
        $conn->query('ALTER TABLE tratamientos_enfermeria DROP INDEX uk_te_consulta');
    }

    $colVersion = $conn->query("SHOW COLUMNS FROM tratamientos_enfermeria LIKE 'version_num'");
    if ($colVersion && $colVersion->num_rows === 0) {
        $conn->query('ALTER TABLE tratamientos_enfermeria ADD COLUMN version_num INT NOT NULL DEFAULT 1');
    }

    $colOrigen = $conn->query("SHOW COLUMNS FROM tratamientos_enfermeria LIKE 'origen_tratamiento_id'");
    if ($colOrigen && $colOrigen->num_rows === 0) {
        $conn->query('ALTER TABLE tratamientos_enfermeria ADD COLUMN origen_tratamiento_id INT NULL');
    }

    $idxVersion = $conn->query("SHOW INDEX FROM tratamientos_enfermeria WHERE Key_name = 'idx_te_consulta_version'");
    if ($idxVersion && $idxVersion->num_rows === 0) {
        $conn->query('ALTER TABLE tratamientos_enfermeria ADD INDEX idx_te_consulta_version (consulta_id, version_num)');
    }
}

function hc_ensure_tratamientos_multidia_tables($conn) {
    tph_ensure_multidia_tables($conn);
}

function hc_parse_duracion_dias($duracionTexto) {
    return tph_parse_duracion_dias($duracionTexto);
}

function hc_parse_dosis_por_dia($frecuenciaTexto) {
    $norm = tph_normalize_prescripcion_item(['frecuencia' => $frecuenciaTexto], 0);
    return (int)($norm['dosis_dia'] ?? 1);
}

function hc_rebuild_plan_multidia($conn, $tratamientoId, $receta) {
    tph_rebuild_plan_multidia($conn, $tratamientoId, $receta);
}

function hc_upsert_tratamiento_enfermeria($conn, $consulta_id, $datos) {
    $receta = (is_array($datos) && isset($datos['receta']) && is_array($datos['receta']))
        ? $datos['receta']
        : [];
    $tratamientoTexto = is_array($datos) ? trim((string)($datos['tratamiento'] ?? '')) : '';

    // Solo crear registro si hay algo de valor para enfermería
    if (empty($receta) && $tratamientoTexto === '') {
        return;
    }

    hc_ensure_tratamientos_enfermeria_table($conn);
    hc_ensure_tratamientos_multidia_tables($conn);

    $stmtPac = $conn->prepare('SELECT paciente_id FROM consultas WHERE id = ? LIMIT 1');
    if (!$stmtPac) return;
    $stmtPac->bind_param('i', $consulta_id);
    $stmtPac->execute();
    $rowPac = $stmtPac->get_result()->fetch_assoc();
    $stmtPac->close();
    $pacienteId = (int)($rowPac['paciente_id'] ?? 0);
    if ($pacienteId <= 0) return;

    $recetaJson = json_encode($receta, JSON_UNESCAPED_UNICODE);

    // Buscar la última versión del tratamiento para esta consulta.
    $stmtLast = $conn->prepare(
        'SELECT id, estado, receta_snapshot, tratamiento_texto, version_num
         FROM tratamientos_enfermeria
         WHERE consulta_id = ?
         ORDER BY version_num DESC, id DESC
         LIMIT 1'
    );
    if (!$stmtLast) return;
    $stmtLast->bind_param('i', $consulta_id);
    $stmtLast->execute();
    $last = $stmtLast->get_result()->fetch_assoc();
    $stmtLast->close();

    if (!$last) {
        $stmtInsert = $conn->prepare(
            'INSERT INTO tratamientos_enfermeria (consulta_id, paciente_id, receta_snapshot, tratamiento_texto, estado, version_num)
             VALUES (?, ?, ?, ?, "pendiente", 1)'
        );
        if (!$stmtInsert) return;
        $stmtInsert->bind_param('iiss', $consulta_id, $pacienteId, $recetaJson, $tratamientoTexto);
        $okInsert = $stmtInsert->execute();
        $newTratamientoId = $okInsert ? (int)$stmtInsert->insert_id : 0;
        $stmtInsert->close();
        if ($newTratamientoId > 0) {
            hc_rebuild_plan_multidia($conn, $newTratamientoId, $receta);
        }
        return;
    }

    $lastId = (int)($last['id'] ?? 0);
    $lastEstado = trim((string)($last['estado'] ?? ''));
    $lastVersion = (int)($last['version_num'] ?? 1);
    $lastReceta = (string)($last['receta_snapshot'] ?? '[]');
    $lastTratamiento = trim((string)($last['tratamiento_texto'] ?? ''));
    $mismoContenido = ($lastReceta === $recetaJson) && ($lastTratamiento === $tratamientoTexto);

    // Si no hay cambios en la prescripción, evitar ruido de versiones.
    if ($mismoContenido) {
        return;
    }

    if ($lastEstado === 'pendiente') {
        // Mientras siga pendiente se actualiza en la misma versión.
        $stmtUpd = $conn->prepare(
            'UPDATE tratamientos_enfermeria
             SET receta_snapshot = ?, tratamiento_texto = ?, creado_en = CURRENT_TIMESTAMP
             WHERE id = ? LIMIT 1'
        );
        if (!$stmtUpd) return;
        $stmtUpd->bind_param('ssi', $recetaJson, $tratamientoTexto, $lastId);
        $stmtUpd->execute();
        $stmtUpd->close();
        hc_rebuild_plan_multidia($conn, $lastId, $receta);
        return;
    }

    if ($lastEstado === 'en_ejecucion') {
        // Regla avanzada: si enfermería está aplicando y el médico edita,
        // el tratamiento actual se suspende y se crea una nueva versión pendiente.
        $stmtSusp = $conn->prepare(
            'UPDATE tratamientos_enfermeria
             SET estado = "suspendido",
                 notas_enfermeria = CONCAT(
                    IFNULL(NULLIF(notas_enfermeria, ""), ""),
                    IF(IFNULL(NULLIF(notas_enfermeria, ""), "") = "", "", "\n"),
                    "Suspendido por actualización médica de la receta: ", DATE_FORMAT(NOW(), "%Y-%m-%d %H:%i:%s")
                 )
             WHERE id = ? AND estado = "en_ejecucion" LIMIT 1'
        );
        if ($stmtSusp) {
            $stmtSusp->bind_param('i', $lastId);
            $stmtSusp->execute();
            $stmtSusp->close();
        }
    }

    $newVersion = $lastVersion + 1;
    $stmtInsertVersion = $conn->prepare(
        'INSERT INTO tratamientos_enfermeria
            (consulta_id, paciente_id, receta_snapshot, tratamiento_texto, estado, version_num, origen_tratamiento_id)
         VALUES (?, ?, ?, ?, "pendiente", ?, ?)'
    );
    if (!$stmtInsertVersion) return;
    $stmtInsertVersion->bind_param('iissii', $consulta_id, $pacienteId, $recetaJson, $tratamientoTexto, $newVersion, $lastId);
    $okVersion = $stmtInsertVersion->execute();
    $newTratamientoId = $okVersion ? (int)$stmtInsertVersion->insert_id : 0;
    $stmtInsertVersion->close();

    if ($newTratamientoId > 0) {
        hc_rebuild_plan_multidia($conn, $newTratamientoId, $receta);
    }
}

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        $consulta_id = isset($_GET['consulta_id']) ? intval($_GET['consulta_id']) : 0;
        $hc_id = isset($_GET['hc_id']) ? intval($_GET['hc_id']) : 0;
        $includeChain = hc_bool_query_param('include_chain', false);

        if ($consulta_id <= 0 && $hc_id <= 0) {
            echo json_encode(['success' => false, 'error' => 'Falta consulta_id o hc_id']);
            exit;
        }

        $targetConsultaId = $consulta_id > 0 ? $consulta_id : null;
        $templateMeta = null;
        $templateResolution = null;

        if ($hc_id > 0) {
            $stmt = $conn->prepare('SELECT id, consulta_id, datos, fecha_registro FROM historia_clinica WHERE id = ? LIMIT 1');
            $stmt->bind_param('i', $hc_id);
        } else {
            $stmt = $conn->prepare('SELECT id, consulta_id, datos, fecha_registro FROM historia_clinica WHERE consulta_id = ? LIMIT 1');
            $stmt->bind_param('i', $consulta_id);
        }
        $stmt->execute();
        $res = $stmt->get_result();
        $row = $res->fetch_assoc();
        $stmt->close();

        // Compatibilidad histórica: algunos flujos guardaron hc_origen_id como consulta_id.
        if (!$row && $hc_id > 0) {
            $stmtLegacy = $conn->prepare('SELECT id, consulta_id, datos, fecha_registro FROM historia_clinica WHERE consulta_id = ? LIMIT 1');
            if ($stmtLegacy) {
                $stmtLegacy->bind_param('i', $hc_id);
                $stmtLegacy->execute();
                $resLegacy = $stmtLegacy->get_result();
                $row = $resLegacy->fetch_assoc();
                $stmtLegacy->close();
            }
        }

        if ($row) {
            $targetConsultaId = (int)($row['consulta_id'] ?? 0);
            $datos = json_decode($row['datos'], true);
            [$templateMeta, $templateResolution] = hc_resolve_template_for_hc($conn, $targetConsultaId, is_array($datos) ? $datos : []);
            $historialPrevias = $includeChain
                ? hc_get_historial_cadena_previas($conn, $targetConsultaId)
                : null;
            $proximaContratoEvento = hc_resolver_proxima_cita_contrato($conn, $targetConsultaId);

            echo json_encode([
                'success' => true,
                'hc_id' => (int)($row['id'] ?? 0),
                'consulta_id' => $targetConsultaId,
                'fecha_registro' => (string)($row['fecha_registro'] ?? ''),
                'datos' => $datos,
                'template' => $templateMeta,
                'template_resolution' => $templateResolution,
                'historias_previas' => $historialPrevias,
                'total_historias_previas' => is_array($historialPrevias) ? count($historialPrevias) : null,
                'proxima_contrato_evento' => $proximaContratoEvento,
            ]);
        } else {
            $historialPrevias = ($includeChain && $consulta_id > 0)
                ? hc_get_historial_cadena_previas($conn, $consulta_id)
                : null;
            $resolved = hc_resolve_template($conn, [
                'consulta_id' => (int)($targetConsultaId ?? 0),
            ]);
            if (is_array($resolved) && ($resolved['success'] ?? false)) {
                $templateMeta = $resolved['template'] ?? null;
                $templateResolution = $resolved['resolution'] ?? null;
            }

            echo json_encode([
                'success' => false,
                'error' => $hc_id > 0
                    ? 'No existe historia clínica para el hc_id indicado'
                    : 'No existe historia clínica para esta consulta',
                'template' => $templateMeta,
                'template_resolution' => $templateResolution,
                'historias_previas' => $historialPrevias,
                'total_historias_previas' => is_array($historialPrevias) ? count($historialPrevias) : null,
            ]);
        }
        break;
    case 'POST':
        $data = json_decode(file_get_contents('php://input'), true);
        $consulta_id = $data['consulta_id'] ?? null;
        $datos = $data['datos'] ?? null;
        if (!$consulta_id || !$datos) {
            echo json_encode(['success' => false, 'error' => 'Faltan datos requeridos']);
            exit;
        }

        if (is_array($datos)) {
            $datos = hc_sanitizar_diagnosticos($datos);
        }

        // Verificar si ya existe HC para esta consulta
        $stmt_check = $conn->prepare('SELECT id FROM historia_clinica WHERE consulta_id = ?');
        $stmt_check->bind_param('i', $consulta_id);
        $stmt_check->execute();
        $res_check = $stmt_check->get_result();
        $hcRow = $res_check->fetch_assoc();
        $hcActualId = 0;
        $ok = false;

        if ($hcRow) {
            $hcActualId = (int)($hcRow['id'] ?? 0);
            // Ya existe: actualizar
            $json = json_encode($datos);
            $stmt = $conn->prepare('UPDATE historia_clinica SET datos = ?, fecha_registro = CURRENT_TIMESTAMP WHERE consulta_id = ?');
            $stmt->bind_param('si', $json, $consulta_id);
            $ok = $stmt->execute();
            $stmt->close();
        } else {
            // No existe: insertar
            $json = json_encode($datos);
            $stmt = $conn->prepare('INSERT INTO historia_clinica (consulta_id, datos) VALUES (?, ?)');
            $stmt->bind_param('is', $consulta_id, $json);
            $ok = $stmt->execute();
            if ($ok) {
                $hcActualId = (int)$stmt->insert_id;
            }
            $stmt->close();
        }

        if (!$ok) {
            echo json_encode([
                'success' => false,
                'error' => 'No se pudo guardar la historia clínica',
            ]);
            $stmt_check->close();
            exit;
        }

        // Encadenar HC: resolver parent canonico y persistir campos de cadena
        hc_actualizar_cadena_hc($conn, $hcActualId, (int)$consulta_id);

        // Retro-vincular: si esta consulta pertenece a un contrato, buscar el evento
        // inmediatamente siguiente y actualizar su hc_origen_id al consulta_id actual.
        // Esto resuelve el timing gap: cuando el contrato programó el evento B, la HC de A
        // aún no existía, así que B.hc_origen_id quedó en 0. Al guardar la HC de A ahora
        // se corrige B.hc_origen_id = A.consulta_id para que la cadena quede activa.
        hc_retrovincular_siguiente_evento_contrato($conn, (int)$consulta_id);

        $proximaResultado = null;
        try {
            if (is_array($datos) && isset($datos['proxima_cita']) && is_array($datos['proxima_cita'])) {
                $proximaResultado = hc_programar_proxima_cita($conn, (int)$consulta_id, $datos['proxima_cita'], $hcActualId);
                if (is_array($proximaResultado)) {
                    $datos['proxima_cita']['consulta_id'] = (int)($proximaResultado['consulta_id'] ?? 0);
                    $datos['proxima_cita']['programada_en'] = date('Y-m-d H:i:s');
                    $datos['proxima_cita']['programar'] = true;
                    $datos['proxima_cita']['origen'] = 'historia_clinica';
                    $datos['proxima_cita'] = hc_append_proxima_historial($datos['proxima_cita'], [
                        'accion' => 'programada_desde_hc',
                        'fecha_evento' => date('Y-m-d H:i:s'),
                        'actor' => hc_actor_label(),
                        'consulta_id' => (int)($proximaResultado['consulta_id'] ?? 0),
                        'fecha' => (string)($proximaResultado['fecha'] ?? ''),
                        'hora' => (string)($proximaResultado['hora'] ?? ''),
                    ]);

                    $jsonConProxima = json_encode($datos);
                    $stmtSync = $conn->prepare('UPDATE historia_clinica SET datos = ?, fecha_registro = CURRENT_TIMESTAMP WHERE id = ? LIMIT 1');
                    if ($stmtSync) {
                        $stmtSync->bind_param('si', $jsonConProxima, $hcActualId);
                        $stmtSync->execute();
                        $stmtSync->close();
                    }
                }
            }
        } catch (Throwable $e) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'error' => $e->getMessage(),
            ]);
            $stmt_check->close();
            exit;
        }

        // Actualizar estado de la consulta a 'completada'
        $stmt_estado = $conn->prepare('UPDATE consultas SET estado = ? WHERE id = ?');
        $estado_completada = 'completada';
        $stmt_estado->bind_param('si', $estado_completada, $consulta_id);
        $stmt_estado->execute();
        $stmt_estado->close();

        // Sincronizar receta/tratamiento al panel de enfermería
        hc_upsert_tratamiento_enfermeria($conn, (int)$consulta_id, $datos);

        echo json_encode([
            'success' => $ok,
            'proxima_cita' => $proximaResultado,
        ]);
        $stmt_check->close();
        break;
    default:
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
}
