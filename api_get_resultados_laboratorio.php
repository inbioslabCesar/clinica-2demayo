
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
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}
require_once __DIR__ . '/config.php';

$consulta_id = isset($_GET['orden_id']) ? intval($_GET['orden_id']) : null;
if (!$consulta_id) {
    echo json_encode(['success' => false, 'error' => 'Falta consulta_id']);
    exit;
}
$stmt = $conn->prepare('SELECT * FROM resultados_laboratorio WHERE consulta_id = ? ORDER BY id DESC LIMIT 1');
$stmt->bind_param('i', $consulta_id);
$stmt->execute();
$res = $stmt->get_result();
$row = $res->fetch_assoc();
$stmt->close();
if ($row) {
    $row['resultados'] = json_decode($row['resultados'], true);
    echo json_encode(['success' => true, 'resultado' => $row]);
} else {
    echo json_encode(['success' => false, 'resultado' => null]);
}
