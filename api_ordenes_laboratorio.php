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

// ── Migraciones de columnas ───────────────────────────────────────────────────
$migCols = [
    'cotizacion_id'   => 'ALTER TABLE ordenes_laboratorio ADD COLUMN cotizacion_id INT DEFAULT NULL',
    'carga_anticipada'=> 'ALTER TABLE ordenes_laboratorio ADD COLUMN carga_anticipada TINYINT(1) NOT NULL DEFAULT 0',
];
foreach ($migCols as $col => $sql) {
    $chk = $conn->query("SHOW COLUMNS FROM ordenes_laboratorio LIKE '$col'");
    if ($chk && $chk->num_rows === 0) $conn->query($sql);
}

// Migraciones en cotizaciones_detalle para soporte de derivación a lab externo
$chkDerivado = $conn->query("SHOW COLUMNS FROM cotizaciones_detalle LIKE 'derivado'");
if ($chkDerivado && $chkDerivado->num_rows === 0) {
    $conn->query("ALTER TABLE cotizaciones_detalle ADD COLUMN derivado TINYINT(1) NOT NULL DEFAULT 0");
    $conn->query("ALTER TABLE cotizaciones_detalle ADD COLUMN tipo_derivacion VARCHAR(50) DEFAULT NULL");
    $conn->query("ALTER TABLE cotizaciones_detalle ADD COLUMN valor_derivacion DECIMAL(10,2) DEFAULT NULL");
    $conn->query("ALTER TABLE cotizaciones_detalle ADD COLUMN laboratorio_referencia VARCHAR(255) DEFAULT NULL");
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

switch ($method) {
    case 'POST':
        // Crear nueva orden de laboratorio
        $data = json_decode(file_get_contents('php://input'), true);
        $consulta_id = isset($data['consulta_id']) && is_numeric($data['consulta_id']) ? intval($data['consulta_id']) : null;
        $examenes = $data['examenes'] ?? null;
        if (!$examenes || !is_array($examenes) || count($examenes) === 0) {
            echo json_encode(['success' => false, 'error' => 'Faltan exámenes para la orden']);
            exit;
        }
        $json = json_encode($examenes);
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
                // ── Orden generada desde consulta médica ──────────────────────────────
                $stmt = $conn->prepare('INSERT INTO ordenes_laboratorio (consulta_id, examenes, carga_anticipada) VALUES (?, ?, ?)');
                $stmt->bind_param('isi', $consulta_id, $json, $cargaAnticipada);
                if (!$stmt->execute()) throw new Exception($stmt->error);
                $stmt->close();
                $ordenId = $conn->insert_id;

                // Obtener paciente_id desde consultas
                $stmtPac = $conn->prepare('SELECT paciente_id FROM consultas WHERE id = ? LIMIT 1');
                $stmtPac->bind_param('i', $consulta_id);
                $stmtPac->execute();
                $rowPac = $stmtPac->get_result()->fetch_assoc();
                $stmtPac->close();
                $pacienteIdCotiz = $rowPac ? intval($rowPac['paciente_id']) : 0;

                if ($pacienteIdCotiz > 0) {
                    $stmtFixPacienteOrden = $conn->prepare('UPDATE ordenes_laboratorio SET paciente_id = ? WHERE id = ? AND (paciente_id IS NULL OR paciente_id = 0)');
                    if ($stmtFixPacienteOrden) {
                        $stmtFixPacienteOrden->bind_param('ii', $pacienteIdCotiz, $ordenId);
                        $stmtFixPacienteOrden->execute();
                        $stmtFixPacienteOrden->close();
                    }
                }

                // Construir detalles de cotización a partir de examenes_laboratorio
                $detallesCotiz = [];
                $examenIdsInt  = array_map('intval', array_filter((array)$examenes, 'is_numeric'));
                if (!empty($examenIdsInt) && $pacienteIdCotiz > 0) {
                    $inPlaceholders = implode(',', $examenIdsInt);
                    $resPrecios = $conn->query("SELECT id, nombre, precio_publico FROM examenes_laboratorio WHERE id IN ($inPlaceholders)");
                    while ($rowEx = $resPrecios->fetch_assoc()) {
                        $precio = floatval($rowEx['precio_publico'] ?? 0);
                        $detallesCotiz[] = [
                            'servicio_tipo'  => 'laboratorio',
                            'servicio_id'    => intval($rowEx['id']),
                            'descripcion'    => $rowEx['nombre'],
                            'cantidad'       => 1,
                            'precio_unitario'=> $precio,
                            'subtotal'       => $precio,
                        ];
                    }
                }

                $cotizData = ['cotizacion_id' => null, 'numero_comprobante' => null, 'total' => 0];
                if (!empty($detallesCotiz) && $pacienteIdCotiz > 0) {
                    // Usar usuario_id = 0 si es médico (su ID viene de tabla medicos, no usuarios)
                    $rolCreador = $sessionUsuario['rol'] ?? '';
                    $usuarioIdCotiz = ($rolCreador === 'medico') ? 0 : intval($sessionUsuario['id'] ?? 0);
                    $obsText = 'Orden de laboratorio desde consulta #' . $consulta_id;
                    $cotizData = crearCotizacionDesdeOrden($conn, $pacienteIdCotiz, $consulta_id, $detallesCotiz, $usuarioIdCotiz, $obsText);
                    $cotizId = intval($cotizData['cotizacion_id']);
                    $conn->query("UPDATE ordenes_laboratorio SET cotizacion_id = $cotizId WHERE id = $ordenId");
                }

                echo json_encode([
                    'success'            => true,
                    'orden_id'           => $ordenId,
                    'paciente_id'        => $pacienteIdCotiz,
                    'cotizacion_id'      => $cotizData['cotizacion_id'],
                    'numero_comprobante' => $cotizData['numero_comprobante'],
                    'total'              => $cotizData['total'],
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
        $page = isset($_GET['page']) ? max(1, intval($_GET['page'])) : 1;
        $limit = isset($_GET['limit']) ? max(1, intval($_GET['limit'])) : 10;
        $limit = min($limit, 50);
        $offset = ($page - 1) * $limit;
        $filtro_fecha_desde = isset($_GET['filtro_fecha_desde']) ? trim((string)$_GET['filtro_fecha_desde']) : '';
        $filtro_fecha_hasta = isset($_GET['filtro_fecha_hasta']) ? trim((string)$_GET['filtro_fecha_hasta']) : '';
        $filtro_busqueda = isset($_GET['filtro_busqueda']) ? trim((string)$_GET['filtro_busqueda']) : '';

        // Verificar si cotizaciones_detalle tiene columna derivado
        $hasDerivadoCol = false;
        $chkDeriv = $conn->query("SHOW COLUMNS FROM cotizaciones_detalle LIKE 'derivado'");
        if ($chkDeriv && $chkDeriv->num_rows > 0) $hasDerivadoCol = true;
        $derivadoExpr = $hasDerivadoCol
            ? "(SELECT IF(COUNT(*) > 0, 1, 0) FROM cotizaciones_detalle cd WHERE cd.cotizacion_id = o.cotizacion_id AND cd.derivado = 1)"
            : "0";

        $sql = "SELECT o.*, 
                    IFNULL(p2.id, p.id) AS paciente_id_ref,
                    IFNULL(p2.nombre, p.nombre) AS paciente_nombre, 
                    IFNULL(p2.apellido, p.apellido) AS paciente_apellido, 
                    IFNULL(p2.sexo, p.sexo) AS paciente_sexo,
                    IFNULL(p2.edad, p.edad) AS paciente_edad,
                    m.nombre AS medico_nombre, 
                    m.apellido AS medico_apellido,
                    $derivadoExpr AS tiene_derivados
                FROM ordenes_laboratorio o 
                LEFT JOIN consultas c ON o.consulta_id = c.id 
                LEFT JOIN pacientes p ON c.paciente_id = p.id 
                LEFT JOIN pacientes p2 ON o.paciente_id = p2.id 
                LEFT JOIN medicos m ON c.medico_id = m.id 
                WHERE 1=1";
        $params = [];
        $types = '';
        if ($estado) {
            $sql .= ' AND o.estado = ?';
            $params[] = $estado;
            $types .= 's';
        }
        if ($consulta_id) {
            $sql .= ' AND o.consulta_id = ?';
            $params[] = $consulta_id;
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
        if ($esSesionMedico) {
            $sql .= ' AND c.medico_id = ?';
            $params[] = $medicoSesionId;
            $types .= 'i';
        }

        $sqlCount = "SELECT COUNT(*) AS total
                FROM ordenes_laboratorio o
                LEFT JOIN consultas c ON o.consulta_id = c.id
                LEFT JOIN pacientes p ON c.paciente_id = p.id
                LEFT JOIN pacientes p2 ON o.paciente_id = p2.id
                LEFT JOIN medicos m ON c.medico_id = m.id
                WHERE 1=1";
        if ($estado) {
            $sqlCount .= ' AND o.estado = ?';
        }
        if ($consulta_id) {
            $sqlCount .= ' AND o.consulta_id = ?';
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
        if ($esSesionMedico) {
            $sqlCount .= ' AND c.medico_id = ?';
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
                $decoded = json_decode($examen['valores_referenciales'], true);
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
            $examenesIds = array_values(array_filter(array_map(function ($it) {
                return is_array($it) && isset($it['id']) ? intval($it['id']) : intval($it);
            }, $examenesIdsRaw), function ($v) {
                return $v > 0;
            }));
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
                if (isset($examenCatalogo[$eid])) {
                    $examenes_detalle[] = $examenCatalogo[$eid];
                }
            }

            $derivadoMap = [];
            $cotizId = intval($row['cotizacion_id'] ?? 0);
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
            echo json_encode($totales_alertas);
            exit;
        }

        $payload = ['success' => true, 'ordenes' => $ordenes];
        if ($usePagination && !$resumen_alertas) {
            $payload['total'] = $totalRegistros;
            $payload['page'] = $page;
            $payload['limit'] = $limit;
        }

        echo json_encode($payload);
        break;
    default:
        echo json_encode(['success' => false, 'error' => 'Método no soportado']);
}
