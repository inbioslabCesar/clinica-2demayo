
<?php
// --- Manejo avanzado de CORS y errores ---
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '',
    'secure' => true,
    'httponly' => true,
    'samesite' => 'None',
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
require_once "db.php";

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST') {
    // Registrar nuevo egreso
    $input = json_decode(file_get_contents('php://input'), true);
    $tipo = $input['tipo'] ?? 'operativo';
    $categoria = $input['categoria'] ?? '';
    $concepto = $input['concepto'] ?? '';
    $monto = $input['monto'] ?? 0;
    $responsable = $_SESSION['username'] ?? 'admin';
    $observaciones = isset($input['observaciones']) ? $input['observaciones'] : '';

    $stmt = $pdo->prepare("INSERT INTO egresos (tipo, categoria, concepto, monto, responsable, observaciones) VALUES (?, ?, ?, ?, ?, ?)");
    $ok = $stmt->execute([$tipo, $categoria, $concepto, $monto, $responsable, $observaciones]);
    if ($ok) {
        echo json_encode(["success" => true, "id" => $pdo->lastInsertId()]);
    } else {
        echo json_encode(["success" => false, "error" => "No se pudo registrar el egreso."]);
    }
    exit;
}

if ($method === 'GET') {
    // Listar egresos del día actual (por fecha de creación)
    $stmt = $pdo->query("SELECT * FROM egresos WHERE DATE(created_at) = CURDATE() ORDER BY created_at DESC");
    $egresos = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode(["success" => true, "egresos" => $egresos]);
    exit;
}

http_response_code(405);
echo json_encode(["success" => false, "error" => "Método no permitido"]);
