
<?php
session_set_cookie_params([
    'samesite' => 'None',
    'secure' => isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on',
    'httponly' => true,
    'path' => '/',
]);
session_start();

// Permitir origen local y producción
$allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'https://darkcyan-gnu-615778.hostingersite.com'
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins)) {
    header('Access-Control-Allow-Origin: ' . $origin);
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

// Manejar preflight (OPTIONS)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

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
