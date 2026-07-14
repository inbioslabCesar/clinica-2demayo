<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Metodo no permitido']);
    exit;
}

if (!isset($_SESSION['usuario']) || !is_array($_SESSION['usuario'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Usuario no autenticado']);
    exit;
}

if (!function_exists('caja_table_exists')) {
    function caja_table_exists(PDO $pdo, string $tableName): bool
    {
        static $cache = [];
        $key = strtolower(trim($tableName));
        if ($key === '') return false;
        if (array_key_exists($key, $cache)) return $cache[$key];

        try {
            $stmt = $pdo->prepare('SHOW TABLES LIKE ?');
            $stmt->execute([$tableName]);
            $cache[$key] = (bool)$stmt->fetchColumn();
        } catch (Throwable $e) {
            $cache[$key] = false;
        }
        return $cache[$key];
    }
}

try {
    $usuario = $_SESSION['usuario'];
    $usuarioId = (int)($usuario['id'] ?? 0);
    $rol = strtolower(trim((string)($usuario['rol'] ?? '')));

    if ($usuarioId <= 0) {
        http_response_code(422);
        echo json_encode(['success' => false, 'error' => 'Usuario invalido']);
        exit;
    }

    if (!in_array($rol, ['administrador', 'recepcionista'], true)) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Rol no autorizado para corregir apertura']);
        exit;
    }

    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $cajaId = (int)($input['caja_id'] ?? 0);
    $nuevoMonto = (float)($input['nuevo_monto_apertura'] ?? -1);
    $motivo = trim((string)($input['motivo'] ?? ''));

    if ($nuevoMonto < 0) {
        echo json_encode(['success' => false, 'error' => 'El monto de apertura no puede ser negativo']);
        exit;
    }

    if ($cajaId <= 0) {
        $stmtCaja = $pdo->prepare(
            'SELECT * FROM cajas WHERE usuario_id = ? AND estado = "abierta" ORDER BY created_at DESC LIMIT 1'
        );
        $stmtCaja->execute([$usuarioId]);
    } else {
        $stmtCaja = $pdo->prepare('SELECT * FROM cajas WHERE id = ? LIMIT 1');
        $stmtCaja->execute([$cajaId]);
    }

    $caja = $stmtCaja->fetch(PDO::FETCH_ASSOC);
    if (!$caja) {
        echo json_encode(['success' => false, 'error' => 'Caja no encontrada']);
        exit;
    }

    $cajaId = (int)($caja['id'] ?? 0);
    $cajaUsuarioId = (int)($caja['usuario_id'] ?? 0);
    $estadoCaja = strtolower(trim((string)($caja['estado'] ?? '')));

    if ($estadoCaja !== 'abierta') {
        echo json_encode(['success' => false, 'error' => 'Solo se puede corregir apertura en cajas abiertas']);
        exit;
    }

    if ($rol !== 'administrador' && $cajaUsuarioId !== $usuarioId) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Solo puedes corregir tu propia caja']);
        exit;
    }

    $montoAnterior = (float)($caja['monto_apertura'] ?? 0);
    if (abs($montoAnterior - $nuevoMonto) < 0.00001) {
        echo json_encode([
            'success' => true,
            'message' => 'No se realizaron cambios (mismo monto de apertura)',
            'caja_id' => $cajaId,
            'monto_apertura' => $montoAnterior,
            'sin_cambios' => true,
        ]);
        exit;
    }

    $countIngresos = 0;
    if (caja_table_exists($pdo, 'ingresos_diarios')) {
        $stmtIngresos = $pdo->prepare('SELECT COUNT(*) FROM ingresos_diarios WHERE caja_id = ?');
        $stmtIngresos->execute([$cajaId]);
        $countIngresos = (int)$stmtIngresos->fetchColumn();
    }

    $countEgresos = 0;
    if (caja_table_exists($pdo, 'egresos')) {
        $stmtEgresos = $pdo->prepare('SELECT COUNT(*) FROM egresos WHERE caja_id = ?');
        $stmtEgresos->execute([$cajaId]);
        $countEgresos = (int)$stmtEgresos->fetchColumn();
    }

    $countLabRef = 0;
    if (caja_table_exists($pdo, 'laboratorio_referencia_movimientos')) {
        $stmtLabRef = $pdo->prepare('SELECT COUNT(*) FROM laboratorio_referencia_movimientos WHERE caja_id = ?');
        $stmtLabRef->execute([$cajaId]);
        $countLabRef = (int)$stmtLabRef->fetchColumn();
    }

    $tieneMovimientos = ($countIngresos + $countEgresos + $countLabRef) > 0;

    if ($tieneMovimientos) {
        if ($rol !== 'administrador') {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'error' => 'La caja ya tiene movimientos. Solo un administrador puede corregir apertura en este caso.',
                'requiere_admin' => true,
            ]);
            exit;
        }

        if ($motivo === '' || mb_strlen($motivo) < 10) {
            echo json_encode([
                'success' => false,
                'error' => 'Motivo obligatorio (minimo 10 caracteres) para corregir una caja con movimientos',
                'requiere_motivo' => true,
            ]);
            exit;
        }
    }

    if ($motivo === '') {
        $motivo = 'Correccion administrativa de monto de apertura';
    }

    $auditWarning = '';
    $pdo->beginTransaction();

    if (!caja_table_exists($pdo, 'log_caja_correcciones_apertura')) {
        try {
            $pdo->exec(
                'CREATE TABLE IF NOT EXISTS log_caja_correcciones_apertura (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    caja_id INT NOT NULL,
                    usuario_id INT NOT NULL,
                    usuario_nombre VARCHAR(120) DEFAULT NULL,
                    rol_usuario VARCHAR(40) DEFAULT NULL,
                    monto_anterior DECIMAL(12,2) NOT NULL DEFAULT 0,
                    monto_nuevo DECIMAL(12,2) NOT NULL DEFAULT 0,
                    tiene_movimientos TINYINT(1) NOT NULL DEFAULT 0,
                    motivo TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_caja_id (caja_id),
                    INDEX idx_usuario_id (usuario_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
            );
        } catch (Throwable $e) {
            $auditWarning = 'No se pudo crear la tabla de auditoria de correcciones';
            error_log('api_caja_corregir_apertura.php create audit table warning: ' . $e->getMessage());
        }
    }

    $stmtUpdate = $pdo->prepare('UPDATE cajas SET monto_apertura = ? WHERE id = ? LIMIT 1');
    $stmtUpdate->execute([$nuevoMonto, $cajaId]);

    if (caja_table_exists($pdo, 'log_caja_correcciones_apertura')) {
        $stmtLog = $pdo->prepare(
            'INSERT INTO log_caja_correcciones_apertura
             (caja_id, usuario_id, usuario_nombre, rol_usuario, monto_anterior, monto_nuevo, tiene_movimientos, motivo)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmtLog->execute([
            $cajaId,
            $usuarioId,
            (string)($usuario['nombre'] ?? $usuario['username'] ?? ''),
            $rol,
            $montoAnterior,
            $nuevoMonto,
            $tieneMovimientos ? 1 : 0,
            $motivo,
        ]);
    } else {
        $auditWarning = $auditWarning !== '' ? $auditWarning : 'No se encontro tabla de auditoria para registrar el cambio';
    }

    $pdo->commit();

    echo json_encode([
        'success' => true,
        'message' => 'Monto de apertura corregido correctamente',
        'caja_id' => $cajaId,
        'monto_anterior' => $montoAnterior,
        'monto_nuevo' => $nuevoMonto,
        'tiene_movimientos' => $tieneMovimientos,
        'audit_warning' => $auditWarning,
    ]);
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log('api_caja_corregir_apertura.php error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Error interno al corregir apertura',
    ]);
}
