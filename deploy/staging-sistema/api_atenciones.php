<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $paciente_id = isset($data['paciente_id']) ? intval($data['paciente_id']) : 0;
    $usuario_id = isset($data['usuario_id']) ? intval($data['usuario_id']) : 0;
    $servicio = isset($data['servicio']) ? $data['servicio'] : '';
    $observaciones = isset($data['observaciones']) ? $data['observaciones'] : '';

    if ($paciente_id && $usuario_id && $servicio) {
        $stmt = $conn->prepare("INSERT INTO atenciones (paciente_id, usuario_id, servicio, observaciones) VALUES (?, ?, ?, ?)");
        $stmt->bind_param('iiss', $paciente_id, $usuario_id, $servicio, $observaciones);
        if ($stmt->execute()) {
            echo json_encode(['success' => true, 'id' => $conn->insert_id]);
        } else {
            echo json_encode(['success' => false, 'error' => $stmt->error]);
        }
        $stmt->close();
    } else {
        echo json_encode(['success' => false, 'error' => 'Datos incompletos']);
    }
    exit;
}

// Si se quiere listar atenciones, se puede agregar aquí un GET
http_response_code(405);
echo json_encode(['success' => false, 'error' => 'Método no permitido']);
