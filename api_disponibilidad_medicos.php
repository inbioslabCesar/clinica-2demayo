
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
    'https://darkcyan-gnu-615778.hostingersite.com'
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins)) {
    header('Access-Control-Allow-Origin: ' . $origin);
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}
require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        // Listar disponibilidad de un médico (por id) o todos
        $medico_id = isset($_GET['medico_id']) ? intval($_GET['medico_id']) : null;
        $sql = 'SELECT * FROM disponibilidad_medicos';
        $params = [];
        if ($medico_id) {
            $sql .= ' WHERE medico_id = ?';
            $stmt = $conn->prepare($sql);
            $stmt->bind_param('i', $medico_id);
        } else {
            $stmt = $conn->prepare($sql);
        }
        $stmt->execute();
        $res = $stmt->get_result();
        $rows = [];
        while ($row = $res->fetch_assoc()) {
            $rows[] = $row;
        }
        echo json_encode(['success' => true, 'disponibilidad' => $rows]);
        $stmt->close();
        break;
    case 'POST':
        // Agregar múltiples bloques de disponibilidad
        $data = json_decode(file_get_contents('php://input'), true);
        $medico_id = $data['medico_id'] ?? null;
        $bloques = $data['bloques'] ?? null;
        if (!$medico_id || !is_array($bloques) || count($bloques) === 0) {
            echo json_encode(['success' => false, 'error' => 'Faltan datos requeridos o bloques vacíos']);
            exit;
        }
        $stmt = $conn->prepare('INSERT INTO disponibilidad_medicos (medico_id, fecha, hora_inicio, hora_fin) VALUES (?, ?, ?, ?)');
        $ok = true;
        foreach ($bloques as $bloque) {
            $fecha = $bloque['fecha'] ?? null;
            $hora_inicio = $bloque['hora_inicio'] ?? null;
            $hora_fin = $bloque['hora_fin'] ?? null;
            if (!$fecha || !$hora_inicio || !$hora_fin) {
                $ok = false;
                continue;
            }
            $stmt->bind_param('isss', $medico_id, $fecha, $hora_inicio, $hora_fin);
            if (!$stmt->execute()) {
                $ok = false;
            }
        }
        $stmt->close();
        echo json_encode(['success' => $ok]);
        break;
    case 'PUT':
        // Modificar disponibilidad (por id)
        $data = json_decode(file_get_contents('php://input'), true);
        $id = $data['id'] ?? null;
        $fecha = $data['fecha'] ?? null;
        $hora_inicio = $data['hora_inicio'] ?? null;
        $hora_fin = $data['hora_fin'] ?? null;
        if (!$id || !$fecha || !$hora_inicio || !$hora_fin) {
            echo json_encode(['success' => false, 'error' => 'Faltan datos requeridos']);
            exit;
        }
        $stmt = $conn->prepare('UPDATE disponibilidad_medicos SET fecha=?, hora_inicio=?, hora_fin=? WHERE id=?');
        $stmt->bind_param('sssi', $fecha, $hora_inicio, $hora_fin, $id);
        $ok = $stmt->execute();
        echo json_encode(['success' => $ok]);
        $stmt->close();
        break;
    case 'DELETE':
        // Eliminar disponibilidad (por id)
        $data = json_decode(file_get_contents('php://input'), true);
        $id = $data['id'] ?? null;
        if (!$id) {
            echo json_encode(['success' => false, 'error' => 'ID requerido']);
            exit;
        }
        $stmt = $conn->prepare('DELETE FROM disponibilidad_medicos WHERE id=?');
        $stmt->bind_param('i', $id);
        $ok = $stmt->execute();
        echo json_encode(['success' => $ok]);
        $stmt->close();
        break;
    default:
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
}
