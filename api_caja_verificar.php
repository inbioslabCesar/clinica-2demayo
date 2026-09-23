<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/caja_autocierre.php';
require_once __DIR__ . '/caja_estado_helper.php';

try {
    if (!isset($_SESSION['usuario']) || !is_array($_SESSION['usuario'])) {
        http_response_code(401);
        echo json_encode([
            'success' => false,
            'error' => 'Usuario no autenticado',
            'caja_abierta' => false,
        ]);
        exit;
    }

    $rol = strtolower(trim((string)($_SESSION['usuario']['rol'] ?? '')));
    if (!in_array($rol, ['administrador', 'recepcionista'], true)) {
        http_response_code(403);
        echo json_encode([
            'success' => false,
            'error' => 'Rol no autorizado para verificar caja',
            'caja_abierta' => false,
        ]);
        exit;
    }

    $usuarioId = intval($_SESSION['usuario']['id'] ?? 0);
    if ($usuarioId <= 0) {
        http_response_code(422);
        echo json_encode([
            'success' => false,
            'error' => 'Usuario inválido',
            'caja_abierta' => false,
        ]);
        exit;
    }

    caja_auto_cerrar_vencidas($pdo);

    $estadoCaja = caja_obtener_estado_actual($pdo, $usuarioId, date('Y-m-d'));

    echo json_encode([
        'success' => true,
        'caja_abierta' => (bool)$estadoCaja['caja_abierta'],
        'fecha_hoy' => $estadoCaja['fecha_hoy'],
        'caja' => $estadoCaja['caja'],
    ]);
} catch (Throwable $e) {
    if (function_exists('api_log_server_error')) {
        api_log_server_error('api-caja-verificar', $e->getMessage(), $e->getFile(), (int)$e->getLine());
    }

    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Error interno del servidor',
        'request_id' => function_exists('api_request_id') ? api_request_id() : null,
        'caja_abierta' => false,
    ]);
}
