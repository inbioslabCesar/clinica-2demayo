<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/auth_check.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/modules/RecetaProtocolos.php';

header('Content-Type: application/json; charset=utf-8');

function rp_json_input() {
    $raw = file_get_contents('php://input');
    if (!is_string($raw) || trim($raw) === '') return [];
    $parsed = json_decode($raw, true);
    return is_array($parsed) ? $parsed : [];
}

function rp_lower($txt) {
    return RecetaProtocolos::minusculas($txt);
}

function rp_get_user_id() {
    if (!empty($_SESSION['usuario_id'])) return (int)$_SESSION['usuario_id'];
    if (!empty($_SESSION['id'])) return (int)$_SESSION['id'];
    return 0;
}

function rp_responder($codigo, array $payload) {
    http_response_code($codigo);
    echo json_encode($payload);
    exit;
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
        autor_medico_id INT NULL,
        creado_por_nombre VARCHAR(150) NULL,
        actualizado_por_nombre VARCHAR(150) NULL,
        INDEX idx_rp_activo (activo),
        INDEX idx_rp_medico (medico_id),
        INDEX idx_rp_especialidad (especialidad)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4";
    $conn->query($sql);
}

/** Columnas de autoría que existan en esta BD (clínicas sin el script de esquema siguen funcionando sin la marca). */
function rp_columnas_autoria($conn) {
    static $cache = null;
    if ($cache !== null) return $cache;
    $cache = [];
    $res = $conn->query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'receta_protocolos' AND COLUMN_NAME IN ('autor_medico_id', 'creado_por_nombre', 'actualizado_por_nombre')");
    while ($res && ($r = $res->fetch_assoc())) {
        $cache[$r['COLUMN_NAME']] = true;
    }
    return $cache;
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

function rp_especialidad_de_medico($conn, $medicoId) {
    $medicoId = (int)$medicoId;
    if ($medicoId <= 0) return '';
    $stmt = $conn->prepare('SELECT COALESCE(especialidad, "") AS especialidad FROM medicos WHERE id = ? LIMIT 1');
    if (!$stmt) return '';
    $stmt->bind_param('i', $medicoId);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return trim((string)($row['especialidad'] ?? ''));
}

/** Quién está operando: administrador (sesión de usuario) o médico (login de médico). Otros roles solo consultan. */
function rp_actor() {
    $admin = false;
    $medicoId = 0;
    $usuarioId = 0;
    $nombre = '';

    if (isset($_SESSION['usuario']) && is_array($_SESSION['usuario'])) {
        $rol = strtolower(trim((string)($_SESSION['usuario']['rol'] ?? '')));
        $admin = $rol === 'administrador';
        $usuarioId = (int)($_SESSION['usuario']['id'] ?? 0);
        $nombre = trim((string)($_SESSION['usuario']['nombre'] ?? ''));
        if ($rol === 'medico') {
            $medicoId = (int)($_SESSION['usuario']['medico_id'] ?? $usuarioId);
        }
    } elseif (!empty($_SESSION['medico_id'])) {
        $medicoId = (int)$_SESSION['medico_id'];
        $m = isset($_SESSION['medico']) && is_array($_SESSION['medico']) ? $_SESSION['medico'] : [];
        $nombre = trim(trim((string)($m['nombre'] ?? '')) . ' ' . trim((string)($m['apellido'] ?? '')));
    }
    if ($usuarioId <= 0) $usuarioId = rp_get_user_id();

    return [
        'admin' => $admin,
        'gestiona' => $admin || $medicoId > 0,
        'medico_id' => $medicoId,
        'usuario_id' => $usuarioId,
        'nombre' => $nombre !== '' ? $nombre : 'Usuario',
    ];
}

function rp_cargar($conn, $id) {
    $stmt = $conn->prepare('SELECT * FROM receta_protocolos WHERE id = ? AND activo = 1 LIMIT 1');
    if (!$stmt) return null;
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row ?: null;
}

/** Protocolo existente, visible para el contexto y gestionable por el actor; responde el error y termina si no. */
function rp_cargar_gestionable($conn, $id, $ctx, $actor, $accion) {
    if ($id <= 0) rp_responder(400, ['success' => false, 'error' => 'ID de protocolo invalido']);
    if (empty($actor['gestiona'])) rp_responder(403, ['success' => false, 'error' => 'Solo el médico o el administrador pueden modificar protocolos']);

    $row = rp_cargar($conn, $id);
    if (!$row || (empty($actor['admin']) && !RecetaProtocolos::visibleEn($row, (int)$ctx['medico_id'], rp_lower($ctx['especialidad'])))) {
        rp_responder(404, ['success' => false, 'error' => 'Protocolo no encontrado']);
    }
    $permitido = $accion === 'eliminar' ? RecetaProtocolos::puedeEliminar($row, $actor) : RecetaProtocolos::puedeEditar($row, $actor);
    if (!$permitido) {
        $msg = $accion === 'eliminar'
            ? 'Solo el autor o el administrador pueden eliminar este protocolo'
            : 'Este protocolo es personal de otro médico';
        rp_responder(403, ['success' => false, 'error' => $msg]);
    }
    return $row;
}

/** [medico_id, especialidad] a guardar según el alcance elegido (null = vacío). */
function rp_campos_alcance($conn, $scope, $ctx, $actor) {
    $duenio = (int)$actor['medico_id'] > 0 ? (int)$actor['medico_id'] : (int)$ctx['medico_id'];
    $esp = $duenio > 0 ? rp_especialidad_de_medico($conn, $duenio) : '';
    if ($esp === '') $esp = trim((string)$ctx['especialidad']);

    if ($scope === 'general') {
        return [null, null];
    }
    if ($scope === 'especialidad') {
        if ($esp === '') {
            rp_responder(400, ['success' => false, 'error' => 'No hay especialidad definida para compartir por especialidad']);
        }
        return [null, $esp];
    }
    if ($duenio <= 0) {
        rp_responder(400, ['success' => false, 'error' => 'No se pudo determinar el médico dueño del protocolo']);
    }
    return [$duenio, $esp !== '' ? $esp : null];
}

$method = $_SERVER['REQUEST_METHOD'];
rp_ensure_table($conn);

if ($method === 'GET') {
    $consultaId = isset($_GET['consulta_id']) ? (int)$_GET['consulta_id'] : 0;
    $ctx = rp_load_context($conn, $consultaId);
    $medicoId = (int)$ctx['medico_id'];
    $especialidad = trim((string)$ctx['especialidad']);
    $especialidadNorm = rp_lower($especialidad);
    $actor = rp_actor();

    $sql = 'SELECT * FROM receta_protocolos WHERE activo = 1';

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
                nombre ASC,
                id DESC
              LIMIT 300';

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        rp_responder(500, ['success' => false, 'error' => 'No se pudo consultar protocolos']);
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
            'alcance' => RecetaProtocolos::alcance($row['medico_id'] ?? null, $row['especialidad'] ?? ''),
            'activo' => (int)($row['activo'] ?? 0) === 1,
            'items' => $items,
            'creado_en' => (string)($row['creado_en'] ?? ''),
            'actualizado_en' => (string)($row['actualizado_en'] ?? ''),
            'creado_por_nombre' => (string)($row['creado_por_nombre'] ?? ''),
            'actualizado_por_nombre' => (string)($row['actualizado_por_nombre'] ?? ''),
            'puede_editar' => RecetaProtocolos::puedeEditar($row, $actor),
            'puede_eliminar' => RecetaProtocolos::puedeEliminar($row, $actor),
            'puede_cambiar_alcance' => RecetaProtocolos::puedeCambiarAlcance($row, $actor),
        ];
    }

    $stmt->close();

    echo json_encode([
        'success' => true,
        'contexto' => [
            'consulta_id' => $consultaId,
            'medico_id' => $medicoId,
            'especialidad' => $especialidad,
            'puede_gestionar' => !empty($actor['gestiona']),
        ],
        'data' => $rows,
    ]);
    exit;
}

if ($method === 'POST') {
    $body = rp_json_input();
    $action = trim((string)($body['action'] ?? 'save'));
    $consultaId = (int)($body['consulta_id'] ?? 0);
    $ctx = rp_load_context($conn, $consultaId);
    $actor = rp_actor();
    $cols = rp_columnas_autoria($conn);

    if ($action === 'delete') {
        $id = (int)($body['id'] ?? 0);
        rp_cargar_gestionable($conn, $id, $ctx, $actor, 'eliminar');

        $stmt = $conn->prepare('UPDATE receta_protocolos SET activo = 0 WHERE id = ? LIMIT 1');
        if (!$stmt) {
            rp_responder(500, ['success' => false, 'error' => 'No se pudo eliminar protocolo']);
        }
        $stmt->bind_param('i', $id);
        $ok = $stmt->execute();
        $stmt->close();

        echo json_encode(['success' => (bool)$ok]);
        exit;
    }

    $nombre = trim((string)($body['nombre'] ?? ''));
    $items = RecetaProtocolos::limpiarItems($body['items'] ?? []);

    if ($nombre === '') {
        rp_responder(400, ['success' => false, 'error' => 'Nombre de protocolo requerido']);
    }
    if (count($items) === 0) {
        rp_responder(400, ['success' => false, 'error' => 'Debe incluir al menos un medicamento']);
    }
    $nombre = function_exists('mb_substr') ? mb_substr($nombre, 0, 150, 'UTF-8') : substr($nombre, 0, 150);
    $itemsJson = json_encode($items, JSON_UNESCAPED_UNICODE);

    if ($action === 'update') {
        $id = (int)($body['id'] ?? 0);
        $row = rp_cargar_gestionable($conn, $id, $ctx, $actor, 'editar');

        $alcanceActual = RecetaProtocolos::alcance($row['medico_id'] ?? null, $row['especialidad'] ?? '');
        $scope = isset($body['scope']) ? RecetaProtocolos::normalizarAlcance($body['scope']) : $alcanceActual;

        $sets = ['nombre = ?', 'items_json = ?'];
        $types = 'ss';
        $vals = [$nombre, $itemsJson];

        if ($scope !== $alcanceActual) {
            if (!RecetaProtocolos::puedeCambiarAlcance($row, $actor)) {
                rp_responder(403, ['success' => false, 'error' => 'Solo el autor o el administrador pueden cambiar quién ve este protocolo']);
            }
            [$storeMedicoId, $storeEspecialidad] = rp_campos_alcance($conn, $scope, $ctx, $actor);
            $sets[] = 'medico_id = ?';
            $sets[] = 'especialidad = ?';
            $types .= 'is';
            $vals[] = $storeMedicoId;
            $vals[] = $storeEspecialidad;
        }
        if (isset($cols['actualizado_por_nombre'])) {
            $sets[] = 'actualizado_por_nombre = ?';
            $types .= 's';
            $vals[] = $actor['nombre'];
        }
        $types .= 'i';
        $vals[] = $id;

        $stmt = $conn->prepare('UPDATE receta_protocolos SET ' . implode(', ', $sets) . ' WHERE id = ? LIMIT 1');
        if (!$stmt) {
            rp_responder(500, ['success' => false, 'error' => 'No se pudo actualizar protocolo']);
        }
        $stmt->bind_param($types, ...$vals);
        $ok = $stmt->execute();
        $stmt->close();

        echo json_encode(['success' => (bool)$ok, 'id' => $id]);
        exit;
    }

    if (empty($actor['gestiona'])) {
        rp_responder(403, ['success' => false, 'error' => 'Solo el médico o el administrador pueden crear protocolos']);
    }
    $scope = RecetaProtocolos::normalizarAlcance($body['scope'] ?? 'medico');
    [$storeMedicoId, $storeEspecialidad] = rp_campos_alcance($conn, $scope, $ctx, $actor);

    $columnas = ['nombre', 'especialidad', 'medico_id', 'activo', 'items_json', 'creado_por'];
    $types = 'ssisi';
    $vals = [$nombre, $storeEspecialidad, $storeMedicoId, $itemsJson, (int)$actor['usuario_id']];
    $marcas = '?, ?, ?, 1, ?, ?';
    if (isset($cols['autor_medico_id'])) {
        $columnas[] = 'autor_medico_id';
        $marcas .= ', ?';
        $types .= 'i';
        $vals[] = (int)$actor['medico_id'] > 0 ? (int)$actor['medico_id'] : null;
    }
    if (isset($cols['creado_por_nombre'])) {
        $columnas[] = 'creado_por_nombre';
        $marcas .= ', ?';
        $types .= 's';
        $vals[] = $actor['nombre'];
    }

    $stmt = $conn->prepare('INSERT INTO receta_protocolos (' . implode(', ', $columnas) . ') VALUES (' . $marcas . ')');
    if (!$stmt) {
        rp_responder(500, ['success' => false, 'error' => 'No se pudo guardar protocolo']);
    }
    $stmt->bind_param($types, ...$vals);
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
