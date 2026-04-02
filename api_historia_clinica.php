<?php
require_once __DIR__ . '/init_api.php';
// --- Verificación de sesión ---
require_once __DIR__ . '/auth_check.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/modules/HcTemplateResolver.php';

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

function hc_programar_proxima_cita($conn, $consultaIdActual, $proximaData) {
    if (!is_array($proximaData)) {
        return null;
    }

    $programar = (bool)($proximaData['programar'] ?? false);
    if (!$programar) {
        return null;
    }

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
    if ($consultaProgramadaId > 0) {
        $stmtUpd = $conn->prepare('UPDATE consultas SET paciente_id = ?, medico_id = ?, fecha = ?, hora = ?, tipo_consulta = ?, estado = ? WHERE id = ? LIMIT 1');
        if (!$stmtUpd) {
            throw new Exception('No se pudo preparar la actualización de próxima cita');
        }
        $estadoPendiente = 'pendiente';
        $stmtUpd->bind_param('iissssi', $pacienteId, $medicoId, $fecha, $hora, $tipoConsulta, $estadoPendiente, $consultaProgramadaId);
        $stmtUpd->execute();
        $stmtUpd->close();
    } else {
        $stmtFind = $conn->prepare('SELECT id FROM consultas WHERE paciente_id = ? AND medico_id = ? AND fecha = ? AND hora = ? AND estado = "pendiente" LIMIT 1');
        if (!$stmtFind) {
            throw new Exception('No se pudo preparar la búsqueda de próxima cita existente');
        }
        $stmtFind->bind_param('iiss', $pacienteId, $medicoId, $fecha, $hora);
        $stmtFind->execute();
        $found = $stmtFind->get_result()->fetch_assoc();
        $stmtFind->close();

        if ($found) {
            $consultaProgramadaId = (int)($found['id'] ?? 0);
        } else {
            $stmtIns = $conn->prepare('INSERT INTO consultas (paciente_id, medico_id, fecha, hora, tipo_consulta, estado) VALUES (?, ?, ?, ?, ?, "pendiente")');
            if (!$stmtIns) {
                throw new Exception('No se pudo preparar la creación de próxima cita');
            }
            $stmtIns->bind_param('iisss', $pacienteId, $medicoId, $fecha, $hora, $tipoConsulta);
            $okIns = $stmtIns->execute();
            $consultaProgramadaId = $okIns ? (int)$stmtIns->insert_id : 0;
            $stmtIns->close();
            if (!$okIns || $consultaProgramadaId <= 0) {
                throw new Exception('No se pudo registrar la próxima cita');
            }
        }
    }

    return [
        'consulta_id' => $consultaProgramadaId,
        'fecha' => $fecha,
        'hora' => $hora,
        'medico_id' => $medicoId,
        'tipo_consulta' => $tipoConsulta,
    ];
}

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        $consulta_id = $_GET['consulta_id'] ?? null;
        if (!$consulta_id) {
            echo json_encode(['success' => false, 'error' => 'Falta consulta_id']);
            exit;
        }
        $templateMeta = null;
        $templateResolution = null;

        $stmt = $conn->prepare('SELECT datos FROM historia_clinica WHERE consulta_id = ?');
        $stmt->bind_param('i', $consulta_id);
        $stmt->execute();
        $res = $stmt->get_result();
        if ($row = $res->fetch_assoc()) {
            $datos = json_decode($row['datos'], true);
            $templateId = '';
            $templateVersion = '';
            if (is_array($datos) && isset($datos['template']) && is_array($datos['template'])) {
                $templateId = trim((string)($datos['template']['id'] ?? ''));
                $templateVersion = trim((string)($datos['template']['version'] ?? ''));
            }

            $resolved = hc_resolve_template($conn, [
                'consulta_id' => (int)$consulta_id,
                'template_id' => $templateId,
                'version' => $templateVersion,
            ]);
            if (is_array($resolved) && ($resolved['success'] ?? false)) {
                $templateMeta = $resolved['template'] ?? null;
                $templateResolution = $resolved['resolution'] ?? null;
            }

            echo json_encode([
                'success' => true,
                'datos' => $datos,
                'template' => $templateMeta,
                'template_resolution' => $templateResolution,
            ]);
        } else {
            $resolved = hc_resolve_template($conn, [
                'consulta_id' => (int)$consulta_id,
            ]);
            if (is_array($resolved) && ($resolved['success'] ?? false)) {
                $templateMeta = $resolved['template'] ?? null;
                $templateResolution = $resolved['resolution'] ?? null;
            }

            echo json_encode([
                'success' => false,
                'error' => 'No existe historia clínica para esta consulta',
                'template' => $templateMeta,
                'template_resolution' => $templateResolution,
            ]);
        }
        $stmt->close();
        break;
    case 'POST':
        $data = json_decode(file_get_contents('php://input'), true);
        $consulta_id = $data['consulta_id'] ?? null;
        $datos = $data['datos'] ?? null;
        if (!$consulta_id || !$datos) {
            echo json_encode(['success' => false, 'error' => 'Faltan datos requeridos']);
            exit;
        }

        $proximaResultado = null;
        try {
            if (is_array($datos) && isset($datos['proxima_cita']) && is_array($datos['proxima_cita'])) {
                $proximaResultado = hc_programar_proxima_cita($conn, (int)$consulta_id, $datos['proxima_cita']);
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
                }
            }
        } catch (Throwable $e) {
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'error' => $e->getMessage(),
            ]);
            exit;
        }

        $json = json_encode($datos);
        // Verificar si ya existe HC para esta consulta
        $stmt_check = $conn->prepare('SELECT id FROM historia_clinica WHERE consulta_id = ?');
        $stmt_check->bind_param('i', $consulta_id);
        $stmt_check->execute();
        $res_check = $stmt_check->get_result();
        if ($res_check->fetch_assoc()) {
            // Ya existe: actualizar
            $stmt = $conn->prepare('UPDATE historia_clinica SET datos = ?, fecha_registro = CURRENT_TIMESTAMP WHERE consulta_id = ?');
            $stmt->bind_param('si', $json, $consulta_id);
            $ok = $stmt->execute();
            $stmt->close();
        } else {
            // No existe: insertar
            $stmt = $conn->prepare('INSERT INTO historia_clinica (consulta_id, datos) VALUES (?, ?)');
            $stmt->bind_param('is', $consulta_id, $json);
            $ok = $stmt->execute();
            $stmt->close();
        }
        // Actualizar estado de la consulta a 'completada'
        $stmt_estado = $conn->prepare('UPDATE consultas SET estado = ? WHERE id = ?');
        $estado_completada = 'completada';
        $stmt_estado->bind_param('si', $estado_completada, $consulta_id);
        $stmt_estado->execute();
        $stmt_estado->close();
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
