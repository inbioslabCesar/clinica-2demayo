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

require_once __DIR__ . '/config.php';

$data = json_decode(file_get_contents('php://input'), true);
$id = isset($data['id']) ? intval($data['id']) : 0;

// Chequeo de sesión y usuario
if (!isset($_SESSION['usuario']) || !is_array($_SESSION['usuario'])) {
    echo json_encode([
        "success" => false,
        "error" => "Usuario no autenticado o sesión perdida",
        "session" => $_SESSION
    ]);
    exit;
}


// Obtener datos del honorario
// Obtener datos del honorario
$sqlHonorario = "SELECT * FROM honorarios_medicos_movimientos WHERE id = $id";
$resHonorario = $conn->query($sqlHonorario);
if (!$resHonorario || $resHonorario->num_rows === 0) {
    echo json_encode(["success" => false, "error" => "Honorario no encontrado"]);
    exit;
}
$honorario = $resHonorario->fetch_assoc();

// Obtener caja abierta del usuario actual
$usuario_id = isset($_SESSION['usuario']['id']) ? intval($_SESSION['usuario']['id']) : 0;
$sqlCaja = "SELECT id FROM cajas WHERE estado = 'abierta' AND usuario_id = $usuario_id ORDER BY created_at DESC LIMIT 1";
$resCaja = $conn->query($sqlCaja);
$caja_id = null;
if ($resCaja && $resCaja->num_rows > 0) {
    $rowCaja = $resCaja->fetch_assoc();
    $caja_id = intval($rowCaja['id']);
}

// Actualizar estado a pagado
// Actualizar estado a pagado y asociar caja_id si existe
$sql = "UPDATE honorarios_medicos_movimientos SET estado_pago_medico = 'pagado', fecha_pago_medico = NOW()" . ($caja_id ? ", caja_id = $caja_id" : "") . " WHERE id = $id";
if ($conn->query($sql)) {
    // Registrar egreso
    $medico_id = intval($honorario['medico_id']);
    $monto = floatval($honorario['monto_medico']);
    // Usar el turno del usuario que está liquidando (si existe) para que la liquidación quede registrada en su caja/turno
    $turno = isset($_SESSION['usuario']['turno']) ? $conn->real_escape_string($_SESSION['usuario']['turno']) : $conn->real_escape_string($honorario['turno']);
    $metodo_pago = $conn->real_escape_string($honorario['metodo_pago_medico']);
    $fecha = date('Y-m-d');
    $descripcion = "Liquidación honorario médico ID $id";
    $estado = "pagado";
    $honorario_movimiento_id = $id;
    // Registrar egreso con caja_id si existe
    $sqlEgreso = "INSERT INTO egresos (fecha, tipo_egreso, categoria, descripcion, monto, metodo_pago, usuario_id, turno, estado, medico_id, honorario_movimiento_id, caja_id) VALUES (
        '$fecha', 'honorario_medico', 'Honorarios Médicos', '$descripcion', $monto, '$metodo_pago', $usuario_id, '$turno', '$estado', $medico_id, $honorario_movimiento_id, " . ($caja_id ? $caja_id : "NULL") . "
    )";
    $conn->query($sqlEgreso);

    echo json_encode(["success" => true]);
} else {
    echo json_encode([
        "success" => false,
        "error" => $conn->error,
        "usuario_id" => $usuario_id,
        "usuario_sesion" => isset($_SESSION['usuario']) ? $_SESSION['usuario'] : null
    ]);
}
