
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

require_once "db.php";

$data = json_decode(file_get_contents('php://input'), true);
$id = isset($data['id']) ? intval($data['id']) : 0;

if (!$id) {
    echo json_encode(["success" => false, "error" => "ID inválido"]);
    exit;
}


// Obtener datos del honorario
$sqlHonorario = "SELECT * FROM honorarios_medicos_movimientos WHERE id = $id";
$resHonorario = $conn->query($sqlHonorario);
if (!$resHonorario || $resHonorario->num_rows === 0) {
    echo json_encode(["success" => false, "error" => "Honorario no encontrado"]);
    exit;
}
$honorario = $resHonorario->fetch_assoc();

// Actualizar estado a pagado
$sql = "UPDATE honorarios_medicos_movimientos SET estado_pago_medico = 'pagado', fecha_pago_medico = NOW() WHERE id = $id";
if ($conn->query($sql)) {
    // Registrar egreso
    $medico_id = intval($honorario['medico_id']);
    $monto = floatval($honorario['monto_medico']);
    $turno = $conn->real_escape_string($honorario['turno']);
    $metodo_pago = $conn->real_escape_string($honorario['metodo_pago_medico']);
    $usuario_id = isset($_SESSION['usuario_id']) ? intval($_SESSION['usuario_id']) : 0;
    $fecha = date('Y-m-d');
    $descripcion = "Liquidación honorario médico ID $id";
    $estado = "pagado";
    $honorario_movimiento_id = $id;

    $sqlEgreso = "INSERT INTO egresos (fecha, tipo_egreso, categoria, descripcion, monto, metodo_pago, usuario_id, turno, estado, medico_id, honorario_movimiento_id) VALUES (
        '$fecha', 'honorario_medico', 'Honorarios Médicos', '$descripcion', $monto, '$metodo_pago', $usuario_id, '$turno', '$estado', $medico_id, $honorario_movimiento_id
    )";
    $conn->query($sqlEgreso);

    echo json_encode(["success" => true]);
} else {
    echo json_encode(["success" => false, "error" => $conn->error]);
}
