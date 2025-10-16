
<?php
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '',
    'secure' => false, // Cambiado a false para desarrollo local (HTTP)
    'httponly' => true,
    'samesite' => 'Lax', // Cambiado de None a Lax para mejor compatibilidad
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
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Content-Type: application/json');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}
require_once __DIR__ . '/config.php';



$orden_id = isset($_GET['orden_id']) ? intval($_GET['orden_id']) : null;
if (!$orden_id) {
    echo json_encode(['success' => false, 'error' => 'Falta orden_id']);
    exit;
}
// Buscar la orden para saber si tiene consulta asociada
$stmt_orden = $conn->prepare('SELECT id, consulta_id FROM ordenes_laboratorio WHERE id = ? OR consulta_id = ?');
$stmt_orden->bind_param('ii', $orden_id, $orden_id);
$stmt_orden->execute();
$res_orden = $stmt_orden->get_result();
$orden = $res_orden->fetch_assoc();
$stmt_orden->close();
if (!$orden) {
    echo json_encode(['success' => false, 'error' => 'Orden de laboratorio no encontrada']);
    exit;
}
// Buscar resultados por consulta_id si existe, sino por orden_id
if ($orden['consulta_id']) {
    $stmt = $conn->prepare('SELECT * FROM resultados_laboratorio WHERE consulta_id = ? ORDER BY id DESC LIMIT 1');
    $stmt->bind_param('i', $orden['consulta_id']);
} else {
    $stmt = $conn->prepare('SELECT * FROM resultados_laboratorio WHERE orden_id = ? ORDER BY id DESC LIMIT 1');
    $stmt->bind_param('i', $orden['id']);
}
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
