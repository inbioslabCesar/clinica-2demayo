<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

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

    $fechaHoy = date('Y-m-d');

    $stmt = $pdo->prepare(
        "SELECT id, fecha, estado, turno, monto_apertura, hora_apertura
         FROM cajas
         WHERE fecha = :fecha_hoy
           AND usuario_id = :usuario_id
           AND estado <> 'cerrada'
         ORDER BY created_at DESC
         LIMIT 1"
    );
    $stmt->execute([
        ':fecha_hoy' => $fechaHoy,
        ':usuario_id' => $usuarioId,
    ]);
    $caja = $stmt->fetch(PDO::FETCH_ASSOC) ?: null;

    echo json_encode([
        'success' => true,
        'caja_abierta' => $caja !== null,
        'fecha_hoy' => $fechaHoy,
        'caja' => $caja,
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Error interno del servidor',
        'caja_abierta' => false,
    ]);
}
