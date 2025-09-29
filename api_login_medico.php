
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
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With, Authorization');
header('Access-Control-Allow-Methods: POST, OPTIONS, GET');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}
header('Content-Type: application/json');
require_once __DIR__ . '/config.php';

// Debug temporal para producción
$rawInput = file_get_contents('php://input');
$data = json_decode($rawInput, true);

// Log para debugging (remover después de arreglar)
error_log("Login Debug - Raw input: " . $rawInput);
error_log("Login Debug - Parsed data: " . print_r($data, true));
error_log("Login Debug - Request method: " . $_SERVER['REQUEST_METHOD']);

// Si es GET, mostrar info de debug
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    echo json_encode([
        'info' => 'Este endpoint requiere método POST con email y password en el body',
        'method_received' => $_SERVER['REQUEST_METHOD'],
        'test_url' => 'Usa test_login_form.html para probar'
    ]);
    exit;
}

$email = $data['email'] ?? '';
$password = $data['password'] ?? '';

if (!$email || !$password) {
    http_response_code(400);
    echo json_encode(['error' => 'Email y contraseña requeridos']);
    exit;
}

$stmt = $conn->prepare('SELECT id, nombre, especialidad, email, password FROM medicos WHERE email = ? LIMIT 1');
$stmt->bind_param('s', $email);
$stmt->execute();
$result = $stmt->get_result();

if ($row = $result->fetch_assoc()) {
    if (password_verify($password, $row['password'])) {
        // Guardar el id del médico en la sesión para mantener autenticación
        $_SESSION['medico_id'] = $row['id'];
        unset($row['password']);
        echo json_encode(['success' => true, 'medico' => $row]);
    } else {
        http_response_code(401);
        echo json_encode(['error' => 'Credenciales incorrectas']);
    }
} else {
    http_response_code(401);
    echo json_encode(['error' => 'Credenciales incorrectas']);
}
?>
