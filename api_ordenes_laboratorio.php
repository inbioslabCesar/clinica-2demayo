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
                foreach ($requiredKeys as $requiredKey) {
                    $analisisTotales++;
                    if (array_key_exists($requiredKey, $resultados) && is_result_value_meaningful($resultados[$requiredKey])) {
                        $analisisCompletos++;
                    }
                }
            } else {
                $analisisTotales++;
                $directKey = (string)$examId;
                if (array_key_exists($directKey, $resultados) && is_result_value_meaningful($resultados[$directKey])) {
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
        try {
            if ($consulta_id !== null) {
                // Orden generada desde consulta médica, no requiere cobro_id
                $stmt = $conn->prepare('INSERT INTO ordenes_laboratorio (consulta_id, examenes) VALUES (?, ?)');
                $stmt->bind_param('is', $consulta_id, $json);
            } else if ($paciente_id && $cobro_id !== null) {
                // Orden cotizada directamente, vincular cobro_id
                $stmt = $conn->prepare('INSERT INTO ordenes_laboratorio (consulta_id, examenes, paciente_id, cobro_id) VALUES (NULL, ?, ?, ?)');
                $stmt->bind_param('sii', $json, $paciente_id, $cobro_id);
            } else if ($paciente_id) {
                // Orden cotizada directamente, pero sin cobro_id (caso raro)
                $stmt = $conn->prepare('INSERT INTO ordenes_laboratorio (consulta_id, examenes, paciente_id) VALUES (NULL, ?, ?)');
                $stmt->bind_param('si', $json, $paciente_id);
            } else {
                $stmt = $conn->prepare('INSERT INTO ordenes_laboratorio (consulta_id, examenes) VALUES (NULL, ?)');
                $stmt->bind_param('s', $json);
            }
            $ok = $stmt->execute();
            if (!$ok) {
                throw new Exception($stmt->error);
            }
            $stmt->close();
            echo json_encode(['success' => $ok]);
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
        $filtro_fecha_desde = isset($_GET['filtro_fecha_desde']) ? trim((string)$_GET['filtro_fecha_desde']) : '';
        $filtro_fecha_hasta = isset($_GET['filtro_fecha_hasta']) ? trim((string)$_GET['filtro_fecha_hasta']) : '';
        $filtro_busqueda = isset($_GET['filtro_busqueda']) ? trim((string)$_GET['filtro_busqueda']) : '';

        $sql = 'SELECT o.*, 
                    IFNULL(p2.id, p.id) AS paciente_id_ref,
                    IFNULL(p2.nombre, p.nombre) AS paciente_nombre, 
                    IFNULL(p2.apellido, p.apellido) AS paciente_apellido, 
                    IFNULL(p2.sexo, p.sexo) AS paciente_sexo,
                    IFNULL(p2.edad, p.edad) AS paciente_edad,
                    m.nombre AS medico_nombre, 
                    m.apellido AS medico_apellido 
                FROM ordenes_laboratorio o 
                LEFT JOIN consultas c ON o.consulta_id = c.id 
                LEFT JOIN pacientes p ON c.paciente_id = p.id 
                LEFT JOIN pacientes p2 ON o.paciente_id = p2.id 
                LEFT JOIN medicos m ON c.medico_id = m.id 
                WHERE 1=1';
        $params = [];
        $types = '';
        if ($estado) {
            $sql .= ' AND estado = ?';
            $params[] = $estado;
            $types .= 's';
        }
        if ($consulta_id) {
            $sql .= ' AND consulta_id = ?';
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
        $stmt = $conn->prepare($sql);
        if ($params) {
            $stmt->bind_param($types, ...$params);
        }
        $stmt->execute();
        $res = $stmt->get_result();
        $ordenes = [];
        $totales_alertas = [
            'vencido' => 0,
            'por_vencer' => 0,
            'en_tiempo' => 0,
            'total' => 0
        ];

        while ($row = $res->fetch_assoc()) {
            // Decodificar los IDs de exámenes
            $examenes_ids = json_decode($row['examenes'], true) ?: [];

            // Obtener detalles completos de los exámenes
            if (!empty($examenes_ids)) {
                $placeholders = str_repeat('?,', count($examenes_ids) - 1) . '?';
                $sql_examenes = "SELECT id, nombre, metodologia as descripcion, condicion_paciente, tiempo_resultado, valores_referenciales FROM examenes_laboratorio WHERE id IN ($placeholders)";
                $stmt_examenes = $conn->prepare($sql_examenes);
                $stmt_examenes->bind_param(str_repeat('i', count($examenes_ids)), ...$examenes_ids);
                $stmt_examenes->execute();
                $res_examenes = $stmt_examenes->get_result();

                $examenes_detalle = [];
                while ($examen = $res_examenes->fetch_assoc()) {
                    // Decodificar y normalizar valores_referenciales si existen
                    $items = [];
                    if (!empty($examen['valores_referenciales'])) {
                        $decoded = json_decode($examen['valores_referenciales'], true);
                        if (is_array($decoded)) {
                            foreach ($decoded as $idx => $it) {
                                if (!is_array($it)) continue;
                                $item = [];
                                $item['tipo'] = isset($it['tipo']) && $it['tipo'] !== '' ? $it['tipo'] : 'Parámetro';
                                $fallbackNombre = 'Item ' . ($idx + 1);
                                if (count($decoded) === 1 && !empty($examen['nombre'])) { $fallbackNombre = $examen['nombre']; }
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
                    $examenes_detalle[] = $examen;
                }
                $stmt_examenes->close();

                $row['examenes'] = $examenes_detalle;
            } else {
                $row['examenes'] = [];
            }

            $stmt_resultado = $conn->prepare('SELECT * FROM resultados_laboratorio WHERE orden_id = ? ORDER BY id DESC LIMIT 1');
            $stmt_resultado->bind_param('i', $row['id']);

            $resultadoRow = null;
            if ($stmt_resultado) {
                $stmt_resultado->execute();
                $res_resultado = $stmt_resultado->get_result();
                $resultadoRow = $res_resultado ? $res_resultado->fetch_assoc() : null;
                $stmt_resultado->close();
            }

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

            $ordenes[] = $row;
        }
        $stmt->close();

        $totales_alertas['total'] = intval($totales_alertas['vencido']) + intval($totales_alertas['por_vencer']) + intval($totales_alertas['en_tiempo']);
        if ($resumen_alertas) {
            echo json_encode($totales_alertas);
            exit;
        }

        echo json_encode(['success' => true, 'ordenes' => $ordenes]);
        break;
    default:
        echo json_encode(['success' => false, 'error' => 'Método no soportado']);
}
