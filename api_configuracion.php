<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

function normalize_logo_size_option($value) {
    $allowed = ['sm', 'md', 'lg', 'xl'];
    $normalized = strtolower(trim((string)($value ?? '')));
    return in_array($normalized, $allowed, true) ? $normalized : null;
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

    $usuario_rol = $_SESSION['usuario']['rol'];
    
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
                    'logo_size_publico' => null
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
            $count = $stmt_check->fetchColumn();
            
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
                        logo_size_sistema = ?, logo_size_publico = ?,
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
                    $logoSizePublico
                ]);
                
                echo json_encode([
                    'success' => true,
                    'message' => 'Configuración actualizada exitosamente'
                ]);
            } else {
                // Insertar nueva configuración
                $stmt = $pdo->prepare("
                    INSERT INTO configuracion_clinica 
                    (nombre_clinica, direccion, telefono, email, horario_atencion, logo_url, website, ruc,
                     especialidades, mision, vision, valores, director_general, jefe_enfermeria, contacto_emergencias,
                     celular, google_maps_embed, slogan, slogan_color, nombre_color, nombre_font_size,
                     logo_size_sistema, logo_size_publico)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    $logoSizePublico
                ]);
                
                echo json_encode([
                    'success' => true,
                    'message' => 'Configuración guardada exitosamente'
                ]);
            }
            break;
            
        default:
            echo json_encode(['error' => 'Método no permitido']);
            http_response_code(405);
            break;
    }
    
} catch (PDOException $e) {
    error_log("Error en api_configuracion.php: " . $e->getMessage());
    echo json_encode(['error' => 'Error interno del servidor']);
    http_response_code(500);
} catch (Exception $e) {
    error_log("Error general en api_configuracion.php: " . $e->getMessage());
    echo json_encode(['error' => 'Error inesperado']);
    http_response_code(500);
}
?>
