<?php
require_once __DIR__ . '/init_api.php';

require_once 'config.php';

$data = json_decode(file_get_contents('php://input'), true);
if (!isset($data['id'])) {
    echo json_encode(['success' => false, 'error' => 'ID no recibido']);
    exit;
}
$id = intval($data['id']);
$sql = "UPDATE honorarios_medicos_movimientos SET estado_pago_medico = 'cancelado' WHERE id = ?";
$stmt = $conn->prepare($sql);
if ($stmt) {
    $stmt->bind_param('i', $id);
    if ($stmt->execute()) {
        echo json_encode(['success' => true]);
    } else {
        echo json_encode(['success' => false, 'error' => 'No se pudo cancelar el honorario']);
    }
    $stmt->close();
} else {
    echo json_encode(['success' => false, 'error' => 'Error en la consulta SQL']);
}
$conn->close();
?>
