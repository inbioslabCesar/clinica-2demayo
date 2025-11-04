

<?php
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '',
    'secure' => false, // Para desarrollo local
    'httponly' => true,
    'samesite' => 'Lax', // Mejor compatibilidad en localhost
]);
session_start();

// CORS para localhost, producción y subdominios Hostinger
$allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'https://clinica2demayo.com',
    'https://www.clinica2demayo.com'
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$currentHost = $_SERVER['HTTP_HOST'] ?? '';
if (in_array($origin, $allowedOrigins)) {
    header('Access-Control-Allow-Origin: ' . $origin);
} elseif ($currentHost && (strpos($currentHost, 'hostingersite.com') !== false || strpos($currentHost, 'clinica2demayo.com') !== false)) {
    header('Access-Control-Allow-Origin: https://' . $currentHost);
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With, Authorization');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS, PUT, DELETE');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}
header('Content-Type: application/json');

// Conexión a la base de datos centralizada
require_once __DIR__ . '/config.php';

// Obtener datos del POST
$data = json_decode(file_get_contents('php://input'), true);
$usuario = $data['usuario'] ?? '';
$password = $data['password'] ?? '';

if (!$usuario || !$password) {
    http_response_code(400);
    echo json_encode(['error' => 'Usuario y contraseña requeridos']);
    exit;
}

// Consulta segura usando SHA2 para la contraseña
$stmt = $mysqli->prepare('SELECT id, usuario, nombre, rol FROM usuarios WHERE usuario = ? AND password = SHA2(?, 256) LIMIT 1');
$stmt->bind_param('ss', $usuario, $password);
$stmt->execute();
$result = $stmt->get_result();

if ($row = $result->fetch_assoc()) {
    // Guardar usuario en sesión
    $_SESSION['usuario'] = $row;
    echo json_encode(['success' => true, 'usuario' => $row]);
} else {
    http_response_code(401);
    echo json_encode(['error' => 'Credenciales incorrectas']);
}

$stmt->close();
$mysqli->close();
