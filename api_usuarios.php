
<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

function permisosPermitidosRecepcion() {
    return [
        'ver_pacientes',
        'ver_usuarios',
        'ver_medicos',
        'ver_panel_enfermeria',
        'ver_gestion_tarifas',
        'ver_inventario_general',
        'ver_panel_laboratorio',
        'ver_inventario_laboratorio',
        'ver_modulo_quimico',
        'ver_contabilidad',
        'ver_paquetes_perfiles',
        'ver_cotizaciones',
        'ver_contratos',
        'ver_lista_consultas',
        'ver_recordatorios_citas',
        'ver_web_servicios',
        'ver_web_ofertas',
        'ver_web_banners',
        'ver_configuracion',
        'ver_plantillas_hc',
        'ver_tema',
        'ver_reabrir_caja',
    ];
}

function normalizarPermisosRecepcion($raw) {
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
    $allow = array_flip(permisosPermitidosRecepcion());
    $clean = [];
    foreach ($raw as $item) {
        $key = trim((string)$item);
        if ($key !== '' && isset($allow[$key])) {
            $clean[$key] = true;
        }
    }
    return array_keys($clean);
}

function asegurarColumnaPermisos($mysqli) {
    $check = $mysqli->query("SHOW COLUMNS FROM usuarios LIKE 'permisos'");
    if ($check && $check->num_rows === 0) {
        $mysqli->query("ALTER TABLE usuarios ADD COLUMN permisos TEXT NULL AFTER cargo_firma");
    }
}

asegurarColumnaPermisos($mysqli);

switch ($_SERVER['REQUEST_METHOD']) {
    case 'GET':
        $result = $mysqli->query('SELECT id, usuario, nombre, dni, profesion, firma_reportes, colegiatura_tipo, colegiatura_numero, cargo_firma, permisos, rol, activo, creado_en FROM usuarios');
        $usuarios = [];
        while ($row = $result->fetch_assoc()) {
            $row['permisos'] = normalizarPermisosRecepcion($row['permisos'] ?? '[]');
            $usuarios[] = $row;
        }
        echo json_encode($usuarios);
        break;
    case 'POST':
        $data = json_decode(file_get_contents('php://input'), true);
        
        // Validar campos requeridos SOLO para crear usuario
        $required_fields = ['usuario', 'password', 'nombre', 'dni', 'profesion', 'rol'];
        foreach ($required_fields as $field) {
            if (!isset($data[$field]) || empty($data[$field])) {
                http_response_code(400);
                echo json_encode(['error' => "Campo $field es obligatorio para crear usuario"]);
                                // Eliminado echo de error de campo obligatorio
                exit;
            }
        }
        
        try {
            $firmaReportes = $data['firma_reportes'] ?? null;
            $colegiaturaTipo = $data['colegiatura_tipo'] ?? null;
            $colegiaturaNumero = $data['colegiatura_numero'] ?? null;
            $cargoFirma = $data['cargo_firma'] ?? null;
            $rol = $data['rol'] ?? 'recepcionista';
            $permisos = normalizarPermisosRecepcion($data['permisos'] ?? []);

            if ($rol === 'recepcionista' && count($permisos) === 0) {
                http_response_code(400);
                echo json_encode(['error' => 'Debe seleccionar al menos un privilegio para la recepcionista.']);
                exit;
            }
            $permisosJson = json_encode($rol === 'recepcionista' ? $permisos : []);

            if (!empty($firmaReportes) && !preg_match('/^data:image\/(png|jpeg|jpg);base64,/', $firmaReportes)) {
                http_response_code(400);
                echo json_encode(['error' => 'Formato de firma inválido. Debe ser PNG o JPEG en base64.']);
                exit;
            }

            $stmt = $mysqli->prepare('INSERT INTO usuarios (usuario, password, nombre, dni, profesion, firma_reportes, colegiatura_tipo, colegiatura_numero, cargo_firma, permisos, rol, activo) VALUES (?, SHA2(?,256), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
            if (!$stmt) {
                throw new Exception('Error preparando consulta: ' . $mysqli->error);
            }
            
            $activo = $data['activo'] ?? 1;
            $stmt->bind_param('sssssssssssi', $data['usuario'], $data['password'], $data['nombre'], $data['dni'], $data['profesion'], $firmaReportes, $colegiaturaTipo, $colegiaturaNumero, $cargoFirma, $permisosJson, $rol, $activo);
            
            if ($stmt->execute()) {
                echo json_encode(['success' => true, 'id' => $mysqli->insert_id, 'message' => 'Usuario creado correctamente']);
                            // Eliminado echo de usuario creado correctamente
            } else {
                throw new Exception('Error ejecutando consulta: ' . $stmt->error);
            }
            $stmt->close();
        } catch (Exception $e) {
            // Eliminado log de error POST usuarios
            http_response_code(500);
            echo json_encode(['error' => 'Error interno del servidor al crear usuario']);
                    // Eliminado echo de error interno al crear usuario
        }
        break;
    case 'PUT':
        $data = json_decode(file_get_contents('php://input'), true);
        
        // Validar que se recibió el ID
        if (!isset($data['id']) || empty($data['id'])) {
            http_response_code(400);
            // Eliminado echo de error de ID requerido para actualizar
            break;
        }
        
        // Para editar, validar solo campos básicos (password es opcional)
        $required_for_edit = ['usuario', 'nombre', 'dni', 'profesion', 'rol'];
        foreach ($required_for_edit as $field) {
            if (isset($data[$field]) && empty($data[$field])) {
                http_response_code(400);
                echo json_encode(['error' => "Campo $field no puede estar vacío"]);
                exit;
            }
        }
        
        $id = $data['id'];
        $campos = [];
        $params = [];
        $types = '';
        
        // Manejar password solo si se proporciona y NO está vacío
        if (isset($data['password']) && !empty($data['password'])) {
            $campos[] = 'password = SHA2(?,256)';
            $params[] = $data['password'];
            $types .= 's';
        }
        
        // Manejar otros campos
        if (isset($data['firma_reportes']) && !empty($data['firma_reportes']) && !preg_match('/^data:image\/(png|jpeg|jpg);base64,/', $data['firma_reportes'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Formato de firma inválido. Debe ser PNG o JPEG en base64.']);
            exit;
        }

        foreach (['usuario','nombre','dni','profesion','firma_reportes','colegiatura_tipo','colegiatura_numero','cargo_firma','rol','activo'] as $campo) {
            if (isset($data[$campo])) {
                $campos[] = "$campo = ?";
                $params[] = $data[$campo];
                $types .= ($campo === 'activo') ? 'i' : 's';
            }
        }

        if (isset($data['permisos'])) {
            $permisosEdit = normalizarPermisosRecepcion($data['permisos']);
            if (($data['rol'] ?? null) === 'recepcionista' && count($permisosEdit) === 0) {
                http_response_code(400);
                echo json_encode(['error' => 'Debe seleccionar al menos un privilegio para la recepcionista.']);
                exit;
            }
            $campos[] = 'permisos = ?';
            $params[] = json_encode($permisosEdit);
            $types .= 's';
        } elseif (isset($data['rol']) && $data['rol'] !== 'recepcionista') {
            $campos[] = 'permisos = ?';
            $params[] = '[]';
            $types .= 's';
        }
        
        if (count($campos) > 0) {
            $sql = 'UPDATE usuarios SET ' . implode(', ', $campos) . ' WHERE id = ?';
            $params[] = $id;
            $types .= 'i';
            
            try {
                $stmt = $mysqli->prepare($sql);
                if (!$stmt) {
                    throw new Exception('Error preparando consulta: ' . $mysqli->error);
                }
                
                $stmt->bind_param($types, ...$params);
                
                if ($stmt->execute()) {
                    if ($stmt->affected_rows > 0) {
                        echo json_encode(['success' => true, 'message' => 'Usuario actualizado correctamente']);
                    } else {
                        echo json_encode(['success' => true, 'message' => 'No se realizaron cambios']);
                    }
                } else {
                    throw new Exception('Error ejecutando consulta: ' . $stmt->error);
                }
                $stmt->close();
            } catch (Exception $e) {
                error_log("Error en PUT usuarios: " . $e->getMessage());
                http_response_code(500);
                echo json_encode(['error' => 'Error interno del servidor al actualizar usuario']);
            }
        } else {
            http_response_code(400);
            echo json_encode(['error' => 'No hay campos para actualizar']);
        }
        break;
    case 'DELETE':
        // Manejar tanto query string como body
        $id = $_GET['id'] ?? null;
        
        if (!$id) {
            // Si no viene por query string, intentar desde el body
            parse_str(file_get_contents('php://input'), $data);
            $id = $data['id'] ?? null;
        }
        
        if ($id) {
            try {
                $stmt = $mysqli->prepare('DELETE FROM usuarios WHERE id = ?');
                if (!$stmt) {
                    throw new Exception('Error preparando consulta: ' . $mysqli->error);
                }
                
                $stmt->bind_param('i', $id);
                
                if ($stmt->execute()) {
                    if ($stmt->affected_rows > 0) {
                        echo json_encode(['success' => true, 'message' => 'Usuario eliminado correctamente']);
                    } else {
                        echo json_encode(['success' => false, 'message' => 'Usuario no encontrado']);
                    }
                } else {
                    throw new Exception('Error ejecutando consulta: ' . $stmt->error);
                }
                $stmt->close();
            } catch (Exception $e) {
                error_log("Error en DELETE usuarios: " . $e->getMessage());
                http_response_code(500);
                echo json_encode(['error' => 'Error interno del servidor al eliminar usuario']);
            }
        } else {
            http_response_code(400);
            echo json_encode(['error' => 'ID de usuario requerido para eliminar']);
        }
        break;
    default:
        http_response_code(405);
        echo json_encode(['error' => 'Método no permitido']);
}

$mysqli->close();
