
<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/auth_check.php';
require_once __DIR__ . '/config.php';

function disponibilidad_horario_valido($horaInicio, $horaFin): bool {
    $inicio = trim((string)$horaInicio);
    $fin = trim((string)$horaFin);
    if ($inicio === '' || $fin === '') {
        return false;
    }
    return $inicio < $fin;
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
        // Listar disponibilidad de un médico (por id) o todos
        $medico_id = isset($_GET['medico_id']) ? intval($_GET['medico_id']) : null;
        if ($esSesionMedico) {
            if ($medico_id && $medico_id !== $medicoSesionId) {
                http_response_code(403);
                echo json_encode(['success' => false, 'error' => 'No autorizado para ver disponibilidad de otro médico']);
                exit;
            }
            $medico_id = $medicoSesionId;
        }
        $sql = 'SELECT * FROM disponibilidad_medicos';
        $params = [];
        if ($medico_id) {
            $sql .= ' WHERE medico_id = ?';
            $stmt = $conn->prepare($sql);
            $stmt->bind_param('i', $medico_id);
        } else {
            $stmt = $conn->prepare($sql);
        }
        $stmt->execute();
        $res = $stmt->get_result();
        $rows = [];
        while ($row = $res->fetch_assoc()) {
            $rows[] = $row;
        }
        echo json_encode(['success' => true, 'disponibilidad' => $rows]);
        $stmt->close();
        break;
    case 'POST':
        $data = json_decode(file_get_contents('php://input'), true);
        $accion = $data['accion'] ?? 'agregar_bloques';

        // —— Programar un mes completo ——
        if ($accion === 'programar_mes') {
            if ($esSesionMedico) {
                http_response_code(403);
                echo json_encode(['success' => false, 'error' => 'Solo admin o recepcionista puede programar horarios']);
                exit;
            }
            $medico_id  = intval($data['medico_id'] ?? 0);
            $anio       = intval($data['anio'] ?? date('Y'));
            $mes        = intval($data['mes'] ?? date('n'));
            $hora_inicio = trim((string)($data['hora_inicio'] ?? '08:00'));
            $hora_fin    = trim((string)($data['hora_fin'] ?? '12:00'));
            // Compatibilidad: dias_semana + hora_inicio/hora_fin (modo antiguo)
            $dias_semana = isset($data['dias_semana']) && is_array($data['dias_semana'])
                ? array_map('intval', $data['dias_semana'])
                : [0,1,2,3,4,5,6];
            // Nuevo modo: bloques_semana con horario por día, ejemplo:
            // {"1":{"activo":true,"hora_inicio":"08:00","hora_fin":"12:00"}, ...}
            $bloques_semana = isset($data['bloques_semana']) && is_array($data['bloques_semana'])
                ? $data['bloques_semana']
                : null;

            if ($medico_id <= 0 || $mes < 1 || $mes > 12 || $anio < 2020) {
                echo json_encode(['success' => false, 'error' => 'Datos inválidos']);
                exit;
            }
            $reglasDia = [];
            if (is_array($bloques_semana)) {
                foreach ($bloques_semana as $diaSemanaRaw => $cfg) {
                    if (!is_array($cfg)) continue;
                    $diaSemana = intval($diaSemanaRaw);
                    if ($diaSemana < 0 || $diaSemana > 6) continue;

                    $activo = !array_key_exists('activo', $cfg) || !!$cfg['activo'];
                    if (!$activo) continue;

                    $hi = trim((string)($cfg['hora_inicio'] ?? ''));
                    $hf = trim((string)($cfg['hora_fin'] ?? ''));
                    if ($hi === '' || $hf === '' || $hi >= $hf) {
                        echo json_encode(['success' => false, 'error' => "Horario inválido para el día {$diaSemana}"]);
                        exit;
                    }
                    $reglasDia[$diaSemana] = [
                        'hora_inicio' => $hi,
                        'hora_fin' => $hf,
                    ];
                }
            }

            if (count($reglasDia) === 0) {
                if ($hora_inicio >= $hora_fin) {
                    echo json_encode(['success' => false, 'error' => 'La hora inicio debe ser anterior a hora fin']);
                    exit;
                }
                foreach ($dias_semana as $d) {
                    if ($d < 0 || $d > 6) continue;
                    $reglasDia[$d] = [
                        'hora_inicio' => $hora_inicio,
                        'hora_fin' => $hora_fin,
                    ];
                }
            }

            if (count($reglasDia) === 0) {
                echo json_encode(['success' => false, 'error' => 'Selecciona al menos un día de la semana']);
                exit;
            }

            $diasEnMes = cal_days_in_month(CAL_GREGORIAN, $mes, $anio);
            $insertados = 0;
            $omitidos   = 0;
            $stmtCheck  = $conn->prepare('SELECT id FROM disponibilidad_medicos WHERE medico_id=? AND fecha=? LIMIT 1');
            $stmtIns    = $conn->prepare('INSERT INTO disponibilidad_medicos (medico_id, fecha, hora_inicio, hora_fin) VALUES (?, ?, ?, ?)');

            for ($d = 1; $d <= $diasEnMes; $d++) {
                $fechaDia  = sprintf('%04d-%02d-%02d', $anio, $mes, $d);
                $diaSemana = intval(date('w', mktime(0,0,0,$mes,$d,$anio))); // 0=Dom
                if (!isset($reglasDia[$diaSemana])) continue;

                $horaInicioDia = $reglasDia[$diaSemana]['hora_inicio'];
                $horaFinDia = $reglasDia[$diaSemana]['hora_fin'];

                // Si ya existe un bloque ese día, omitir
                $stmtCheck->bind_param('is', $medico_id, $fechaDia);
                $stmtCheck->execute();
                if ($stmtCheck->get_result()->num_rows > 0) {
                    $omitidos++;
                    continue;
                }

                $stmtIns->bind_param('isss', $medico_id, $fechaDia, $horaInicioDia, $horaFinDia);
                if ($stmtIns->execute()) {
                    $insertados++;
                }
            }
            $stmtCheck->close();
            $stmtIns->close();

            echo json_encode([
                'success'   => true,
                'insertados'=> $insertados,
                'omitidos'  => $omitidos,
                'mensaje'   => "Se programaron $insertados días. $omitidos ya tenían disponibilidad.",
            ]);
            break;
        }

        // —— Limpiar todos los bloques de un mes ——
        if ($accion === 'limpiar_mes') {
            if ($esSesionMedico) {
                http_response_code(403);
                echo json_encode(['success' => false, 'error' => 'Solo admin o recepcionista puede limpiar horarios']);
                exit;
            }
            $medico_id = intval($data['medico_id'] ?? 0);
            $anio      = intval($data['anio'] ?? date('Y'));
            $mes       = intval($data['mes'] ?? date('n'));
            if ($medico_id <= 0) {
                echo json_encode(['success' => false, 'error' => 'medico_id requerido']);
                exit;
            }
            $mesStr = sprintf('%04d-%02d', $anio, $mes);
            $stmt = $conn->prepare("DELETE FROM disponibilidad_medicos WHERE medico_id=? AND fecha LIKE ?");
            $like = "$mesStr-%";
            $stmt->bind_param('is', $medico_id, $like);
            $ok = $stmt->execute();
            $eliminados = $stmt->affected_rows;
            $stmt->close();
            echo json_encode(['success' => $ok, 'eliminados' => $eliminados]);
            break;
        }

        // —— Agregar múltiples bloques de disponibilidad (comportamiento original) ——
        $medico_id = $data['medico_id'] ?? null;
        $bloques = $data['bloques'] ?? null;
        if (!$medico_id || !is_array($bloques) || count($bloques) === 0) {
            echo json_encode(['success' => false, 'error' => 'Faltan datos requeridos o bloques vacíos']);
            exit;
        }
        if ($esSesionMedico && intval($medico_id) !== $medicoSesionId) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'No autorizado para registrar disponibilidad de otro médico']);
            exit;
        }
        $stmt = $conn->prepare('INSERT INTO disponibilidad_medicos (medico_id, fecha, hora_inicio, hora_fin) VALUES (?, ?, ?, ?)');
        $ok = true;
        foreach ($bloques as $bloque) {
            $fecha = $bloque['fecha'] ?? null;
            $hora_inicio = $bloque['hora_inicio'] ?? null;
            $hora_fin = $bloque['hora_fin'] ?? null;
            if (!$fecha || !$hora_inicio || !$hora_fin) {
                $ok = false;
                continue;
            }
            if (!disponibilidad_horario_valido($hora_inicio, $hora_fin)) {
                echo json_encode(['success' => false, 'error' => 'La hora inicio debe ser anterior a la hora fin en cada bloque']);
                $stmt->close();
                exit;
            }
            $stmt->bind_param('isss', $medico_id, $fecha, $hora_inicio, $hora_fin);
            if (!$stmt->execute()) {
                $ok = false;
            }
        }
        $stmt->close();
        echo json_encode(['success' => $ok]);
        break;
    case 'PUT':
        // Modificar disponibilidad (por id)
        $data = json_decode(file_get_contents('php://input'), true);
        $id = $data['id'] ?? null;
        $fecha = $data['fecha'] ?? null;
        $hora_inicio = $data['hora_inicio'] ?? null;
        $hora_fin = $data['hora_fin'] ?? null;
        if (!$id || !$fecha || !$hora_inicio || !$hora_fin) {
            echo json_encode(['success' => false, 'error' => 'Faltan datos requeridos']);
            exit;
        }
        if (!disponibilidad_horario_valido($hora_inicio, $hora_fin)) {
            echo json_encode(['success' => false, 'error' => 'La hora inicio debe ser anterior a la hora fin']);
            exit;
        }
        if ($esSesionMedico) {
            $stmtOwner = $conn->prepare('SELECT medico_id FROM disponibilidad_medicos WHERE id = ? LIMIT 1');
            $stmtOwner->bind_param('i', $id);
            $stmtOwner->execute();
            $ownerRow = $stmtOwner->get_result()->fetch_assoc();
            $stmtOwner->close();
            if (!$ownerRow || intval($ownerRow['medico_id']) !== $medicoSesionId) {
                http_response_code(403);
                echo json_encode(['success' => false, 'error' => 'No autorizado para modificar este bloque']);
                exit;
            }
        }
        $stmt = $conn->prepare('UPDATE disponibilidad_medicos SET fecha=?, hora_inicio=?, hora_fin=? WHERE id=?');
        $stmt->bind_param('sssi', $fecha, $hora_inicio, $hora_fin, $id);
        $ok = $stmt->execute();
        echo json_encode(['success' => $ok]);
        $stmt->close();
        break;
    case 'DELETE':
        // Eliminar disponibilidad (por id)
        $data = json_decode(file_get_contents('php://input'), true);
        $id = $data['id'] ?? null;
        if (!$id) {
            echo json_encode(['success' => false, 'error' => 'ID requerido']);
            exit;
        }
        if ($esSesionMedico) {
            $stmtOwner = $conn->prepare('SELECT medico_id FROM disponibilidad_medicos WHERE id = ? LIMIT 1');
            $stmtOwner->bind_param('i', $id);
            $stmtOwner->execute();
            $ownerRow = $stmtOwner->get_result()->fetch_assoc();
            $stmtOwner->close();
            if (!$ownerRow || intval($ownerRow['medico_id']) !== $medicoSesionId) {
                http_response_code(403);
                echo json_encode(['success' => false, 'error' => 'No autorizado para eliminar este bloque']);
                exit;
            }
        }
        $stmt = $conn->prepare('DELETE FROM disponibilidad_medicos WHERE id=?');
        $stmt->bind_param('i', $id);
        $ok = $stmt->execute();
        echo json_encode(['success' => $ok]);
        $stmt->close();
        break;
    default:
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
}
