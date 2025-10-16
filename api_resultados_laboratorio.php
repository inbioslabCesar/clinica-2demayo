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
// api_resultados_laboratorio.php: Guarda resultados de laboratorio
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
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}
header('Content-Type: application/json');
require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        // Obtener resultados de laboratorio por consulta_id
        $consulta_id = isset($_GET['consulta_id']) ? intval($_GET['consulta_id']) : null;
        if (!$consulta_id) {
            echo json_encode(['success' => false, 'error' => 'Falta consulta_id']);
            exit;
        }
        $stmt = $conn->prepare('SELECT * FROM resultados_laboratorio WHERE consulta_id = ?');
        $stmt->bind_param('i', $consulta_id);
        $stmt->execute();
        $res = $stmt->get_result();
        $resultados = [];
        while ($row = $res->fetch_assoc()) {
            $row['resultados'] = json_decode($row['resultados'], true);
            $resultados[] = $row;
        }
        $stmt->close();
        echo json_encode(['success' => true, 'resultados' => $resultados]);
        break;
    case 'POST':
        // Guardar resultados de laboratorio
        $data = json_decode(file_get_contents('php://input'), true);
        $consulta_id = $data['consulta_id'] ?? null;
        $tipo_examen = $data['tipo_examen'] ?? null;
        $resultados = $data['resultados'] ?? null;
        if (!$consulta_id || !$resultados) {
            echo json_encode(['success' => false, 'error' => 'Faltan datos requeridos']);
            exit;
        }
        $json = json_encode($resultados);
        // Verificar si la orden existe y si es directa (sin consulta)
        $stmt_orden = $conn->prepare('SELECT id, consulta_id FROM ordenes_laboratorio WHERE id = ? OR consulta_id = ?');
        $stmt_orden->bind_param('ii', $consulta_id, $consulta_id);
        $stmt_orden->execute();
        $res_orden = $stmt_orden->get_result();
        $orden = $res_orden->fetch_assoc();
        $stmt_orden->close();
        if (!$orden) {
            echo json_encode(['success' => false, 'error' => 'Orden de laboratorio no encontrada']);
            exit;
        }
        $tieneConsulta = $orden['consulta_id'] ? true : false;
        // Verificar si ya existen resultados para esta orden
        if ($tieneConsulta) {
            // Guardar en consulta_id (flujo tradicional)
            $stmt_check = $conn->prepare('SELECT id FROM resultados_laboratorio WHERE consulta_id = ?');
            $stmt_check->bind_param('i', $orden['consulta_id']);
            $stmt_check->execute();
            $stmt_check->store_result();
            if ($stmt_check->num_rows > 0) {
                $stmt_update = $conn->prepare('UPDATE resultados_laboratorio SET tipo_examen = ?, resultados = ? WHERE consulta_id = ?');
                $stmt_update->bind_param('ssi', $tipo_examen, $json, $orden['consulta_id']);
                $ok = $stmt_update->execute();
                $stmt_update->close();
            } else {
                $stmt = $conn->prepare('INSERT INTO resultados_laboratorio (consulta_id, tipo_examen, resultados) VALUES (?, ?, ?)');
                $stmt->bind_param('iss', $orden['consulta_id'], $tipo_examen, $json);
                $ok = $stmt->execute();
                $stmt->close();
            }
            $stmt_check->close();
        } else {
            // Guardar en orden_id (cotización directa)
            $stmt_check = $conn->prepare('SELECT id FROM resultados_laboratorio WHERE orden_id = ?');
            $stmt_check->bind_param('i', $orden['id']);
            $stmt_check->execute();
            $stmt_check->store_result();
            if ($stmt_check->num_rows > 0) {
                $stmt_update = $conn->prepare('UPDATE resultados_laboratorio SET tipo_examen = ?, resultados = ? WHERE orden_id = ?');
                $stmt_update->bind_param('ssi', $tipo_examen, $json, $orden['id']);
                $ok = $stmt_update->execute();
                $stmt_update->close();
            } else {
                $stmt = $conn->prepare('INSERT INTO resultados_laboratorio (orden_id, tipo_examen, resultados) VALUES (?, ?, ?)');
                $stmt->bind_param('iss', $orden['id'], $tipo_examen, $json);
                $ok = $stmt->execute();
                $stmt->close();
            }
            $stmt_check->close();
        }
        // Cambiar estado de la orden a completado
        $stmt2 = $conn->prepare('UPDATE ordenes_laboratorio SET estado = "completado" WHERE id = ? OR consulta_id = ?');
        $stmt2->bind_param('ii', $orden['id'], $orden['consulta_id']);
        $stmt2->execute();
        $stmt2->close();
        echo json_encode(['success' => $ok]);
        break;
    default:
        echo json_encode(['success' => false, 'error' => 'Método no soportado']);
}
