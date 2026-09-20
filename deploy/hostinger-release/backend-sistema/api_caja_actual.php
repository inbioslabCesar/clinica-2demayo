<?php
require_once __DIR__ . '/init_api.php';

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/caja_autocierre.php';

try {
    // Verificar autenticación
    if (!isset($_SESSION['usuario'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'No autenticado']);
        exit;
    }

    caja_auto_cerrar_vencidas($pdo);

    // Obtener caja abierta actual
    $sql = "SELECT c.*, u.nombre as usuario_nombre,
                COALESCE(SUM(CASE WHEN LOWER(TRIM(i.metodo_pago)) = 'efectivo' THEN i.monto ELSE 0 END), 0) AS total_efectivo_rt,
                COALESCE(SUM(CASE WHEN LOWER(TRIM(i.metodo_pago)) = 'tarjeta' THEN i.monto ELSE 0 END), 0) AS total_tarjetas_rt,
                COALESCE(SUM(CASE WHEN LOWER(TRIM(i.metodo_pago)) IN ('transferencia','yape','plin') THEN i.monto ELSE 0 END), 0) AS total_transferencias_rt,
                COALESCE(SUM(CASE WHEN LOWER(TRIM(i.metodo_pago)) NOT IN ('efectivo','tarjeta','transferencia','yape','plin') THEN i.monto ELSE 0 END), 0) AS total_otros_rt
        FROM cajas c 
        LEFT JOIN usuarios u ON c.usuario_id = u.id 
        LEFT JOIN ingresos_diarios i ON i.caja_id = c.id
        WHERE c.estado = 'abierta' AND c.usuario_id = :usuario_id
        GROUP BY c.id
        ORDER BY c.created_at DESC 
        LIMIT 1";
    $stmt = $pdo->prepare($sql);
    $stmt->execute(['usuario_id' => $_SESSION['usuario']['id']]);
    $caja = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($caja) {
        // En caja abierta, mostrar siempre total en tiempo real calculado desde ingresos_diarios.
        $caja['total_efectivo'] = round((float)($caja['total_efectivo_rt'] ?? 0), 2);
        $caja['total_tarjetas'] = round((float)($caja['total_tarjetas_rt'] ?? 0), 2);
        $caja['total_transferencias'] = round((float)($caja['total_transferencias_rt'] ?? 0), 2);
        $caja['total_otros'] = round((float)($caja['total_otros_rt'] ?? 0), 2);
        $caja['total_dia'] = round(
            $caja['total_efectivo'] +
            $caja['total_tarjetas'] +
            $caja['total_transferencias'] +
            $caja['total_otros'],
            2
        );
        unset(
            $caja['total_efectivo_rt'],
            $caja['total_tarjetas_rt'],
            $caja['total_transferencias_rt'],
            $caja['total_otros_rt']
        );

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