<?php
require_once __DIR__ . '/init_api.php';

require_once 'db.php';

try {
    // Verificar si el usuario está autenticado
    if (!isset($_SESSION['usuario']) || !is_array($_SESSION['usuario'])) {
        echo json_encode(['success' => false, 'error' => 'Usuario no autenticado']);
        exit;
    }

    $usuario_id = intval($_SESSION['usuario']['id']);
    $fecha_hoy = date('Y-m-d');
    error_log("[DEBUG] api_caja_estado.php - fecha_hoy: $fecha_hoy, usuario_id: $usuario_id");

    // Depuración: mostrar todas las cajas de hoy para el usuario
    $sqlDebug = "SELECT id, fecha, usuario_id, estado FROM cajas WHERE fecha = ? AND usuario_id = ? ORDER BY created_at DESC";
    $stmtDebug = $pdo->prepare($sqlDebug);
    $stmtDebug->execute([$fecha_hoy, $usuario_id]);
    $debugCajas = $stmtDebug->fetchAll(PDO::FETCH_ASSOC);
    error_log('[DEBUG] api_caja_estado.php - registros encontrados: ' . json_encode($debugCajas));

    // Buscar caja abierta para el usuario en el día actual
    $stmt = $pdo->prepare("
        SELECT 
            id,
            fecha,
            estado,
            monto_apertura,
            hora_apertura,
            total_efectivo,
            total_tarjetas,
            total_transferencias,
            total_otros,
            (total_efectivo + total_tarjetas + total_transferencias + total_otros) as total_dia,
            observaciones_apertura
        FROM cajas 
        WHERE fecha = ? AND usuario_id = ? AND estado != 'cerrada'
        ORDER BY created_at DESC 
        LIMIT 1
    ");
    $stmt->execute([$fecha_hoy, $usuario_id]);
    $caja = $stmt->fetch(PDO::FETCH_ASSOC);
    error_log("[DEBUG] api_caja_estado.php - resultado consulta caja: " . json_encode($caja));
    if ($caja) {
        if (isset($caja['usuario_id'])) {
            error_log("[DEBUG] api_caja_estado.php - usuario_id sesión: $usuario_id, usuario_id caja: " . $caja['usuario_id']);
        }
    }

    if ($caja) {
        // Formatear hora de apertura
        $caja['hora_apertura'] = date('H:i', strtotime($caja['hora_apertura']));
        
        echo json_encode([
            'success' => true,
            'caja' => $caja,
            'estado' => 'abierta'
        ]);
    } else {
        echo json_encode([
            'success' => true,
            'caja' => null,
            'estado' => 'cerrada'
        ]);
    }

} catch (Exception $e) {
    error_log("Error en api_caja_estado.php: " . $e->getMessage());
    echo json_encode([
        'success' => false,
        'error' => 'Error interno del servidor'
    ]);
}
?>