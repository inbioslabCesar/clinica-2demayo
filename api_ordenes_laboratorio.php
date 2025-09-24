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
// Mostrar errores para depuración
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);
// api_ordenes_laboratorio.php: Gestiona las órdenes de laboratorio
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
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}
header('Content-Type: application/json');
require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'POST':
        // Crear nueva orden de laboratorio
        $data = json_decode(file_get_contents('php://input'), true);
        $consulta_id = $data['consulta_id'] ?? null;
        $examenes = $data['examenes'] ?? null;
        if (!$consulta_id || !$examenes) {
            echo json_encode(['success' => false, 'error' => 'Faltan datos requeridos']);
            exit;
        }
        $json = json_encode($examenes);
        $stmt = $conn->prepare('INSERT INTO ordenes_laboratorio (consulta_id, examenes) VALUES (?, ?)');
        $stmt->bind_param('is', $consulta_id, $json);
        $ok = $stmt->execute();
        $stmt->close();
        echo json_encode(['success' => $ok]);
        break;
    case 'GET':
        // Listar órdenes de laboratorio (por estado o consulta_id)
        $estado = $_GET['estado'] ?? null;
        $consulta_id = isset($_GET['consulta_id']) ? intval($_GET['consulta_id']) : null;
    $sql = 'SELECT o.*, p.nombre AS paciente_nombre, p.apellido AS paciente_apellido, m.nombre AS medico_nombre FROM ordenes_laboratorio o LEFT JOIN consultas c ON o.consulta_id = c.id LEFT JOIN pacientes p ON c.paciente_id = p.id LEFT JOIN medicos m ON c.medico_id = m.id WHERE 1=1';
        $params = [];
        $types = '';
        if ($estado) {
            $sql .= ' AND estado = ?';
            $params[] = $estado;
            $types .= 's';
        }
        if ($consulta_id) {
            $sql .= ' AND consulta_id = ?';
            $params[] = $consulta_id;
            $types .= 'i';
        }
        $stmt = $conn->prepare($sql);
        if ($params) {
            $stmt->bind_param($types, ...$params);
        }
        $stmt->execute();
        $res = $stmt->get_result();
        $ordenes = [];
        while ($row = $res->fetch_assoc()) {
            $row['examenes'] = json_decode($row['examenes'], true);
            $ordenes[] = $row;
        }
        $stmt->close();
        echo json_encode(['success' => true, 'ordenes' => $ordenes]);
        break;
    default:
        echo json_encode(['success' => false, 'error' => 'Método no soportado']);
}
