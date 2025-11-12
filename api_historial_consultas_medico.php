<?php
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

// --- Verificación de sesión ---
require_once __DIR__ . '/auth_check.php';

$medico_id = isset($_GET['medico_id']) ? intval($_GET['medico_id']) : 0;
if (!$medico_id) {
    echo json_encode(["success" => false, "error" => "Falta medico_id"]);
    exit;
}

$sql = "SELECT hc.id, hc.consulta_id, hc.fecha_registro AS fecha, c.paciente_id, p.nombre as paciente_nombre, hc.datos, c.estado
    FROM historia_clinica hc
    JOIN consultas c ON hc.consulta_id = c.id
    JOIN pacientes p ON c.paciente_id = p.id
    WHERE c.medico_id = ?
    ORDER BY hc.fecha_registro DESC";
$stmt = $pdo->prepare($sql);
$stmt->execute([$medico_id]);
$rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

// Resumir datos para la tabla
$historial = array_map(function($row) {
    $datos = json_decode($row['datos'], true);
    return [
        "id" => $row['id'],
        "consulta_id" => $row['consulta_id'],
        "fecha" => $row['fecha'],
        "paciente_id" => $row['paciente_id'],
        "paciente_nombre" => $row['paciente_nombre'],
        "motivo" => isset($datos['motivo']) ? $datos['motivo'] : '',
        "diagnostico" => isset($datos['diagnosticos'][0]['nombre']) ? $datos['diagnosticos'][0]['nombre'] : '',
        "estado" => $row['estado'] ?? ''
    ];
}, $rows);

echo json_encode(["success" => true, "historial" => $historial]);
