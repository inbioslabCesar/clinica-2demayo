<?php
// --- Bloque de CORS y sesión seguro ---
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '',
    'secure' => false, // Cambiado a false para desarrollo local (HTTP)
    'httponly' => true,
    'samesite' => 'Lax', // Cambiado de None a Lax para mejor compatibilidad
]);
session_start();
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
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}
header('Content-Type: application/json');

// --- Verificación de sesión ---
require_once __DIR__ . '/auth_check.php';

// --- Lógica principal ---
require_once __DIR__ . '/config.php';
$method = $_SERVER['REQUEST_METHOD'];
if ($method === 'GET') {
    $medicamento_id = isset($_GET['medicamento_id']) ? intval($_GET['medicamento_id']) : 0;
    $sql = "SELECT m.*, u.nombre as usuario_nombre FROM movimientos_medicamento m LEFT JOIN usuarios u ON m.usuario_id = u.id WHERE m.medicamento_id = ? ORDER BY m.fecha DESC";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param('i', $medicamento_id);
    $stmt->execute();
    $result = $stmt->get_result();
    $movimientos = [];
    while ($row = $result->fetch_assoc()) {
        $movimientos[] = $row;
    }
    echo json_encode($movimientos);
} elseif ($method === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $stmt = $conn->prepare("INSERT INTO movimientos_medicamento (medicamento_id, tipo, cantidad, usuario_id, observaciones) VALUES (?, ?, ?, ?, ?)");
    $stmt->bind_param('isiss', $data['medicamento_id'], $data['tipo'], $data['cantidad'], $data['usuario_id'], $data['observaciones']);
    $ok = $stmt->execute();
    if ($ok) {
        // Actualizar stock en medicamentos
        $sign = $data['tipo'] === 'entrada' ? '+' : '-';
        $conn->query("UPDATE medicamentos SET stock = stock $sign {$data['cantidad']} WHERE id = {$data['medicamento_id']}");
    }
    echo json_encode(["success" => $ok]);
} else {
    http_response_code(405);
    echo json_encode(["error" => "Método no permitido"]);
}