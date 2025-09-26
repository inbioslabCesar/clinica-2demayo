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
// api_triaje.php: Guarda y consulta datos de triaje en formato JSON
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
        // Guardar o actualizar triaje
        $data = json_decode(file_get_contents('php://input'), true);
        $consulta_id = $data['consulta_id'] ?? null;
        $datos = $data['datos'] ?? null;
        if (!$consulta_id || !$datos) {
            echo json_encode(['success' => false, 'error' => 'Faltan datos requeridos']);
            exit;
        }
        $json = json_encode($datos);
        // Verificar si ya existe triaje para esta consulta
        $stmt_check = $conn->prepare('SELECT id FROM triaje WHERE consulta_id = ?');
        $stmt_check->bind_param('i', $consulta_id);
        $stmt_check->execute();
        $res_check = $stmt_check->get_result();
        $clasificacion = isset($datos['clasificacion']) ? $datos['clasificacion'] : null;
        if ($res_check->fetch_assoc()) {
            // Ya existe: actualizar
            $stmt = $conn->prepare('UPDATE triaje SET datos = ?, fecha_registro = CURRENT_TIMESTAMP WHERE consulta_id = ?');
            $stmt->bind_param('si', $json, $consulta_id);
            $ok = $stmt->execute();
            $stmt->close();
        } else {
            // No existe: insertar
            $stmt = $conn->prepare('INSERT INTO triaje (consulta_id, datos) VALUES (?, ?)');
            $stmt->bind_param('is', $consulta_id, $json);
            $ok = $stmt->execute();
            $stmt->close();
        }
        // Actualizar clasificacion y marcar triaje_realizado en la tabla consultas
        // Siempre actualizar clasificacion y marcar triaje_realizado
        // Si no hay clasificacion, guardar como 'Sin clasificar'
        $clasificacion_final = $clasificacion !== null && $clasificacion !== '' ? $clasificacion : 'Sin clasificar';
        $stmt2 = $conn->prepare('UPDATE consultas SET clasificacion = ?, triaje_realizado = 1 WHERE id = ?');
        if (!$stmt2) {
            error_log('Error al preparar UPDATE consultas: ' . $conn->error);
            echo json_encode(['success' => false, 'error' => 'Error al preparar UPDATE consultas', 'mysqli_error' => $conn->error]);
            exit;
        }
        $stmt2->bind_param('si', $clasificacion_final, $consulta_id);
        $exec_ok = $stmt2->execute();
        if (!$exec_ok) {
            error_log('Error al ejecutar UPDATE consultas: ' . $stmt2->error);
            echo json_encode(['success' => false, 'error' => 'Error al ejecutar UPDATE consultas', 'mysqli_error' => $stmt2->error]);
            $stmt2->close();
            exit;
        }
        $stmt2->close();
        echo json_encode(['success' => $ok, 'updated' => true, 'update_consultas_ok' => $exec_ok, 'clasificacion_final' => $clasificacion_final]);
        $stmt_check->close();
        break;
    case 'GET':
        // Consultar triaje por consulta_id
        $consulta_id = isset($_GET['consulta_id']) ? intval($_GET['consulta_id']) : null;
        if (!$consulta_id) {
            echo json_encode(['success' => false, 'error' => 'Falta consulta_id']);
            exit;
        }
        $stmt = $conn->prepare('SELECT * FROM triaje WHERE consulta_id = ?');
        $stmt->bind_param('i', $consulta_id);
        $stmt->execute();
        $res = $stmt->get_result();
        $row = $res->fetch_assoc();
        if ($row) {
            $row['datos'] = json_decode($row['datos'], true);
            echo json_encode(['success' => true, 'triaje' => $row]);
        } else {
            echo json_encode(['success' => false, 'error' => 'No encontrado']);
        }
        $stmt->close();
        break;
    default:
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
}
