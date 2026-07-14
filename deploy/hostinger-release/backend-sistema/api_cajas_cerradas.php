<?php
require_once __DIR__ . '/init_api.php';
require_once 'config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Método no permitido']);
    exit;
}

try {
    // Verificar autenticación
    if (!isset($_SESSION['usuario'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'No autenticado']);
        exit;
    }

    // Verificar que sea administrador
    if ($_SESSION['usuario']['rol'] !== 'administrador') {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Solo los administradores pueden ver cajas cerradas']);
        exit;
    }

    // Obtener cajas cerradas con detalles
    $sql = "SELECT 
        c.id,
        c.fecha,
        c.hora_apertura,
        c.hora_cierre,
        c.monto_apertura,
        c.monto_cierre,
        c.diferencia,
        c.observaciones_cierre,
        u.nombre as usuario_nombre,
        c.turno
        FROM cajas c
        LEFT JOIN usuarios u ON c.usuario_id = u.id
        WHERE c.estado = 'cerrada'
        ORDER BY c.fecha DESC, c.hora_cierre DESC
        LIMIT 20";
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute();
    $cajas = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Obtener historial de reaperturas para contexto
    $sqlReaperturas = "SELECT 
        lr.caja_id,
        lr.fecha_reapertura,
        lr.usuario_nombre,
        lr.motivo
        FROM log_reaperturas lr
        ORDER BY lr.fecha_reapertura DESC
        LIMIT 10";
    
    $stmtReaperturas = $pdo->prepare($sqlReaperturas);
    $stmtReaperturas->execute();
    $reaperturas = $stmtReaperturas->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'success' => true,
        'cajas_cerradas' => $cajas,
        'historial_reaperturas' => $reaperturas
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