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
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

// CORS para localhost y producción
$allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',
    'https://darkcyan-gnu-615778.hostingersite.com'
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
$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        // Obtener firma del médico actual
        try {
            $stmt = $mysqli->prepare("SELECT firma FROM medicos WHERE id = ?");
            $stmt->bind_param("i", $medico_id);
            $stmt->execute();
            $result = $stmt->get_result();
            
            if ($row = $result->fetch_assoc()) {
                echo json_encode([
                    'success' => true,
                    'firma' => $row['firma'],
                    'tiene_firma' => !empty($row['firma'])
                ]);
            } else {
                echo json_encode(['success' => false, 'error' => 'Médico no encontrado']);
            }
            
            $stmt->close();
        } catch (Exception $e) {
            echo json_encode(['success' => false, 'error' => 'Error al obtener firma: ' . $e->getMessage()]);
        }
        break;
        
    case 'POST':
        // Subir nueva firma
        try {
            $input = json_decode(file_get_contents('php://input'), true);
            
            if (!isset($input['firma']) || empty($input['firma'])) {
                echo json_encode(['success' => false, 'error' => 'Datos de firma requeridos']);
                exit();
            }
            
            $firma_base64 = $input['firma'];
            
            // Validar que sea una imagen base64 válida
            if (!preg_match('/^data:image\/(png|jpeg|jpg);base64,/', $firma_base64)) {
                echo json_encode(['success' => false, 'error' => 'Formato de imagen no válido. Solo se permiten PNG y JPEG.']);
                exit();
            }
            
            // Verificar tamaño (máximo 2MB)
            $imagen_data = base64_decode(preg_replace('/^data:image\/(png|jpeg|jpg);base64,/', '', $firma_base64));
            if (strlen($imagen_data) > 2 * 1024 * 1024) {
                echo json_encode(['success' => false, 'error' => 'La imagen es demasiado grande. Máximo 2MB.']);
                exit();
            }
            
            // Guardar firma en la base de datos
            $stmt = $mysqli->prepare("UPDATE medicos SET firma = ? WHERE id = ?");
            $stmt->bind_param("si", $firma_base64, $medico_id);
            
            if ($stmt->execute()) {
                echo json_encode([
                    'success' => true,
                    'message' => 'Firma guardada exitosamente',
                    'medico_id' => $medico_id
                ]);
            } else {
                echo json_encode(['success' => false, 'error' => 'Error al guardar la firma']);
            }
            
            $stmt->close();
        } catch (Exception $e) {
            echo json_encode(['success' => false, 'error' => 'Error al procesar firma: ' . $e->getMessage()]);
        }
        break;
        
    case 'DELETE':
        // Eliminar firma del médico
        try {
            $stmt = $mysqli->prepare("UPDATE medicos SET firma = NULL WHERE id = ?");
            $stmt->bind_param("i", $medico_id);
            
            if ($stmt->execute()) {
                echo json_encode([
                    'success' => true,
                    'message' => 'Firma eliminada exitosamente'
                ]);
            } else {
                echo json_encode(['success' => false, 'error' => 'Error al eliminar la firma']);
            }
            
            $stmt->close();
        } catch (Exception $e) {
            echo json_encode(['success' => false, 'error' => 'Error al eliminar firma: ' . $e->getMessage()]);
        }
        break;
        
    default:
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
        break;
}

$mysqli->close();
?>