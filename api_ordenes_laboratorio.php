<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/auth_check.php';
require_once __DIR__ . '/config.php';

if (!function_exists('parse_datetime_safe')) {
    function parse_datetime_safe($value)
    {
        if (!$value || !is_string($value)) {
            return null;
        }
        $ts = strtotime($value);
        if ($ts === false) {
            return null;
        }
        return $ts;
    }
}

if (!function_exists('pick_alarm_base_ts')) {
    function pick_alarm_base_ts($resultadoRow, $ordenFecha)
    {
        if (is_array($resultadoRow)) {
            $candidateFields = ['fecha', 'fecha_resultado', 'updated_at', 'created_at'];
            foreach ($candidateFields as $field) {
                if (isset($resultadoRow[$field])) {
                    $ts = parse_datetime_safe($resultadoRow[$field]);
                    if ($ts !== null) {
                        return $ts;
                    }
                }
            }
        }
        return parse_datetime_safe($ordenFecha);
    }
}

if (!function_exists('calculate_alarm_summary')) {
    function calculate_alarm_summary($resultadosJson, $examenesIds, $baseTs)
    {
        $summary = [
            'alarmas_activas' => 0,
            'alarmas_vencidas' => 0,
            'alarmas_vencidas_detalle' => [],
            'alerta_estado' => 'sin_alarma',
            'alerta_vencido' => 0,
            'alerta_por_vencer' => 0,
            'alerta_en_tiempo' => 0,
            'alerta_total' => 0
        ];

        if (!is_array($resultadosJson) || !is_array($examenesIds) || empty($examenesIds) || !$baseTs) {
            return $summary;
        }

        $now = time();
        foreach ($examenesIds as $examIdRaw) {
            $examId = intval($examIdRaw);
            if ($examId <= 0) {
                continue;
            }

            $activeKey = $examId . '__alarma_activa';
            $daysKey = $examId . '__alarma_dias';

            $isActive = isset($resultadosJson[$activeKey]) && intval($resultadosJson[$activeKey]) === 1;
            if (!$isActive) {
                continue;
            }

            $days = isset($resultadosJson[$daysKey]) ? intval($resultadosJson[$daysKey]) : 0;
            if ($days <= 0) {
                continue;
            }

            $summary['alarmas_activas']++;
            $dueTs = strtotime('+' . $days . ' days', $baseTs);
            $warningStartTs = strtotime('+' . max($days - 1, 0) . ' days', $baseTs);
            if ($dueTs !== false && $now > $dueTs) {
                $summary['alerta_vencido']++;
                $summary['alarmas_vencidas_detalle'][] = [
                    'examen_id' => $examId,
                    'dias' => $days,
                    'fecha_objetivo' => date('Y-m-d H:i:s', $dueTs)
                ];
            } elseif ($dueTs !== false && $warningStartTs !== false && $now <= $dueTs && $now >= $warningStartTs) {
                $summary['alerta_por_vencer']++;
            } elseif ($warningStartTs !== false && $now < $warningStartTs) {
                $summary['alerta_en_tiempo']++;
            } else {
                $summary['alerta_por_vencer']++;
            }
        }

        $summary['alarmas_vencidas'] = $summary['alerta_vencido'];
        $summary['alerta_total'] = $summary['alerta_vencido'] + $summary['alerta_por_vencer'] + $summary['alerta_en_tiempo'];
        if ($summary['alerta_vencido'] > 0) {
            $summary['alerta_estado'] = 'vencido';
        } elseif ($summary['alerta_por_vencer'] > 0) {
            $summary['alerta_estado'] = 'por_vencer';
        } elseif ($summary['alerta_en_tiempo'] > 0) {
            $summary['alerta_estado'] = 'en_tiempo';
        }

        return $summary;
    }
}

if (!function_exists('is_result_value_meaningful')) {
    function is_result_value_meaningful($value)
    {
        if ($value === null) return false;
        if (is_string($value)) return trim($value) !== '';
        if (is_array($value)) return count($value) > 0;
        return true;
    }
}

if (!function_exists('decode_valores_referenciales_any')) {
    function decode_valores_referenciales_any($raw)
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

        if (!is_array($value)) {
            return [];
        }

        if (isset($value['nombre']) || isset($value['titulo']) || isset($value['tipo']) || isset($value['referencias'])) {
            return [$value];
        }

        return $value;
    }
}

if (!function_exists('calculate_exam_progress_summary')) {
    function calculate_exam_progress_summary($resultadosJson, $examenesIds, $examenesDetalle = null)
    {
        $resultados = is_array($resultadosJson) ? $resultadosJson : [];
        $examIds = [];
        if (is_array($examenesIds)) {
            foreach ($examenesIds as $item) {
                $examId = is_array($item) && isset($item['id']) ? intval($item['id']) : intval($item);
                if ($examId > 0) {
                    $examIds[] = $examId;
                }
            }
        }
        $examIds = array_values(array_unique($examIds));

        $total = count($examIds);
        if ($total <= 0) {
            return ['total' => $total, 'completos' => 0, 'porcentaje' => 0];
        }

        $detallePorId = [];
        if (is_array($examenesDetalle)) {
            foreach ($examenesDetalle as $detalle) {
                if (is_array($detalle) && isset($detalle['id'])) {
                    $detallePorId[intval($detalle['id'])] = $detalle;
                }
            }
        }

        $analisisTotales = 0;
        $analisisCompletos = 0;
        foreach ($examIds as $examId) {
            $requiredKeys = [];
            $detalle = $detallePorId[$examId] ?? null;
            if (is_array($detalle) && isset($detalle['valores_referenciales']) && is_array($detalle['valores_referenciales'])) {
                foreach ($detalle['valores_referenciales'] as $param) {
                    if (!is_array($param)) continue;
                    $tipo = strtolower(trim((string)($param['tipo'] ?? 'Parámetro')));
                    $nombre = trim((string)($param['nombre'] ?? ''));
                    if ($nombre === '') continue;
                    if ($tipo === '' || $tipo === 'parámetro' || $tipo === 'parametro' || $tipo === 'texto largo' || $tipo === 'campo') {
                        $requiredKeys[] = $examId . '__' . $nombre;
                    }
                }
            }

            if (!empty($requiredKeys)) {
                $allFound = true;
                foreach ($requiredKeys as $requiredKey) {
                    $analisisTotales++;
                    if (array_key_exists($requiredKey, $resultados) && is_result_value_meaningful($resultados[$requiredKey])) {
                        $analisisCompletos++;
                    } else {
                        $allFound = false;
                    }
                }
                // Fallback: if the exact keys weren't found, check bare ID or any "examId__*" prefix.
                // This tolerates saves that used a different key format (e.g. "57" vs "57__Aga y electrolitos").
                if (!$allFound) {
                    $directKey = (string)$examId;
                    $fallbackFound = array_key_exists($directKey, $resultados) && is_result_value_meaningful($resultados[$directKey]);
                    if (!$fallbackFound) {
                        $prefix = $examId . '__';
                        foreach ($resultados as $k => $v) {
                            if (strpos((string)$k, $prefix) === 0 && is_result_value_meaningful($v)) {
                                $fallbackFound = true;
                                break;
                            }
                        }
                    }
                    if ($fallbackFound) {
                        // Count all required keys as complete via fallback
                        foreach ($requiredKeys as $rk) {
                            if (!array_key_exists($rk, $resultados) || !is_result_value_meaningful($resultados[$rk])) {
                                $analisisCompletos++;
                            }
                        }
                    }
                }
            } else {
                // No required keys: check bare ID or any "examId__*" key (handles fallback-named params).
                $analisisTotales++;
                $directKey = (string)$examId;
                $found = array_key_exists($directKey, $resultados) && is_result_value_meaningful($resultados[$directKey]);
                if (!$found) {
                    $prefix = $examId . '__';
                    foreach ($resultados as $k => $v) {
                        if (strpos((string)$k, $prefix) === 0 && is_result_value_meaningful($v)) {
                            $found = true;
                            break;
                        }
                    }
                }
                if ($found) {
                    $analisisCompletos++;
                }
            }
        }

        $porcentaje = $analisisTotales > 0 ? intval(round(($analisisCompletos / $analisisTotales) * 100)) : 0;
        return ['total' => $analisisTotales, 'completos' => $analisisCompletos, 'porcentaje' => $porcentaje];
    }
}

if (!function_exists('ol_column_exists')) {
    function ol_column_exists(mysqli $conn, $table, $column)
    {
        static $cache = [];
        $key = $table . '.' . $column;
        if (array_key_exists($key, $cache)) {
            return $cache[$key];
        }

        $stmt = $conn->prepare("SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1");
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

if (!function_exists('ol_ensure_write_schema')) {
    function ol_ensure_write_schema(mysqli $conn)
    {
        $migCols = [
            'cotizacion_id' => 'ALTER TABLE ordenes_laboratorio ADD COLUMN cotizacion_id INT DEFAULT NULL',
            'carga_anticipada' => 'ALTER TABLE ordenes_laboratorio ADD COLUMN carga_anticipada TINYINT(1) NOT NULL DEFAULT 0',
        ];

        foreach ($migCols as $col => $sql) {
            if (!ol_column_exists($conn, 'ordenes_laboratorio', $col)) {
                $conn->query($sql);
            }
        }

        if (!ol_column_exists($conn, 'cotizaciones_detalle', 'derivado')) {
            $conn->query("ALTER TABLE cotizaciones_detalle ADD COLUMN derivado TINYINT(1) NOT NULL DEFAULT 0");
        }
        if (!ol_column_exists($conn, 'cotizaciones_detalle', 'tipo_derivacion')) {
            $conn->query("ALTER TABLE cotizaciones_detalle ADD COLUMN tipo_derivacion VARCHAR(50) DEFAULT NULL");
        }
        if (!ol_column_exists($conn, 'cotizaciones_detalle', 'valor_derivacion')) {
            $conn->query("ALTER TABLE cotizaciones_detalle ADD COLUMN valor_derivacion DECIMAL(10,2) DEFAULT NULL");
        }
        if (!ol_column_exists($conn, 'cotizaciones_detalle', 'laboratorio_referencia')) {
            $conn->query("ALTER TABLE cotizaciones_detalle ADD COLUMN laboratorio_referencia VARCHAR(255) DEFAULT NULL");
        }
    }
}

if (!function_exists('ol_log_slow_request')) {
    function ol_log_slow_request($startedAt, $method, $context = '')
    {
        $ms = (microtime(true) - $startedAt) * 1000;
        if ($ms > 400) {
            error_log('api_ordenes_laboratorio.php lento: ' . round($ms, 1) . 'ms | metodo=' . $method . ($context ? ' | ' . $context : ''));
        }
    }
}

if (!function_exists('ol_consulta_requiere_filtro_estricto')) {
    function ol_consulta_requiere_filtro_estricto(mysqli $conn, int $consultaId): bool
    {
        if ($consultaId <= 0) {
            return false;
        }

        $hasHcOrigenId = ol_column_exists($conn, 'consultas', 'hc_origen_id');
        $hasOrigenCreacion = ol_column_exists($conn, 'consultas', 'origen_creacion');
        $hasEsControl = ol_column_exists($conn, 'consultas', 'es_control');
        $hasAgendaContrato = ol_column_exists($conn, 'agenda_contrato', 'consulta_id');

        $selectCols = [];
        if ($hasHcOrigenId) $selectCols[] = 'hc_origen_id';
        if ($hasOrigenCreacion) $selectCols[] = 'origen_creacion';
        if ($hasEsControl) $selectCols[] = 'es_control';

        if (empty($selectCols)) {
            return false;
        }

        $sql = 'SELECT ' . implode(', ', $selectCols) . ' FROM consultas WHERE id = ? LIMIT 1';
        $stmt = $conn->prepare($sql);
        if (!$stmt) {
            return false;
        }
        $stmt->bind_param('i', $consultaId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();

        if (!$row) {
            return false;
        }

        $hcOrigenId = $hasHcOrigenId ? intval($row['hc_origen_id'] ?? 0) : 0;
        $origen = $hasOrigenCreacion ? strtolower(trim((string)($row['origen_creacion'] ?? ''))) : '';
        $esControl = $hasEsControl ? intval($row['es_control'] ?? 0) : 0;

        $esConsultaEncadenada =
            $hcOrigenId > 0
            || $esControl === 1
            || in_array($origen, ['hc_proxima', 'contrato_agenda'], true);

        if (!$esConsultaEncadenada) {
            return false;
        }

        $hasAgendaLink = false;
        if ($hasAgendaContrato) {
            $stmtAg = $conn->prepare('SELECT 1 FROM agenda_contrato WHERE consulta_id = ? LIMIT 1');
            if ($stmtAg) {
                $stmtAg->bind_param('i', $consultaId);
                $stmtAg->execute();
                $ag = $stmtAg->get_result()->fetch_assoc();
                $stmtAg->close();
                $hasAgendaLink = (bool)$ag;
                if ($hasAgendaLink) {
                    return true;
                }
            }
        }

        // Si la consulta nace desde cotizador pero está marcada como consumo de contrato,
        // también debe aislarse en modo estricto para evitar cruces por paciente/cotización.
        $hasContratoDetalleLink = false;
        if (ol_column_exists($conn, 'cotizaciones_detalle', 'consulta_id')
            && ol_column_exists($conn, 'cotizaciones_detalle', 'contrato_paciente_id')) {
            $sqlCd = 'SELECT 1 FROM cotizaciones_detalle WHERE consulta_id = ? AND contrato_paciente_id IS NOT NULL AND contrato_paciente_id > 0';
            if (ol_column_exists($conn, 'cotizaciones_detalle', 'estado_item')) {
                $sqlCd .= " AND COALESCE(estado_item, 'activo') <> 'eliminado'";
            }
            $sqlCd .= ' LIMIT 1';
            $stmtCd = $conn->prepare($sqlCd);
            if ($stmtCd) {
                $stmtCd->bind_param('i', $consultaId);
                $stmtCd->execute();
                $cd = $stmtCd->get_result()->fetch_assoc();
                $stmtCd->close();
                $hasContratoDetalleLink = (bool)$cd;
            }
        }

        return $hcOrigenId > 0
            || $esControl === 1
            || $origen === 'hc_proxima'
            || $hasAgendaLink
            || $hasContratoDetalleLink;
    }
}

if (!function_exists('ol_medico_tiene_acceso_consulta')) {
    function ol_medico_tiene_acceso_consulta(mysqli $conn, int $consultaId, int $medicoSesionId, string $mode = 'read'): bool
    {
        $consultaId = (int)$consultaId;
        $medicoSesionId = (int)$medicoSesionId;
        $mode = strtolower(trim($mode));
        if ($consultaId <= 0 || $medicoSesionId <= 0) {
            return false;
        }

        $stmtOwner = $conn->prepare('SELECT medico_id FROM consultas WHERE id = ? LIMIT 1');
        if (!$stmtOwner) {
            return false;
        }
        $stmtOwner->bind_param('i', $consultaId);
        $stmtOwner->execute();
        $ownerConsulta = $stmtOwner->get_result()->fetch_assoc();
        $stmtOwner->close();

        $ownerMedicoId = (int)($ownerConsulta['medico_id'] ?? 0);
        if ($ownerMedicoId <= 0) {
            return false;
        }
        if ($ownerMedicoId === $medicoSesionId) {
            return true;
        }

        if (!ol_column_exists($conn, 'doctor_access_delegations', 'source_doctor_id')
            || !ol_column_exists($conn, 'doctor_access_delegations', 'target_doctor_id')
            || !ol_column_exists($conn, 'doctor_access_delegations', 'status')
            || !ol_column_exists($conn, 'doctor_access_delegations', 'access_type')
            || !ol_column_exists($conn, 'doctor_access_delegations', 'starts_at')
            || !ol_column_exists($conn, 'doctor_access_delegations', 'expires_at')) {
            return false;
        }

        $allowedAccess = ($mode === 'write') ? ['write', 'full'] : ['read', 'write', 'full'];
        $placeholders = implode(', ', array_fill(0, count($allowedAccess), '?'));
        $sql = 'SELECT 1 FROM doctor_access_delegations
                WHERE source_doctor_id = ?
                  AND target_doctor_id = ?
                  AND status = "active"
                  AND starts_at <= NOW()
                  AND expires_at >= NOW()
                  AND access_type IN (' . $placeholders . ')
                LIMIT 1';
        $stmtDel = $conn->prepare($sql);
        if (!$stmtDel) {
            return false;
        }

        $types = 'ii' . str_repeat('s', count($allowedAccess));
        $params = [$ownerMedicoId, $medicoSesionId];
        foreach ($allowedAccess as $acc) {
            $params[] = $acc;
        }

        $stmtDel->bind_param($types, ...$params);
        $stmtDel->execute();
        $rowDel = $stmtDel->get_result()->fetch_assoc();
        $stmtDel->close();

        if ($rowDel) {
            return true;
        }

        // Fallback de continuidad clínica: permitir lectura si el médico de sesión
        // ya atiende al mismo paciente en al menos una consulta.
        // Evita bloqueo al abrir órdenes/resultados desde continuidad.
        if ($mode === 'write') {
            return false;
        }

        $stmtPaciente = $conn->prepare('SELECT paciente_id FROM consultas WHERE id = ? LIMIT 1');
        if (!$stmtPaciente) {
            return false;
        }
        $stmtPaciente->bind_param('i', $consultaId);
        $stmtPaciente->execute();
        $rowPaciente = $stmtPaciente->get_result()->fetch_assoc();
        $stmtPaciente->close();

        $pacienteId = (int)($rowPaciente['paciente_id'] ?? 0);
        if ($pacienteId <= 0) {
            return false;
        }

        $stmtMismoPaciente = $conn->prepare('SELECT 1 FROM consultas WHERE paciente_id = ? AND medico_id = ? LIMIT 1');
        if (!$stmtMismoPaciente) {
            return false;
        }
        $stmtMismoPaciente->bind_param('ii', $pacienteId, $medicoSesionId);
        $stmtMismoPaciente->execute();
        $rowMismoPaciente = $stmtMismoPaciente->get_result()->fetch_assoc();
        $stmtMismoPaciente->close();

        return (bool)$rowMismoPaciente;
    }
}

$method = $_SERVER['REQUEST_METHOD'];
$requestStartedAt = microtime(true);
$sessionUsuario = $_SESSION['usuario'] ?? null;
$sessionMedico = $_SESSION['medico'] ?? null;
$rolSesion = $sessionUsuario['rol'] ?? null;
$medicoSesionId = intval($_SESSION['medico_id'] ?? ($sessionUsuario['medico_id'] ?? ($sessionUsuario['id'] ?? 0)));
$esSesionMedico = ($medicoSesionId > 0) && (
    strtolower(trim((string)$rolSesion)) === 'medico'
    || isset($_SESSION['medico_id'])
    || (is_array($sessionMedico) && intval($sessionMedico['id'] ?? 0) === $medicoSesionId)
);

if (!isset($_SESSION['usuario']) && !isset($_SESSION['medico_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'No autenticado']);
    exit;
}

// ── Helper: crear cotización desde orden médica ───────────────────────────────
if (!function_exists('crearCotizacionDesdeOrden')) {
    function crearCotizacionDesdeOrden(mysqli $conn, int $pacienteId, int $consultaId, array $detalles, int $usuarioId, string $observaciones): array {
        $total = 0.0;
        foreach ($detalles as $d) $total += floatval($d['subtotal']);
        $stmt = $conn->prepare(
            'INSERT INTO cotizaciones (paciente_id, usuario_id, total, estado, saldo_pendiente, total_pagado, observaciones)
             VALUES (?, ?, ?, \'pendiente\', ?, 0, ?)'
        );
        $stmt->bind_param('iidds', $pacienteId, $usuarioId, $total, $total, $observaciones);
        $stmt->execute();
        $cotizacionId = $conn->insert_id;
        $stmt->close();
        $nroComp = 'Q' . str_pad((string)$cotizacionId, 6, '0', STR_PAD_LEFT);
        $conn->query("UPDATE cotizaciones SET numero_comprobante = '$nroComp' WHERE id = $cotizacionId");
        foreach ($detalles as $d) {
            $servTipo  = $conn->real_escape_string($d['servicio_tipo']);
            $servId    = intval($d['servicio_id']);
            $desc      = $conn->real_escape_string($d['descripcion']);
            $cant      = intval($d['cantidad'] ?? 1);
            $pu        = floatval($d['precio_unitario']);
            $sub       = floatval($d['subtotal']);
            $conn->query(
                "INSERT INTO cotizaciones_detalle (cotizacion_id, servicio_tipo, servicio_id, descripcion, cantidad, precio_unitario, subtotal, consulta_id)
                 VALUES ($cotizacionId, '$servTipo', $servId, '$desc', $cant, $pu, $sub, $consultaId)"
            );
        }
        return ['cotizacion_id' => $cotizacionId, 'numero_comprobante' => $nroComp, 'total' => $total];
    }
}

if (!function_exists('ol_normalize_examenes_ids')) {
    function ol_normalize_examenes_ids($raw)
    {
        $out = [];
        foreach ((array)$raw as $it) {
            $id = is_array($it) && isset($it['id']) ? intval($it['id']) : intval($it);
            if ($id > 0) {
                $out[] = $id;
            }
        }
        return array_values(array_unique($out));
    }
}

if (!function_exists('ol_decode_valores_referenciales_snapshot')) {
    function ol_decode_valores_referenciales_snapshot($raw)
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

        if (!is_array($value)) {
            return [];
        }

        if (isset($value['nombre']) || isset($value['titulo']) || isset($value['tipo']) || isset($value['referencias'])) {
            return [$value];
        }

        return $value;
    }
}

if (!function_exists('ol_build_examenes_snapshot')) {
    function ol_build_examenes_snapshot(mysqli $conn, array $examenIds)
    {
        $detalles = [];
        $ids = ol_normalize_examenes_ids($examenIds);
        if (empty($ids)) {
            return $detalles;
        }

        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $sql = "SELECT id, nombre, metodologia, condicion_paciente, tiempo_resultado, valores_referenciales, precio_publico FROM examenes_laboratorio WHERE id IN ($placeholders)";
        $stmt = $conn->prepare($sql);
        if (!$stmt) {
            return $detalles;
        }

        $stmt->bind_param(str_repeat('i', count($ids)), ...$ids);
        $stmt->execute();
        $res = $stmt->get_result();
        $snapshotPorId = [];
        while ($row = $res->fetch_assoc()) {
            $row['id'] = intval($row['id'] ?? 0);
            $row['valores_referenciales'] = ol_decode_valores_referenciales_snapshot($row['valores_referenciales'] ?? '[]');
            if ($row['id'] > 0) {
                $snapshotPorId[$row['id']] = $row;
            }
        }
        $stmt->close();

        foreach ($ids as $id) {
            if (!isset($snapshotPorId[$id])) {
                continue;
            }

            $examen = $snapshotPorId[$id];
            $precio = floatval($examen['precio_publico'] ?? 0);
            $detalles[] = [
                'id' => $id,
                'nombre' => (string)($examen['nombre'] ?? ''),
                'metodologia' => (string)($examen['metodologia'] ?? ''),
                'condicion_paciente' => (string)($examen['condicion_paciente'] ?? ''),
                'tiempo_resultado' => (string)($examen['tiempo_resultado'] ?? ''),
                'valores_referenciales' => $examen['valores_referenciales'] ?? [],
                'precio_publico' => $precio,
                'servicio_tipo' => 'laboratorio',
                'servicio_id' => $id,
                'descripcion' => (string)($examen['nombre'] ?? ''),
                'cantidad' => 1,
                'precio_unitario' => $precio,
                'subtotal' => $precio,
            ];
        }

        return $detalles;
    }
}

if (!function_exists('ol_build_detalles_laboratorio_cotizacion')) {
    function ol_build_detalles_laboratorio_cotizacion(mysqli $conn, array $examenIds)
    {
        $detalles = [];
        $snapshot = ol_build_examenes_snapshot($conn, $examenIds);

        foreach ($snapshot as $item) {
            $detalles[] = [
                'id' => intval($item['id'] ?? 0),
                'nombre' => (string)($item['nombre'] ?? ''),
                'metodologia' => (string)($item['metodologia'] ?? ''),
                'condicion_paciente' => (string)($item['condicion_paciente'] ?? ''),
                'tiempo_resultado' => (string)($item['tiempo_resultado'] ?? ''),
                'valores_referenciales' => $item['valores_referenciales'] ?? [],
                'precio_publico' => floatval($item['precio_publico'] ?? 0),
                'servicio_tipo' => 'laboratorio',
                'servicio_id' => intval($item['id'] ?? 0),
                'descripcion' => (string)($item['nombre'] ?? ''),
                'cantidad' => 1,
                'precio_unitario' => floatval($item['precio_publico'] ?? 0),
                'subtotal' => floatval($item['precio_publico'] ?? 0),
            ];
        }

        return $detalles;
    }
}

if (!function_exists('ol_recalcular_total_cotizacion')) {
    function ol_recalcular_total_cotizacion(mysqli $conn, int $cotizacionId)
    {
        $whereEstado = ol_column_exists($conn, 'cotizaciones_detalle', 'estado_item')
            ? " AND estado_item <> 'eliminado'"
            : '';

        $stmtTotal = $conn->prepare("SELECT COALESCE(SUM(subtotal),0) AS total FROM cotizaciones_detalle WHERE cotizacion_id = ?{$whereEstado}");
        if (!$stmtTotal) {
            return;
        }
        $stmtTotal->bind_param('i', $cotizacionId);
        $stmtTotal->execute();
        $row = $stmtTotal->get_result()->fetch_assoc();
        $stmtTotal->close();
        $total = round((float)($row['total'] ?? 0), 2);

        if (ol_column_exists($conn, 'cotizaciones', 'total_pagado') && ol_column_exists($conn, 'cotizaciones', 'saldo_pendiente')) {
            $stmtPag = $conn->prepare('SELECT COALESCE(total_pagado, 0) AS total_pagado FROM cotizaciones WHERE id = ? LIMIT 1');
            $pagado = 0.0;
            if ($stmtPag) {
                $stmtPag->bind_param('i', $cotizacionId);
                $stmtPag->execute();
                $rowPag = $stmtPag->get_result()->fetch_assoc();
                $stmtPag->close();
                $pagado = (float)($rowPag['total_pagado'] ?? 0);
            }

            $saldo = max(0.0, round($total - $pagado, 2));
            $estado = $saldo <= 0.00001 ? 'pagado' : ($pagado > 0.00001 ? 'parcial' : 'pendiente');
            $stmtUp = $conn->prepare('UPDATE cotizaciones SET total = ?, saldo_pendiente = ?, estado = ? WHERE id = ?');
            if ($stmtUp) {
                $stmtUp->bind_param('ddsi', $total, $saldo, $estado, $cotizacionId);
                $stmtUp->execute();
                $stmtUp->close();
            }
            return;
        }

        $stmtUp = $conn->prepare('UPDATE cotizaciones SET total = ? WHERE id = ?');
        if ($stmtUp) {
            $stmtUp->bind_param('di', $total, $cotizacionId);
            $stmtUp->execute();
            $stmtUp->close();
        }
    }
}

switch ($method) {
    case 'POST':
        ol_ensure_write_schema($conn);
        // Crear nueva orden de laboratorio
        $data = json_decode(file_get_contents('php://input'), true);
        $consulta_id = isset($data['consulta_id']) && is_numeric($data['consulta_id']) ? intval($data['consulta_id']) : null;
        $examenes = $data['examenes'] ?? null;
        if (!$examenes || !is_array($examenes) || count($examenes) === 0) {
            echo json_encode(['success' => false, 'error' => 'Faltan exámenes para la orden']);
            exit;
        }
        $json = json_encode(ol_build_detalles_laboratorio_cotizacion($conn, ol_normalize_examenes_ids($examenes)));
        $paciente_id = $data['paciente_id'] ?? null;
        $cobro_id = isset($data['cobro_id']) && is_numeric($data['cobro_id']) ? intval($data['cobro_id']) : null;
        $cotizacion_id_entrada = isset($data['cotizacion_id']) && is_numeric($data['cotizacion_id']) ? intval($data['cotizacion_id']) : null;
        if ($esSesionMedico) {
            if (!$consulta_id) {
                http_response_code(403);
                echo json_encode(['success' => false, 'error' => 'No autorizado para crear órdenes sin consulta asociada']);
                exit;
            }
            $stmtOwnerConsulta = $conn->prepare('SELECT medico_id FROM consultas WHERE id = ? LIMIT 1');
            $stmtOwnerConsulta->bind_param('i', $consulta_id);
            $stmtOwnerConsulta->execute();
            $ownerConsulta = $stmtOwnerConsulta->get_result()->fetch_assoc();
            $stmtOwnerConsulta->close();
            if (!$ownerConsulta || intval($ownerConsulta['medico_id']) !== $medicoSesionId) {
                http_response_code(403);
                echo json_encode(['success' => false, 'error' => 'No autorizado para crear órdenes en consultas de otro médico']);
                exit;
            }
        }
        $cargaAnticipada = !empty($data['carga_anticipada']) ? 1 : 0;

        try {
            if ($consulta_id !== null) {
                // ── Upsert desde consulta médica: consolidar en orden pendiente existente ──
                $conn->begin_transaction();

                $stmtPac = $conn->prepare('SELECT paciente_id FROM consultas WHERE id = ? LIMIT 1');
                $stmtPac->bind_param('i', $consulta_id);
                $stmtPac->execute();
                $rowPac = $stmtPac->get_result()->fetch_assoc();
                $stmtPac->close();
                $pacienteIdCotiz = $rowPac ? intval($rowPac['paciente_id']) : 0;

                $incomingExamIds = ol_normalize_examenes_ids($examenes);
                if (empty($incomingExamIds)) {
                    throw new Exception('No hay examenes validos para registrar');
                }

                $stmtFindPend = $conn->prepare("SELECT id, examenes, cotizacion_id, paciente_id, carga_anticipada
                                                FROM ordenes_laboratorio
                                                WHERE consulta_id = ? AND LOWER(COALESCE(estado, 'pendiente')) = 'pendiente'
                                                ORDER BY id DESC LIMIT 1 FOR UPDATE");
                $stmtFindPend->bind_param('i', $consulta_id);
                $stmtFindPend->execute();
                $ordenPendiente = $stmtFindPend->get_result()->fetch_assoc();
                $stmtFindPend->close();

                $ordenId = 0;
                $cotizacionIdOrden = 0;
                $modoOperacion = 'creada';
                $examenesFinales = $incomingExamIds;

                if ($ordenPendiente) {
                    $ordenId = intval($ordenPendiente['id'] ?? 0);
                    $cotizacionIdOrden = intval($ordenPendiente['cotizacion_id'] ?? 0);
                    $prevExamIds = ol_normalize_examenes_ids(json_decode((string)($ordenPendiente['examenes'] ?? '[]'), true) ?: []);
                    $examenesFinales = array_values(array_unique(array_merge($prevExamIds, $incomingExamIds)));
                    $jsonFinal = json_encode(ol_build_detalles_laboratorio_cotizacion($conn, $examenesFinales));
                    $cargaFinal = (intval($ordenPendiente['carga_anticipada'] ?? 0) === 1 || $cargaAnticipada === 1) ? 1 : 0;

                    $stmtUpOrden = $conn->prepare('UPDATE ordenes_laboratorio SET examenes = ?, carga_anticipada = ?, paciente_id = CASE WHEN (paciente_id IS NULL OR paciente_id = 0) THEN ? ELSE paciente_id END WHERE id = ?');
                    $stmtUpOrden->bind_param('siii', $jsonFinal, $cargaFinal, $pacienteIdCotiz, $ordenId);
                    if (!$stmtUpOrden->execute()) {
                        throw new Exception($stmtUpOrden->error);
                    }
                    $stmtUpOrden->close();
                    $modoOperacion = 'consolidada';
                } else {
                    $jsonFinal = json_encode(ol_build_detalles_laboratorio_cotizacion($conn, $examenesFinales));
                    $stmt = $conn->prepare('INSERT INTO ordenes_laboratorio (consulta_id, examenes, carga_anticipada) VALUES (?, ?, ?)');
                    $stmt->bind_param('isi', $consulta_id, $jsonFinal, $cargaAnticipada);
                    if (!$stmt->execute()) throw new Exception($stmt->error);
                    $stmt->close();
                    $ordenId = $conn->insert_id;

                    // Vincular al nodo HC activo de esta consulta
                    $conn->query("UPDATE ordenes_laboratorio ol INNER JOIN historia_clinica h ON h.consulta_id = ol.consulta_id SET ol.historia_clinica_id = h.id WHERE ol.id = $ordenId AND ol.historia_clinica_id IS NULL");

                    if ($pacienteIdCotiz > 0) {
                        $stmtFixPacienteOrden = $conn->prepare('UPDATE ordenes_laboratorio SET paciente_id = ? WHERE id = ? AND (paciente_id IS NULL OR paciente_id = 0)');
                        if ($stmtFixPacienteOrden) {
                            $stmtFixPacienteOrden->bind_param('ii', $pacienteIdCotiz, $ordenId);
                            $stmtFixPacienteOrden->execute();
                            $stmtFixPacienteOrden->close();
                        }
                    }
                }

                $detallesCotiz = ol_build_detalles_laboratorio_cotizacion($conn, $examenesFinales);
                $cotizData = ['cotizacion_id' => null, 'numero_comprobante' => null, 'total' => 0];

                if (!empty($detallesCotiz) && $pacienteIdCotiz > 0) {
                    $cotizacionEditable = false;
                    if ($cotizacionIdOrden > 0) {
                        $stmtCot = $conn->prepare('SELECT id, estado, numero_comprobante FROM cotizaciones WHERE id = ? FOR UPDATE');
                        if ($stmtCot) {
                            $stmtCot->bind_param('i', $cotizacionIdOrden);
                            $stmtCot->execute();
                            $rowCot = $stmtCot->get_result()->fetch_assoc();
                            $stmtCot->close();
                            if ($rowCot) {
                                $estadoCot = strtolower(trim((string)($rowCot['estado'] ?? 'pendiente')));
                                $cotizacionEditable = in_array($estadoCot, ['pendiente', 'parcial'], true);
                            }
                        }
                    }

                    if ($cotizacionIdOrden > 0 && $cotizacionEditable) {
                        $hasConsultaDetalle = ol_column_exists($conn, 'cotizaciones_detalle', 'consulta_id');
                        if ($hasConsultaDetalle) {
                            $stmtDelLab = $conn->prepare("DELETE FROM cotizaciones_detalle WHERE cotizacion_id = ? AND consulta_id = ? AND LOWER(TRIM(servicio_tipo)) = 'laboratorio'");
                            $stmtDelLab->bind_param('ii', $cotizacionIdOrden, $consulta_id);
                        } else {
                            $stmtDelLab = $conn->prepare("DELETE FROM cotizaciones_detalle WHERE cotizacion_id = ? AND LOWER(TRIM(servicio_tipo)) = 'laboratorio'");
                            $stmtDelLab->bind_param('i', $cotizacionIdOrden);
                        }
                        if ($stmtDelLab) {
                            $stmtDelLab->execute();
                            $stmtDelLab->close();
                        }

                        foreach ($detallesCotiz as $d) {
                            $servTipo = $conn->real_escape_string($d['servicio_tipo']);
                            $servId = intval($d['servicio_id']);
                            $desc = $conn->real_escape_string($d['descripcion']);
                            $cant = intval($d['cantidad'] ?? 1);
                            $pu = floatval($d['precio_unitario']);
                            $sub = floatval($d['subtotal']);
                            if ($hasConsultaDetalle) {
                                $conn->query("INSERT INTO cotizaciones_detalle (cotizacion_id, servicio_tipo, servicio_id, descripcion, cantidad, precio_unitario, subtotal, consulta_id) VALUES ($cotizacionIdOrden, '$servTipo', $servId, '$desc', $cant, $pu, $sub, $consulta_id)");
                            } else {
                                $conn->query("INSERT INTO cotizaciones_detalle (cotizacion_id, servicio_tipo, servicio_id, descripcion, cantidad, precio_unitario, subtotal) VALUES ($cotizacionIdOrden, '$servTipo', $servId, '$desc', $cant, $pu, $sub)");
                            }
                        }

                        ol_recalcular_total_cotizacion($conn, $cotizacionIdOrden);

                        $stmtOut = $conn->prepare('SELECT numero_comprobante, total FROM cotizaciones WHERE id = ? LIMIT 1');
                        if ($stmtOut) {
                            $stmtOut->bind_param('i', $cotizacionIdOrden);
                            $stmtOut->execute();
                            $rowOut = $stmtOut->get_result()->fetch_assoc();
                            $stmtOut->close();
                            $cotizData = [
                                'cotizacion_id' => $cotizacionIdOrden,
                                'numero_comprobante' => $rowOut['numero_comprobante'] ?? null,
                                'total' => (float)($rowOut['total'] ?? 0),
                            ];
                        }
                    } else {
                        // Usar usuario_id = 0 si es médico (su ID viene de tabla medicos, no usuarios)
                        $rolCreador = $sessionUsuario['rol'] ?? '';
                        $usuarioIdCotiz = ($rolCreador === 'medico') ? 0 : intval($sessionUsuario['id'] ?? 0);
                        $obsText = 'Orden de laboratorio desde consulta #' . $consulta_id;
                        $cotizData = crearCotizacionDesdeOrden($conn, $pacienteIdCotiz, $consulta_id, $detallesCotiz, $usuarioIdCotiz, $obsText);
                        $cotizIdNuevo = intval($cotizData['cotizacion_id']);

                        if ($cotizIdNuevo > 0) {
                            $stmtLink = $conn->prepare('UPDATE ordenes_laboratorio SET cotizacion_id = ? WHERE id = ?');
                            if ($stmtLink) {
                                $stmtLink->bind_param('ii', $cotizIdNuevo, $ordenId);
                                $stmtLink->execute();
                                $stmtLink->close();
                            }
                        }
                    }
                }

                $conn->commit();

                echo json_encode([
                    'success' => true,
                    'modo' => $modoOperacion,
                    'orden_id' => $ordenId,
                    'paciente_id' => $pacienteIdCotiz,
                    'cotizacion_id' => $cotizData['cotizacion_id'],
                    'numero_comprobante' => $cotizData['numero_comprobante'],
                    'total' => $cotizData['total'],
                ]);
            } else if ($paciente_id && $cobro_id !== null) {
                // Orden cotizada directamente. Si ya existe una orden para esta cotización, actualizar cobro_id en lugar de duplicar.
                $ordenId = 0;
                if ($cotizacion_id_entrada) {
                    $stmtFind = $conn->prepare('SELECT id FROM ordenes_laboratorio WHERE cotizacion_id = ? LIMIT 1');
                    if ($stmtFind) {
                        $stmtFind->bind_param('i', $cotizacion_id_entrada);
                        $stmtFind->execute();
                        $rowFind = $stmtFind->get_result()->fetch_assoc();
                        $stmtFind->close();
                        if ($rowFind) {
                            $ordenId = intval($rowFind['id']);
                            $stmtUpd = $conn->prepare('UPDATE ordenes_laboratorio SET cobro_id = ?, examenes = ? WHERE id = ?');
                            if ($stmtUpd) {
                                $stmtUpd->bind_param('isi', $cobro_id, $json, $ordenId);
                                $stmtUpd->execute();
                                $stmtUpd->close();
                            }
                        }
                    }
                }
                if (!$ordenId) {
                    $stmt = $conn->prepare('INSERT INTO ordenes_laboratorio (consulta_id, examenes, paciente_id, cobro_id, cotizacion_id, carga_anticipada) VALUES (NULL, ?, ?, ?, ?, ?)');
                    $stmt->bind_param('siiii', $json, $paciente_id, $cobro_id, $cotizacion_id_entrada, $cargaAnticipada);
                    if (!$stmt->execute()) throw new Exception($stmt->error);
                    $stmt->close();
                    $ordenId = $conn->insert_id;
                }
                echo json_encode(['success' => true, 'orden_id' => $ordenId]);
            } else if ($paciente_id) {
                $stmt = $conn->prepare('INSERT INTO ordenes_laboratorio (consulta_id, examenes, paciente_id, carga_anticipada) VALUES (NULL, ?, ?, ?)');
                $stmt->bind_param('sii', $json, $paciente_id, $cargaAnticipada);
                if (!$stmt->execute()) throw new Exception($stmt->error);
                $stmt->close();
                echo json_encode(['success' => true, 'orden_id' => $conn->insert_id]);
            } else {
                $stmt = $conn->prepare('INSERT INTO ordenes_laboratorio (consulta_id, examenes, carga_anticipada) VALUES (NULL, ?, ?)');
                $stmt->bind_param('si', $json, $cargaAnticipada);
                if (!$stmt->execute()) throw new Exception($stmt->error);
                $stmt->close();
                echo json_encode(['success' => true, 'orden_id' => $conn->insert_id]);
            }
        } catch (Exception $e) {
            error_log('Error al guardar orden laboratorio: ' . $e->getMessage());
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        }
        break;
    case 'GET':
        // Listar órdenes de laboratorio (por estado o consulta_id)
        $estado = $_GET['estado'] ?? null;
        $consulta_id = isset($_GET['consulta_id']) ? intval($_GET['consulta_id']) : null;
        $filtro_alerta = isset($_GET['filtro_alerta']) ? strtolower(trim((string)$_GET['filtro_alerta'])) : '';
        $resumen_alertas = isset($_GET['resumen_alertas']) && intval($_GET['resumen_alertas']) === 1;
        $usePagination = isset($_GET['paginated']) && intval($_GET['paginated']) === 1;
        $solo_visibles_panel = isset($_GET['solo_visibles_panel']) && intval($_GET['solo_visibles_panel']) === 1;
        $page = isset($_GET['page']) ? max(1, intval($_GET['page'])) : 1;
        $limit = isset($_GET['limit']) ? max(1, intval($_GET['limit'])) : 10;
        $limit = min($limit, 50);
        $offset = ($page - 1) * $limit;
        $filtro_fecha_desde = isset($_GET['filtro_fecha_desde']) ? trim((string)$_GET['filtro_fecha_desde']) : '';
        $filtro_fecha_hasta = isset($_GET['filtro_fecha_hasta']) ? trim((string)$_GET['filtro_fecha_hasta']) : '';
        $filtro_busqueda = isset($_GET['filtro_busqueda']) ? trim((string)$_GET['filtro_busqueda']) : '';
        // En endpoints por consulta, el médico debe ser dueño de la consulta solicitada.
        // Esto evita exposición cruzada y permite relajar filtros por fila cuando la orden
        // heredada no tiene medico resoluble por joins.
        if ($esSesionMedico && $consulta_id && $consulta_id > 0) {
            if (!ol_medico_tiene_acceso_consulta($conn, $consulta_id, $medicoSesionId, 'read')) {
                http_response_code(403);
                echo json_encode(['success' => false, 'error' => 'No autorizado para ver órdenes de esta consulta']);
                break;
            }
        }

        // Fast path: si no hay órdenes, evitar consultas/joins pesados.
        $resQuickCount = $conn->query('SELECT COUNT(*) AS total FROM ordenes_laboratorio');
        $totalQuick = $resQuickCount ? intval(($resQuickCount->fetch_assoc()['total'] ?? 0)) : 0;
        if ($totalQuick === 0) {
            if ($resumen_alertas) {
                $payloadEmptyAlerts = ['vencido' => 0, 'por_vencer' => 0, 'en_tiempo' => 0, 'total' => 0];
                ol_log_slow_request($requestStartedAt, 'GET', 'fast_path_empty_resumen');
                echo json_encode($payloadEmptyAlerts);
                break;
            }

            $payloadEmpty = ['success' => true, 'ordenes' => []];
            if ($usePagination) {
                $payloadEmpty['total'] = 0;
                $payloadEmpty['page'] = $page;
                $payloadEmpty['limit'] = $limit;
            }
            ol_log_slow_request($requestStartedAt, 'GET', 'fast_path_empty_list');
            echo json_encode($payloadEmpty);
            break;
        }

        // Verificar si cotizaciones_detalle tiene columna derivado
        $hasDerivadoCol = false;
        $hasDerivadoCol = ol_column_exists($conn, 'cotizaciones_detalle', 'derivado');
        $derivadoExpr = $hasDerivadoCol
            ? "(SELECT IF(COUNT(*) > 0, 1, 0) FROM cotizaciones_detalle cd WHERE cd.cotizacion_id = o.cotizacion_id AND cd.derivado = 1)"
            : "0";

        $sql = "SELECT o.*, 
                    COALESCE(o.consulta_id, cd_ref.consulta_ref_id) AS consulta_id_ref,
                    IFNULL(p2.id, IFNULL(p.id, p_ref.id)) AS paciente_id_ref,
                    IFNULL(p2.nombre, IFNULL(p.nombre, p_ref.nombre)) AS paciente_nombre, 
                    IFNULL(p2.apellido, IFNULL(p.apellido, p_ref.apellido)) AS paciente_apellido, 
                    IFNULL(p2.sexo, IFNULL(p.sexo, p_ref.sexo)) AS paciente_sexo,
                    IFNULL(p2.edad, IFNULL(p.edad, p_ref.edad)) AS paciente_edad,
                    m.nombre AS medico_nombre, 
                    m.apellido AS medico_apellido,
                    $derivadoExpr AS tiene_derivados
                FROM ordenes_laboratorio o 
                LEFT JOIN consultas c ON o.consulta_id = c.id 
                LEFT JOIN (
                    SELECT cotizacion_id, MAX(consulta_id) AS consulta_ref_id
                    FROM cotizaciones_detalle
                    WHERE consulta_id IS NOT NULL AND consulta_id > 0
                    GROUP BY cotizacion_id
                ) cd_ref ON cd_ref.cotizacion_id = o.cotizacion_id
                LEFT JOIN consultas c_ref ON c_ref.id = cd_ref.consulta_ref_id
                LEFT JOIN pacientes p ON c.paciente_id = p.id 
                LEFT JOIN pacientes p_ref ON c_ref.paciente_id = p_ref.id
                LEFT JOIN pacientes p2 ON o.paciente_id = p2.id 
                LEFT JOIN cotizaciones ct ON o.cotizacion_id = ct.id
                LEFT JOIN medicos m ON m.id = COALESCE(c.medico_id, c_ref.medico_id)
                WHERE 1=1";
        $params = [];
        $types = '';
        if ($solo_visibles_panel) {
            $sql .= " AND (o.cotizacion_id IS NULL OR o.cotizacion_id = 0 OR LOWER(COALESCE(ct.estado, '')) = 'pagado')";
        }
        if ($estado) {
            $sql .= ' AND o.estado = ?';
            $params[] = $estado;
            $types .= 's';
        }
        if ($consulta_id) {
            // Regla estricta HC: solo órdenes ligadas explícitamente a la consulta actual.
            $sql .= ' AND o.consulta_id = ?';
            $params[] = $consulta_id;
            $types .= 'i';
        }
        if ($esSesionMedico && $consulta_id) {
            $sql .= ' AND COALESCE('
                . ' (SELECT MAX(cd_hc.medico_id) FROM cotizaciones_detalle cd_hc'
                . '   WHERE cd_hc.cotizacion_id = o.cotizacion_id'
                . '     AND cd_hc.consulta_id = o.consulta_id'
                . '     AND LOWER(TRIM(cd_hc.servicio_tipo)) = "laboratorio"'
                . '     AND cd_hc.medico_id IS NOT NULL'
                . '     AND cd_hc.medico_id > 0),'
                . ' c.medico_id, c_ref.medico_id'
                . ' ) = ?';
            $params[] = $medicoSesionId;
            $types .= 'i';
        }
        if ($filtro_fecha_desde !== '') {
            $sql .= ' AND DATE(o.fecha) >= ?';
            $params[] = $filtro_fecha_desde;
            $types .= 's';
        }
        if ($filtro_fecha_hasta !== '') {
            $sql .= ' AND DATE(o.fecha) <= ?';
            $params[] = $filtro_fecha_hasta;
            $types .= 's';
        }
        if ($filtro_busqueda !== '') {
            $sql .= ' AND (
                CONCAT(IFNULL(p2.nombre, p.nombre), " ", IFNULL(p2.apellido, p.apellido)) LIKE ?
                OR CONCAT(IFNULL(m.nombre, ""), " ", IFNULL(m.apellido, "")) LIKE ?
                OR IFNULL(p2.nombre, p.nombre) LIKE ?
                OR IFNULL(p2.apellido, p.apellido) LIKE ?
                OR IFNULL(m.nombre, "") LIKE ?
                OR IFNULL(m.apellido, "") LIKE ?
            )';
            $searchLike = '%' . $filtro_busqueda . '%';
            $params[] = $searchLike;
            $params[] = $searchLike;
            $params[] = $searchLike;
            $params[] = $searchLike;
            $params[] = $searchLike;
            $params[] = $searchLike;
            $types .= 'ssssss';
        }
        if ($esSesionMedico && !$consulta_id) {
            // Tercer camino para ordenes de contrato sin consulta_id directo:
            // resolver medico_id via agenda_contrato → consultas.
            $sql .= ' AND COALESCE(c.medico_id, c_ref.medico_id,'
                . ' (SELECT c_ag.medico_id FROM cotizaciones_detalle cd_m'
                . '  INNER JOIN agenda_contrato ac_m'
                . '      ON ac_m.contrato_paciente_id = cd_m.contrato_paciente_id'
            . '     AND LOWER(TRIM(ac_m.servicio_tipo)) COLLATE utf8mb4_general_ci = LOWER(TRIM(cd_m.servicio_tipo)) COLLATE utf8mb4_general_ci'
                . '     AND ac_m.servicio_id = cd_m.servicio_id'
                . '  INNER JOIN consultas c_ag ON c_ag.id = ac_m.consulta_id'
                . '  WHERE cd_m.cotizacion_id = o.cotizacion_id AND cd_m.contrato_paciente_id > 0'
                . '    AND ac_m.consulta_id > 0 LIMIT 1)'
                . ') = ?';
            $params[] = $medicoSesionId;
            $types .= 'i';
        }

        $sqlCount = "SELECT COUNT(*) AS total
                FROM ordenes_laboratorio o
                LEFT JOIN consultas c ON o.consulta_id = c.id
                LEFT JOIN (
                    SELECT cotizacion_id, MAX(consulta_id) AS consulta_ref_id
                    FROM cotizaciones_detalle
                    WHERE consulta_id IS NOT NULL AND consulta_id > 0
                    GROUP BY cotizacion_id
                ) cd_ref ON cd_ref.cotizacion_id = o.cotizacion_id
                LEFT JOIN consultas c_ref ON c_ref.id = cd_ref.consulta_ref_id
                LEFT JOIN pacientes p ON c.paciente_id = p.id
                LEFT JOIN pacientes p_ref ON c_ref.paciente_id = p_ref.id
                LEFT JOIN pacientes p2 ON o.paciente_id = p2.id
                LEFT JOIN cotizaciones ct ON o.cotizacion_id = ct.id
                LEFT JOIN medicos m ON m.id = COALESCE(c.medico_id, c_ref.medico_id)
                WHERE 1=1";
        if ($solo_visibles_panel) {
            $sqlCount .= " AND (o.cotizacion_id IS NULL OR o.cotizacion_id = 0 OR LOWER(COALESCE(ct.estado, '')) = 'pagado')";
        }
        if ($estado) {
            $sqlCount .= ' AND o.estado = ?';
        }
        if ($consulta_id) {
            $sqlCount .= ' AND o.consulta_id = ?';
        }
        if ($esSesionMedico && $consulta_id) {
            $sqlCount .= ' AND COALESCE('
                . ' (SELECT MAX(cd_hc.medico_id) FROM cotizaciones_detalle cd_hc'
                . '   WHERE cd_hc.cotizacion_id = o.cotizacion_id'
                . '     AND cd_hc.consulta_id = o.consulta_id'
                . '     AND LOWER(TRIM(cd_hc.servicio_tipo)) = "laboratorio"'
                . '     AND cd_hc.medico_id IS NOT NULL'
                . '     AND cd_hc.medico_id > 0),'
                . ' c.medico_id, c_ref.medico_id'
                . ' ) = ?';
        }
        if ($filtro_fecha_desde !== '') {
            $sqlCount .= ' AND DATE(o.fecha) >= ?';
        }
        if ($filtro_fecha_hasta !== '') {
            $sqlCount .= ' AND DATE(o.fecha) <= ?';
        }
        if ($filtro_busqueda !== '') {
            $sqlCount .= ' AND (
                CONCAT(IFNULL(p2.nombre, p.nombre), " ", IFNULL(p2.apellido, p.apellido)) LIKE ?
                OR CONCAT(IFNULL(m.nombre, ""), " ", IFNULL(m.apellido, "")) LIKE ?
                OR IFNULL(p2.nombre, p.nombre) LIKE ?
                OR IFNULL(p2.apellido, p.apellido) LIKE ?
                OR IFNULL(m.nombre, "") LIKE ?
                OR IFNULL(m.apellido, "") LIKE ?
            )';
        }
        if ($esSesionMedico && !$consulta_id) {
            $sqlCount .= ' AND COALESCE(c.medico_id, c_ref.medico_id,'
                . ' (SELECT c_ag.medico_id FROM cotizaciones_detalle cd_m'
                . '  INNER JOIN agenda_contrato ac_m'
                . '      ON ac_m.contrato_paciente_id = cd_m.contrato_paciente_id'
            . '     AND LOWER(TRIM(ac_m.servicio_tipo)) COLLATE utf8mb4_general_ci = LOWER(TRIM(cd_m.servicio_tipo)) COLLATE utf8mb4_general_ci'
                . '     AND ac_m.servicio_id = cd_m.servicio_id'
                . '  INNER JOIN consultas c_ag ON c_ag.id = ac_m.consulta_id'
                . '  WHERE cd_m.cotizacion_id = o.cotizacion_id AND cd_m.contrato_paciente_id > 0'
                . '    AND ac_m.consulta_id > 0 LIMIT 1)'
                . ') = ?';
        }

        $totalRegistros = 0;
        if ($usePagination && !$resumen_alertas) {
            $stmtCount = $conn->prepare($sqlCount);
            if ($stmtCount) {
                if ($params) {
                    $stmtCount->bind_param($types, ...$params);
                }
                $stmtCount->execute();
                $rowCount = $stmtCount->get_result()->fetch_assoc();
                $stmtCount->close();
                $totalRegistros = intval($rowCount['total'] ?? 0);
            }
        }

        $sql .= ' ORDER BY o.fecha DESC, o.id DESC';
        if ($usePagination && !$resumen_alertas) {
            $sql .= ' LIMIT ? OFFSET ?';
        }

        $execTypes = $types;
        $execParams = $params;
        if ($usePagination && !$resumen_alertas) {
            $execTypes .= 'ii';
            $execParams[] = $limit;
            $execParams[] = $offset;
        }

        $stmt = $conn->prepare($sql);
        if ($execParams) {
            $stmt->bind_param($execTypes, ...$execParams);
        }
        $stmt->execute();
        $res = $stmt->get_result();
        $rowsBase = $res ? $res->fetch_all(MYSQLI_ASSOC) : [];
        $ordenes = [];
        $totales_alertas = [
            'vencido' => 0,
            'por_vencer' => 0,
            'en_tiempo' => 0,
            'total' => 0
        ];

        $normalizarValoresReferenciales = function ($examen) {
            $items = [];
            if (!empty($examen['valores_referenciales'])) {
                $decoded = decode_valores_referenciales_any($examen['valores_referenciales']);
                if (is_array($decoded)) {
                    foreach ($decoded as $idx => $it) {
                        if (!is_array($it)) continue;
                        $item = [];
                        $item['tipo'] = isset($it['tipo']) && $it['tipo'] !== '' ? $it['tipo'] : 'Parámetro';
                        $fallbackNombre = 'Item ' . ($idx + 1);
                        if (count($decoded) === 1 && !empty($examen['nombre'])) {
                            $fallbackNombre = $examen['nombre'];
                        }
                        $item['nombre'] = isset($it['nombre']) && trim($it['nombre']) !== ''
                            ? $it['nombre']
                            : (isset($it['titulo']) && trim($it['titulo']) !== '' ? $it['titulo'] : $fallbackNombre);
                        $item['metodologia'] = isset($it['metodologia']) ? $it['metodologia'] : '';
                        $item['unidad'] = isset($it['unidad']) ? $it['unidad'] : '';
                        $item['opciones'] = (isset($it['opciones']) && is_array($it['opciones'])) ? $it['opciones'] : [];
                        $item['referencias'] = [];
                        if (isset($it['referencias']) && is_array($it['referencias'])) {
                            foreach ($it['referencias'] as $r) {
                                if (!is_array($r)) continue;
                                $item['referencias'][] = [
                                    'valor' => $r['valor'] ?? '',
                                    'valor_min' => $r['valor_min'] ?? '',
                                    'valor_max' => $r['valor_max'] ?? '',
                                    'desc' => $r['desc'] ?? '',
                                    'sexo' => $r['sexo'] ?? 'cualquiera',
                                    'edad_min' => $r['edad_min'] ?? '',
                                    'edad_max' => $r['edad_max'] ?? ''
                                ];
                            }
                        }
                        if (!empty($it['min']) || !empty($it['max'])) {
                            $item['referencias'][] = [
                                'valor' => '',
                                'valor_min' => $it['min'] ?? '',
                                'valor_max' => $it['max'] ?? '',
                                'desc' => 'Rango'
                            ];
                        }
                        $item['formula'] = isset($it['formula']) ? $it['formula'] : '';
                        $item['negrita'] = !empty($it['negrita']) ? true : false;
                        $item['cursiva'] = !empty($it['cursiva']) ? true : false;
                        $item['alineacion'] = isset($it['alineacion']) ? $it['alineacion'] : 'left';
                        $item['color_texto'] = isset($it['color_texto']) ? $it['color_texto'] : '#000000';
                        $item['color_fondo'] = isset($it['color_fondo']) ? $it['color_fondo'] : '#ffffff';
                        $item['decimales'] = (isset($it['decimales']) && $it['decimales'] !== '' && is_numeric($it['decimales'])) ? intval($it['decimales']) : null;
                        $item['rows'] = (isset($it['rows']) && $it['rows'] !== '' && is_numeric($it['rows'])) ? intval($it['rows']) : null;
                        $item['orden'] = (isset($it['orden']) && is_numeric($it['orden'])) ? intval($it['orden']) : ($idx + 1);
                        $items[] = $item;
                    }
                }
            }
            $examen['valores_referenciales'] = $items;
            return $examen;
        };

        $examenesIdsPorOrden = [];
        $examenesRawPorOrden = [];
        $allExamenesIds = [];
        $allCotizacionIds = [];
        $allCobroIds = [];
        $allOrderIds = [];

        foreach ($rowsBase as $rowBase) {
            $orderId = intval($rowBase['id'] ?? 0);
            if ($orderId > 0) {
                $allOrderIds[] = $orderId;
            }

            $examenesIdsRaw = json_decode($rowBase['examenes'], true) ?: [];
            $examenesRawPorOrden[$orderId] = [];
            $examenesIds = array_values(array_filter(array_map(function ($it) {
                return is_array($it) && isset($it['id']) ? intval($it['id']) : intval($it);
            }, $examenesIdsRaw), function ($v) {
                return $v > 0;
            }));
            foreach ($examenesIdsRaw as $it) {
                if (is_array($it) && isset($it['id'])) {
                    $eid = intval($it['id']);
                    if ($eid > 0) {
                        $examenesRawPorOrden[$orderId][$eid] = $it;
                    }
                }
            }
            $examenesIdsPorOrden[$orderId] = $examenesIds;
            foreach ($examenesIds as $eid) {
                $allExamenesIds[] = $eid;
            }

            $cotizId = intval($rowBase['cotizacion_id'] ?? 0);
            if ($cotizId > 0) {
                $allCotizacionIds[] = $cotizId;
            }

            $cobroId = intval($rowBase['cobro_id'] ?? 0);
            if ($cobroId > 0) {
                $allCobroIds[] = $cobroId;
            }
        }

        $allExamenesIds = array_values(array_unique($allExamenesIds));
        $allCotizacionIds = array_values(array_unique($allCotizacionIds));
        $allCobroIds = array_values(array_unique($allCobroIds));
        $allOrderIds = array_values(array_unique($allOrderIds));

        $examenCatalogo = [];
        if (!empty($allExamenesIds)) {
            $placeholders = implode(',', array_fill(0, count($allExamenesIds), '?'));
            $sqlExamenes = "SELECT id, nombre, metodologia as descripcion, condicion_paciente, tiempo_resultado, valores_referenciales FROM examenes_laboratorio WHERE id IN ($placeholders)";
            $stmtExamenes = $conn->prepare($sqlExamenes);
            if ($stmtExamenes) {
                $stmtExamenes->bind_param(str_repeat('i', count($allExamenesIds)), ...$allExamenesIds);
                $stmtExamenes->execute();
                $rowsExamenes = $stmtExamenes->get_result()->fetch_all(MYSQLI_ASSOC);
                $stmtExamenes->close();

                foreach ($rowsExamenes as $examen) {
                    $examenNormalizado = $normalizarValoresReferenciales($examen);
                    $examenCatalogo[intval($examenNormalizado['id'])] = $examenNormalizado;
                }
            }
        }

        $derivadosPorCotizacion = [];
        $cargarDerivadosCotizacion = function ($cotizIds) use ($conn, &$derivadosPorCotizacion, $hasDerivadoCol) {
            if (!$hasDerivadoCol || empty($cotizIds)) return;
            $cotizIds = array_values(array_unique(array_filter(array_map('intval', (array)$cotizIds), function ($id) {
                return $id > 0;
            })));
            if (empty($cotizIds)) return;

            $placeholders = implode(',', array_fill(0, count($cotizIds), '?'));
            $sqlDeriv = "SELECT cotizacion_id, servicio_id FROM cotizaciones_detalle WHERE servicio_tipo = 'laboratorio' AND derivado = 1 AND cotizacion_id IN ($placeholders)";
            $stmtDeriv = $conn->prepare($sqlDeriv);
            if (!$stmtDeriv) return;
            $stmtDeriv->bind_param(str_repeat('i', count($cotizIds)), ...$cotizIds);
            $stmtDeriv->execute();
            $rowsDeriv = $stmtDeriv->get_result()->fetch_all(MYSQLI_ASSOC);
            $stmtDeriv->close();

            foreach ($rowsDeriv as $dr) {
                $cid = intval($dr['cotizacion_id'] ?? 0);
                $sid = intval($dr['servicio_id'] ?? 0);
                if ($cid <= 0 || $sid <= 0) continue;
                if (!isset($derivadosPorCotizacion[$cid])) {
                    $derivadosPorCotizacion[$cid] = [];
                }
                $derivadosPorCotizacion[$cid][$sid] = true;
            }
        };

        $cargarDerivadosCotizacion($allCotizacionIds);

        $derivadosPorCobro = [];
        $cotizacionViaCobro = [];
        $cotizPendientesDesdeCobro = [];
        if (!empty($allCobroIds)) {
            $placeholders = implode(',', array_fill(0, count($allCobroIds), '?'));
            $sqlCob = "SELECT cobro_id, descripcion FROM cobros_detalle WHERE servicio_tipo = 'laboratorio' AND cobro_id IN ($placeholders)";
            $stmtCob = $conn->prepare($sqlCob);
            if ($stmtCob) {
                $stmtCob->bind_param(str_repeat('i', count($allCobroIds)), ...$allCobroIds);
                $stmtCob->execute();
                $rowsCob = $stmtCob->get_result()->fetch_all(MYSQLI_ASSOC);
                $stmtCob->close();

                foreach ($rowsCob as $cobRow) {
                    $cobroId = intval($cobRow['cobro_id'] ?? 0);
                    if ($cobroId <= 0 || empty($cobRow['descripcion'])) continue;
                    $itemsJson = json_decode($cobRow['descripcion'], true);
                    if (!is_array($itemsJson)) continue;

                    foreach ($itemsJson as $item) {
                        if (!is_array($item)) continue;
                        if (!empty($item['derivado']) && isset($item['servicio_id'])) {
                            $sid = intval($item['servicio_id']);
                            if ($sid > 0) {
                                if (!isset($derivadosPorCobro[$cobroId])) {
                                    $derivadosPorCobro[$cobroId] = [];
                                }
                                $derivadosPorCobro[$cobroId][$sid] = true;
                            }
                        }
                        if (!isset($cotizacionViaCobro[$cobroId]) && !empty($item['cotizacion_id'])) {
                            $cid = intval($item['cotizacion_id']);
                            if ($cid > 0) {
                                $cotizacionViaCobro[$cobroId] = $cid;
                                $cotizPendientesDesdeCobro[] = $cid;
                            }
                        }
                    }
                }
            }
        }

        if ($hasDerivadoCol && !empty($cotizPendientesDesdeCobro)) {
            $cargarDerivadosCotizacion($cotizPendientesDesdeCobro);
        }

        $cotizacionSnapshotsPorId = [];
        $hasSnapshotJsonDetalle = ol_column_exists($conn, 'cotizaciones_detalle', 'snapshot_json');
        if (!empty($allCotizacionIds)) {
            $placeholders = implode(',', array_fill(0, count($allCotizacionIds), '?'));
            $selectSnapshotJson = $hasSnapshotJsonDetalle ? ', snapshot_json' : '';
            $sqlLabSnap = "SELECT cotizacion_id, servicio_id, descripcion{$selectSnapshotJson} FROM cotizaciones_detalle WHERE servicio_tipo = 'laboratorio' AND cotizacion_id IN ($placeholders) ORDER BY cotizacion_id ASC, id ASC";
            $stmtLabSnap = $conn->prepare($sqlLabSnap);
            if ($stmtLabSnap) {
                $stmtLabSnap->bind_param(str_repeat('i', count($allCotizacionIds)), ...$allCotizacionIds);
                $stmtLabSnap->execute();
                $rowsLabSnap = $stmtLabSnap->get_result()->fetch_all(MYSQLI_ASSOC);
                $stmtLabSnap->close();

                foreach ($rowsLabSnap as $snapRow) {
                    $cid = intval($snapRow['cotizacion_id'] ?? 0);
                    $sid = intval($snapRow['servicio_id'] ?? 0);
                    if ($cid <= 0 || $sid <= 0) {
                        continue;
                    }
                    if (!isset($cotizacionSnapshotsPorId[$cid])) {
                        $cotizacionSnapshotsPorId[$cid] = [];
                    }
                    if (!isset($cotizacionSnapshotsPorId[$cid][$sid])) {
                        $snapshotJson = null;
                        if ($hasSnapshotJsonDetalle && !empty($snapRow['snapshot_json'])) {
                            $decodedSnapshot = json_decode((string)$snapRow['snapshot_json'], true);
                            if (is_array($decodedSnapshot)) {
                                $snapshotJson = $decodedSnapshot;
                            }
                        }
                        $cotizacionSnapshotsPorId[$cid][$sid] = [
                            'descripcion' => (string)($snapRow['descripcion'] ?? ''),
                            'snapshot_json' => $snapshotJson,
                        ];
                    }
                }
            }
        }

        $resultadoPorOrden = [];
        if (!empty($allOrderIds)) {
            $placeholders = implode(',', array_fill(0, count($allOrderIds), '?'));
            $sqlResultados = "SELECT * FROM resultados_laboratorio WHERE orden_id IN ($placeholders) ORDER BY orden_id ASC, id DESC";
            $stmtResultados = $conn->prepare($sqlResultados);
            if ($stmtResultados) {
                $stmtResultados->bind_param(str_repeat('i', count($allOrderIds)), ...$allOrderIds);
                $stmtResultados->execute();
                $rowsResultados = $stmtResultados->get_result()->fetch_all(MYSQLI_ASSOC);
                $stmtResultados->close();

                foreach ($rowsResultados as $rr) {
                    $oid = intval($rr['orden_id'] ?? 0);
                    if ($oid > 0 && !isset($resultadoPorOrden[$oid])) {
                        $resultadoPorOrden[$oid] = $rr;
                    }
                }
            }
        }

        foreach ($rowsBase as $row) {
            $orderId = intval($row['id'] ?? 0);
            $examenes_ids = $examenesIdsPorOrden[$orderId] ?? [];
            $examenes_detalle = [];
            foreach ($examenes_ids as $eid) {
                $catalogoActual = $examenCatalogo[$eid] ?? null;
                $snapshotOrden = $examenesRawPorOrden[$orderId][$eid] ?? null;
                $snapshotCotizacion = null;
                $cotizId = intval($row['cotizacion_id'] ?? 0);
                if ($cotizId > 0 && isset($cotizacionSnapshotsPorId[$cotizId][$eid])) {
                    $snapshotCotizacion = $cotizacionSnapshotsPorId[$cotizId][$eid];
                }

                $detalleBase = [];
                if (is_array($snapshotOrden) && !empty($snapshotOrden['snapshot_json'])) {
                    $detalleBase = $snapshotOrden['snapshot_json'];
                } elseif (is_array($snapshotCotizacion) && !empty($snapshotCotizacion['snapshot_json'])) {
                    $detalleBase = $snapshotCotizacion['snapshot_json'];
                } elseif (is_array($snapshotOrden) && !empty($snapshotOrden)) {
                    $detalleBase = $snapshotOrden;
                } elseif (is_array($catalogoActual) && !empty($catalogoActual)) {
                    $detalleBase = $catalogoActual;
                } elseif (is_array($snapshotCotizacion) && !empty($snapshotCotizacion)) {
                    $detalleBase = [
                        'id' => $eid,
                        'nombre' => (string)($snapshotCotizacion['descripcion'] ?? ''),
                        'descripcion' => (string)($snapshotCotizacion['descripcion'] ?? ''),
                        'valores_referenciales' => [],
                    ];
                }

                if (empty($detalleBase)) {
                    continue;
                }

                if (is_array($snapshotCotizacion) && !empty($snapshotCotizacion['descripcion'])) {
                    $snapshotNombre = trim((string)$snapshotCotizacion['descripcion']);
                    $nombreActual = trim((string)($detalleBase['nombre'] ?? $detalleBase['descripcion'] ?? ''));
                    if ($snapshotNombre !== '' && $snapshotNombre !== $nombreActual) {
                        $detalleBase['nombre'] = $snapshotNombre;
                        $detalleBase['descripcion'] = $snapshotNombre;
                        // Mantener parametros historicos disponibles para evitar ocultar
                        // campos/resultados cuando solo cambia el nombre del examen.
                        $detalleBase['snapshot_nombre'] = $snapshotNombre;
                        $detalleBase['snapshot_origen'] = 'cotizacion';
                    }
                }

                $examenes_detalle[] = $detalleBase;
            }

            $derivadoMap = [];
            if ($hasDerivadoCol && $cotizId > 0 && isset($derivadosPorCotizacion[$cotizId])) {
                $derivadoMap = $derivadosPorCotizacion[$cotizId];
            }

            $cobroId = intval($row['cobro_id'] ?? 0);
            if (empty($derivadoMap) && $cobroId > 0 && isset($derivadosPorCobro[$cobroId])) {
                $derivadoMap = $derivadosPorCobro[$cobroId];
            }

            if (empty($derivadoMap) && $hasDerivadoCol && $cobroId > 0 && isset($cotizacionViaCobro[$cobroId])) {
                $cid = intval($cotizacionViaCobro[$cobroId]);
                if ($cid > 0 && isset($derivadosPorCotizacion[$cid])) {
                    $derivadoMap = $derivadosPorCotizacion[$cid];
                }
            }

            foreach ($examenes_detalle as &$exDetalle) {
                $exDetalle['derivado'] = isset($derivadoMap[intval($exDetalle['id'] ?? 0)]);
            }
            unset($exDetalle);

            $row['examenes'] = $examenes_detalle;

            $resultadoRow = $resultadoPorOrden[$orderId] ?? null;
            $resultadosJson = null;
            if ($resultadoRow && isset($resultadoRow['resultados'])) {
                $decoded = json_decode($resultadoRow['resultados'], true);
                $resultadosJson = is_array($decoded) ? $decoded : null;
            }

            $baseTs = pick_alarm_base_ts($resultadoRow, $row['fecha'] ?? null);
            $alarmSummary = calculate_alarm_summary($resultadosJson, $examenes_ids, $baseTs);
            $progressSummary = calculate_exam_progress_summary($resultadosJson, $examenes_ids, $row['examenes']);
            $row['alarmas_activas'] = $alarmSummary['alarmas_activas'];
            $row['alarmas_vencidas'] = $alarmSummary['alarmas_vencidas'];
            $row['alarmas_vencidas_detalle'] = $alarmSummary['alarmas_vencidas_detalle'];
            $row['alerta_estado'] = $alarmSummary['alerta_estado'];
            $row['alerta_vencido'] = $alarmSummary['alerta_vencido'];
            $row['alerta_por_vencer'] = $alarmSummary['alerta_por_vencer'];
            $row['alerta_en_tiempo'] = $alarmSummary['alerta_en_tiempo'];
            $row['alerta_total'] = $alarmSummary['alerta_total'];
            $row['analisis_totales'] = $progressSummary['total'];
            $row['analisis_completos'] = $progressSummary['completos'];
            $row['progreso_porcentaje'] = $progressSummary['porcentaje'];

            if (($row['estado'] ?? '') !== 'cancelada' && $progressSummary['total'] > 0) {
                $row['estado_visual'] = $progressSummary['completos'] >= $progressSummary['total'] ? 'completado' : 'pendiente';
            } else {
                $row['estado_visual'] = $row['estado'];
            }

            $totales_alertas['vencido'] += intval($row['alerta_vencido']);
            $totales_alertas['por_vencer'] += intval($row['alerta_por_vencer']);
            $totales_alertas['en_tiempo'] += intval($row['alerta_en_tiempo']);

            if ($filtro_alerta !== '' && in_array($filtro_alerta, ['vencido', 'por_vencer', 'en_tiempo'], true)) {
                if ($filtro_alerta === 'vencido' && intval($row['alerta_vencido']) <= 0) {
                    continue;
                }
                if ($filtro_alerta === 'por_vencer' && intval($row['alerta_por_vencer']) <= 0) {
                    continue;
                }
                if ($filtro_alerta === 'en_tiempo' && intval($row['alerta_en_tiempo']) <= 0) {
                    continue;
                }
            }

            $row['tiene_derivados'] = !empty($row['tiene_derivados']);
            $ordenes[] = $row;
        }
        $stmt->close();

        $totales_alertas['total'] = intval($totales_alertas['vencido']) + intval($totales_alertas['por_vencer']) + intval($totales_alertas['en_tiempo']);
        if ($resumen_alertas) {
            ol_log_slow_request($requestStartedAt, 'GET', 'resumen_alertas');
            echo json_encode($totales_alertas);
            exit;
        }

        $payload = ['success' => true, 'ordenes' => $ordenes];
        if ($usePagination && !$resumen_alertas) {
            $payload['total'] = $totalRegistros;
            $payload['page'] = $page;
            $payload['limit'] = $limit;
        }

        ol_log_slow_request($requestStartedAt, 'GET', 'listado');
        echo json_encode($payload);
        break;
    default:
        echo json_encode(['success' => false, 'error' => 'Método no soportado']);
}
