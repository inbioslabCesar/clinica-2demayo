<?php
require_once __DIR__ . '/init_api.php';

require_once 'db.php';
require_once __DIR__ . '/caja_autocierre.php';
require_once __DIR__ . '/caja_estado_helper.php';

try {
    // Verificar si el usuario está autenticado
    if (!isset($_SESSION['usuario']) || !is_array($_SESSION['usuario'])) {
        echo json_encode(['success' => false, 'error' => 'Usuario no autenticado']);
        exit;
    }

    $usuario_id = intval($_SESSION['usuario']['id']);
    caja_auto_cerrar_vencidas($pdo);
    $estadoCaja = caja_obtener_estado_actual($pdo, $usuario_id, date('Y-m-d'));
    echo json_encode([
        'success' => true,
        'caja' => $estadoCaja['caja'],
        'estado' => $estadoCaja['estado']
    ]);

} catch (Exception $e) {
    error_log("Error en api_caja_estado.php: " . $e->getMessage());
    echo json_encode([
        'success' => false,
        'error' => 'Error interno del servidor'
    ]);
}
?>