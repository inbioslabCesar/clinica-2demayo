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
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}
header('Content-Type: application/json');
require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        // Listar médicos
        $sql = 'SELECT * FROM medicos';
        $res = $conn->query($sql);
        $rows = [];
        while ($row = $res->fetch_assoc()) {
            $rows[] = $row;
        }
        echo json_encode(['success' => true, 'medicos' => $rows]);
        exit;
    case 'POST':
        // Crear médico
        $data = json_decode(file_get_contents('php://input'), true);
        $nombre = $data['nombre'] ?? null;
        $especialidad = $data['especialidad'] ?? null;
        $email = $data['email'] ?? null;
        $password = $data['password'] ?? null;
        if (!$nombre || !$especialidad || !$email || !$password) {
            echo json_encode(['success' => false, 'error' => 'Nombre, especialidad, email y contraseña requeridos']);
            exit;
        }
        $password_hash = password_hash($password, PASSWORD_DEFAULT);
        $stmt = $conn->prepare('INSERT INTO medicos (nombre, especialidad, email, password) VALUES (?, ?, ?, ?)');
        $stmt->bind_param('ssss', $nombre, $especialidad, $email, $password_hash);
        $ok = $stmt->execute();
        echo json_encode(['success' => $ok, 'id' => $ok ? $stmt->insert_id : null]);
        $stmt->close();
        exit;
    case 'PUT':
        // Editar médico
        $data = json_decode(file_get_contents('php://input'), true);
        $id = $data['id'] ?? null;
        $nombre = $data['nombre'] ?? null;
        $especialidad = $data['especialidad'] ?? null;
        $email = $data['email'] ?? null;
        $password = $data['password'] ?? null;
        if (!$id || !$nombre || !$especialidad || !$email) {
            echo json_encode(['success' => false, 'error' => 'ID, nombre, especialidad y email requeridos']);
            exit;
        }
        if (!empty($password)) {
            $password_hash = password_hash($password, PASSWORD_DEFAULT);
            $stmt = $conn->prepare('UPDATE medicos SET nombre=?, especialidad=?, email=?, password=? WHERE id=?');
            $stmt->bind_param('ssssi', $nombre, $especialidad, $email, $password_hash, $id);
        } else {
            $stmt = $conn->prepare('UPDATE medicos SET nombre=?, especialidad=?, email=? WHERE id=?');
            $stmt->bind_param('sssi', $nombre, $especialidad, $email, $id);
        }
        $ok = $stmt->execute();
        echo json_encode(['success' => $ok]);
        $stmt->close();
        exit;
    case 'DELETE':
        // Eliminar médico
        $data = json_decode(file_get_contents('php://input'), true);
        $id = $data['id'] ?? null;
        if (!$id) {
            echo json_encode(['success' => false, 'error' => 'ID requerido']);
            exit;
        }
        $stmt = $conn->prepare('DELETE FROM medicos WHERE id=?');
        $stmt->bind_param('i', $id);
        $ok = $stmt->execute();
        echo json_encode(['success' => $ok]);
        $stmt->close();
        exit;
    default:
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
}
