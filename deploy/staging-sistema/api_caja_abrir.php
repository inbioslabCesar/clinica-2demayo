<?php
require_once __DIR__ . '/init_api.php';

require_once 'db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['success' => false, 'error' => 'Método no permitido']);
    exit;
}

try {
    // Verificar autenticación
    if (!isset($_SESSION['usuario']) || !is_array($_SESSION['usuario'])) {
        echo json_encode(['success' => false, 'error' => 'Usuario no autenticado']);
        exit;
    }


    $usuario_id = $_SESSION['usuario']['id'];
    $fecha_hoy = date('Y-m-d');
    $hora_actual = date('H:i:s');
    $input = json_decode(file_get_contents('php://input'), true);
    $monto_apertura = floatval($input['monto_apertura'] ?? 0);
    $observaciones = trim($input['observaciones'] ?? '');
    $turno = isset($input['turno']) ? trim($input['turno']) : '';

    // Validaciones
    if ($monto_apertura < 0) {
        echo json_encode(['success' => false, 'error' => 'El monto de apertura no puede ser negativo']);
        exit;
    }
    if ($turno === '') {
        echo json_encode(['success' => false, 'error' => 'Debe especificar el turno']);
        exit;
    }

    // Crear nueva caja (sin restricción por fecha ni hora)
    $stmt = $pdo->prepare("
        INSERT INTO cajas (
            fecha, 
            usuario_id, 
            estado, 
            monto_apertura, 
            hora_apertura, 
            observaciones_apertura,
            turno,
            total_efectivo,
            total_tarjetas,
            total_transferencias,
            total_otros
        ) VALUES (?, ?, 'abierta', ?, ?, ?, ?, 0.00, 0.00, 0.00, 0.00)
    ");

    $stmt->execute([
        $fecha_hoy,
        $usuario_id,
        $monto_apertura,
        $hora_actual,
        $observaciones,
        $turno
    ]);

    $caja_id = $pdo->lastInsertId();

    // Obtener información del usuario para el log
    $stmt = $pdo->prepare("SELECT nombre FROM usuarios WHERE id = ?");
    $stmt->execute([$usuario_id]);
    $usuario = $stmt->fetch(PDO::FETCH_ASSOC);

    // Log de la acción
    error_log("Caja abierta - ID: $caja_id, Usuario: {$usuario['nombre']}, Monto: $monto_apertura");

    echo json_encode([
        'success' => true,
        'message' => 'Caja abierta exitosamente',
        'caja_id' => $caja_id,
        'fecha' => $fecha_hoy,
        'hora_apertura' => date('H:i', strtotime($hora_actual)),
        'monto_apertura' => $monto_apertura
    ]);

} catch (Exception $e) {
    error_log("Error en api_caja_abrir.php: " . $e->getMessage());
    
    // Manejo específico de error de restricción única
    if (strpos($e->getMessage(), 'Duplicate entry') !== false && strpos($e->getMessage(), 'unique_fecha_usuario') !== false) {
        echo json_encode([
            'success' => false,
            'error' => 'Ya existe una caja para este usuario en la fecha actual. Para abrir una nueva caja, primero debe cerrar o reabrir la caja existente.'
        ]);
    } else {
        echo json_encode([
            'success' => false,
            'error' => 'Error interno del servidor: ' . $e->getMessage()
        ]);
    }
}
?>