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

    $caja_id = isset($_GET['caja_id']) ? intval($_GET['caja_id']) : null;

    if (!$caja_id) {
        echo json_encode(['success' => false, 'error' => 'ID de caja requerido']);
        exit;
    }

    // Obtener ingresos diarios de la caja
    $sql = "SELECT 
                id.tipo_ingreso,
                id.area,
                id.descripcion,
                id.monto,
                id.metodo_pago,
                id.paciente_nombre,
                id.fecha_hora,
                u.nombre as usuario_nombre
            FROM ingresos_diarios id
            LEFT JOIN usuarios u ON id.usuario_id = u.id
            WHERE id.caja_id = ?
            ORDER BY id.fecha_hora ASC";
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$caja_id]);
    $ingresos = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'success' => true,
        'ingresos' => $ingresos
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