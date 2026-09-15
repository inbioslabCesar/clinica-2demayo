<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

if (!isset($_SESSION['usuario']) || !is_array($_SESSION['usuario'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Usuario no autenticado']);
    exit;
}

function sesionEsAdmin(): bool
{
    $rol = strtolower(trim((string)($_SESSION['usuario']['rol'] ?? '')));
    return $rol === 'administrador' || $rol === 'admin';
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
        $scope = strtolower(trim((string)($_GET['scope'] ?? '')));
        if ($scope === 'admin_pendientes') {
            if (!sesionEsAdmin()) {
                http_response_code(403);
                echo json_encode(['success' => false, 'error' => 'No autorizado']);
                exit;
            }

            $stmt = $pdo->query("SELECT
                    ct.id,
                    ct.caja_origen_id,
                    ct.caja_destino_id,
                    ct.usuario_entrega_id,
                    ct.usuario_recibe_id,
                    ct.monto,
                    ct.estado,
                    ct.observaciones,
                    ct.fecha_entrega,
                    ct.fecha_recepcion,
                    ue.nombre AS entrega_nombre,
                    ur.nombre AS recibe_nombre,
                    ur.rol AS recibe_rol,
                    (
                        SELECT c2.id
                        FROM cajas c2
                        WHERE c2.usuario_id = ct.usuario_recibe_id AND c2.estado = 'abierta'
                        ORDER BY c2.created_at DESC
                        LIMIT 1
                    ) AS caja_abierta_destino_id
                FROM caja_traspasos ct
                LEFT JOIN usuarios ue ON ue.id = ct.usuario_entrega_id
                LEFT JOIN usuarios ur ON ur.id = ct.usuario_recibe_id
                WHERE ct.estado = 'pendiente'
                ORDER BY ct.fecha_entrega ASC");

            echo json_encode([
                'success' => true,
                'pendientes' => $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [],
            ]);
            exit;
        }

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
    $action = strtolower(trim((string)($input['action'] ?? '')));

    if ($action === 'regularizar_pendiente_admin') {
        if (!sesionEsAdmin()) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'No autorizado']);
            exit;
        }

        $traspasoId = (int)($input['traspaso_id'] ?? 0);
        if ($traspasoId <= 0) {
            http_response_code(422);
            echo json_encode(['success' => false, 'error' => 'Traspaso inválido']);
            exit;
        }

        $stmtTraspaso = $pdo->prepare("SELECT id, usuario_recibe_id FROM caja_traspasos WHERE id = ? AND estado = 'pendiente' LIMIT 1");
        $stmtTraspaso->execute([$traspasoId]);
        $traspaso = $stmtTraspaso->fetch(PDO::FETCH_ASSOC);
        if (!$traspaso) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'El traspaso ya no está pendiente o no existe']);
            exit;
        }

        $usuarioRecibeId = (int)($traspaso['usuario_recibe_id'] ?? 0);
        $stmtCajaAbiertaDestino = $pdo->prepare("SELECT id
            FROM cajas
            WHERE usuario_id = ? AND estado = 'abierta'
            ORDER BY created_at DESC
            LIMIT 1");
        $stmtCajaAbiertaDestino->execute([$usuarioRecibeId]);
        $cajaDestinoId = (int)$stmtCajaAbiertaDestino->fetchColumn();
        if ($cajaDestinoId <= 0) {
            $cajaDestinoId = null;
        }

        $adminId = (int)($_SESSION['usuario']['id'] ?? 0);
        $marcaAdmin = 'Recepción manual por admin #' . $adminId;
        $stmtRecibir = $pdo->prepare("UPDATE caja_traspasos
            SET
                caja_destino_id = COALESCE(?, caja_destino_id),
                estado = 'recibido',
                fecha_recepcion = NOW(),
                observaciones = TRIM(CONCAT(COALESCE(observaciones, ''), CASE WHEN COALESCE(observaciones, '') <> '' THEN ' | ' ELSE '' END, ?))
            WHERE id = ? AND estado = 'pendiente'");
        $stmtRecibir->execute([$cajaDestinoId, $marcaAdmin, $traspasoId]);

        if ($stmtRecibir->rowCount() <= 0) {
            http_response_code(409);
            echo json_encode(['success' => false, 'error' => 'No se pudo regularizar el traspaso']);
            exit;
        }

        echo json_encode([
            'success' => true,
            'traspaso_id' => $traspasoId,
            'caja_destino_id' => $cajaDestinoId,
            'message' => 'Traspaso regularizado manualmente',
        ]);
        exit;
    }

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

    $stmtCajaDestinoAbierta = $pdo->prepare("SELECT c.id, c.hora_apertura, c.fecha, u.nombre
        FROM cajas c
        LEFT JOIN usuarios u ON u.id = c.usuario_id
        WHERE c.usuario_id = ? AND c.estado = 'abierta'
        ORDER BY c.created_at DESC
        LIMIT 1");
    $stmtCajaDestinoAbierta->execute([$usuarioDestinoId]);
    $cajaDestinoAbierta = $stmtCajaDestinoAbierta->fetch(PDO::FETCH_ASSOC);
    if ($cajaDestinoAbierta) {
        $destinoNombre = trim((string)($cajaDestinoAbierta['nombre'] ?? ''));
        $destinoNombre = $destinoNombre !== '' ? $destinoNombre : 'El responsable seleccionado';
        throw new RuntimeException($destinoNombre . ' ya tiene una caja abierta. No puede recibir un traspaso pendiente hasta su próxima apertura de caja.');
    }

    $stmtPendiente = $pdo->prepare("SELECT ct.id, ct.monto, ct.fecha_entrega, u.nombre AS receptor_nombre
        FROM caja_traspasos ct
        LEFT JOIN usuarios u ON u.id = ct.usuario_recibe_id
        WHERE ct.usuario_recibe_id = ? AND ct.estado = 'pendiente'
        ORDER BY ct.fecha_entrega ASC
        LIMIT 1");
    $stmtPendiente->execute([$usuarioDestinoId]);
    $pendiente = $stmtPendiente->fetch(PDO::FETCH_ASSOC);
    if ($pendiente) {
        $receptorNombre = trim((string)($pendiente['receptor_nombre'] ?? ''));
        $montoPendiente = number_format((float)($pendiente['monto'] ?? 0), 2, '.', '');
        $fechaEntregaRaw = (string)($pendiente['fecha_entrega'] ?? '');
        $fechaEntrega = $fechaEntregaRaw !== '' ? date('d/m/Y H:i', strtotime($fechaEntregaRaw)) : 'fecha no disponible';

        $detalleReceptor = $receptorNombre !== '' ? $receptorNombre : 'El responsable seleccionado';
        throw new RuntimeException($detalleReceptor . ' ya tiene un traspaso pendiente de S/ ' . $montoPendiente . ' (entregado el ' . $fechaEntrega . '). Primero debe recibirlo al abrir su caja.');
    }

    $stmt = $pdo->prepare("INSERT INTO caja_traspasos (caja_origen_id, usuario_entrega_id, usuario_recibe_id, monto, observaciones) VALUES (?, ?, ?, ?, ?)");
    $stmt->execute([$cajaOrigenId, $usuarioId, $usuarioDestinoId, $monto, $observaciones]);
    echo json_encode(['success' => true, 'traspaso_id' => (int)$pdo->lastInsertId(), 'message' => 'Traspaso pendiente de recepción registrado']);
} catch (Throwable $e) {
    error_log('api_caja_traspasos.php: ' . $e->getMessage());
    http_response_code(422);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
