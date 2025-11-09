<?php
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
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}
header('Content-Type: application/json');
require_once "config.php";
require_once "auth_check.php";
if (isset($conn) && method_exists($conn, 'set_charset')) {
    $conn->set_charset('utf8mb4');
}

$method = $_SERVER['REQUEST_METHOD'];

switch($method) {
    case 'POST':
        $data = json_decode(file_get_contents('php://input'), true);
        // Si la acción es marcar como pagado
        if (isset($data['accion']) && $data['accion'] === 'marcar_pagado' && isset($data['id'])) {
            // Registrar quién liquidó y el turno/hora de liquidación
            $usuario = $_SESSION['usuario'] ?? null;
            $usuario_id = $usuario['id'] ?? null;
            $turno_liq = null;
            $caja_id = null;
            if ($usuario_id) {
                $stmtCaja = $conn->prepare("SELECT id, turno FROM cajas WHERE estado = 'abierta' AND usuario_id = ? ORDER BY created_at DESC LIMIT 1");
                $stmtCaja->bind_param("i", $usuario_id);
                $stmtCaja->execute();
                $resCaja = $stmtCaja->get_result();
                if ($resCaja && $resCaja->num_rows > 0) {
                    $cajaRow = $resCaja->fetch_assoc();
                    $turno_liq = $cajaRow['turno'];
                    $caja_id = $cajaRow['id'];
                }
            }
            $stmt = $conn->prepare("UPDATE laboratorio_referencia_movimientos SET estado = 'pagado', liquidado_por = ?, turno_liquidacion = ?, hora_liquidacion = CURTIME(), caja_id = COALESCE(caja_id, ?) WHERE id = ?");
            $stmt->bind_param("issi", $usuario_id, $turno_liq, $caja_id, $data['id']);
            $stmt->execute();
            echo json_encode(['success' => true]);
            break;
        }
        // Registrar movimiento de laboratorio de referencia (alta)
        if (!isset($data['cobro_id']) || !isset($data['examen_id']) || !isset($data['laboratorio']) || !isset($data['monto']) || !isset($data['tipo']) || !isset($data['estado'])) {
            echo json_encode(['success' => false, 'error' => 'Datos incompletos']);
            break;
        }
        $stmt = $conn->prepare("INSERT INTO laboratorio_referencia_movimientos (cobro_id, examen_id, laboratorio, monto, tipo, estado, paciente_id, fecha, hora, observaciones) VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE(), CURTIME(), ?)");
        $stmt->bind_param("iissssis", $data['cobro_id'], $data['examen_id'], $data['laboratorio'], $data['monto'], $data['tipo'], $data['estado'], $data['paciente_id'], $data['observaciones']);
        $stmt->execute();
        echo json_encode(['success' => true, 'id' => $conn->insert_id]);
        break;
    case 'GET':
        // Listar movimientos por laboratorio, estado, fecha, etc.
        $laboratorio = $_GET['laboratorio'] ?? null;
        $estado = $_GET['estado'] ?? null;
    $sql = "SELECT m.*, u.nombre AS nombre_cobrado_por, ul.nombre AS nombre_liquidado_por FROM laboratorio_referencia_movimientos m LEFT JOIN usuarios u ON m.cobrado_por = u.id LEFT JOIN usuarios ul ON m.liquidado_por = ul.id WHERE 1=1";
        $params = [];
        $types = "";
        if ($laboratorio) {
            $sql .= " AND m.laboratorio = ?";
            $params[] = $laboratorio;
            $types .= "s";
        }
        if ($estado) {
            $sql .= " AND m.estado = ?";
            $params[] = $estado;
            $types .= "s";
        }
        $sql .= " ORDER BY m.fecha DESC, m.hora DESC";
        $stmt = $conn->prepare($sql);
        if (!empty($params)) {
            $stmt->bind_param($types, ...$params);
        }
        $stmt->execute();
        $result = $stmt->get_result();
        $movimientos = [];
        while ($row = $result->fetch_assoc()) {
            // Mostrar el nombre del usuario en vez del ID (para cobro y liquidación)
            $row['cobrado_por'] = $row['nombre_cobrado_por'] ?? $row['cobrado_por'];
            $row['liquidado_por'] = $row['nombre_liquidado_por'] ?? $row['liquidado_por'] ?? null;
            unset($row['nombre_cobrado_por']);
            unset($row['nombre_liquidado_por']);
            $movimientos[] = $row;
        }
        echo json_encode(['success' => true, 'movimientos' => $movimientos]);
        break;
    default:
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
        break;
}
?>
