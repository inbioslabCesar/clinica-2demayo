
<?php
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '',
    'secure' => true,
    'httponly' => true,
    'samesite' => 'None',
]);
session_start();
// CORS para localhost y producción
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
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}
// API para registrar una nueva atención en recepción
header('Content-Type: application/json');
require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $paciente_id = isset($data['paciente_id']) ? intval($data['paciente_id']) : 0;
    $usuario_id = isset($data['usuario_id']) ? intval($data['usuario_id']) : 0;
    $servicio = isset($data['servicio']) ? $data['servicio'] : '';
    $observaciones = isset($data['observaciones']) ? $data['observaciones'] : '';

    if ($paciente_id && $usuario_id && $servicio) {
        $stmt = $conn->prepare("INSERT INTO atenciones (paciente_id, usuario_id, servicio, observaciones) VALUES (?, ?, ?, ?)");
        $stmt->bind_param('iiss', $paciente_id, $usuario_id, $servicio, $observaciones);
        if ($stmt->execute()) {
            echo json_encode(['success' => true, 'id' => $conn->insert_id]);
        } else {
            echo json_encode(['success' => false, 'error' => $stmt->error]);
        }
        $stmt->close();
    } else {
        echo json_encode(['success' => false, 'error' => 'Datos incompletos']);
    }
    exit;
}

// Si se quiere listar atenciones, se puede agregar aquí un GET
http_response_code(405);
echo json_encode(['success' => false, 'error' => 'Método no permitido']);
