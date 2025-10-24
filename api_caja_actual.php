<?php
header('Access-Control-Allow-Origin: http://localhost:5173');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json');

// Manejar preflight OPTIONS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

session_start();

require_once 'config.php';

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
            WHERE c.estado = 'abierta' 
            ORDER BY c.created_at DESC 
            LIMIT 1";
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute();
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