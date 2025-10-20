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
    'http://localhost:5176',
    'https://darkcyan-gnu-615778.hostingersite.com'
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins)) {
    header('Access-Control-Allow-Origin: ' . $origin);
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
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
        $apellido = $data['apellido'] ?? null;
        $especialidad = $data['especialidad'] ?? null;
        $email = $data['email'] ?? null;
        $password = $data['password'] ?? null;
        $cmp = $data['cmp'] ?? null;
        $rne = $data['rne'] ?? null;
        $firma = $data['firma'] ?? null;
        
        if (!$nombre || !$apellido || !$especialidad || !$email || !$password || !$cmp) {
            echo json_encode(['success' => false, 'error' => 'Nombre, apellido, especialidad, email, contraseña y CMP son requeridos']);
            exit;
        }
        
        // Validar formato CMP
        if (!preg_match('/^[A-Za-z0-9]{1,20}$/', $cmp)) {
            echo json_encode(['success' => false, 'error' => 'Formato de CMP inválido. Solo letras y números, máximo 20 caracteres.']);
            exit;
        }
        
        // Validar formato RNE si está presente
        if (!empty($rne) && !preg_match('/^[A-Za-z0-9]{1,20}$/', $rne)) {
            echo json_encode(['success' => false, 'error' => 'Formato de RNE inválido. Solo letras y números, máximo 20 caracteres.']);
            exit;
        }
        
        // Validar firma si está presente
        if (!empty($firma) && !preg_match('/^data:image\/(png|jpeg|jpg);base64,/', $firma)) {
            echo json_encode(['success' => false, 'error' => 'Formato de firma inválido. Debe ser PNG o JPEG en base64.']);
            exit;
        }
        
        $password_hash = password_hash($password, PASSWORD_DEFAULT);
        $stmt = $conn->prepare('INSERT INTO medicos (nombre, apellido, especialidad, email, password, cmp, rne, firma) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->bind_param('ssssssss', $nombre, $apellido, $especialidad, $email, $password_hash, $cmp, $rne, $firma);
        $ok = $stmt->execute();
        echo json_encode(['success' => $ok, 'id' => $ok ? $stmt->insert_id : null]);
        $stmt->close();
        exit;
    case 'PUT':
        // Editar médico
        $data = json_decode(file_get_contents('php://input'), true);
        $id = $data['id'] ?? null;
        $nombre = $data['nombre'] ?? null;
        $apellido = $data['apellido'] ?? null;
        $especialidad = $data['especialidad'] ?? null;
        $email = $data['email'] ?? null;
        $password = $data['password'] ?? null;
        $cmp = $data['cmp'] ?? null;
        $rne = $data['rne'] ?? null;
        $firma = $data['firma'] ?? null;
        
        if (!$id || !$nombre || !$apellido || !$especialidad || !$email || !$cmp) {
            echo json_encode(['success' => false, 'error' => 'ID, nombre, apellido, especialidad, email y CMP son requeridos']);
            exit;
        }
        
        // Validar formato CMP
        if (!preg_match('/^[A-Za-z0-9]{1,20}$/', $cmp)) {
            echo json_encode(['success' => false, 'error' => 'Formato de CMP inválido. Solo letras y números, máximo 20 caracteres.']);
            exit;
        }
        
        // Validar formato RNE si está presente
        if (!empty($rne) && !preg_match('/^[A-Za-z0-9]{1,20}$/', $rne)) {
            echo json_encode(['success' => false, 'error' => 'Formato de RNE inválido. Solo letras y números, máximo 20 caracteres.']);
            exit;
        }
        
        // Validar firma si está presente
        if (!empty($firma) && !preg_match('/^data:image\/(png|jpeg|jpg);base64,/', $firma)) {
            echo json_encode(['success' => false, 'error' => 'Formato de firma inválido. Debe ser PNG o JPEG en base64.']);
            exit;
        }
        
        if (!empty($password)) {
            $password_hash = password_hash($password, PASSWORD_DEFAULT);
            $stmt = $conn->prepare('UPDATE medicos SET nombre=?, apellido=?, especialidad=?, email=?, password=?, cmp=?, rne=?, firma=? WHERE id=?');
            $stmt->bind_param('ssssssssi', $nombre, $apellido, $especialidad, $email, $password_hash, $cmp, $rne, $firma, $id);
        } else {
            $stmt = $conn->prepare('UPDATE medicos SET nombre=?, apellido=?, especialidad=?, email=?, cmp=?, rne=?, firma=? WHERE id=?');
            $stmt->bind_param('sssssssi', $nombre, $apellido, $especialidad, $email, $cmp, $rne, $firma, $id);
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
