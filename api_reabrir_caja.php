<?php
require_once __DIR__ . '/init_api.php';
require_once 'config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Método no permitido']);
    exit;
}

try {
    // Verificar autenticación
    if (!isset($_SESSION['usuario'])) {
        http_response_code(401);
        echo json_encode([
            'success' => false, 
            'error' => 'No autenticado'
        ]);
        exit;
    }

    // Verificar que sea administrador
    if ($_SESSION['usuario']['rol'] !== 'administrador') {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Solo los administradores pueden reabrir cajas']);
        exit;
    }

    // Obtener datos del POST
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!$input || !isset($input['caja_id'])) {
        echo json_encode(['success' => false, 'error' => 'ID de caja requerido']);
        exit;
    }

    $caja_id = intval($input['caja_id']);
    $motivo = trim($input['motivo'] ?? 'Reapertura administrativa');

    // Verificar que la caja existe y está cerrada
    $sqlVerificar = "SELECT * FROM cajas WHERE id = ? AND estado = 'cerrada'";
    $stmtVerificar = $pdo->prepare($sqlVerificar);
    $stmtVerificar->execute([$caja_id]);
    $caja = $stmtVerificar->fetch(PDO::FETCH_ASSOC);

    if (!$caja) {
        echo json_encode(['success' => false, 'error' => 'Caja no encontrada o ya está abierta']);
        exit;
    }

    try {
        // Crear tabla de log de reaperturas si no existe (sin foreign keys para evitar conflictos)
        $sqlCreateLog = "CREATE TABLE IF NOT EXISTS log_reaperturas (
            id INT PRIMARY KEY AUTO_INCREMENT,
            caja_id INT NOT NULL,
            fecha_reapertura TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            usuario_id INT NOT NULL,
            usuario_nombre VARCHAR(100),
            motivo TEXT,
            datos_cierre_anterior TEXT,
            INDEX idx_caja_id (caja_id),
            INDEX idx_usuario_id (usuario_id)
        )";
        $pdo->exec($sqlCreateLog);

        // Guardar datos del cierre anterior para auditoría
        $datosAnteriores = json_encode([
            'hora_cierre' => $caja['hora_cierre'],
            'monto_cierre' => $caja['monto_cierre'],
            'diferencia' => $caja['diferencia'],
            'observaciones_cierre' => $caja['observaciones_cierre']
        ]);

        // Registrar la reapertura en el log
        $sqlLog = "INSERT INTO log_reaperturas (
            caja_id, 
            usuario_id, 
            usuario_nombre, 
            motivo, 
            datos_cierre_anterior
        ) VALUES (?, ?, ?, ?, ?)";
        
        $stmtLog = $pdo->prepare($sqlLog);
        $stmtLog->execute([
            $caja_id,
            $_SESSION['usuario']['id'],
            $_SESSION['usuario']['nombre'] ?? $_SESSION['usuario']['username'],
            $motivo,
            $datosAnteriores
        ]);

        // Reabrir la caja: cambiar estado a 'abierta'
        $sqlReabrir = "UPDATE cajas SET 
            estado = 'abierta',
            hora_cierre = NULL,
            observaciones_cierre = NULL,
            monto_cierre = NULL,
            diferencia = NULL
            WHERE id = ?";
        $stmtReabrir = $pdo->prepare($sqlReabrir);
        $stmtReabrir->execute([$caja_id]);

        echo json_encode([
            'success' => true,
            'message' => 'Caja reabierta exitosamente',
            'caja_id' => $caja_id,
            'fecha_reapertura' => date('Y-m-d H:i:s'),
            'usuario' => $_SESSION['usuario']['nombre'] ?? $_SESSION['usuario']['username']
        ]);

    } catch (Exception $e) {
        throw $e;
    }

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Error de base de datos: ' . $e->getMessage()
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Error del servidor: ' . $e->getMessage()
    ]);
}
?>