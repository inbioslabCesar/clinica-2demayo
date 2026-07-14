<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/modules/HcTemplateResolver.php';

function cfg_table_exists($pdo, $tableName) {
    $stmt = $pdo->prepare("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1");
    $stmt->execute([$tableName]);
    return (bool)$stmt->fetchColumn();
}

function cfg_actor_label() {
    $u = $_SESSION['usuario'] ?? null;
    if (!is_array($u)) {
        return 'sistema';
    }

    $rol = trim((string)($u['rol'] ?? 'usuario'));
    $nombre = trim((string)($u['nombre'] ?? ''));
    $apellido = trim((string)($u['apellido'] ?? ''));
    $display = trim($nombre . ' ' . $apellido);
    if ($display === '') {
        $display = trim((string)($u['usuario'] ?? 'usuario'));
    }
    return $display . ' (' . $rol . ')';
}

function cfg_normalize_mode($modeRaw) {
    $mode = strtolower(trim((string)$modeRaw));
    return in_array($mode, ['auto', 'single'], true) ? $mode : 'auto';
}

function cfg_ensure_hc_backup_table($pdo) {
    $pdo->exec("CREATE TABLE IF NOT EXISTS historia_clinica_backups (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        batch_id VARCHAR(80) NOT NULL,
        historia_id BIGINT NOT NULL,
        consulta_id BIGINT NOT NULL,
        datos_json LONGTEXT NOT NULL,
        backup_reason VARCHAR(80) NOT NULL DEFAULT 'policy_change_pin',
        actor VARCHAR(180) NULL,
        template_id_resuelto VARCHAR(150) NULL,
        template_version_resuelta VARCHAR(60) NULL,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_hc_backup_batch (batch_id),
        KEY idx_hc_backup_historia (historia_id),
        KEY idx_hc_backup_consulta (consulta_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
}

function cfg_pin_existing_hc_templates($pdo, $conn, $actorLabel) {
    $summary = [
        'batch_id' => '',
        'evaluated' => 0,
        'already_pinned' => 0,
        'pinned_now' => 0,
        'invalid_json' => 0,
        'unresolved' => 0,
    ];

    if (!cfg_table_exists($pdo, 'historia_clinica')) {
        return $summary;
    }

    // Note: cfg_ensure_hc_backup_table($pdo) must be called BEFORE transaction
    // because CREATE TABLE is DDL and cannot be in an explicit transaction

    $batchId = 'hc_policy_' . date('Ymd_His') . '_' . substr(md5(uniqid('', true)), 0, 8);
    $summary['batch_id'] = $batchId;

    $rows = $pdo->query('SELECT id, consulta_id, datos FROM historia_clinica ORDER BY id ASC')->fetchAll(PDO::FETCH_ASSOC);
    $stmtBackup = $pdo->prepare('INSERT INTO historia_clinica_backups (batch_id, historia_id, consulta_id, datos_json, backup_reason, actor, template_id_resuelto, template_version_resuelta) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    $stmtUpdate = $pdo->prepare('UPDATE historia_clinica SET datos = ?, fecha_registro = CURRENT_TIMESTAMP WHERE id = ?');

    foreach ($rows as $row) {
        $summary['evaluated']++;

        $historiaId = (int)($row['id'] ?? 0);
        $consultaId = (int)($row['consulta_id'] ?? 0);
        $datosRaw = (string)($row['datos'] ?? '');
        $datos = json_decode($datosRaw, true);
        if (!is_array($datos)) {
            $summary['invalid_json']++;
            continue;
        }

        $templateIdActual = trim((string)($datos['template']['id'] ?? ''));
        if ($templateIdActual !== '') {
            $summary['already_pinned']++;
            continue;
        }

        $resolved = hc_resolve_template($conn, [
            'consulta_id' => $consultaId,
        ]);
        $resolvedTemplate = (is_array($resolved) && ($resolved['success'] ?? false)) ? ($resolved['template'] ?? null) : null;
        $resolvedTemplateId = trim((string)($resolvedTemplate['id'] ?? ''));
        $resolvedVersion = trim((string)($resolvedTemplate['version'] ?? ''));
        if ($resolvedTemplateId === '') {
            $summary['unresolved']++;
            continue;
        }

        $stmtBackup->execute([
            $batchId,
            $historiaId,
            $consultaId,
            $datosRaw,
            'policy_change_pin',
            $actorLabel,
            $resolvedTemplateId,
            $resolvedVersion,
        ]);

        $datos['template'] = [
            'id' => $resolvedTemplateId,
            'version' => $resolvedVersion,
        ];
        $datosJsonPinned = json_encode($datos, JSON_UNESCAPED_UNICODE);
        if (!is_string($datosJsonPinned) || $datosJsonPinned === '') {
            $summary['invalid_json']++;
            continue;
        }

        $stmtUpdate->execute([$datosJsonPinned, $historiaId]);
        $summary['pinned_now']++;
    }

    return $summary;
}

function normalize_logo_size_option($value) {
    $allowed = ['sm', 'md', 'lg', 'xl', 'xxl'];
    $normalized = strtolower(trim((string)($value ?? '')));
    return in_array($normalized, $allowed, true) ? $normalized : null;
}

function normalize_logo_shape_option($value) {
    $allowed = ['auto', 'round', 'wide'];
    $normalized = strtolower(trim((string)($value ?? 'auto')));
    return in_array($normalized, $allowed, true) ? $normalized : 'auto';
}

// Verificar que el usuario esté autenticado (usuario normal o médico)
if (!isset($_SESSION['usuario']) && !isset($_SESSION['medico_id'])) {
    echo json_encode(['error' => 'No autorizado']);
    http_response_code(401);
    exit;
}

// Para operaciones de lectura (GET), permitir acceso a médicos y usuarios
// Para operaciones de escritura (POST, PUT, DELETE), solo administradores
$method = $_SERVER['REQUEST_METHOD'];


if ($method !== 'GET') {
    // Para operaciones de escritura, verificar que sea administrador
    if (!isset($_SESSION['usuario']) || !isset($_SESSION['usuario']['id'])) {
        echo json_encode(['error' => 'No autorizado']);
        http_response_code(401);
        exit;
    }

    $usuario_rol = trim((string)($_SESSION['usuario']['rol'] ?? ''));
    
    // Verificar si el usuario es administrador para operaciones de escritura
    if ($usuario_rol !== 'administrador') {
        echo json_encode(['error' => 'Acceso denegado. Solo administradores pueden modificar la configuración.']);
        http_response_code(403);
        exit;
    }
}

try {
    // Auto-create columns if missing
    $autoColumns = [
        'celular' => "ALTER TABLE configuracion_clinica ADD COLUMN celular VARCHAR(30) DEFAULT NULL",
        'google_maps_embed' => "ALTER TABLE configuracion_clinica ADD COLUMN google_maps_embed TEXT DEFAULT NULL",
        'slogan' => "ALTER TABLE configuracion_clinica ADD COLUMN slogan VARCHAR(255) DEFAULT NULL",
        'slogan_color' => "ALTER TABLE configuracion_clinica ADD COLUMN slogan_color VARCHAR(20) DEFAULT NULL",
        'nombre_color' => "ALTER TABLE configuracion_clinica ADD COLUMN nombre_color VARCHAR(20) DEFAULT NULL",
        'nombre_font_size' => "ALTER TABLE configuracion_clinica ADD COLUMN nombre_font_size VARCHAR(10) DEFAULT NULL",
        'logo_size_sistema' => "ALTER TABLE configuracion_clinica ADD COLUMN logo_size_sistema VARCHAR(10) DEFAULT NULL",
        'logo_size_publico' => "ALTER TABLE configuracion_clinica ADD COLUMN logo_size_publico VARCHAR(10) DEFAULT NULL",
        'logo_shape_sistema' => "ALTER TABLE configuracion_clinica ADD COLUMN logo_shape_sistema VARCHAR(10) DEFAULT 'auto'",
        'caratula_fondo_url' => "ALTER TABLE configuracion_clinica ADD COLUMN caratula_fondo_url VARCHAR(500) DEFAULT NULL",
        'hc_template_mode' => "ALTER TABLE configuracion_clinica ADD COLUMN hc_template_mode VARCHAR(20) DEFAULT 'auto'",
        'hc_template_single_id' => "ALTER TABLE configuracion_clinica ADD COLUMN hc_template_single_id VARCHAR(100) DEFAULT NULL",
    ];
    foreach ($autoColumns as $col => $ddl) {
        $chk = $pdo->query("SHOW COLUMNS FROM configuracion_clinica LIKE '$col'");
        if ($chk->rowCount() === 0) {
            $pdo->exec($ddl);
        }
    }

    switch ($method) {
        case 'GET':
            // Obtener configuración actual
            $stmt = $pdo->query("SELECT * FROM configuracion_clinica ORDER BY created_at DESC LIMIT 1");
            $configuracion = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$configuracion) {
                // Si no hay configuración, devolver valores por defecto
                $configuracion = [
                    'nombre_clinica' => 'Mi Clínica',
                    'direccion' => '',
                    'telefono' => '',
                    'email' => '',
                    'horario_atencion' => 'Lunes a Viernes: 7:00 AM - 8:00 PM\nSábados: 7:00 AM - 2:00 PM',
                    'logo_url' => null,
                    'website' => null,
                    'ruc' => null,
                    'especialidades' => null,
                    'mision' => null,
                    'vision' => null,
                    'valores' => null,
                    'director_general' => null,
                    'jefe_enfermeria' => null,
                    'contacto_emergencias' => null,
                    'celular' => null,
                    'google_maps_embed' => null,
                    'slogan' => null,
                    'slogan_color' => null,
                    'nombre_color' => null,
                    'nombre_font_size' => null,
                    'logo_size_sistema' => null,
                    'logo_size_publico' => null,
                    'logo_shape_sistema' => 'auto',
                    'caratula_fondo_url' => null,
                    'hc_template_mode' => 'auto',
                    'hc_template_single_id' => null,
                ];
            }
            
            echo json_encode([
                'success' => true,
                'data' => $configuracion
            ]);
            break;
            
        case 'POST':
            // Guardar configuración
            $input = json_decode(file_get_contents('php://input'), true);

            $logoUrlNormalizado = null;
            if (isset($input['logo_url'])) {
                $logoRaw = trim((string)$input['logo_url']);
                if ($logoRaw !== '') {
                    $logoRaw = str_replace('\\\\', '/', $logoRaw);
                    if (preg_match('~(?:^|/)(uploads/[^?#\\s]+)$~i', $logoRaw, $m) && !empty($m[1])) {
                        $logoRaw = ltrim($m[1], '/');
                    } else {
                        $logoRaw = preg_replace('#^\./#', '', $logoRaw);
                        $logoRaw = ltrim($logoRaw, '/');
                    }
                    $logoUrlNormalizado = $logoRaw;
                }
            }
            $logoSizeSistema = normalize_logo_size_option($input['logo_size_sistema'] ?? null);
            $logoSizePublico = normalize_logo_size_option($input['logo_size_publico'] ?? null);
            $logoShapeSistema = normalize_logo_shape_option($input['logo_shape_sistema'] ?? 'auto');
            $caratulaFondoUrl = null;
            if (isset($input['caratula_fondo_url'])) {
                $caratulaRaw = trim((string)$input['caratula_fondo_url']);
                if ($caratulaRaw !== '') {
                    $caratulaRaw = str_replace('\\\\', '/', $caratulaRaw);
                    if (preg_match('~(?:^|/)(uploads/[^?#\\s]+)$~i', $caratulaRaw, $m2) && !empty($m2[1])) {
                        $caratulaRaw = ltrim($m2[1], '/');
                    } else {
                        $caratulaRaw = preg_replace('#^\./#', '', $caratulaRaw);
                        $caratulaRaw = ltrim($caratulaRaw, '/');
                    }
                    $caratulaFondoUrl = $caratulaRaw;
                }
            }
            $hcTemplateMode = strtolower(trim((string)($input['hc_template_mode'] ?? 'auto')));
            if (!in_array($hcTemplateMode, ['auto', 'single'], true)) {
                $hcTemplateMode = 'auto';
            }
            $hcTemplateSingleId = trim((string)($input['hc_template_single_id'] ?? ''));
            if ($hcTemplateSingleId === '') {
                $hcTemplateSingleId = null;
            }

            $existingConfig = $pdo->query('SELECT id, hc_template_mode, hc_template_single_id FROM configuracion_clinica ORDER BY created_at DESC LIMIT 1')->fetch(PDO::FETCH_ASSOC);
            $hasExistingConfig = is_array($existingConfig) && !empty($existingConfig['id']);
            $currentMode = cfg_normalize_mode($existingConfig['hc_template_mode'] ?? 'auto');
            $currentSingle = trim((string)($existingConfig['hc_template_single_id'] ?? ''));
            if ($currentSingle === '') {
                $currentSingle = null;
            }
            $incomingSingle = trim((string)($hcTemplateSingleId ?? ''));
            if ($incomingSingle === '') {
                $incomingSingle = null;
            }
            $policyChanged = $hasExistingConfig && (
                $currentMode !== $hcTemplateMode
                || $currentSingle !== $incomingSingle
            );
            $hcProtection = [
                'policy_changed' => $policyChanged,
                'batch_id' => '',
                'evaluated' => 0,
                'already_pinned' => 0,
                'pinned_now' => 0,
                'invalid_json' => 0,
                'unresolved' => 0,
            ];
            
            // Validar datos requeridos
            $required_fields = ['nombre_clinica', 'direccion', 'telefono', 'email'];
            foreach ($required_fields as $field) {
                if (empty($input[$field])) {
                    echo json_encode(['error' => "El campo $field es obligatorio"]);
                    http_response_code(400);
                    exit;
                }
            }
            
            // Validar email
            if (!filter_var($input['email'], FILTER_VALIDATE_EMAIL)) {
                echo json_encode(['error' => 'El email no tiene un formato válido']);
                http_response_code(400);
                exit;
            }

            // Verificar si ya existe configuración
            $stmt_check = $pdo->query("SELECT COUNT(*) FROM configuracion_clinica");
            $count = (int)$stmt_check->fetchColumn();

            // Create backup table BEFORE transaction (DDL can't be in transaction)
            cfg_ensure_hc_backup_table($pdo);

            $pdo->beginTransaction();

            if ($policyChanged) {
                $hcProtection = cfg_pin_existing_hc_templates($pdo, $conn, cfg_actor_label());
                $hcProtection['policy_changed'] = true;
            }
            
            if ($count > 0) {
                // Actualizar configuración existente
                $stmt = $pdo->prepare("
                    UPDATE configuracion_clinica 
                    SET nombre_clinica = ?, direccion = ?, telefono = ?, email = ?, 
                        horario_atencion = ?, logo_url = ?, website = ?, ruc = ?,
                        especialidades = ?, mision = ?, vision = ?, valores = ?,
                        director_general = ?, jefe_enfermeria = ?, contacto_emergencias = ?,
                        celular = ?, google_maps_embed = ?,
                        slogan = ?, slogan_color = ?,
                        nombre_color = ?, nombre_font_size = ?,
                        logo_size_sistema = ?, logo_size_publico = ?, logo_shape_sistema = ?, caratula_fondo_url = ?,
                        hc_template_mode = ?, hc_template_single_id = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = (SELECT id FROM (SELECT id FROM configuracion_clinica ORDER BY created_at DESC LIMIT 1) AS temp)
                ");
                
                $stmt->execute([
                    $input['nombre_clinica'],
                    $input['direccion'],
                    $input['telefono'],
                    $input['email'],
                    $input['horario_atencion'] ?? '',
                    $logoUrlNormalizado,
                    $input['website'] ?? null,
                    $input['ruc'] ?? null,
                    $input['especialidades'] ?? null,
                    $input['mision'] ?? null,
                    $input['vision'] ?? null,
                    $input['valores'] ?? null,
                    $input['director_general'] ?? null,
                    $input['jefe_enfermeria'] ?? null,
                    $input['contacto_emergencias'] ?? null,
                    $input['celular'] ?? null,
                    $input['google_maps_embed'] ?? null,
                    $input['slogan'] ?? null,
                    $input['slogan_color'] ?? null,
                    $input['nombre_color'] ?? null,
                    $input['nombre_font_size'] ?? null,
                    $logoSizeSistema,
                    $logoSizePublico,
                    $logoShapeSistema,
                    $caratulaFondoUrl,
                    $hcTemplateMode,
                    $hcTemplateSingleId
                ]);

                $pdo->commit();
                echo json_encode([
                    'success' => true,
                    'message' => 'Configuración actualizada exitosamente',
                    'hc_protection' => $hcProtection,
                ]);
            } else {
                // Insertar nueva configuración
                $stmt = $pdo->prepare("
                    INSERT INTO configuracion_clinica 
                    (nombre_clinica, direccion, telefono, email, horario_atencion, logo_url, website, ruc,
                     especialidades, mision, vision, valores, director_general, jefe_enfermeria, contacto_emergencias,
                     celular, google_maps_embed, slogan, slogan_color, nombre_color, nombre_font_size,
                     logo_size_sistema, logo_size_publico, logo_shape_sistema, caratula_fondo_url,
                     hc_template_mode, hc_template_single_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ");
                
                $stmt->execute([
                    $input['nombre_clinica'],
                    $input['direccion'],
                    $input['telefono'],
                    $input['email'],
                    $input['horario_atencion'] ?? '',
                    $logoUrlNormalizado,
                    $input['website'] ?? null,
                    $input['ruc'] ?? null,
                    $input['especialidades'] ?? null,
                    $input['mision'] ?? null,
                    $input['vision'] ?? null,
                    $input['valores'] ?? null,
                    $input['director_general'] ?? null,
                    $input['jefe_enfermeria'] ?? null,
                    $input['contacto_emergencias'] ?? null,
                    $input['celular'] ?? null,
                    $input['google_maps_embed'] ?? null,
                    $input['slogan'] ?? null,
                    $input['slogan_color'] ?? null,
                    $input['nombre_color'] ?? null,
                    $input['nombre_font_size'] ?? null,
                    $logoSizeSistema,
                    $logoSizePublico,
                    $logoShapeSistema,
                    $caratulaFondoUrl,
                    $hcTemplateMode,
                    $hcTemplateSingleId
                ]);

                $pdo->commit();
                echo json_encode([
                    'success' => true,
                    'message' => 'Configuración guardada exitosamente',
                    'hc_protection' => $hcProtection,
                ]);
            }
            break;
            
        default:
            echo json_encode(['error' => 'Método no permitido']);
            http_response_code(405);
            break;
    }
    
} catch (PDOException $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log("Error en api_configuracion.php: " . $e->getMessage());
    echo json_encode(['error' => 'Error interno del servidor']);
    http_response_code(500);
} catch (Exception $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log("Error general en api_configuracion.php: " . $e->getMessage());
    echo json_encode(['error' => 'Error inesperado']);
    http_response_code(500);
}
?>
