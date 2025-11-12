<?php
date_default_timezone_set('America/Lima');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '.clinica2demayo.com',
    'secure' => true,
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();
// CORS para localhost y producción
$allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',
    'https://clinica2demayo.com',
    'https://www.clinica2demayo.com'
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins)) {
    header('Access-Control-Allow-Origin: ' . $origin);
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS, DELETE');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Capturar errores fatales y enviar JSON con CORS
set_exception_handler(function($e) use ($origin, $allowedOrigins) {
    http_response_code(500);
    if (in_array($origin, $allowedOrigins)) {
        header('Access-Control-Allow-Origin: ' . $origin);
    }
    header('Access-Control-Allow-Credentials: true');
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => 'Error del servidor: ' . $e->getMessage()]);
    exit();
});
header('Content-Type: application/json');
require_once 'config.php';


$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        // Listar ingresos por caja, usuario, área, tipo de pago, etc.
        $caja_id = isset($_GET['caja_id']) ? intval($_GET['caja_id']) : null;
        $usuario_id = isset($_GET['usuario_id']) ? intval($_GET['usuario_id']) : null;
        $area = isset($_GET['area']) ? trim($_GET['area']) : null;
        $tipo_pago = isset($_GET['tipo_pago']) ? trim($_GET['tipo_pago']) : null;
        $sql = 'SELECT * FROM ingresos WHERE 1=1';
        $params = [];
        if ($caja_id) {
            $sql .= ' AND caja_id = ?';
            $params[] = $caja_id;
        }
        if ($usuario_id) {
            $sql .= ' AND usuario_id = ?';
            $params[] = $usuario_id;
        }
        if ($area) {
            $sql .= ' AND area = ?';
            $params[] = $area;
        }
        if ($tipo_pago) {
            $sql .= ' AND tipo_pago = ?';
            $params[] = $tipo_pago;
        }
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(['success' => true, 'ingresos' => $rows]);
        break;
    case 'POST':
        // Registrar nuevo ingreso
        if (!isset($_SESSION['usuario']) || !is_array($_SESSION['usuario'])) {
            echo json_encode(['success' => false, 'error' => 'Usuario no autenticado']);
            exit;
        }
        $data = json_decode(file_get_contents('php://input'), true);
        $caja_id = intval($data['caja_id'] ?? 0);
        $area = trim($data['area'] ?? '');
        $tipo_pago = trim($data['tipo_pago'] ?? '');
        $monto = floatval($data['monto'] ?? 0);
        $descripcion = trim($data['descripcion'] ?? '');
        $fecha_hora = date('Y-m-d H:i:s');
        $usuario_id = $_SESSION['usuario']['id'];
        if ($caja_id <= 0 || $area === '' || $tipo_pago === '' || $monto <= 0) {
            echo json_encode(['success' => false, 'error' => 'Datos incompletos o inválidos']);
            exit;
        }
        $stmt = $pdo->prepare('INSERT INTO ingresos (caja_id, area, tipo_pago, monto, descripcion, fecha_hora, usuario_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
        $ok = $stmt->execute([$caja_id, $area, $tipo_pago, $monto, $descripcion, $fecha_hora, $usuario_id]);
        echo json_encode(['success' => $ok, 'id' => $ok ? $pdo->lastInsertId() : null]);
        break;
    default:
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
}
?>
