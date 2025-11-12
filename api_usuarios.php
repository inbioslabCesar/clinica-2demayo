
<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

switch ($_SERVER['REQUEST_METHOD']) {
    case 'GET':
        $result = $mysqli->query('SELECT id, usuario, nombre, dni, profesion, rol, activo, creado_en FROM usuarios');
        $usuarios = [];
        while ($row = $result->fetch_assoc()) {
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
                exit;
            }
        }
        
        try {
            $stmt = $mysqli->prepare('INSERT INTO usuarios (usuario, password, nombre, dni, profesion, rol, activo) VALUES (?, SHA2(?,256), ?, ?, ?, ?, ?)');
            if (!$stmt) {
                throw new Exception('Error preparando consulta: ' . $mysqli->error);
            }
            
            $activo = $data['activo'] ?? 1;
            $stmt->bind_param('ssssssi', $data['usuario'], $data['password'], $data['nombre'], $data['dni'], $data['profesion'], $data['rol'], $activo);
            
            if ($stmt->execute()) {
                echo json_encode(['success' => true, 'id' => $mysqli->insert_id, 'message' => 'Usuario creado correctamente']);
            } else {
                throw new Exception('Error ejecutando consulta: ' . $stmt->error);
            }
            $stmt->close();
        } catch (Exception $e) {
            error_log("Error en POST usuarios: " . $e->getMessage());
            http_response_code(500);
            echo json_encode(['error' => 'Error interno del servidor al crear usuario']);
        }
        break;
    case 'PUT':
        $data = json_decode(file_get_contents('php://input'), true);
        
        // Validar que se recibió el ID
        if (!isset($data['id']) || empty($data['id'])) {
            http_response_code(400);
            echo json_encode(['error' => 'ID de usuario requerido para actualizar']);
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
        foreach (['usuario','nombre','dni','profesion','rol','activo'] as $campo) {
            if (isset($data[$campo])) {
                $campos[] = "$campo = ?";
                $params[] = $data[$campo];
                $types .= is_int($data[$campo]) ? 'i' : 's';
            }
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
