<?php
// api_configuracion_medico.php - Versión que permite médicos y admins
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '',
    'secure' => isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on',
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

$method = $_SERVER['REQUEST_METHOD'];

if ($method !== 'GET') {
    // Para operaciones de escritura, verificar que sea admin O médico
    $isAdmin = isset($_SESSION['usuario']) && $_SESSION['usuario']['rol'] === 'administrador';
    $isMedico = isset($_SESSION['medico_id']) && isset($_SESSION['medico_email']);
    
    if (!$isAdmin && !$isMedico) {
        echo json_encode(['error' => 'No autorizado. Necesita autenticación como administrador o médico.']);
        http_response_code(401);
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
        case 'PUT':
            // Actualizar/crear configuración
            $data = json_decode(file_get_contents('php://input'), true);
            
            if (!$data) {
                echo json_encode(['error' => 'Datos inválidos']);
                http_response_code(400);
                break;
            }
            
            // Obtener configuración existente
            $stmt = $pdo->query("SELECT id FROM configuracion_clinica ORDER BY created_at DESC LIMIT 1");
            $existing = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if ($existing) {
                // Actualizar existente
                $stmt = $pdo->prepare("
                    UPDATE configuracion_clinica 
                    SET nombre_clinica = ?, direccion = ?, telefono = ?, email = ?, 
                        horario_atencion = ?, logo_url = ?, website = ?, ruc = ?, 
                        updated_at = NOW()
                    WHERE id = ?
                ");
                $stmt->execute([
                    $data['nombre_clinica'],
                    $data['direccion'], 
                    $data['telefono'],
                    $data['email'],
                    $data['horario_atencion'] ?? null,
                    $data['logo_url'] ?? null,
                    $data['website'] ?? null,
                    $data['ruc'] ?? null,
                    $existing['id']
                ]);
            } else {
                // Crear nuevo
                $stmt = $pdo->prepare("
                    INSERT INTO configuracion_clinica 
                    (nombre_clinica, direccion, telefono, email, horario_atencion, logo_url, website, ruc)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ");
                $stmt->execute([
                    $data['nombre_clinica'],
                    $data['direccion'],
                    $data['telefono'], 
                    $data['email'],
                    $data['horario_atencion'] ?? null,
                    $data['logo_url'] ?? null,
                    $data['website'] ?? null,
                    $data['ruc'] ?? null
                ]);
            }
            
            echo json_encode([
                'success' => true,
                'message' => 'Configuración actualizada exitosamente'
            ]);
            break;

        default:
            echo json_encode(['error' => 'Método no permitido']);
            http_response_code(405);
    }
} catch (PDOException $e) {
    echo json_encode([
        'error' => 'Error de base de datos',
        'details' => $e->getMessage()
    ]);
    http_response_code(500);
} catch (Exception $e) {
    echo json_encode([
        'error' => 'Error interno del servidor',
        'details' => $e->getMessage()
    ]);
    http_response_code(500);
}
?>