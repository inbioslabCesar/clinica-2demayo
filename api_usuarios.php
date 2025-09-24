
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
    exit;
}
header('Content-Type: application/json');
require_once __DIR__ . '/config.php';

switch ($_SERVER['REQUEST_METHOD']) {
    case 'GET':
        $result = $mysqli->query('SELECT id, usuario, nombre, dni, profesion, rol, activo, creado_en FROM usuarios');
        $usuarios = [];
        while ($row = $result->fetch_assoc()) {
            $usuarios[] = $row;
        }
        echo json_encode($usuarios);
        break;
    case 'POST':
        $data = json_decode(file_get_contents('php://input'), true);
        $stmt = $mysqli->prepare('INSERT INTO usuarios (usuario, password, nombre, dni, profesion, rol, activo) VALUES (?, SHA2(?,256), ?, ?, ?, ?, ?)');
        $stmt->bind_param('ssssssi', $data['usuario'], $data['password'], $data['nombre'], $data['dni'], $data['profesion'], $data['rol'], $data['activo']);
        if ($stmt->execute()) {
            echo json_encode(['success' => true, 'id' => $mysqli->insert_id]);
        } else {
            http_response_code(400);
            echo json_encode(['error' => 'No se pudo crear el usuario']);
        }
        $stmt->close();
        break;
    case 'PUT':
        $data = json_decode(file_get_contents('php://input'), true);
        $id = $data['id'];
        $campos = [];
        $params = [];
        $types = '';
        if (isset($data['password']) && $data['password'] !== '') {
            $campos[] = 'password = SHA2(?,256)';
            $params[] = $data['password'];
            $types .= 's';
        }
        foreach (['usuario','nombre','dni','profesion','rol','activo'] as $campo) {
            if (isset($data[$campo])) {
                $campos[] = "$campo = ?";
                $params[] = $data[$campo];
                $types .= is_int($data[$campo]) ? 'i' : 's';
            }
        }
        if (count($campos) > 0) {
            $sql = 'UPDATE usuarios SET ' . implode(', ', $campos) . ' WHERE id = ?';
            $params[] = $id;
            $types .= 'i';
            $stmt = $mysqli->prepare($sql);
            $stmt->bind_param($types, ...$params);
            if ($stmt->execute()) {
                echo json_encode(['success' => true]);
            } else {
                http_response_code(400);
                echo json_encode(['error' => 'No se pudo actualizar el usuario']);
            }
            $stmt->close();
        } else {
            http_response_code(400);
            echo json_encode(['error' => 'No hay campos para actualizar']);
        }
        break;
    case 'DELETE':
        // Eliminar usuario por id recibido por parámetro (query string)
        $id = $_GET['id'] ?? null;
        if ($id) {
            $stmt = $mysqli->prepare('DELETE FROM usuarios WHERE id = ?');
            $stmt->bind_param('i', $id);
            if ($stmt->execute()) {
                echo json_encode(['success' => true]);
            } else {
                http_response_code(400);
                echo json_encode(['error' => 'No se pudo eliminar el usuario']);
            }
            $stmt->close();
        } else {
            http_response_code(400);
            echo json_encode(['error' => 'ID de usuario requerido para eliminar']);
        }
        break;
    case 'DELETE':
        parse_str(file_get_contents('php://input'), $data);
        $id = $data['id'] ?? null;
        if ($id) {
            $stmt = $mysqli->prepare('DELETE FROM usuarios WHERE id = ?');
            $stmt->bind_param('i', $id);
            if ($stmt->execute()) {
                echo json_encode(['success' => true]);
            } else {
                http_response_code(400);
                echo json_encode(['error' => 'No se pudo eliminar el usuario']);
            }
            $stmt->close();
        } else {
            http_response_code(400);
            echo json_encode(['error' => 'ID requerido para eliminar']);
        }
        break;
    default:
        http_response_code(405);
        echo json_encode(['error' => 'Método no permitido']);
}

$mysqli->close();
