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
// Mostrar errores para depuración
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);
// api_ordenes_laboratorio.php: Gestiona las órdenes de laboratorio
// CORS para localhost y producción
$allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'https://clinica2demayo.com'
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
    case 'POST':
        // Crear nueva orden de laboratorio
        $data = json_decode(file_get_contents('php://input'), true);
        $consulta_id = isset($data['consulta_id']) && is_numeric($data['consulta_id']) ? intval($data['consulta_id']) : null;
        $examenes = $data['examenes'] ?? null;
        if (!$examenes || !is_array($examenes) || count($examenes) === 0) {
            echo json_encode(['success' => false, 'error' => 'Faltan exámenes para la orden']);
            exit;
        }
        $json = json_encode($examenes);
        $paciente_id = $data['paciente_id'] ?? null;
        $cobro_id = isset($data['cobro_id']) && is_numeric($data['cobro_id']) ? intval($data['cobro_id']) : null;
        try {
            if ($consulta_id !== null) {
                // Orden generada desde consulta médica, no requiere cobro_id
                $stmt = $conn->prepare('INSERT INTO ordenes_laboratorio (consulta_id, examenes) VALUES (?, ?)');
                $stmt->bind_param('is', $consulta_id, $json);
            } else if ($paciente_id && $cobro_id !== null) {
                // Orden cotizada directamente, vincular cobro_id
                $stmt = $conn->prepare('INSERT INTO ordenes_laboratorio (consulta_id, examenes, paciente_id, cobro_id) VALUES (NULL, ?, ?, ?)');
                $stmt->bind_param('sii', $json, $paciente_id, $cobro_id);
            } else if ($paciente_id) {
                // Orden cotizada directamente, pero sin cobro_id (caso raro)
                $stmt = $conn->prepare('INSERT INTO ordenes_laboratorio (consulta_id, examenes, paciente_id) VALUES (NULL, ?, ?)');
                $stmt->bind_param('si', $json, $paciente_id);
            } else {
                $stmt = $conn->prepare('INSERT INTO ordenes_laboratorio (consulta_id, examenes) VALUES (NULL, ?)');
                $stmt->bind_param('s', $json);
            }
            $ok = $stmt->execute();
            if (!$ok) {
                throw new Exception($stmt->error);
            }
            $stmt->close();
            echo json_encode(['success' => $ok]);
        } catch (Exception $e) {
            error_log('Error al guardar orden laboratorio: ' . $e->getMessage());
            echo json_encode(['success' => false, 'error' => $e->getMessage()]);
        }
        break;
    case 'GET':
        // Listar órdenes de laboratorio (por estado o consulta_id)
        $estado = $_GET['estado'] ?? null;
        $consulta_id = isset($_GET['consulta_id']) ? intval($_GET['consulta_id']) : null;

        $sql = 'SELECT o.*, 
                    IFNULL(p2.nombre, p.nombre) AS paciente_nombre, 
                    IFNULL(p2.apellido, p.apellido) AS paciente_apellido, 
                    m.nombre AS medico_nombre, 
                    m.apellido AS medico_apellido 
                FROM ordenes_laboratorio o 
                LEFT JOIN consultas c ON o.consulta_id = c.id 
                LEFT JOIN pacientes p ON c.paciente_id = p.id 
                LEFT JOIN pacientes p2 ON o.paciente_id = p2.id 
                LEFT JOIN medicos m ON c.medico_id = m.id 
                WHERE 1=1';
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
            // Decodificar los IDs de exámenes
            $examenes_ids = json_decode($row['examenes'], true) ?: [];

            // Obtener detalles completos de los exámenes
            if (!empty($examenes_ids)) {
                $placeholders = str_repeat('?,', count($examenes_ids) - 1) . '?';
                $sql_examenes = "SELECT id, nombre, metodologia as descripcion, condicion_paciente, tiempo_resultado FROM examenes_laboratorio WHERE id IN ($placeholders)";
                $stmt_examenes = $conn->prepare($sql_examenes);
                $stmt_examenes->bind_param(str_repeat('i', count($examenes_ids)), ...$examenes_ids);
                $stmt_examenes->execute();
                $res_examenes = $stmt_examenes->get_result();

                $examenes_detalle = [];
                while ($examen = $res_examenes->fetch_assoc()) {
                    $examenes_detalle[] = $examen;
                }
                $stmt_examenes->close();

                $row['examenes'] = $examenes_detalle;
            } else {
                $row['examenes'] = [];
            }

            $ordenes[] = $row;
        }
        $stmt->close();
        echo json_encode(['success' => true, 'ordenes' => $ordenes]);
        break;
    default:
        echo json_encode(['success' => false, 'error' => 'Método no soportado']);
}
