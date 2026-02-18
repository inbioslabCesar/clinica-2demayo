<?php
require_once __DIR__ . '/init_api.php';
require_once 'config.php';

try {
    // Verificar autenticación
    if (!isset($_SESSION['usuario'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'No autenticado']);
        exit;
    }

    // Obtener métodos de pago activos
    $sql = "SELECT codigo, nombre, descripcion 
            FROM metodos_pago 
            WHERE activo = 1 
            ORDER BY orden_visualizacion, nombre";
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute();
    $metodos = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'success' => true,
        'metodos' => $metodos
    ]);

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