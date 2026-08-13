<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

if (!isset($_SESSION['usuario']) || !is_array($_SESSION['usuario'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Usuario no autenticado']);
    exit;
}

function asegurarTablaTraspasos(PDO $pdo): void
{
    $pdo->exec("CREATE TABLE IF NOT EXISTS caja_traspasos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        caja_origen_id INT NOT NULL,
        caja_destino_id INT NULL,
        usuario_entrega_id INT NOT NULL,
        usuario_recibe_id INT NOT NULL,
        monto DECIMAL(12,2) NOT NULL,
        estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
        observaciones TEXT NULL,
        fecha_entrega DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        fecha_recepcion DATETIME NULL,
        INDEX idx_ct_destino (usuario_recibe_id, estado),
        INDEX idx_ct_origen (caja_origen_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

try {
    asegurarTablaTraspasos($pdo);
    $usuarioId = (int)($_SESSION['usuario']['id'] ?? 0);
    $method = $_SERVER['REQUEST_METHOD'];

    if ($method === 'GET') {
        $stmt = $pdo->prepare("SELECT ct.*, u.nombre AS entrega_nombre
            FROM caja_traspasos ct
            LEFT JOIN usuarios u ON u.id = ct.usuario_entrega_id
            WHERE ct.usuario_recibe_id = ? AND ct.estado = 'pendiente'
            ORDER BY ct.fecha_entrega ASC LIMIT 1");
        $stmt->execute([$usuarioId]);
        echo json_encode(['success' => true, 'traspaso' => $stmt->fetch(PDO::FETCH_ASSOC) ?: null]);
        exit;
    }

    if ($method !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Metodo no permitido']);
        exit;
    }

    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $usuarioDestinoId = (int)($input['usuario_destino_id'] ?? 0);
    $monto = (float)($input['monto'] ?? 0);
    $observaciones = trim((string)($input['observaciones'] ?? ''));
    if ($usuarioDestinoId <= 0 || $usuarioDestinoId === $usuarioId || $monto <= 0) {
        http_response_code(422);
        echo json_encode(['success' => false, 'error' => 'Destino y monto de traspaso invalidos']);
        exit;
    }

    $stmtCaja = $pdo->prepare("SELECT id FROM cajas WHERE usuario_id = ? AND estado = 'abierta' ORDER BY created_at DESC LIMIT 1");
    $stmtCaja->execute([$usuarioId]);
    $cajaOrigenId = (int)$stmtCaja->fetchColumn();
    if ($cajaOrigenId <= 0) {
        throw new RuntimeException('No tienes una caja abierta para entregar el fondo');
    }

    $stmtPendiente = $pdo->prepare("SELECT id FROM caja_traspasos WHERE usuario_recibe_id = ? AND estado = 'pendiente' LIMIT 1");
    $stmtPendiente->execute([$usuarioDestinoId]);
    if ($stmtPendiente->fetchColumn()) {
        throw new RuntimeException('El responsable seleccionado ya tiene un traspaso pendiente');
    }

    $stmt = $pdo->prepare("INSERT INTO caja_traspasos (caja_origen_id, usuario_entrega_id, usuario_recibe_id, monto, observaciones) VALUES (?, ?, ?, ?, ?)");
    $stmt->execute([$cajaOrigenId, $usuarioId, $usuarioDestinoId, $monto, $observaciones]);
    echo json_encode(['success' => true, 'traspaso_id' => (int)$pdo->lastInsertId(), 'message' => 'Traspaso pendiente de recepción registrado']);
} catch (Throwable $e) {
    error_log('api_caja_traspasos.php: ' . $e->getMessage());
    http_response_code(422);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
