<?php
// api_login_medico_v2.php - Versión mejorada con mejor manejo de errores
$isProduction = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on';

session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '',
    'secure' => $isProduction,
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

// CORS mejorado
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
    // En producción, permitir el dominio actual también
    $currentDomain = 'https://' . ($_SERVER['HTTP_HOST'] ?? '');
    if ($isProduction) {
        header('Access-Control-Allow-Origin: ' . $currentDomain);
    }
}

header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With, Authorization');
header('Access-Control-Allow-Methods: POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

header('Content-Type: application/json');

try {
    require_once __DIR__ . '/config.php';
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Error de configuración del servidor']);
    exit;
}

// Múltiples formas de obtener los datos
$rawInput = file_get_contents('php://input');
$data = json_decode($rawInput, true) ?: [];

// Fallback a $_POST si JSON no funciona
if (empty($data) && !empty($_POST)) {
    $data = $_POST;
}

$email = $data['email'] ?? $_POST['email'] ?? '';
$password = $data['password'] ?? $_POST['password'] ?? '';

// Debug temporal (solo en producción para no llenar logs locales)
if ($isProduction) {
    error_log("Login Debug - Method: " . $_SERVER['REQUEST_METHOD']);
    error_log("Login Debug - Raw input: " . $rawInput);
    error_log("Login Debug - Parsed data: " . print_r($data, true));
    error_log("Login Debug - Email: " . $email);
    error_log("Login Debug - Password length: " . strlen($password));
}

if (!$email || !$password) {
    http_response_code(400);
    echo json_encode([
        'error' => 'Email y contraseña requeridos',
        'debug' => $isProduction ? [
            'email_received' => !empty($email),
            'password_received' => !empty($password),
            'raw_input_length' => strlen($rawInput),
            'content_type' => $_SERVER['CONTENT_TYPE'] ?? 'not set'
        ] : null
    ]);
    exit;
}

try {
    $stmt = $conn->prepare('SELECT id, nombre, especialidad, email, password FROM medicos WHERE email = ? LIMIT 1');
    $stmt->bind_param('s', $email);
    $stmt->execute();
    $result = $stmt->get_result();

    if ($row = $result->fetch_assoc()) {
        if (password_verify($password, $row['password'])) {
            $_SESSION['medico_id'] = $row['id'];
            $_SESSION['medico_email'] = $row['email'];
            $_SESSION['medico_nombre'] = $row['nombre'];
            
            echo json_encode([
                'success' => true,
                'medico' => [
                    'id' => $row['id'],
                    'nombre' => $row['nombre'],
                    'especialidad' => $row['especialidad'],
                    'email' => $row['email']
                ]
            ]);
        } else {
            http_response_code(401);
            echo json_encode(['error' => 'Credenciales incorrectas']);
        }
    } else {
        http_response_code(404);
        echo json_encode(['error' => 'Médico no encontrado']);
    }
} catch (Exception $e) {
    error_log("Error en login médico: " . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Error interno del servidor']);
}
?>