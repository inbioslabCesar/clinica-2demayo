<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/auth_check.php';
require_once __DIR__ . '/config.php';

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
        // Listar consultas (por médico, paciente o todas)
        $medico_id = isset($_GET['medico_id']) ? intval($_GET['medico_id']) : null;
        $paciente_id = isset($_GET['paciente_id']) ? intval($_GET['paciente_id']) : null;
        $page = isset($_GET['page']) ? intval($_GET['page']) : 0;
        $per_page = isset($_GET['per_page']) ? intval($_GET['per_page']) : 0;
        $search = isset($_GET['search']) ? trim($_GET['search']) : '';
        $fecha_desde = isset($_GET['fecha_desde']) ? trim($_GET['fecha_desde']) : '';
        $fecha_hasta = isset($_GET['fecha_hasta']) ? trim($_GET['fecha_hasta']) : '';
        $usar_paginacion = ($page > 0 && $per_page > 0);
        if ($usar_paginacion && $per_page > 100) {
            $per_page = 100;
        }

        if ($esSesionMedico) {
            if ($medico_id && $medico_id !== $medicoSesionId) {
                http_response_code(403);
                echo json_encode(['success' => false, 'error' => 'No autorizado para ver consultas de otro médico']);
                exit;
            }
            $medico_id = $medicoSesionId;
            $paciente_id = null;
        }

        $from = ' FROM consultas LEFT JOIN pacientes ON consultas.paciente_id = pacientes.id LEFT JOIN medicos ON consultas.medico_id = medicos.id';
        $where = [];
        $params = [];
        $types = '';

        if ($medico_id) {
            $where[] = 'consultas.medico_id = ?';
            $params[] = $medico_id;
            $types .= 'i';
        } elseif ($paciente_id) {
            $where[] = 'consultas.paciente_id = ?';
            $params[] = $paciente_id;
            $types .= 'i';
        }

        if ($search !== '') {
            $where[] = '(pacientes.nombre LIKE ? OR pacientes.apellido LIKE ? OR pacientes.historia_clinica LIKE ? OR pacientes.dni LIKE ?)';
            $searchLike = '%' . $search . '%';
            $params[] = $searchLike;
            $params[] = $searchLike;
            $params[] = $searchLike;
            $params[] = $searchLike;
            $types .= 'ssss';
        }

        if ($fecha_desde !== '') {
            $where[] = 'consultas.fecha >= ?';
            $params[] = $fecha_desde;
            $types .= 's';
        }

        if ($fecha_hasta !== '') {
            $where[] = 'consultas.fecha <= ?';
            $params[] = $fecha_hasta;
            $types .= 's';
        }

        $whereSql = count($where) ? (' WHERE ' . implode(' AND ', $where)) : '';

        $statsSql = 'SELECT COUNT(*) AS total, '
            . 'SUM(CASE WHEN LOWER(TRIM(consultas.estado)) = "pendiente" THEN 1 ELSE 0 END) AS pendientes, '
            . 'SUM(CASE WHEN LOWER(TRIM(consultas.clasificacion)) = "emergencia" THEN 1 ELSE 0 END) AS emergencias'
            . $from
            . $whereSql;

        $statsStmt = $conn->prepare($statsSql);
        if ($types) {
            $statsStmt->bind_param($types, ...$params);
        }
        $statsStmt->execute();
        $statsRes = $statsStmt->get_result();
        $statsRow = $statsRes->fetch_assoc() ?: [];
        $statsStmt->close();

        $sql = 'SELECT consultas.*, pacientes.nombre AS paciente_nombre, pacientes.apellido AS paciente_apellido, pacientes.historia_clinica, pacientes.dni, medicos.nombre AS medico_nombre, medicos.apellido AS medico_apellido'
            . $from
            . $whereSql
            . ' ORDER BY consultas.fecha DESC, consultas.hora DESC';

        if ($usar_paginacion) {
            $offset = ($page - 1) * $per_page;
            $sql .= ' LIMIT ? OFFSET ?';
            $paramsQuery = $params;
            $paramsQuery[] = $per_page;
            $paramsQuery[] = $offset;
            $typesQuery = $types . 'ii';
        } else {
            $paramsQuery = $params;
            $typesQuery = $types;
        }

        $stmt = $conn->prepare($sql);
        if ($typesQuery) $stmt->bind_param($typesQuery, ...$paramsQuery);
        $stmt->execute();
        $res = $stmt->get_result();
        $rows = [];
        while ($row = $res->fetch_assoc()) {
            $rows[] = $row;
        }

        $totalFiltrado = intval($statsRow['total'] ?? count($rows));
        $respuesta = [
            'success' => true,
            'consultas' => $rows,
            'stats' => [
                'total' => $totalFiltrado,
                'pendientes' => intval($statsRow['pendientes'] ?? 0),
                'emergencias' => intval($statsRow['emergencias'] ?? 0),
            ],
        ];

        if ($usar_paginacion) {
            $respuesta['pagination'] = [
                'page' => $page,
                'per_page' => $per_page,
                'total' => $totalFiltrado,
                'total_pages' => max(1, (int)ceil($totalFiltrado / $per_page)),
            ];
        }

        echo json_encode($respuesta);
        $stmt->close();
        break;
    case 'POST':
        // Agendar nueva consulta
        $data = json_decode(file_get_contents('php://input'), true);
        $paciente_id = $data['paciente_id'] ?? null;
        $medico_id = $data['medico_id'] ?? null;
        $fecha = $data['fecha'] ?? null;
        $hora = $data['hora'] ?? null;
        if (!$paciente_id || !$medico_id || !$fecha || !$hora) {
            echo json_encode(['success' => false, 'error' => 'Faltan datos requeridos']);
            exit;
        }
        
        // Normalizar formato de hora (agregar segundos si no los tiene)
        if (strlen($hora) == 5 && substr_count($hora, ':') == 1) {
            $hora = $hora . ':00';
        }
        // Solo validar caja abierta para consultas espontáneas
        $tipo_consulta = $data['tipo_consulta'] ?? 'programada';
        if ($tipo_consulta === 'espontanea') {
            $usuario_id = $_SESSION['usuario']['id'] ?? null;
            // Normalizar fecha a Y-m-d
            $fecha_consulta = date('Y-m-d', strtotime($fecha));
            $stmtCaja = $conn->prepare('SELECT id FROM cajas WHERE usuario_id = ? AND DATE(fecha) = ? AND TRIM(LOWER(estado)) = "abierta" LIMIT 1');
            $stmtCaja->bind_param('is', $usuario_id, $fecha_consulta);
            $stmtCaja->execute();
            $resCaja = $stmtCaja->get_result();
            $cajaAbierta = $resCaja->fetch_assoc();
            $stmtCaja->close();
            if (!$cajaAbierta) {
                echo json_encode([
                    'success' => false,
                    'error' => 'No hay caja abierta para el usuario en la fecha seleccionada. Abra una caja antes de agendar la consulta espontánea.',
                    'debug' => [
                        'usuario_id' => $usuario_id,
                        'fecha_consulta' => $fecha_consulta
                    ]
                ]);
                exit;
            }
        }
        // Verificar que no haya otra consulta en ese horario para el médico
        $stmt = $conn->prepare('SELECT id, estado FROM consultas WHERE medico_id=? AND fecha=? AND hora=? AND estado NOT IN ("cancelada", "completada")');
        $stmt->bind_param('iss', $medico_id, $fecha, $hora);
        $stmt->execute();
        $res = $stmt->get_result();
        $conflicto = $res->fetch_assoc();
        if ($conflicto) {
            echo json_encode([
                'success' => false, 
                'error' => 'El médico ya tiene una consulta pendiente en ese horario',
                'detalle' => "Consulta ID {$conflicto['id']} con estado '{$conflicto['estado']}'",
                'medico_id' => $medico_id,
                'fecha' => $fecha,
                'hora' => $hora
            ]);
            $stmt->close();
            exit;
        }
        $stmt->close();
    $tipo_consulta = $data['tipo_consulta'] ?? 'programada';
    $stmt = $conn->prepare('INSERT INTO consultas (paciente_id, medico_id, fecha, hora, tipo_consulta) VALUES (?, ?, ?, ?, ?)');
    $stmt->bind_param('iisss', $paciente_id, $medico_id, $fecha, $hora, $tipo_consulta);
    $ok = $stmt->execute();
    echo json_encode(['success' => $ok, 'id' => $ok ? $stmt->insert_id : null]);
    $stmt->close();
    break;
    case 'PUT':
        // Actualizar estado de consulta
        $data = json_decode(file_get_contents('php://input'), true);
        $id = $data['id'] ?? null;
        $estado = $data['estado'] ?? null;
        if (!$id || !$estado) {
            echo json_encode(['success' => false, 'error' => 'Faltan datos requeridos']);
            exit;
        }

        if ($esSesionMedico) {
            $stmtOwner = $conn->prepare('SELECT medico_id FROM consultas WHERE id = ? LIMIT 1');
            $stmtOwner->bind_param('i', $id);
            $stmtOwner->execute();
            $ownerRow = $stmtOwner->get_result()->fetch_assoc();
            $stmtOwner->close();
            if (!$ownerRow || intval($ownerRow['medico_id']) !== $medicoSesionId) {
                http_response_code(403);
                echo json_encode(['success' => false, 'error' => 'No autorizado para actualizar esta consulta']);
                exit;
            }
        }

        $stmt = $conn->prepare('UPDATE consultas SET estado=? WHERE id=?');
        $stmt->bind_param('si', $estado, $id);
        $ok = $stmt->execute();
        echo json_encode(['success' => $ok]);
        $stmt->close();
        break;
    default:
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
}
