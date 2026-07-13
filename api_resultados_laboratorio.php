<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/auth_check.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/modules/InventarioLaboratorioModule.php';

if (!function_exists('normalize_exam_ids_from_raw')) {
    function normalize_exam_ids_from_raw($raw)
    {
        if (is_string($raw)) {
            $decoded = json_decode($raw, true);
            $raw = is_array($decoded) ? $decoded : [];
        }
        if (!is_array($raw)) {
            return [];
        }

        $ids = [];
        foreach ($raw as $item) {
            if (is_array($item) && isset($item['id'])) {
                $examId = intval($item['id']);
            } else {
                $examId = intval($item);
            }
            if ($examId > 0) {
                $ids[] = $examId;
            }
        }

        return array_values(array_unique($ids));
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

if (!function_exists('rl_str_ends_with')) {
    function rl_str_ends_with($haystack, $needle)
    {
        $haystack = (string)$haystack;
        $needle = (string)$needle;
        if ($needle === '') {
            return true;
        }
        $needleLen = strlen($needle);
        if ($needleLen > strlen($haystack)) {
            return false;
        }
        return substr($haystack, -$needleLen) === $needle;
    }
}

if (!function_exists('resultados_has_meaningful_values')) {
    function resultados_has_meaningful_values($resultados)
    {
        if (!is_array($resultados)) {
            return false;
        }

        foreach ($resultados as $k => $v) {
            $key = (string)$k;
            if ($key === '' || rl_str_ends_with($key, '__alarma_activa') || rl_str_ends_with($key, '__alarma_dias') || rl_str_ends_with($key, '__imprimir_examen')) {
                continue;
            }
            if (is_result_value_meaningful($v)) {
                return true;
            }
        }

        return false;
    }
}

if (!function_exists('merge_resultados_preservando_historico')) {
    function merge_resultados_preservando_historico($existentes, $nuevos)
    {
        $base = is_array($existentes) ? $existentes : [];
        $incoming = is_array($nuevos) ? $nuevos : [];

        // Regla de merge: respetar todo lo previo y sobreescribir solo claves recibidas.
        // De este modo no se pierden claves legacy tras renombrado de parámetros.
        foreach ($incoming as $k => $v) {
            $base[$k] = $v;
        }

        return $base;
    }
}

if (!function_exists('compact_resultados_aliases')) {
    function compact_resultados_aliases($resultados)
    {
        if (!is_array($resultados)) {
            return [];
        }

        $agrupados = [];
        foreach ($resultados as $key => $value) {
            $keyText = (string)$key;
            if ($keyText === '' || strpos($keyText, '__') === false) {
                continue;
            }

            if (rl_str_ends_with($keyText, '__alarma_activa') || rl_str_ends_with($keyText, '__alarma_dias') || rl_str_ends_with($keyText, '__imprimir_examen')) {
                continue;
            }

            list($examIdText, $suffix) = explode('__', $keyText, 2);
            $examId = intval($examIdText);
            $token = preg_replace('/_+/', '_', preg_replace('/[^a-z0-9_]/', '', str_replace(['-', ' '], '_', strtolower(trim(iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', (string)$suffix) ?: (string)$suffix)))));
            $token = trim((string)$token, '_');
            if ($examId <= 0 || $token === '') {
                continue;
            }

            if (!isset($agrupados[$examId])) {
                $agrupados[$examId] = [];
            }
            if (!isset($agrupados[$examId][$token])) {
                $agrupados[$examId][$token] = [];
            }
            $agrupados[$examId][$token][] = $keyText;
        }

        foreach ($agrupados as $tokensPorExamen) {
            foreach ($tokensPorExamen as $keysGrupo) {
                if (count($keysGrupo) <= 1) {
                    continue;
                }

                $hasMeaningful = false;
                foreach ($keysGrupo as $groupKey) {
                    if (array_key_exists($groupKey, $resultados) && is_result_value_meaningful($resultados[$groupKey])) {
                        $hasMeaningful = true;
                        break;
                    }
                }

                if (!$hasMeaningful) {
                    continue;
                }

                foreach ($keysGrupo as $groupKey) {
                    if (array_key_exists($groupKey, $resultados) && !is_result_value_meaningful($resultados[$groupKey])) {
                        unset($resultados[$groupKey]);
                    }
                }
            }
        }

        return $resultados;
    }
}

if (!function_exists('calculate_order_progress')) {
    function calculate_order_progress($conn, $resultados, $rawExamenes)
    {
        $examIds = normalize_exam_ids_from_raw($rawExamenes);
        $total = count($examIds);
        if ($total <= 0 || !is_array($resultados)) {
            return ['total' => $total, 'completos' => 0, 'porcentaje' => 0];
        }

        $requiredByExam = [];
        $snapshotByExam = [];
        if (is_string($rawExamenes)) {
            $decodedRaw = json_decode($rawExamenes, true);
            $rawExamenes = is_array($decodedRaw) ? $decodedRaw : [];
        }
        if (is_array($rawExamenes)) {
            foreach ($rawExamenes as $rawExam) {
                if (!is_array($rawExam)) continue;
                $examId = intval($rawExam['id'] ?? 0);
                if ($examId <= 0) continue;

                $values = [];
                if (isset($rawExam['snapshot_json']) && is_array($rawExam['snapshot_json']) && isset($rawExam['snapshot_json']['valores_referenciales']) && is_array($rawExam['snapshot_json']['valores_referenciales'])) {
                    $values = $rawExam['snapshot_json']['valores_referenciales'];
                } elseif (isset($rawExam['valores_referenciales']) && is_array($rawExam['valores_referenciales'])) {
                    $values = $rawExam['valores_referenciales'];
                }

                if (!empty($values)) {
                    $snapshotByExam[$examId] = $values;
                }
            }
        }

        foreach ($snapshotByExam as $examId => $values) {
            $requiredByExam[$examId] = [];
            foreach ($values as $param) {
                if (!is_array($param)) continue;
                $tipo = strtolower(trim((string)($param['tipo'] ?? 'Parámetro')));
                $nombre = trim((string)($param['nombre'] ?? ''));
                if ($nombre === '') continue;
                if ($tipo === '' || $tipo === 'parámetro' || $tipo === 'parametro' || $tipo === 'texto largo' || $tipo === 'campo') {
                    $requiredByExam[$examId][] = $examId . '__' . $nombre;
                }
            }
        }

        $missingExamIds = array_values(array_filter($examIds, function ($examId) use ($snapshotByExam) {
            return !isset($snapshotByExam[$examId]);
        }));
        if (!empty($missingExamIds)) {
            $placeholders = implode(',', array_fill(0, count($missingExamIds), '?'));
            $types = str_repeat('i', count($missingExamIds));
            $sqlReq = "SELECT id, valores_referenciales FROM examenes_laboratorio WHERE id IN ($placeholders)";
            $stmtReq = $conn->prepare($sqlReq);
            if ($stmtReq) {
                $stmtReq->bind_param($types, ...$missingExamIds);
                $stmtReq->execute();
                $resReq = $stmtReq->get_result();
                while ($rowReq = $resReq->fetch_assoc()) {
                    $examId = intval($rowReq['id']);
                    $requiredByExam[$examId] = [];
                    $decoded = json_decode($rowReq['valores_referenciales'] ?? '[]', true);
                    if (!is_array($decoded)) {
                        continue;
                    }
                    foreach ($decoded as $param) {
                        if (!is_array($param)) continue;
                        $tipo = strtolower(trim((string)($param['tipo'] ?? 'Parámetro')));
                        $nombre = trim((string)($param['nombre'] ?? ''));
                        if ($nombre === '') continue;
                        if ($tipo === '' || $tipo === 'parámetro' || $tipo === 'parametro' || $tipo === 'texto largo' || $tipo === 'campo') {
                            $requiredByExam[$examId][] = $examId . '__' . $nombre;
                        }
                    }
                }
                $stmtReq->close();
            }
        }

        $completos = 0;
        foreach ($examIds as $examId) {
            $requiredKeys = $requiredByExam[$examId] ?? [];
            $complete = true;

            if (!empty($requiredKeys)) {
                $complete = true;
                foreach ($requiredKeys as $requiredKey) {
                    if (!array_key_exists($requiredKey, $resultados) || !is_result_value_meaningful($resultados[$requiredKey])) {
                        $complete = false;
                        break;
                    }
                }
                // Fallback: if exact keys weren't found, check bare ID or any "examId__*" prefix.
                if (!$complete) {
                    $directKey = (string)$examId;
                    $complete = array_key_exists($directKey, $resultados) && is_result_value_meaningful($resultados[$directKey]);
                    if (!$complete) {
                        $prefix = $examId . '__';
                        foreach ($resultados as $k => $v) {
                            if (strpos((string)$k, $prefix) === 0 && is_result_value_meaningful($v)) {
                                $complete = true;
                                break;
                            }
                        }
                    }
                }
            } else {
                // No required keys defined: check bare exam ID key OR any "examId__*" key.
                // This handles fallback-named params (e.g. "57" vs "57__Aga y electrolitos").
                $directKey = (string)$examId;
                $complete = array_key_exists($directKey, $resultados) && is_result_value_meaningful($resultados[$directKey]);
                if (!$complete) {
                    $prefix = $examId . '__';
                    foreach ($resultados as $k => $v) {
                        if (strpos((string)$k, $prefix) === 0 && is_result_value_meaningful($v)) {
                            $complete = true;
                            break;
                        }
                    }
                }
            }

            if ($complete) {
                $completos++;
            }
        }

        $porcentaje = $total > 0 ? intval(round(($completos / $total) * 100)) : 0;
        return ['total' => $total, 'completos' => $completos, 'porcentaje' => $porcentaje];
    }
}

if (!function_exists('rl_decode_valores_referenciales_snapshot')) {
    function rl_decode_valores_referenciales_snapshot($raw)
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

if (!function_exists('rl_order_examenes_needs_snapshot')) {
    function rl_order_examenes_needs_snapshot($rawExamenes)
    {
        if (is_string($rawExamenes)) {
            $decoded = json_decode($rawExamenes, true);
            $rawExamenes = is_array($decoded) ? $decoded : [];
        }
        if (!is_array($rawExamenes) || empty($rawExamenes)) {
            return false;
        }

        foreach ($rawExamenes as $item) {
            if (is_numeric($item)) {
                return true;
            }
            if (!is_array($item)) {
                return true;
            }

            $hasSnapshotJson = isset($item['snapshot_json']) && is_array($item['snapshot_json']) && !empty($item['snapshot_json']);
            $hasValores = isset($item['valores_referenciales']) && is_array($item['valores_referenciales']) && !empty($item['valores_referenciales']);
            $hasMethod = isset($item['metodologia']) && trim((string)$item['metodologia']) !== '';

            if (!$hasSnapshotJson && (!$hasValores || !$hasMethod)) {
                return true;
            }
        }

        return false;
    }
}

if (!function_exists('rl_build_order_examenes_snapshot')) {
    function rl_build_order_examenes_snapshot(mysqli $conn, $rawExamenes)
    {
        $ids = normalize_exam_ids_from_raw($rawExamenes);
        if (empty($ids)) {
            return [];
        }

        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmt = $conn->prepare("SELECT id, nombre, metodologia, condicion_paciente, tiempo_resultado, valores_referenciales, precio_publico FROM examenes_laboratorio WHERE id IN ($placeholders)");
        if (!$stmt) {
            return [];
        }

        $stmt->bind_param(str_repeat('i', count($ids)), ...$ids);
        $stmt->execute();
        $res = $stmt->get_result();
        $catalog = [];
        while ($row = $res->fetch_assoc()) {
            $id = intval($row['id'] ?? 0);
            if ($id <= 0) continue;
            $values = rl_decode_valores_referenciales_snapshot($row['valores_referenciales'] ?? '[]');
            $snapshotJson = [
                'id' => $id,
                'nombre' => (string)($row['nombre'] ?? ''),
                'descripcion' => (string)($row['nombre'] ?? ''),
                'metodologia' => (string)($row['metodologia'] ?? ''),
                'condicion_paciente' => (string)($row['condicion_paciente'] ?? ''),
                'tiempo_resultado' => (string)($row['tiempo_resultado'] ?? ''),
                'valores_referenciales' => $values,
            ];
            $catalog[$id] = [
                'id' => $id,
                'nombre' => (string)($row['nombre'] ?? ''),
                'descripcion' => (string)($row['nombre'] ?? ''),
                'metodologia' => (string)($row['metodologia'] ?? ''),
                'condicion_paciente' => (string)($row['condicion_paciente'] ?? ''),
                'tiempo_resultado' => (string)($row['tiempo_resultado'] ?? ''),
                'valores_referenciales' => $values,
                'precio_publico' => floatval($row['precio_publico'] ?? 0),
                'servicio_tipo' => 'laboratorio',
                'servicio_id' => $id,
                'cantidad' => 1,
                'precio_unitario' => floatval($row['precio_publico'] ?? 0),
                'subtotal' => floatval($row['precio_publico'] ?? 0),
                'snapshot_json' => $snapshotJson,
            ];
        }
        $stmt->close();

        $out = [];
        foreach ($ids as $id) {
            if (isset($catalog[$id])) {
                $out[] = $catalog[$id];
            }
        }
        return $out;
    }
}

if (!function_exists('is_laboratorio_signer_role')) {
    function is_laboratorio_signer_role($rol)
    {
        $role = strtolower(trim((string)$rol));
        // Solo profesionales del área de laboratorio pueden firmar resultados.
        return in_array($role, ['laboratorista', 'quimico', 'químico'], true);
    }
}

if (!function_exists('is_valid_laboratorio_signer_user_id')) {
    function is_valid_laboratorio_signer_user_id($conn, $userId)
    {
        $id = intval($userId);
        if ($id <= 0) {
            return false;
        }

        $stmtRole = $conn->prepare('SELECT rol FROM usuarios WHERE id = ? LIMIT 1');
        if (!$stmtRole) {
            return false;
        }

        $stmtRole->bind_param('i', $id);
        $stmtRole->execute();
        $rowRole = $stmtRole->get_result()->fetch_assoc();
        $stmtRole->close();

        return is_laboratorio_signer_role($rowRole['rol'] ?? '');
    }
}

if (!function_exists('resolve_laboratorio_signer_user_id')) {
    function resolve_laboratorio_signer_user_id($conn, $sessionUsuario, $existingSignerId = 0)
    {
        $rolSesion = strtolower(trim((string)($sessionUsuario['rol'] ?? '')));
        $sessionUserId = intval($sessionUsuario['id'] ?? 0);

        // Solo perfiles profesionales del área pueden reemplazar la firma.
        if ($sessionUserId > 0 && is_laboratorio_signer_role($rolSesion)) {
            return $sessionUserId;
        }

        // Si quien opera no es firmante del área, solo conservar firmante previo si también es válido.
        if ($existingSignerId > 0 && is_valid_laboratorio_signer_user_id($conn, $existingSignerId)) {
            return $existingSignerId;
        }

        // Fallback: usar un usuario profesional de laboratorio configurado en el sistema.
        $stmtSigner = $conn->prepare(
            "SELECT id
             FROM usuarios
             WHERE rol IN ('laboratorista', 'quimico', 'químico')
             ORDER BY
                CASE WHEN firma_reportes IS NOT NULL AND TRIM(firma_reportes) <> '' THEN 0 ELSE 1 END,
                id ASC
             LIMIT 1"
        );
        if ($stmtSigner) {
            $stmtSigner->execute();
            $rowSigner = $stmtSigner->get_result()->fetch_assoc();
            $stmtSigner->close();
            $fallbackId = intval($rowSigner['id'] ?? 0);
            if ($fallbackId > 0) {
                return $fallbackId;
            }
        }

        return 0;
    }
}

if (!function_exists('rl_column_exists')) {
    function rl_column_exists(mysqli $conn, string $table, string $column): bool
    {
        $stmt = $conn->prepare('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1');
        if (!$stmt) {
            return false;
        }
        $stmt->bind_param('ss', $table, $column);
        $stmt->execute();
        $res = $stmt->get_result();
        $exists = $res && $res->num_rows > 0;
        $stmt->close();
        return $exists;
    }
}

if (!function_exists('rl_consulta_requiere_filtro_estricto')) {
    function rl_consulta_requiere_filtro_estricto(mysqli $conn, int $consultaId): bool
    {
        if ($consultaId <= 0) {
            return false;
        }

        $hasHcOrigenId = rl_column_exists($conn, 'consultas', 'hc_origen_id');
        $hasOrigenCreacion = rl_column_exists($conn, 'consultas', 'origen_creacion');
        $hasEsControl = rl_column_exists($conn, 'consultas', 'es_control');
        $hasAgendaContrato = rl_column_exists($conn, 'agenda_contrato', 'consulta_id');

        $selectCols = [];
        if ($hasHcOrigenId) $selectCols[] = 'hc_origen_id';
        if ($hasOrigenCreacion) $selectCols[] = 'origen_creacion';
        if ($hasEsControl) $selectCols[] = 'es_control';
        if (empty($selectCols)) {
            return false;
        }

        $stmt = $conn->prepare('SELECT ' . implode(', ', $selectCols) . ' FROM consultas WHERE id = ? LIMIT 1');
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

        $hasContratoDetalleLink = false;
        if (rl_column_exists($conn, 'cotizaciones_detalle', 'consulta_id')
            && rl_column_exists($conn, 'cotizaciones_detalle', 'contrato_paciente_id')) {
            $sqlCd = 'SELECT 1 FROM cotizaciones_detalle WHERE consulta_id = ? AND contrato_paciente_id IS NOT NULL AND contrato_paciente_id > 0';
            if (rl_column_exists($conn, 'cotizaciones_detalle', 'estado_item')) {
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

if (!function_exists('rl_medico_tiene_acceso_consulta')) {
    function rl_medico_tiene_acceso_consulta(mysqli $conn, int $consultaId, int $medicoSesionId, string $mode = 'read'): bool
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

        if (!rl_column_exists($conn, 'doctor_access_delegations', 'source_doctor_id')
            || !rl_column_exists($conn, 'doctor_access_delegations', 'target_doctor_id')
            || !rl_column_exists($conn, 'doctor_access_delegations', 'status')
            || !rl_column_exists($conn, 'doctor_access_delegations', 'access_type')
            || !rl_column_exists($conn, 'doctor_access_delegations', 'starts_at')
            || !rl_column_exists($conn, 'doctor_access_delegations', 'expires_at')) {
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
        // Evita bloqueo al abrir laboratorios desde la pestaña de continuidad.
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
$sessionUsuario = $_SESSION['usuario'] ?? null;
$rolSesion = $sessionUsuario['rol'] ?? null;
$medicoSesionId = intval($_SESSION['medico_id'] ?? ($sessionUsuario['medico_id'] ?? ($sessionUsuario['id'] ?? 0)));
$esSesionMedico = ($rolSesion === 'medico' && $medicoSesionId > 0);

if (!isset($_SESSION['usuario']) && !isset($_SESSION['medico_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'No autenticado']);
    exit;
}

switch ($method) {
    case 'GET':
        $action = trim((string)($_GET['action'] ?? ''));

        // Visor inline de archivos externos referenciados a la consulta.
        if ($action === 'view_archivo') {
            $consulta_id = isset($_GET['consulta_id']) ? intval($_GET['consulta_id']) : 0;
            $archivo_id = isset($_GET['archivo_id']) ? intval($_GET['archivo_id']) : 0;
            if ($consulta_id <= 0 || $archivo_id <= 0) {
                http_response_code(400);
                echo 'Parámetros inválidos';
                exit;
            }

            if ($esSesionMedico) {
                if (!rl_medico_tiene_acceso_consulta($conn, $consulta_id, $medicoSesionId, 'read')) {
                    http_response_code(403);
                    echo 'No autorizado';
                    exit;
                }
            }

            $stmtArchivo = $conn->prepare(
                'SELECT dea.id, dea.nombre_original, dea.archivo_path, dea.mime_type, dea.tamano
                 FROM documentos_externos_archivos dea
                 INNER JOIN documentos_externos_paciente dep ON dep.id = dea.documento_id
                 INNER JOIN ordenes_laboratorio ol ON ol.id = dep.orden_id
                 WHERE dea.id = ? AND ol.consulta_id = ?
                 LIMIT 1'
            );
            $stmtArchivo->bind_param('ii', $archivo_id, $consulta_id);
            $stmtArchivo->execute();
            $archivo = $stmtArchivo->get_result()->fetch_assoc();
            $stmtArchivo->close();

            if (!$archivo || !file_exists($archivo['archivo_path'])) {
                http_response_code(404);
                echo 'Archivo no encontrado';
                exit;
            }

            $safeName = preg_replace('/[^a-zA-Z0-9._\- ]/', '_', (string)($archivo['nombre_original'] ?? 'archivo'));
            $mimeServe = !empty($archivo['mime_type']) ? (string)$archivo['mime_type'] : 'application/octet-stream';

            header('Content-Type: ' . $mimeServe);
            header('Content-Disposition: inline; filename="' . $safeName . '"');
            header('Content-Length: ' . filesize($archivo['archivo_path']));
            header('Cache-Control: private, max-age=3600');
            readfile($archivo['archivo_path']);
            exit;
        }

        // Obtener resultados de laboratorio por consulta_id
        $consulta_id = isset($_GET['consulta_id']) ? intval($_GET['consulta_id']) : null;
        if (!$consulta_id) {
            echo json_encode(['success' => false, 'error' => 'Falta consulta_id']);
            exit;
        }
        header('Content-Type: application/json; charset=utf-8');

        if ($esSesionMedico) {
            if (!rl_medico_tiene_acceso_consulta($conn, $consulta_id, $medicoSesionId, 'read')) {
                http_response_code(403);
                echo json_encode(['success' => false, 'error' => 'No autorizado para ver resultados de esta consulta']);
                exit;
            }
        }
        $resultados = [];

        // Regla estricta HC: solo resultados vinculados explícitamente a la consulta actual.
        $stmt = $conn->prepare(
            'SELECT r.* FROM resultados_laboratorio r'
            . ' INNER JOIN ordenes_laboratorio o ON o.id = r.orden_id'
            . ' WHERE o.consulta_id = ?'
            . ' ORDER BY r.fecha ASC, r.id ASC'
        );
        $stmt->bind_param('i', $consulta_id);
        $stmt->execute();
        $res = $stmt->get_result();
        while ($row = $res->fetch_assoc()) {
            $row['resultados'] = json_decode($row['resultados'], true);
            $resultados[] = $row;
        }
        $stmt->close();

        // Fallback de compatibilidad: si no hay filas ligadas por orden_id, usar consulta_id directo
        if (count($resultados) === 0) {
            $stmt = $conn->prepare('SELECT * FROM resultados_laboratorio WHERE consulta_id = ? ORDER BY fecha ASC, id ASC');
            $stmt->bind_param('i', $consulta_id);
            $stmt->execute();
            $res = $stmt->get_result();
            while ($row = $res->fetch_assoc()) {
                $row['resultados'] = json_decode($row['resultados'], true);
                $resultados[] = $row;
            }
            $stmt->close();
        }

        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $baseUrl = $scheme . '://' . $_SERVER['HTTP_HOST'] . rtrim(dirname($_SERVER['SCRIPT_NAME']), '/\\') . '/';

                $documentos_externos = [];
                $stmtDocs = $conn->prepare(
                    'SELECT
                        dep.id AS documento_id,
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
                     WHERE LOWER(TRIM(dep.tipo)) = "laboratorio"
                       AND dep.orden_id IN (SELECT id FROM ordenes_laboratorio WHERE consulta_id = ?)
                     ORDER BY dep.fecha DESC, dep.id DESC, dea.id ASC'
                );
        if ($stmtDocs) {
                    $stmtDocs->bind_param('i', $consulta_id);
            $stmtDocs->execute();
            $rowsDocs = $stmtDocs->get_result()->fetch_all(MYSQLI_ASSOC);
            $stmtDocs->close();

            $bucket = [];
            foreach ($rowsDocs as $rowDoc) {
                $docId = intval($rowDoc['documento_id'] ?? 0);
                if ($docId <= 0) continue;

                if (!isset($bucket[$docId])) {
                    $bucket[$docId] = [
                        'documento_id' => $docId,
                        'titulo' => (string)($rowDoc['titulo'] ?? ''),
                        'descripcion' => (string)($rowDoc['descripcion'] ?? ''),
                        'fecha' => (string)($rowDoc['documento_fecha'] ?? ''),
                        'orden_id' => intval($rowDoc['orden_id'] ?? 0),
                        'archivos' => [],
                    ];
                }

                $archivoId = intval($rowDoc['archivo_id'] ?? 0);
                if ($archivoId > 0) {
                    $mime = !empty($rowDoc['mime_type']) ? (string)$rowDoc['mime_type'] : 'application/octet-stream';
                    $bucket[$docId]['archivos'][] = [
                        'archivo_id' => $archivoId,
                        'nombre_original' => (string)($rowDoc['nombre_original'] ?? ''),
                        'mime_type' => $mime,
                        'tamano' => intval($rowDoc['tamano'] ?? 0),
                        'url' => $baseUrl . 'api_resultados_laboratorio.php?action=view_archivo&consulta_id=' . $consulta_id . '&archivo_id=' . $archivoId,
                    ];
                }
            }
            $documentos_externos = array_values($bucket);
        }

        // Exámenes derivados a laboratorio externo sin documento subido aún
        $examenes_referenciados_pendientes = [];
        $chkDerivadoCol = $conn->query("SHOW COLUMNS FROM cotizaciones_detalle LIKE 'derivado'");
        if ($chkDerivadoCol && $chkDerivadoCol->num_rows > 0) {
            $stmtRef = $conn->prepare(
                'SELECT cd.descripcion, cd.laboratorio_referencia, cd.cotizacion_id
                 FROM cotizaciones_detalle cd
                 INNER JOIN ordenes_laboratorio ol ON ol.cotizacion_id = cd.cotizacion_id
                 WHERE ol.consulta_id = ?
                   AND COALESCE(cd.derivado, 0) = 1
                   AND COALESCE(cd.estado_item, \'activo\') <> \'eliminado\'
                   AND cd.cotizacion_id NOT IN (
                       SELECT DISTINCT cotizacion_id
                       FROM documentos_externos_paciente
                       WHERE cotizacion_id IS NOT NULL
                         AND LOWER(TRIM(tipo)) = \'laboratorio\'
                   )
                 GROUP BY cd.cotizacion_id, cd.descripcion, cd.laboratorio_referencia'
            );
            if ($stmtRef) {
                $stmtRef->bind_param('i', $consulta_id);
                $stmtRef->execute();
                $rowsRef = $stmtRef->get_result()->fetch_all(MYSQLI_ASSOC);
                $stmtRef->close();
                foreach ($rowsRef as $r) {
                    $examenes_referenciados_pendientes[] = [
                        'descripcion'   => (string)($r['descripcion'] ?? ''),
                        'laboratorio'   => (string)($r['laboratorio_referencia'] ?? ''),
                        'cotizacion_id' => intval($r['cotizacion_id'] ?? 0),
                    ];
                }
            }
        }

        echo json_encode([
            'success' => true,
            'resultados' => $resultados,
            'documentos_externos' => $documentos_externos,
            'examenes_referenciados_pendientes' => $examenes_referenciados_pendientes,
        ]);
        break;
    case 'POST':
        // Guardar resultados de laboratorio
        $data = json_decode(file_get_contents('php://input'), true);
        $orden_id = isset($data['orden_id']) && is_numeric($data['orden_id']) ? intval($data['orden_id']) : null;
        $consulta_id = isset($data['consulta_id']) && is_numeric($data['consulta_id']) ? intval($data['consulta_id']) : null;
        $tipo_examen = $data['tipo_examen'] ?? null;
        $resultados = $data['resultados'] ?? null;
        if ((!$orden_id && !$consulta_id) || !$resultados) {
            echo json_encode(['success' => false, 'error' => 'Faltan datos requeridos']);
            exit;
        }

        $hasMeaningfulResults = resultados_has_meaningful_values($resultados);

        if (is_array($resultados)) {
            foreach ($resultados as $key => $value) {
                if (preg_match('/^(\d+)__alarma_activa$/', (string)$key, $m)) {
                    $examId = $m[1];
                    $activa = 0;
                    if (is_bool($value)) {
                        $activa = $value ? 1 : 0;
                    } elseif (is_numeric($value)) {
                        $activa = intval($value) === 1 ? 1 : 0;
                    } else {
                        $normalized = strtolower(trim((string)$value));
                        $activa = in_array($normalized, ['1', 'true', 'si', 'sí'], true) ? 1 : 0;
                    }
                    $resultados[$key] = $activa;

                    $dayKey = $examId . '__alarma_dias';
                    $diasRaw = isset($resultados[$dayKey]) ? intval($resultados[$dayKey]) : 0;
                    $resultados[$dayKey] = ($activa === 1 && $diasRaw > 0) ? $diasRaw : '';
                }
            }
        }

        $resultadosPersistir = $resultados;
        $inventarioResumen = [
            'aplicados' => 0,
            'pendientes' => 0,
            'detalles' => [],
            'saltado' => true,
        ];
        // Verificar si la orden existe. Priorizar orden_id para evitar colisiones entre
        // múltiples órdenes que comparten la misma consulta_id.
        $orden = null;
        if ($orden_id) {
            $stmt_orden = $conn->prepare('SELECT id, consulta_id, estado, examenes FROM ordenes_laboratorio WHERE id = ? LIMIT 1');
            $stmt_orden->bind_param('i', $orden_id);
            $stmt_orden->execute();
            $orden = $stmt_orden->get_result()->fetch_assoc();
            $stmt_orden->close();
        }
        if (!$orden && $consulta_id) {
            // Compatibilidad hacia atrás: algunos flujos antiguos enviaban consulta_id.
            $stmt_orden = $conn->prepare('SELECT id, consulta_id, estado, examenes FROM ordenes_laboratorio WHERE id = ? LIMIT 1');
            $stmt_orden->bind_param('i', $consulta_id);
            $stmt_orden->execute();
            $orden = $stmt_orden->get_result()->fetch_assoc();
            $stmt_orden->close();

            if (!$orden) {
                $stmt_orden = $conn->prepare('SELECT id, consulta_id, estado, examenes FROM ordenes_laboratorio WHERE consulta_id = ? ORDER BY id DESC LIMIT 1');
                $stmt_orden->bind_param('i', $consulta_id);
                $stmt_orden->execute();
                $orden = $stmt_orden->get_result()->fetch_assoc();
                $stmt_orden->close();
            }
        }
        if (!$orden) {
            echo json_encode(['success' => false, 'error' => 'Orden de laboratorio no encontrada']);
            exit;
        }

        if (rl_order_examenes_needs_snapshot($orden['examenes'] ?? [])) {
            $snapshotOrden = rl_build_order_examenes_snapshot($conn, $orden['examenes'] ?? []);
            if (!empty($snapshotOrden)) {
                $jsonOrdenSnapshot = json_encode($snapshotOrden, JSON_UNESCAPED_UNICODE);
                if ($jsonOrdenSnapshot !== false) {
                    $stmtFreeze = $conn->prepare('UPDATE ordenes_laboratorio SET examenes = ? WHERE id = ?');
                    if ($stmtFreeze) {
                        $stmtFreeze->bind_param('si', $jsonOrdenSnapshot, $orden['id']);
                        $stmtFreeze->execute();
                        $stmtFreeze->close();
                        $orden['examenes'] = $jsonOrdenSnapshot;
                    }
                }
            }
        }

        if (isset($orden['estado']) && strtolower((string)$orden['estado']) === 'cancelada') {
            echo json_encode(['success' => false, 'error' => 'La orden de laboratorio está cancelada']);
            exit;
        }
        $ok = false;
        $existingSignerId = 0;
        $stmt_check = $conn->prepare('SELECT id, firmado_por_usuario_id, resultados FROM resultados_laboratorio WHERE orden_id = ? LIMIT 1');
        $stmt_check->bind_param('i', $orden['id']);
        $stmt_check->execute();
        $existingResult = $stmt_check->get_result()->fetch_assoc();
        $hasExistingResult = is_array($existingResult) && isset($existingResult['id']);
        $existingSignerId = intval($existingResult['firmado_por_usuario_id'] ?? 0);

        if ($hasExistingResult) {
            $existingResultados = json_decode($existingResult['resultados'] ?? '[]', true);
            $resultadosPersistir = merge_resultados_preservando_historico($existingResultados, $resultados);
        }

        $resultadosPersistir = compact_resultados_aliases($resultadosPersistir);
        $json = json_encode($resultadosPersistir);
        $hasMeaningfulResults = resultados_has_meaningful_values($resultadosPersistir);

        $firmado_por_usuario_id = resolve_laboratorio_signer_user_id($conn, $_SESSION['usuario'] ?? null, $existingSignerId);

        if ($hasExistingResult) {
            $stmt_update = $conn->prepare('UPDATE resultados_laboratorio SET tipo_examen = ?, resultados = ?, firmado_por_usuario_id = ?, consulta_id = ? WHERE orden_id = ?');
            $consultaOrden = !empty($orden['consulta_id']) ? intval($orden['consulta_id']) : null;
            $stmt_update->bind_param('ssiii', $tipo_examen, $json, $firmado_por_usuario_id, $consultaOrden, $orden['id']);
            $ok = $stmt_update->execute();
            $stmt_update->close();
        } else {
            if (!empty($orden['consulta_id'])) {
                $stmt = $conn->prepare('INSERT INTO resultados_laboratorio (orden_id, consulta_id, tipo_examen, resultados, firmado_por_usuario_id) VALUES (?, ?, ?, ?, ?)');
                $consultaOrden = intval($orden['consulta_id']);
                $stmt->bind_param('iissi', $orden['id'], $consultaOrden, $tipo_examen, $json, $firmado_por_usuario_id);
            } else {
                $stmt = $conn->prepare('INSERT INTO resultados_laboratorio (orden_id, tipo_examen, resultados, firmado_por_usuario_id) VALUES (?, ?, ?, ?)');
                $stmt->bind_param('issi', $orden['id'], $tipo_examen, $json, $firmado_por_usuario_id);
            }
            $ok = $stmt->execute();
            $stmt->close();
        }
        $stmt_check->close();

        $progress = calculate_order_progress($conn, $resultadosPersistir, $orden['examenes'] ?? []);
        // Compatibilidad: algunas ordenes legacy no tienen mapeo usable de examenes,
        // pero si se guardaron resultados significativos no debe quedarse en pendiente.
        if ($progress['total'] <= 0 && $hasMeaningfulResults) {
            $nuevoEstadoOrden = 'completado';
        } else {
            $nuevoEstadoOrden = ($progress['total'] > 0 && $progress['completos'] >= $progress['total']) ? 'completado' : 'pendiente';
        }

        // Cambiar estado según porcentaje real de llenado
        $stmt2 = $conn->prepare('UPDATE ordenes_laboratorio SET estado = ? WHERE id = ?');
        $stmt2->bind_param('si', $nuevoEstadoOrden, $orden['id']);
        $stmt2->execute();
        $stmt2->close();
        if ($ok && $hasMeaningfulResults) {
            try {
                $usuarioId = isset($_SESSION['usuario']['id']) ? intval($_SESSION['usuario']['id']) : null;
                $inventarioResumen = InventarioLaboratorioModule::aplicarConsumoPorResultado($conn, intval($orden['id']), $usuarioId);
            } catch (Throwable $e) {
                $inventarioResumen = [
                    'aplicados' => 0,
                    'pendientes' => 0,
                    'detalles' => ['No se pudo aplicar consumo automático: ' . $e->getMessage()],
                    'saltado' => true,
                ];
            }
        }

        echo json_encode([
            'success' => $ok,
            'inventario' => $inventarioResumen,
            'progreso' => $progress,
            'estado' => $nuevoEstadoOrden,
        ]);
        break;
    default:
        echo json_encode(['success' => false, 'error' => 'Método no soportado']);
}
