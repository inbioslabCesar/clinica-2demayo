
<?php
// --- Manejo avanzado de CORS y errores ---
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '',
    'secure' => false,
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();
$allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',
    'https://clinica2demayo.com'
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
require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST') {
    // Registrar nuevo egreso con todos los campos relevantes
    $input = json_decode(file_get_contents('php://input'), true);
    $tipo_egreso = $input['tipo_egreso'] ?? 'operativo';
    $categoria = $input['categoria'] ?? '';
    $descripcion = $input['descripcion'] ?? '';
    $monto = $input['monto'] ?? 0;
    $metodo_pago = $input['metodo_pago'] ?? 'efectivo';
    $usuario_id = $_SESSION['usuario']['id'] ?? null;
    $turno = $input['turno'] ?? ($_SESSION['usuario']['turno'] ?? 'mañana');
    $estado = $input['estado'] ?? 'pagado';
    $caja_id = empty($input['caja_id']) ? null : $input['caja_id'];
    $observaciones = $input['observaciones'] ?? '';
    $fecha = $input['fecha'] ?? date('Y-m-d');
    $hora = $input['hora'] ?? date('H:i:s');

    $stmt = $pdo->prepare("INSERT INTO egresos (fecha, tipo_egreso, categoria, descripcion, monto, metodo_pago, usuario_id, turno, estado, caja_id, observaciones, hora) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    $ok = $stmt->execute([$fecha, $tipo_egreso, $categoria, $descripcion, $monto, $metodo_pago, $usuario_id, $turno, $estado, $caja_id, $observaciones, $hora]);
    if ($ok) {
        echo json_encode(["success" => true, "id" => $pdo->lastInsertId()]);
    } else {
        echo json_encode(["success" => false, "error" => "No se pudo registrar el egreso."]);
    }
    exit;
}

if ($method === 'DELETE') {
    parse_str($_SERVER['QUERY_STRING'], $params);
    $id = $params['id'] ?? null;
    if (!$id) {
        echo json_encode(["success" => false, "error" => "ID de egreso requerido"]);
        exit;
    }
    $stmt = $pdo->prepare("DELETE FROM egresos WHERE id = ?");
    $ok = $stmt->execute([$id]);
    if ($ok) {
        echo json_encode(["success" => true]);
    } else {
        echo json_encode(["success" => false, "error" => "No se pudo eliminar el egreso."]);
    }
    exit;
    exit;
}

if ($method === 'PUT') {
    // Actualizar egreso existente
    parse_str($_SERVER['QUERY_STRING'], $params);
    $id = $params['id'] ?? null;
    if (!$id) {
        echo json_encode(["success" => false, "error" => "ID de egreso requerido"]);
        exit;
    }
    $input = json_decode(file_get_contents('php://input'), true);
    $stmt = $pdo->prepare("UPDATE egresos SET fecha=?, tipo_egreso=?, categoria=?, descripcion=?, monto=?, metodo_pago=?, turno=?, estado=?, caja_id=?, observaciones=?, hora=? WHERE id=?");
    $ok = $stmt->execute([
        $input['fecha'] ?? date('Y-m-d'),
        $input['tipo_egreso'] ?? '',
        $input['categoria'] ?? '',
        $input['descripcion'] ?? '',
        $input['monto'] ?? 0,
        $input['metodo_pago'] ?? 'efectivo',
        $input['turno'] ?? '',
        $input['estado'] ?? 'pagado',
        empty($input['caja_id']) ? null : $input['caja_id'],
        $input['observaciones'] ?? '',
        $input['hora'] ?? date('H:i:s'),
        $id
    ]);
    if ($ok) {
        echo json_encode(["success" => true]);
    } else {
        echo json_encode(["success" => false, "error" => "No se pudo actualizar el egreso."]);
    }
    exit;
}

if ($method === 'GET') {
    // Listar egresos por fecha (por defecto, día actual)
    $fecha = isset($_GET['fecha']) ? $_GET['fecha'] : date('Y-m-d');
    $stmt = $pdo->prepare("SELECT * FROM egresos WHERE DATE(created_at) = ? ORDER BY created_at DESC");
    $stmt->execute([$fecha]);
    $egresos = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode(["success" => true, "egresos" => $egresos]);
    exit;
}

http_response_code(405);
echo json_encode(["success" => false, "error" => "Método no permitido"]);
