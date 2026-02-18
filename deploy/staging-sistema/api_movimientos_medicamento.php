<?php
require_once __DIR__ . '/init_api.php';
// --- Verificación de sesión ---
require_once __DIR__ . '/auth_check.php';
// --- Lógica principal ---
require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];
if ($method === 'GET') {
    $medicamento_id = isset($_GET['medicamento_id']) ? intval($_GET['medicamento_id']) : 0;
    $sql = "SELECT m.*, u.nombre as usuario_nombre, CONCAT(md.nombre, ' ', md.apellido) as medico_nombre FROM movimientos_medicamento m LEFT JOIN usuarios u ON m.usuario_id = u.id LEFT JOIN medicos md ON m.medico_id = md.id WHERE m.medicamento_id = ? ORDER BY m.fecha_hora DESC";
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
    $stmt = $conn->prepare("INSERT INTO movimientos_medicamento (medicamento_id, tipo_movimiento, cantidad, usuario_id, medico_id, observaciones) VALUES (?, ?, ?, ?, ?, ?)");
    $stmt->bind_param('isiiis', $data['medicamento_id'], $data['tipo'], $data['cantidad'], $data['usuario_id'], $data['medico_id'], $data['observaciones']);
    $ok = $stmt->execute();
    if ($ok) {
        // Actualizar stock en medicamentos
        $sign = $data['tipo'] === 'entrada' ? '+' : '-';
        $conn->query("UPDATE medicamentos SET stock = stock $sign {$data['cantidad']} WHERE id = {$data['medicamento_id']}");
    }
    echo json_encode(["success" => $ok]);
} elseif ($method === 'DELETE') {
    $data = json_decode(file_get_contents('php://input'), true);
    if (isset($data['id'])) {
        // Obtener cantidad y tipo para revertir stock
        $stmt = $conn->prepare("SELECT medicamento_id, cantidad, tipo_movimiento FROM movimientos_medicamento WHERE id=?");
        $stmt->bind_param('i', $data['id']);
        $stmt->execute();
        $res = $stmt->get_result();
        $mov = $res->fetch_assoc();
        if ($mov) {
            // Eliminar movimiento
            $stmtDel = $conn->prepare("DELETE FROM movimientos_medicamento WHERE id=?");
            $stmtDel->bind_param('i', $data['id']);
            $ok = $stmtDel->execute();
            if ($ok) {
                // Revertir stock
                $sign = $mov['tipo_movimiento'] === 'entrada' ? '-' : '+';
                $conn->query("UPDATE medicamentos SET stock = stock $sign {$mov['cantidad']} WHERE id = {$mov['medicamento_id']}");
            }
            echo json_encode(["success" => $ok]);
        } else {
            echo json_encode(["success" => false, "error" => "Movimiento no encontrado"]);
        }
    } else {
        echo json_encode(["success" => false, "error" => "ID requerido"]);
    }
} else {
    http_response_code(405);
    echo json_encode(["error" => "Método no permitido"]);
}
