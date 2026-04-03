<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/auth_check.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/modules/HcTemplateResolver.php';

function hc_templates_require_admin_for_write() {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if ($method === 'GET') return;

    if (!isset($_SESSION['usuario']) || !is_array($_SESSION['usuario'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'No autenticado']);
        exit;
    }

    $rol = trim((string)($_SESSION['usuario']['rol'] ?? ''));
    if ($rol !== 'administrador') {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Solo administradores pueden modificar plantillas HC']);
        exit;
    }
}

function hc_templates_ensure_table($conn) {
    $sql = "CREATE TABLE IF NOT EXISTS hc_templates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        template_id VARCHAR(100) NOT NULL,
        version VARCHAR(50) NOT NULL,
        nombre VARCHAR(150) NOT NULL,
        schema_version VARCHAR(20) NOT NULL DEFAULT '2.0',
        source VARCHAR(50) NOT NULL DEFAULT 'clinica_override',
        clinic_key VARCHAR(120) NULL,
        schema_json LONGTEXT NOT NULL,
        activo TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_hc_templates_unique (template_id, version, clinic_key),
        KEY idx_hc_templates_lookup (template_id, activo, clinic_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";
    $conn->query($sql);
}

function hc_templates_normalize_sections($sections) {
    if (!is_array($sections)) return [];

    $clean = [];
    foreach ($sections as $sectionKey => $fields) {
        $sKey = trim((string)$sectionKey);
        if ($sKey === '') continue;
        if (!is_array($fields)) continue;

        $sectionFields = [];
        foreach ($fields as $fieldKey => $fieldDefault) {
            $fKey = trim((string)$fieldKey);
            if ($fKey === '') continue;

            $normalized = [
                'type' => 'textarea',
                'width' => 'half',
                'rows' => 2,
                'options' => [],
                'break_after' => false,
            ];

            if (is_array($fieldDefault)) {
                $rawType = strtolower(trim((string)($fieldDefault['type'] ?? 'textarea')));
                if (in_array($rawType, ['text', 'textarea', 'number', 'select'], true)) {
                    $normalized['type'] = $rawType;
                }

                $rawWidth = strtolower(trim((string)($fieldDefault['width'] ?? 'half')));
                if (in_array($rawWidth, ['quarter', 'third', 'half', 'full'], true)) {
                    $normalized['width'] = $rawWidth;
                }

                $rows = (int)($fieldDefault['rows'] ?? 2);
                if ($rows < 1) $rows = 1;
                if ($rows > 8) $rows = 8;
                $normalized['rows'] = $rows;

                $rawOptions = $fieldDefault['options'] ?? [];
                if (is_string($rawOptions)) {
                    $rawOptions = explode(',', $rawOptions);
                }
                if (is_array($rawOptions)) {
                    $options = [];
                    foreach ($rawOptions as $option) {
                        $opt = trim((string)$option);
                        if ($opt !== '') $options[] = $opt;
                    }
                    $normalized['options'] = array_values(array_unique($options));
                }

                $rawBreak = $fieldDefault['break_after'] ?? ($fieldDefault['breakAfter'] ?? false);
                $normalized['break_after'] = filter_var($rawBreak, FILTER_VALIDATE_BOOLEAN);
            }

            $sectionFields[$fKey] = $normalized;
        }

        if (!empty($sectionFields)) {
            $clean[$sKey] = $sectionFields;
        }
    }

    return $clean;
}

function hc_templates_handle_list($conn) {
    $clinicKey = trim((string)($_GET['clinic_key'] ?? ''));
    if ($clinicKey === '') {
        $clinicKey = hc_guess_clinic_key($conn);
    }

    $items = [];
    foreach (hc_get_builtin_templates() as $tpl) {
        $items[] = [
            'template_id' => (string)($tpl['id'] ?? ''),
            'version' => (string)($tpl['version'] ?? ''),
            'nombre' => (string)($tpl['nombre'] ?? ''),
            'source' => 'builtin',
            'clinic_key' => '',
            'activo' => 1,
        ];
    }

    if (hc_table_exists($conn, 'hc_templates')) {
        $hasClinicCol = hc_column_exists_hc_templates($conn, 'clinic_key');
        $sql = 'SELECT template_id, version, nombre, source, activo' . ($hasClinicCol ? ', clinic_key' : ', NULL AS clinic_key') . ' FROM hc_templates WHERE activo = 1';

        if ($hasClinicCol && $clinicKey !== '') {
            $sql .= ' AND (clinic_key = ? OR clinic_key IS NULL OR clinic_key = "")';
            $stmt = $conn->prepare($sql . ' ORDER BY template_id ASC, id DESC');
            if ($stmt) {
                $stmt->bind_param('s', $clinicKey);
                $stmt->execute();
                $res = $stmt->get_result();
                while ($row = $res->fetch_assoc()) {
                    $items[] = [
                        'template_id' => (string)($row['template_id'] ?? ''),
                        'version' => (string)($row['version'] ?? ''),
                        'nombre' => (string)($row['nombre'] ?? ''),
                        'source' => (string)($row['source'] ?? 'clinica_override'),
                        'clinic_key' => (string)($row['clinic_key'] ?? ''),
                        'activo' => (int)($row['activo'] ?? 1),
                    ];
                }
                $stmt->close();
            }
        } else {
            $res = $conn->query($sql . ' ORDER BY template_id ASC, id DESC');
            if ($res) {
                while ($row = $res->fetch_assoc()) {
                    $items[] = [
                        'template_id' => (string)($row['template_id'] ?? ''),
                        'version' => (string)($row['version'] ?? ''),
                        'nombre' => (string)($row['nombre'] ?? ''),
                        'source' => (string)($row['source'] ?? 'clinica_override'),
                        'clinic_key' => (string)($row['clinic_key'] ?? ''),
                        'activo' => (int)($row['activo'] ?? 1),
                    ];
                }
            }
        }
    }

    echo json_encode([
        'success' => true,
        'clinic_key' => $clinicKey,
        'items' => $items,
    ]);
}

function hc_templates_handle_get($conn) {
    $consultaId = isset($_GET['consulta_id']) ? (int)$_GET['consulta_id'] : 0;
    $templateId = trim((string)($_GET['template_id'] ?? ''));
    $version = trim((string)($_GET['version'] ?? ''));
    $especialidad = trim((string)($_GET['especialidad'] ?? ''));
    $clinicKey = trim((string)($_GET['clinic_key'] ?? ''));

    $resolved = hc_resolve_template($conn, [
        'consulta_id' => $consultaId,
        'template_id' => $templateId,
        'version' => $version,
        'especialidad' => $especialidad,
        'clinic_key' => $clinicKey,
    ]);

    if (!($resolved['success'] ?? false)) {
        echo json_encode(['success' => false, 'error' => 'No se pudo resolver plantilla HC']);
        exit;
    }

    echo json_encode([
        'success' => true,
        'template' => $resolved['template'],
        'resolution' => $resolved['resolution'] ?? [],
    ]);
}

function hc_templates_handle_upsert($conn) {
    hc_templates_require_admin_for_write();
    hc_templates_ensure_table($conn);

    $payload = json_decode(file_get_contents('php://input'), true);
    if (!is_array($payload)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'JSON invalido']);
        exit;
    }

    $templateId = trim((string)($payload['template_id'] ?? ''));
    $nombre = trim((string)($payload['nombre'] ?? ''));
    $version = trim((string)($payload['version'] ?? ''));
    $schemaVersion = trim((string)($payload['schema_version'] ?? '2.0'));
    $clinicKey = trim((string)($payload['clinic_key'] ?? ''));
    $activo = (int)($payload['activo'] ?? 1) ? 1 : 0;
    $sections = hc_templates_normalize_sections($payload['sections'] ?? []);

    if ($templateId === '' || $nombre === '' || $version === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'template_id, nombre y version son requeridos']);
        exit;
    }
    if (empty($sections)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'La plantilla debe incluir al menos una seccion con campos']);
        exit;
    }

    $schemaJson = json_encode(['sections' => $sections], JSON_UNESCAPED_UNICODE);
    $stmt = $conn->prepare(
        'INSERT INTO hc_templates (template_id, version, nombre, schema_version, source, clinic_key, schema_json, activo)
         VALUES (?, ?, ?, ?, "clinica_override", ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           nombre = VALUES(nombre),
           schema_version = VALUES(schema_version),
           source = VALUES(source),
           schema_json = VALUES(schema_json),
           activo = VALUES(activo),
           updated_at = CURRENT_TIMESTAMP'
    );
    if (!$stmt) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'No se pudo preparar la escritura']);
        exit;
    }
    $stmt->bind_param('ssssssi', $templateId, $version, $nombre, $schemaVersion, $clinicKey, $schemaJson, $activo);
    $ok = $stmt->execute();
    $stmt->close();

    if (!$ok) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'No se pudo guardar la plantilla']);
        exit;
    }

    echo json_encode([
        'success' => true,
        'saved' => [
            'template_id' => $templateId,
            'version' => $version,
            'nombre' => $nombre,
            'schema_version' => $schemaVersion,
            'clinic_key' => $clinicKey,
            'activo' => $activo,
            'sections' => $sections,
        ],
    ]);
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $mode = trim((string)($_GET['mode'] ?? 'get'));
    if ($mode === 'list') {
        hc_templates_handle_list($conn);
        exit;
    }

    hc_templates_handle_get($conn);
    exit;
}

if ($method === 'POST' || $method === 'PUT') {
    hc_templates_handle_upsert($conn);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'error' => 'Metodo no permitido']);
