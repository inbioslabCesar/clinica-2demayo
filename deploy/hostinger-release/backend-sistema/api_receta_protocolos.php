<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/auth_check.php';
require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

function rp_json_input() {
    $raw = file_get_contents('php://input');
    if (!is_string($raw) || trim($raw) === '') return [];
    $parsed = json_decode($raw, true);
    return is_array($parsed) ? $parsed : [];
}

function rp_lower($txt) {
    $txt = trim((string)$txt);
    if ($txt === '') return '';
    return function_exists('mb_strtolower') ? mb_strtolower($txt, 'UTF-8') : strtolower($txt);
}

function rp_get_user_id() {
    if (!empty($_SESSION['usuario_id'])) return (int)$_SESSION['usuario_id'];
    if (!empty($_SESSION['id'])) return (int)$_SESSION['id'];
    return 0;
}

function rp_ensure_table($conn) {
    $sql = "CREATE TABLE IF NOT EXISTS receta_protocolos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(150) NOT NULL,
        especialidad VARCHAR(120) NULL,
        medico_id INT NULL,
        activo TINYINT(1) NOT NULL DEFAULT 1,
        items_json JSON NOT NULL,
        creado_por INT NULL,
        creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_rp_activo (activo),
        INDEX idx_rp_medico (medico_id),
        INDEX idx_rp_especialidad (especialidad)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";
    $conn->query($sql);
}

function rp_load_context($conn, $consultaId) {
    $ctx = ['medico_id' => 0, 'especialidad' => ''];
    $consultaId = (int)$consultaId;
    if ($consultaId <= 0) return $ctx;

    $stmt = $conn->prepare('SELECT c.medico_id, COALESCE(m.especialidad, "") AS especialidad FROM consultas c LEFT JOIN medicos m ON m.id = c.medico_id WHERE c.id = ? LIMIT 1');
    if (!$stmt) return $ctx;
    $stmt->bind_param('i', $consultaId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if ($row) {
        $ctx['medico_id'] = (int)($row['medico_id'] ?? 0);
        $ctx['especialidad'] = trim((string)($row['especialidad'] ?? ''));
    }
    return $ctx;
}

$method = $_SERVER['REQUEST_METHOD'];
rp_ensure_table($conn);

if ($method === 'GET') {
    $consultaId = isset($_GET['consulta_id']) ? (int)$_GET['consulta_id'] : 0;
    $ctx = rp_load_context($conn, $consultaId);
    $medicoId = (int)$ctx['medico_id'];
    $especialidad = trim((string)$ctx['especialidad']);
    $especialidadNorm = rp_lower($especialidad);

    $sql = 'SELECT id, nombre, especialidad, medico_id, activo, items_json, creado_en, actualizado_en
            FROM receta_protocolos
            WHERE activo = 1';

    $params = [];
    $types = '';

    if ($medicoId > 0 && $especialidadNorm !== '') {
        $sql .= ' AND ((medico_id = ?) OR (medico_id IS NULL AND (LOWER(TRIM(COALESCE(especialidad, ""))) = ? OR COALESCE(especialidad, "") = "")))';
        $types .= 'is';
        $params[] = $medicoId;
        $params[] = $especialidadNorm;
    } elseif ($medicoId > 0) {
        $sql .= ' AND (medico_id = ? OR medico_id IS NULL)';
        $types .= 'i';
        $params[] = $medicoId;
    } elseif ($especialidadNorm !== '') {
        $sql .= ' AND (LOWER(TRIM(COALESCE(especialidad, ""))) = ? OR COALESCE(especialidad, "") = "")';
        $types .= 's';
        $params[] = $especialidadNorm;
    }

    $sql .= ' ORDER BY
                CASE WHEN medico_id IS NOT NULL THEN 0 ELSE 1 END,
                CASE WHEN TRIM(COALESCE(especialidad, "")) <> "" THEN 0 ELSE 1 END,
                actualizado_en DESC,
                id DESC
              LIMIT 30';

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'No se pudo consultar protocolos']);
        exit;
    }

    if ($types !== '') {
        $stmt->bind_param($types, ...$params);
    }

    $stmt->execute();
    $res = $stmt->get_result();
    $rows = [];

    while ($row = $res->fetch_assoc()) {
        $items = [];
        if (is_string($row['items_json'] ?? null)) {
            $decoded = json_decode($row['items_json'], true);
            if (is_array($decoded)) $items = $decoded;
        }

        $rows[] = [
            'id' => (int)($row['id'] ?? 0),
            'nombre' => (string)($row['nombre'] ?? ''),
            'especialidad' => (string)($row['especialidad'] ?? ''),
            'medico_id' => isset($row['medico_id']) ? (int)$row['medico_id'] : null,
            'activo' => (int)($row['activo'] ?? 0) === 1,
            'items' => $items,
            'creado_en' => (string)($row['creado_en'] ?? ''),
            'actualizado_en' => (string)($row['actualizado_en'] ?? ''),
        ];
    }

    $stmt->close();

    echo json_encode([
        'success' => true,
        'contexto' => [
            'consulta_id' => $consultaId,
            'medico_id' => $medicoId,
            'especialidad' => $especialidad,
        ],
        'data' => $rows,
    ]);
    exit;
}

if ($method === 'POST') {
    $body = rp_json_input();
    $action = trim((string)($body['action'] ?? 'save'));

    if ($action === 'delete') {
        $id = (int)($body['id'] ?? 0);
        if ($id <= 0) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'ID de protocolo invalido']);
            exit;
        }

        $stmt = $conn->prepare('UPDATE receta_protocolos SET activo = 0 WHERE id = ? LIMIT 1');
        if (!$stmt) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'No se pudo eliminar protocolo']);
            exit;
        }
        $stmt->bind_param('i', $id);
        $ok = $stmt->execute();
        $stmt->close();

        echo json_encode(['success' => (bool)$ok]);
        exit;
    }

    $nombre = trim((string)($body['nombre'] ?? ''));
    $consultaId = (int)($body['consulta_id'] ?? 0);
    $scope = trim((string)($body['scope'] ?? 'medico'));
    $items = is_array($body['items'] ?? null) ? $body['items'] : [];

    if ($nombre === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Nombre de protocolo requerido']);
        exit;
    }
    if (count($items) === 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Debe incluir al menos un medicamento']);
        exit;
    }

    $ctx = rp_load_context($conn, $consultaId);
    $medicoId = (int)$ctx['medico_id'];
    $especialidad = trim((string)$ctx['especialidad']);

    $storeMedicoId = null;
    $storeEspecialidad = null;

    if ($scope === 'general') {
        $storeMedicoId = null;
        $storeEspecialidad = null;
    } elseif ($scope === 'especialidad') {
        $storeMedicoId = null;
        $storeEspecialidad = $especialidad !== '' ? $especialidad : null;
    } else {
        $storeMedicoId = $medicoId > 0 ? $medicoId : null;
        $storeEspecialidad = $especialidad !== '' ? $especialidad : null;
    }

    $itemsJson = json_encode($items, JSON_UNESCAPED_UNICODE);
    $creadoPor = rp_get_user_id();

    $stmt = $conn->prepare('INSERT INTO receta_protocolos (nombre, especialidad, medico_id, activo, items_json, creado_por) VALUES (?, ?, ?, 1, ?, ?)');
    if (!$stmt) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'No se pudo guardar protocolo']);
        exit;
    }

    $stmt->bind_param('ssisi', $nombre, $storeEspecialidad, $storeMedicoId, $itemsJson, $creadoPor);
    $ok = $stmt->execute();
    $newId = $ok ? (int)$stmt->insert_id : 0;
    $stmt->close();

    echo json_encode([
        'success' => (bool)$ok,
        'id' => $newId,
    ]);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'error' => 'Metodo no permitido']);
