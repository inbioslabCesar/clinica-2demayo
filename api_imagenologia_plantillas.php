<?php
/**
 * API: Plantillas de Imagenología — CRUD completo
 * GET  ?mode=list              → Listar todas (admin: activas e inactivas)
 * GET  ?tipo=ecografia         → Plantillas activas por tipo (modal informe)
 * GET  ?id=X                   → Plantilla específica por ID
 * POST                         → Crear o actualizar plantilla (solo admin)
 * DELETE ?id=X                 → Desactivar plantilla (solo admin)
 */

require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/auth_check.php';

header('Content-Type: application/json; charset=utf-8');

$usuario = $_SESSION['usuario'] ?? $_SESSION['medico'] ?? null;
$rol     = strtolower(trim((string)($usuario['rol'] ?? '')));

if (!$usuario || !in_array($rol, ['medico', 'administrador'])) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Acceso denegado']);
    exit;
}

// ─ Migración idempotente: añadir clinic_key si no existe ─────────────────────
$chkClinic = $mysqli->query("SHOW COLUMNS FROM imagenologia_plantillas LIKE 'clinic_key'");
if ($chkClinic && $chkClinic->num_rows === 0) {
    $mysqli->query("ALTER TABLE imagenologia_plantillas ADD COLUMN clinic_key VARCHAR(120) NULL");
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// Solo administradores pueden escribir
if ($method !== 'GET' && $rol !== 'administrador') {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Solo administradores pueden modificar plantillas de imagenología']);
    exit;
}

// ─ Helpers ───────────────────────────────────────────────────────────────────
function img_normalize_tipo(string $tipo): string {
    $t = strtolower(trim($tipo));
    if (in_array($t, ['rayos_x', 'rayos x', 'rx'], true)) return 'rayosx';
    if ($t === 'ecografia') return 'ecografia';
    if ($t === 'tomografia') return 'tomografia';
    return $t;
}

function img_normalize_secciones(array $sections): array {
    $clean = [];
    foreach ($sections as $s) {
        $id     = trim((string)($s['id'] ?? ''));
        $nombre = trim((string)($s['nombre'] ?? ''));
        if ($id === '' || $nombre === '') continue;
        $campos = [];
        foreach ((array)($s['campos'] ?? []) as $c) {
            $cid = trim((string)($c['id'] ?? ''));
            if ($cid === '') continue;
            $tipo = strtolower(trim((string)($c['type'] ?? 'textarea')));
            if (!in_array($tipo, ['text', 'textarea', 'number', 'select'], true)) $tipo = 'textarea';
            $campos[] = [
                'id'          => $cid,
                'label'       => trim((string)($c['label'] ?? '')),
                'type'        => $tipo,
                'placeholder' => trim((string)($c['placeholder'] ?? '')),
                'required'    => (bool)($c['required'] ?? false),
            ];
        }
        if (!empty($campos)) {
            $clean[] = ['id' => $id, 'nombre' => $nombre, 'campos' => $campos];
        }
    }
    return $clean;
}

function img_decode_row(array $row): array {
    $row['estructura_json'] = $row['estructura_json']
        ? json_decode((string)$row['estructura_json'], true)
        : null;
    $row['es_activa'] = (int)($row['es_activa'] ?? 1);
    return $row;
}

// ─ GET ────────────────────────────────────────────────────────────────────────
if ($method === 'GET') {
    $mode = trim((string)($_GET['mode'] ?? 'get'));
    $tipo = img_normalize_tipo((string)($_GET['tipo'] ?? ''));
    $id   = (int)($_GET['id'] ?? 0);

    // mode=list: todas las plantillas para el panel admin (activas e inactivas)
    if ($mode === 'list') {
        $hasClinicKey = (bool)$mysqli->query("SHOW COLUMNS FROM imagenologia_plantillas LIKE 'clinic_key'")->num_rows;
        $clinicKeySel = $hasClinicKey ? ', clinic_key' : ', NULL AS clinic_key';
        $res = $mysqli->query("SELECT id, nombre, tipo_examen, descripcion, es_activa{$clinicKeySel} FROM imagenologia_plantillas ORDER BY tipo_examen, nombre");
        $items = [];
        while ($row = $res->fetch_assoc()) {
            $items[] = $row;
        }
        echo json_encode(['success' => true, 'plantillas' => $items]);
        exit;
    }

    // Por ID específico
    if ($id > 0) {
        $stmt = $mysqli->prepare('SELECT * FROM imagenologia_plantillas WHERE id = ? LIMIT 1');
        $stmt->bind_param('i', $id);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if (!$row) {
            echo json_encode(['success' => false, 'error' => 'Plantilla no encontrada']);
            exit;
        }
        echo json_encode(['success' => true, 'plantilla' => img_decode_row($row)]);
        exit;
    }

    // Por tipo (comportamiento original — usado por ModalInformeImagenologia)
    if ($tipo !== '') {
        $stmt = $mysqli->prepare('SELECT id, nombre, tipo_examen, descripcion, estructura_json, es_activa FROM imagenologia_plantillas WHERE tipo_examen = ? AND es_activa = 1 ORDER BY nombre');
        $stmt->bind_param('s', $tipo);
        $stmt->execute();
        $res = $stmt->get_result();
        $plantillas = [];
        while ($row = $res->fetch_assoc()) {
            $plantillas[] = img_decode_row($row);
        }
        $stmt->close();
        echo json_encode(['success' => true, 'plantillas' => $plantillas, 'total' => count($plantillas)]);
        exit;
    }

    // Todas activas (sin filtro de tipo)
    $stmt = $mysqli->prepare('SELECT id, nombre, tipo_examen, descripcion, estructura_json, es_activa FROM imagenologia_plantillas WHERE es_activa = 1 ORDER BY tipo_examen, nombre');
    $stmt->execute();
    $res = $stmt->get_result();
    $plantillas = [];
    while ($row = $res->fetch_assoc()) {
        $plantillas[] = img_decode_row($row);
    }
    $stmt->close();
    echo json_encode(['success' => true, 'plantillas' => $plantillas, 'total' => count($plantillas)]);
    exit;
}

// ─ POST: Crear o actualizar ───────────────────────────────────────────────────
if ($method === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (!is_array($input)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'JSON inválido']);
        exit;
    }

    $id          = (int)($input['id'] ?? 0);
    $nombre      = trim((string)($input['nombre'] ?? ''));
    $tipoExamen  = img_normalize_tipo((string)($input['tipo_examen'] ?? ''));
    $descripcion = trim((string)($input['descripcion'] ?? ''));
    $clinicKey   = trim((string)($input['clinic_key'] ?? ''));
    $esActiva    = isset($input['es_activa']) ? (int)(bool)$input['es_activa'] : 1;

    if ($nombre === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'El nombre es requerido']);
        exit;
    }
    if (!in_array($tipoExamen, ['ecografia', 'rayosx', 'tomografia'], true)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Tipo inválido. Usar: ecografia, rayosx, tomografia']);
        exit;
    }

    // Resolver secciones (acepta estructura_json.sections o sections directamente)
    $sectionsRaw = [];
    if (isset($input['estructura_json']['sections'])) {
        $sectionsRaw = (array)$input['estructura_json']['sections'];
    } elseif (isset($input['sections'])) {
        $sectionsRaw = (array)$input['sections'];
    }

    $sections = img_normalize_secciones($sectionsRaw);
    if (empty($sections)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'La plantilla debe tener al menos una sección con campos']);
        exit;
    }

    $estructuraJson = json_encode(['sections' => $sections], JSON_UNESCAPED_UNICODE);
    $ahora = date('Y-m-d H:i:s');

    if ($id > 0) {
        $stmt = $mysqli->prepare('UPDATE imagenologia_plantillas SET nombre = ?, tipo_examen = ?, descripcion = ?, estructura_json = ?, clinic_key = ?, es_activa = ?, updated_at = ? WHERE id = ?');
        $stmt->bind_param('sssssisi', $nombre, $tipoExamen, $descripcion, $estructuraJson, $clinicKey, $esActiva, $ahora, $id);
        $stmt->execute();
        $stmt->close();
        echo json_encode(['success' => true, 'id' => $id, 'accion' => 'actualizado']);
    } else {
        $stmt = $mysqli->prepare('INSERT INTO imagenologia_plantillas (nombre, tipo_examen, descripcion, estructura_json, clinic_key, es_activa) VALUES (?, ?, ?, ?, ?, ?)');
        $stmt->bind_param('sssssi', $nombre, $tipoExamen, $descripcion, $estructuraJson, $clinicKey, $esActiva);
        $stmt->execute();
        $newId = (int)$mysqli->insert_id;
        $stmt->close();
        echo json_encode(['success' => true, 'id' => $newId, 'accion' => 'creado']);
    }
    exit;
}

// ─ DELETE: Soft-delete (desactivar) ──────────────────────────────────────────
if ($method === 'DELETE') {
    $id = (int)($_GET['id'] ?? 0);
    if ($id <= 0) {
        $inputDel = json_decode(file_get_contents('php://input'), true);
        $id = (int)($inputDel['id'] ?? 0);
    }
    if ($id <= 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'id requerido']);
        exit;
    }
    $stmt = $mysqli->prepare('UPDATE imagenologia_plantillas SET es_activa = 0, updated_at = NOW() WHERE id = ?');
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $stmt->close();
    echo json_encode(['success' => true, 'accion' => 'desactivado']);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'error' => 'Método no permitido']);
?>
