<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/auth_check.php';
require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];

function triaje_actor_context() {
    if (isset($_SESSION['usuario']) && is_array($_SESSION['usuario'])) {
        $u = $_SESSION['usuario'];
        $nombre = trim((string)($u['nombre'] ?? ''));
        $apellido = trim((string)($u['apellido'] ?? ''));
        $display = trim($nombre . ' ' . $apellido);
        if ($display === '') {
            $display = trim((string)($u['usuario'] ?? ''));
        }
        if ($display === '') {
            $display = 'usuario';
        }
        return [
            'id' => (int)($u['id'] ?? 0),
            'rol' => strtolower(trim((string)($u['rol'] ?? 'usuario'))),
            'nombre' => $display,
            'permisos' => triaje_normalizar_permisos($u['permisos'] ?? []),
        ];
    }

    if (isset($_SESSION['medico_id'])) {
        $medicoId = (int)$_SESSION['medico_id'];
        $med = isset($_SESSION['medico']) && is_array($_SESSION['medico']) ? $_SESSION['medico'] : [];
        $display = trim((string)($med['nombre'] ?? ''));
        if ($display === '') {
            $display = 'medico';
        }
        return [
            'id' => $medicoId,
            'rol' => 'medico',
            'nombre' => $display,
            'permisos' => [],
        ];
    }

    return ['id' => 0, 'rol' => 'usuario', 'nombre' => 'usuario', 'permisos' => []];
}

function triaje_normalizar_permisos($raw) {
    if (is_string($raw)) {
        $decoded = json_decode($raw, true);
        if (json_last_error() === JSON_ERROR_NONE) {
            $raw = $decoded;
        } else {
            $raw = explode(',', $raw);
        }
    }
    if (!is_array($raw)) {
        return [];
    }

    $clean = [];
    foreach ($raw as $item) {
        $key = trim((string)$item);
        if ($key !== '') {
            $clean[$key] = true;
        }
    }
    return array_keys($clean);
}

function triaje_actor_puede_guardar($actor) {
    $rol = strtolower(trim((string)($actor['rol'] ?? '')));
    if (in_array($rol, ['medico', 'enfermero', 'administrador', 'admin'], true)) {
        return true;
    }

    $permisos = triaje_normalizar_permisos($actor['permisos'] ?? []);
    if ($rol === 'recepcionista' && in_array('ver_panel_enfermeria', $permisos, true)) {
        return true;
    }

    return false;
}

function triaje_table_exists($conn, $table) {
    $stmt = $conn->prepare('SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1');
    if (!$stmt) return false;
    $stmt->bind_param('s', $table);
    $stmt->execute();
    $res = $stmt->get_result();
    $ok = $res && $res->num_rows > 0;
    $stmt->close();
    return $ok;
}

function triaje_column_exists($conn, $table, $column) {
    $stmt = $conn->prepare('SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1');
    if (!$stmt) return false;
    $stmt->bind_param('ss', $table, $column);
    $stmt->execute();
    $res = $stmt->get_result();
    $ok = $res && $res->num_rows > 0;
    $stmt->close();
    return $ok;
}

function triaje_ensure_audit_schema($conn) {
    if (!triaje_table_exists($conn, 'triaje')) return;

    $alterations = [];
    if (!triaje_column_exists($conn, 'triaje', 'creado_por_id')) {
        $alterations[] = "ADD COLUMN creado_por_id INT NULL";
    }
    if (!triaje_column_exists($conn, 'triaje', 'creado_por_rol')) {
        $alterations[] = "ADD COLUMN creado_por_rol VARCHAR(40) NULL";
    }
    if (!triaje_column_exists($conn, 'triaje', 'creado_por_nombre')) {
        $alterations[] = "ADD COLUMN creado_por_nombre VARCHAR(120) NULL";
    }
    if (!triaje_column_exists($conn, 'triaje', 'actualizado_por_id')) {
        $alterations[] = "ADD COLUMN actualizado_por_id INT NULL";
    }
    if (!triaje_column_exists($conn, 'triaje', 'actualizado_por_rol')) {
        $alterations[] = "ADD COLUMN actualizado_por_rol VARCHAR(40) NULL";
    }
    if (!triaje_column_exists($conn, 'triaje', 'actualizado_por_nombre')) {
        $alterations[] = "ADD COLUMN actualizado_por_nombre VARCHAR(120) NULL";
    }
    if (!triaje_column_exists($conn, 'triaje', 'origen_registro')) {
        $alterations[] = "ADD COLUMN origen_registro VARCHAR(40) NULL";
    }

    foreach ($alterations as $part) {
        @mysqli_query($conn, 'ALTER TABLE triaje ' . $part);
    }
}

if (!isset($_SESSION['usuario']) && !isset($_SESSION['medico_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'No autenticado']);
    exit;
}

switch ($method) {
    case 'POST':
        // Guardar o actualizar triaje
        $actor = triaje_actor_context();
        if (!triaje_actor_puede_guardar($actor)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'No autorizado para registrar triaje']);
            exit;
        }

        $data = json_decode(file_get_contents('php://input'), true);
        $consulta_id = $data['consulta_id'] ?? null;
        $datos = $data['datos'] ?? null;
        if (!$consulta_id || !$datos) {
            echo json_encode(['success' => false, 'error' => 'Faltan datos requeridos']);
            exit;
        }

        triaje_ensure_audit_schema($conn);

        $origenRegistro = trim((string)($datos['origen_registro'] ?? ''));
        if ($origenRegistro === '') {
            $origenRegistro = ($actor['rol'] === 'enfermero') ? 'panel_enfermeria' : 'hc_medico';
        }

        $json = json_encode($datos);
        // Verificar si ya existe triaje para esta consulta
        $stmt_check = $conn->prepare('SELECT id FROM triaje WHERE consulta_id = ?');
        $stmt_check->bind_param('i', $consulta_id);
        $stmt_check->execute();
        $res_check = $stmt_check->get_result();
        $clasificacion = isset($datos['clasificacion']) ? $datos['clasificacion'] : null;
        if ($res_check->fetch_assoc()) {
            // Ya existe: actualizar
            $stmt = $conn->prepare('UPDATE triaje SET datos = ?, fecha_registro = CURRENT_TIMESTAMP, actualizado_por_id = ?, actualizado_por_rol = ?, actualizado_por_nombre = ?, origen_registro = ? WHERE consulta_id = ?');
            if (!$stmt) {
                $stmt = $conn->prepare('UPDATE triaje SET datos = ?, fecha_registro = CURRENT_TIMESTAMP WHERE consulta_id = ?');
                if (!$stmt) {
                    echo json_encode(['success' => false, 'error' => 'No se pudo preparar actualización de triaje']);
                    $stmt_check->close();
                    exit;
                }
                $stmt->bind_param('si', $json, $consulta_id);
            } else {
                $actorId = (int)($actor['id'] ?? 0);
                $actorRol = (string)($actor['rol'] ?? 'usuario');
                $actorNombre = (string)($actor['nombre'] ?? 'usuario');
                $stmt->bind_param('sisssi', $json, $actorId, $actorRol, $actorNombre, $origenRegistro, $consulta_id);
            }
            $ok = $stmt->execute();
            $stmt->close();
        } else {
            // No existe: insertar
            $stmt = $conn->prepare('INSERT INTO triaje (consulta_id, datos, creado_por_id, creado_por_rol, creado_por_nombre, actualizado_por_id, actualizado_por_rol, actualizado_por_nombre, origen_registro) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
            if (!$stmt) {
                $stmt = $conn->prepare('INSERT INTO triaje (consulta_id, datos) VALUES (?, ?)');
                if (!$stmt) {
                    echo json_encode(['success' => false, 'error' => 'No se pudo preparar registro de triaje']);
                    $stmt_check->close();
                    exit;
                }
                $stmt->bind_param('is', $consulta_id, $json);
            } else {
                $actorId = (int)($actor['id'] ?? 0);
                $actorRol = (string)($actor['rol'] ?? 'usuario');
                $actorNombre = (string)($actor['nombre'] ?? 'usuario');
                $stmt->bind_param('isississs', $consulta_id, $json, $actorId, $actorRol, $actorNombre, $actorId, $actorRol, $actorNombre, $origenRegistro);
            }
            $ok = $stmt->execute();
            $stmt->close();
        }
        // Actualizar clasificacion y marcar triaje_realizado en la tabla consultas
        // Siempre actualizar clasificacion y marcar triaje_realizado
        // Si no hay clasificacion, guardar como 'Sin clasificar'
        $clasificacion_final = $clasificacion !== null && $clasificacion !== '' ? $clasificacion : 'Sin clasificar';
        $stmt2 = $conn->prepare('UPDATE consultas SET clasificacion = ?, triaje_realizado = 1 WHERE id = ?');
        if (!$stmt2) {
            error_log('Error al preparar UPDATE consultas: ' . $conn->error);
            echo json_encode(['success' => false, 'error' => 'Error al preparar UPDATE consultas', 'mysqli_error' => $conn->error]);
            exit;
        }
        $stmt2->bind_param('si', $clasificacion_final, $consulta_id);
        $exec_ok = $stmt2->execute();
        if (!$exec_ok) {
            error_log('Error al ejecutar UPDATE consultas: ' . $stmt2->error);
            echo json_encode(['success' => false, 'error' => 'Error al ejecutar UPDATE consultas', 'mysqli_error' => $stmt2->error]);
            $stmt2->close();
            exit;
        }
        $stmt2->close();
        echo json_encode([
            'success' => $ok,
            'updated' => true,
            'update_consultas_ok' => $exec_ok,
            'clasificacion_final' => $clasificacion_final,
            'actor' => [
                'id' => (int)($actor['id'] ?? 0),
                'rol' => (string)($actor['rol'] ?? 'usuario'),
                'nombre' => (string)($actor['nombre'] ?? 'usuario'),
            ],
            'origen_registro' => $origenRegistro,
        ]);
        $stmt_check->close();
        break;
    case 'GET':
        // Consultar triaje por consulta_id
        $consulta_id = isset($_GET['consulta_id']) ? intval($_GET['consulta_id']) : null;
        if (!$consulta_id) {
            echo json_encode(['success' => false, 'error' => 'Falta consulta_id']);
            exit;
        }
        $stmt = $conn->prepare('SELECT * FROM triaje WHERE consulta_id = ?');
        $stmt->bind_param('i', $consulta_id);
        $stmt->execute();
        $res = $stmt->get_result();
        $row = $res->fetch_assoc();
        if ($row) {
            $row['datos'] = json_decode($row['datos'], true);
            echo json_encode(['success' => true, 'triaje' => $row]);
        } else {
            echo json_encode(['success' => false, 'error' => 'No encontrado']);
        }
        $stmt->close();
        break;
    default:
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
}
