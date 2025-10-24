<?php
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '',
    'secure' => false,
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

// Mostrar errores para depuración
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

// CORS para localhost y producción
$allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',
    'https://clinica2demayo.com'
];

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins)) {
    header('Access-Control-Allow-Origin: ' . $origin);
}

header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/config.php';

// Verificar que el usuario esté logueado como médico
if (!isset($_SESSION['medico_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'No autorizado. Debe iniciar sesión como médico.']);
    exit();
}

$medico_id = $_SESSION['medico_id'];

try {
    $pdo = new PDO("mysql:host=$host;dbname=$database", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    switch ($_SERVER['REQUEST_METHOD']) {
        case 'GET':
            // Obtener información profesional completa del médico
            $stmt = $pdo->prepare("
                SELECT nombre, apellido, especialidad, cmp, rne, firma, email 
                FROM medicos 
                WHERE id = ?
            ");
            $stmt->execute([$medico_id]);
            $medico = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if ($medico) {
                echo json_encode([
                    'success' => true,
                    'medico' => $medico
                ]);
            } else {
                echo json_encode([
                    'success' => false,
                    'error' => 'Médico no encontrado'
                ]);
            }
            break;
            
        case 'POST':
            // Actualizar información profesional del médico
            $input = json_decode(file_get_contents('php://input'), true);
            
            $updateFields = [];
            $params = [];
            
            // Campos que se pueden actualizar
            $allowedFields = ['nombre', 'apellido', 'especialidad', 'cmp', 'rne', 'firma'];
            
            foreach ($allowedFields as $field) {
                if (isset($input[$field])) {
                    // Validaciones específicas
                    switch ($field) {
                        case 'firma':
                            // Validar que sea base64 válido y sea una imagen
                            if (!empty($input[$field])) {
                                if (!preg_match('/^data:image\/(png|jpeg|jpg);base64,/', $input[$field])) {
                                    echo json_encode(['success' => false, 'error' => 'Formato de firma inválido. Debe ser PNG o JPEG en base64.']);
                                    exit();
                                }
                                
                                // Verificar tamaño (máximo 2MB)
                                $imageData = base64_decode(preg_replace('/^data:image\/[^;]+;base64,/', '', $input[$field]));
                                if (strlen($imageData) > 2 * 1024 * 1024) {
                                    echo json_encode(['success' => false, 'error' => 'La imagen es demasiado grande. Máximo 2MB.']);
                                    exit();
                                }
                            }
                            break;
                            
                        case 'cmp':
                            // Validar formato CMP (solo números y letras, máximo 20 caracteres)
                            if (!empty($input[$field]) && !preg_match('/^[A-Za-z0-9]{1,20}$/', $input[$field])) {
                                echo json_encode(['success' => false, 'error' => 'Formato de CMP inválido. Solo letras y números, máximo 20 caracteres.']);
                                exit();
                            }
                            break;
                            
                        case 'rne':
                            // Validar formato RNE (solo números y letras, máximo 20 caracteres)
                            if (!empty($input[$field]) && !preg_match('/^[A-Za-z0-9]{1,20}$/', $input[$field])) {
                                echo json_encode(['success' => false, 'error' => 'Formato de RNE inválido. Solo letras y números, máximo 20 caracteres.']);
                                exit();
                            }
                            break;
                            
                        case 'nombre':
                        case 'apellido':
                            // Validar que solo contengan letras, espacios y algunos caracteres especiales
                            if (!empty($input[$field]) && !preg_match('/^[A-Za-zÀ-ÿ\s]{1,100}$/', $input[$field])) {
                                echo json_encode(['success' => false, 'error' => 'Formato de nombre/apellido inválido. Solo letras y espacios, máximo 100 caracteres.']);
                                exit();
                            }
                            break;
                            
                        case 'especialidad':
                            // Validar especialidad
                            if (!empty($input[$field]) && !preg_match('/^[A-Za-zÀ-ÿ\s]{1,100}$/', $input[$field])) {
                                echo json_encode(['success' => false, 'error' => 'Formato de especialidad inválido. Solo letras y espacios, máximo 100 caracteres.']);
                                exit();
                            }
                            break;
                    }
                    
                    $updateFields[] = "$field = ?";
                    $params[] = $input[$field];
                }
            }
            
            if (empty($updateFields)) {
                echo json_encode(['success' => false, 'error' => 'No hay campos para actualizar']);
                exit();
            }
            
            $params[] = $medico_id;
            
            $sql = "UPDATE medicos SET " . implode(', ', $updateFields) . " WHERE id = ?";
            $stmt = $pdo->prepare($sql);
            
            if ($stmt->execute($params)) {
                echo json_encode([
                    'success' => true,
                    'message' => 'Información profesional actualizada correctamente'
                ]);
            } else {
                echo json_encode([
                    'success' => false,
                    'error' => 'Error al actualizar la información'
                ]);
            }
            break;
            
        case 'DELETE':
            // Eliminar solo la firma (mantener otros datos profesionales)
            $stmt = $pdo->prepare("UPDATE medicos SET firma = NULL WHERE id = ?");
            
            if ($stmt->execute([$medico_id])) {
                echo json_encode([
                    'success' => true,
                    'message' => 'Firma eliminada correctamente'
                ]);
            } else {
                echo json_encode([
                    'success' => false,
                    'error' => 'Error al eliminar la firma'
                ]);
            }
            break;
            
        default:
            http_response_code(405);
            echo json_encode(['success' => false, 'error' => 'Método no permitido']);
            break;
    }
    
} catch (PDOException $e) {
    error_log("Error en API firma/info médico: " . $e->getMessage());
    echo json_encode([
        'success' => false,
        'error' => 'Error de base de datos: ' . $e->getMessage()
    ]);
} catch (Exception $e) {
    error_log("Error general en API firma/info médico: " . $e->getMessage());
    echo json_encode([
        'success' => false,
        'error' => 'Error del servidor: ' . $e->getMessage()
    ]);
}
?>
