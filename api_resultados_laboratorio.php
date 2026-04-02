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

if (!function_exists('calculate_order_progress')) {
    function calculate_order_progress($conn, $resultados, $rawExamenes)
    {
        $examIds = normalize_exam_ids_from_raw($rawExamenes);
        $total = count($examIds);
        if ($total <= 0 || !is_array($resultados)) {
            return ['total' => $total, 'completos' => 0, 'porcentaje' => 0];
        }

        $requiredByExam = [];
        if (!empty($examIds)) {
            $placeholders = implode(',', array_fill(0, count($examIds), '?'));
            $types = str_repeat('i', count($examIds));
            $sqlReq = "SELECT id, valores_referenciales FROM examenes_laboratorio WHERE id IN ($placeholders)";
            $stmtReq = $conn->prepare($sqlReq);
            if ($stmtReq) {
                $stmtReq->bind_param($types, ...$examIds);
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

$method = $_SERVER['REQUEST_METHOD'];
$sessionUsuario = $_SESSION['usuario'] ?? null;
$rolSesion = $sessionUsuario['rol'] ?? null;
$medicoSesionId = intval($sessionUsuario['id'] ?? ($_SESSION['medico_id'] ?? 0));
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
                $stmtOwnerConsulta = $conn->prepare('SELECT medico_id FROM consultas WHERE id = ? LIMIT 1');
                $stmtOwnerConsulta->bind_param('i', $consulta_id);
                $stmtOwnerConsulta->execute();
                $ownerConsulta = $stmtOwnerConsulta->get_result()->fetch_assoc();
                $stmtOwnerConsulta->close();
                if (!$ownerConsulta || intval($ownerConsulta['medico_id']) !== $medicoSesionId) {
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
            $stmtOwnerConsulta = $conn->prepare('SELECT medico_id FROM consultas WHERE id = ? LIMIT 1');
            $stmtOwnerConsulta->bind_param('i', $consulta_id);
            $stmtOwnerConsulta->execute();
            $ownerConsulta = $stmtOwnerConsulta->get_result()->fetch_assoc();
            $stmtOwnerConsulta->close();
            if (!$ownerConsulta || intval($ownerConsulta['medico_id']) !== $medicoSesionId) {
                http_response_code(403);
                echo json_encode(['success' => false, 'error' => 'No autorizado para ver resultados de esta consulta']);
                exit;
            }
        }
        $resultados = [];

        // Priorizar resultados asociados a órdenes de esta consulta (evita mezclar filas huérfanas)
        $stmt = $conn->prepare('SELECT r.* FROM resultados_laboratorio r INNER JOIN ordenes_laboratorio o ON o.id = r.orden_id WHERE o.consulta_id = ? ORDER BY r.fecha ASC, r.id ASC');
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
             INNER JOIN ordenes_laboratorio ol ON ol.id = dep.orden_id
             WHERE ol.consulta_id = ? AND LOWER(TRIM(dep.tipo)) = "laboratorio"
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

        echo json_encode([
            'success' => true,
            'resultados' => $resultados,
            'documentos_externos' => $documentos_externos,
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

        $hasMeaningfulResults = false;
        if (is_array($resultados)) {
            foreach ($resultados as $k => $v) {
                $key = (string)$k;
                if ($key === '' || str_ends_with($key, '__alarma_activa') || str_ends_with($key, '__alarma_dias') || str_ends_with($key, '__imprimir_examen')) {
                    continue;
                }
                if ($v === null) {
                    continue;
                }
                if (is_string($v) && trim($v) === '') {
                    continue;
                }
                $hasMeaningfulResults = true;
                break;
            }
        }

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

        $json = json_encode($resultados);
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
        if (isset($orden['estado']) && strtolower((string)$orden['estado']) === 'cancelada') {
            echo json_encode(['success' => false, 'error' => 'La orden de laboratorio está cancelada']);
            exit;
        }
        $ok = false;
        $existingSignerId = 0;
        $stmt_check = $conn->prepare('SELECT id, firmado_por_usuario_id FROM resultados_laboratorio WHERE orden_id = ? LIMIT 1');
        $stmt_check->bind_param('i', $orden['id']);
        $stmt_check->execute();
        $existingResult = $stmt_check->get_result()->fetch_assoc();
        $hasExistingResult = is_array($existingResult) && isset($existingResult['id']);
        $existingSignerId = intval($existingResult['firmado_por_usuario_id'] ?? 0);

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

        $progress = calculate_order_progress($conn, $resultados, $orden['examenes'] ?? []);
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
