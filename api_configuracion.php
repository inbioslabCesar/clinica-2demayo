<?php
// Detectar si estamos en producción (HTTPS) o desarrollo (HTTP)
$isProduction = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on';

session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '',
    'secure' => $isProduction, // true en HTTPS, false en HTTP
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

// CORS para localhost y producción
$allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'https://darkcyan-gnu-615778.hostingersite.com'
];

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins)) {
    header('Access-Control-Allow-Origin: ' . $origin);
} else {
    // Si no hay origin (petición directa) o es el mismo dominio, permitir
    $currentHost = $_SERVER['HTTP_HOST'] ?? '';
    if ($currentHost && strpos($currentHost, 'hostingersite.com') !== false) {
        header('Access-Control-Allow-Origin: https://' . $currentHost);
    }
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

header('Content-Type: application/json');
require_once __DIR__ . '/config.php';

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
    switch ($method) {
        case 'GET':
            // Obtener configuración actual
            $stmt = $pdo->query("SELECT * FROM configuracion_clinica ORDER BY created_at DESC LIMIT 1");
            $configuracion = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$configuracion) {
                // Si no hay configuración, devolver valores por defecto
                $configuracion = [
                    'nombre_clinica' => 'Clínica 2 de Mayo',
                    'direccion' => 'Av. Principal 123, Lima, Perú',
                    'telefono' => '(01) 234-5678',
                    'email' => 'info@clinica2demayo.com',
                    'horario_atencion' => 'Lunes a Viernes: 7:00 AM - 8:00 PM\nSábados: 7:00 AM - 2:00 PM',
                    'logo_url' => null,
                    'website' => null,
                    'ruc' => null
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
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = (SELECT id FROM (SELECT id FROM configuracion_clinica ORDER BY created_at DESC LIMIT 1) AS temp)
                ");
                
                $stmt->execute([
                    $input['nombre_clinica'],
                    $input['direccion'],
                    $input['telefono'],
                    $input['email'],
                    $input['horario_atencion'] ?? '',
                    $input['logo_url'] ?? null,
                    $input['website'] ?? null,
                    $input['ruc'] ?? null
                ]);
                
                echo json_encode([
                    'success' => true,
                    'message' => 'Configuración actualizada exitosamente'
                ]);
            } else {
                // Insertar nueva configuración
                $stmt = $pdo->prepare("
                    INSERT INTO configuracion_clinica 
                    (nombre_clinica, direccion, telefono, email, horario_atencion, logo_url, website, ruc)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ");
                
                $stmt->execute([
                    $input['nombre_clinica'],
                    $input['direccion'],
                    $input['telefono'],
                    $input['email'],
                    $input['horario_atencion'] ?? '',
                    $input['logo_url'] ?? null,
                    $input['website'] ?? null,
                    $input['ruc'] ?? null
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