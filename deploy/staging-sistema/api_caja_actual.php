<?php
require_once __DIR__ . '/init_api.php';

require_once __DIR__ . '/config.php';

try {
    // Verificar autenticación
    if (!isset($_SESSION['usuario'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'No autenticado']);
        exit;
    }

    // Obtener caja abierta actual
    $sql = "SELECT c.*, u.nombre as usuario_nombre 
        FROM cajas c 
        LEFT JOIN usuarios u ON c.usuario_id = u.id 
        WHERE c.estado = 'abierta' AND c.usuario_id = :usuario_id
        ORDER BY c.created_at DESC 
        LIMIT 1";
    $stmt = $pdo->prepare($sql);
    $stmt->execute(['usuario_id' => $_SESSION['usuario']['id']]);
    $caja = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($caja) {
        echo json_encode([
            'success' => true,
            'caja' => $caja
        ]);
    } else {
        echo json_encode([
            'success' => false,
            'message' => 'No hay caja abierta'
        ]);
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