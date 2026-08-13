<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

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

$input = json_decode(file_get_contents('php://input'), true) ?: [];
$ids = isset($input['ids']) && is_array($input['ids']) ? $input['ids'] : [$input['id'] ?? 0];
$ids = array_values(array_unique(array_filter(array_map('intval', $ids), static function ($id) {
    return $id > 0;
})));
$metodoPago = strtolower(trim((string)($input['metodo_pago'] ?? 'efectivo')));
$fuenteFondos = strtolower(trim((string)($input['fuente_fondos'] ?? 'clinica')));
$terceroNombre = trim((string)($input['tercero_nombre'] ?? ''));
$referenciaPago = trim((string)($input['referencia_pago'] ?? ''));
$observaciones = trim((string)($input['observaciones'] ?? ''));

$metodosValidos = ['efectivo', 'yape', 'plin', 'transferencia', 'tarjeta', 'cheque', 'deposito'];
$fuentesValidas = ['clinica', 'tercero_directo', 'tercero_fondeo'];
if (empty($ids) || !in_array($metodoPago, $metodosValidos, true) || !in_array($fuenteFondos, $fuentesValidas, true)) {
    http_response_code(422);
    echo json_encode(['success' => false, 'error' => 'Datos de liquidacion invalidos']);
    exit;
}
if ($fuenteFondos !== 'clinica' && $terceroNombre === '') {
    http_response_code(422);
    echo json_encode(['success' => false, 'error' => 'Indica quien cubrio el pago externo']);
    exit;
}

function liquidar_honorario_asegurar_columna(mysqli $conn, string $tabla, string $columna, string $definicion): void
{
    $check = $conn->query("SHOW COLUMNS FROM {$tabla} LIKE '{$columna}'");
    if ($check && $check->num_rows === 0) {
        $conn->query("ALTER TABLE {$tabla} ADD COLUMN {$columna} {$definicion}");
    }
}

try {
    $usuario = $_SESSION['usuario'];
    $usuarioId = (int)($usuario['id'] ?? 0);
    if ($usuarioId <= 0) {
        throw new RuntimeException('Usuario invalido');
    }

    liquidar_honorario_asegurar_columna($conn, 'egresos', 'fuente_fondos', "VARCHAR(30) NOT NULL DEFAULT 'clinica'");
    liquidar_honorario_asegurar_columna($conn, 'egresos', 'tercero_nombre', 'VARCHAR(150) NULL');
    liquidar_honorario_asegurar_columna($conn, 'egresos', 'referencia_pago', 'VARCHAR(150) NULL');
    liquidar_honorario_asegurar_columna($conn, 'honorarios_medicos_movimientos', 'fuente_pago_medico', "VARCHAR(30) NOT NULL DEFAULT 'clinica'");
    liquidar_honorario_asegurar_columna($conn, 'honorarios_medicos_movimientos', 'referencia_pago_medico', 'VARCHAR(150) NULL');

    $conn->query("CREATE TABLE IF NOT EXISTS cuenta_corriente_terceros (
        id INT AUTO_INCREMENT PRIMARY KEY,
        caja_id INT NULL,
        tercero_nombre VARCHAR(150) NOT NULL,
        tipo_movimiento VARCHAR(30) NOT NULL,
        monto DECIMAL(12,2) NOT NULL,
        metodo_pago VARCHAR(30) NOT NULL,
        referencia_pago VARCHAR(150) NULL,
        honorario_movimiento_id INT NULL,
        usuario_id INT NOT NULL,
        observaciones TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_cct_caja (caja_id),
        INDEX idx_cct_tercero (tercero_nombre),
        INDEX idx_cct_honorario (honorario_movimiento_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $stmtCaja = $conn->prepare("SELECT id, turno FROM cajas WHERE usuario_id = ? AND estado = 'abierta' ORDER BY created_at DESC LIMIT 1");
    $stmtCaja->bind_param('i', $usuarioId);
    $stmtCaja->execute();
    $caja = $stmtCaja->get_result()->fetch_assoc();
    $stmtCaja->close();
    if (!$caja) {
        throw new RuntimeException('Debes tener una caja abierta para liquidar honorarios');
    }
    $cajaId = (int)$caja['id'];
    $turno = (string)($caja['turno'] ?? 'mañana');

    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $tipos = str_repeat('i', count($ids));
    $stmtHonorarios = $conn->prepare("SELECT id, medico_id, monto_medico, estado_pago_medico FROM honorarios_medicos_movimientos WHERE id IN ({$placeholders}) FOR UPDATE");
    $stmtHonorarios->bind_param($tipos, ...$ids);

    $conn->begin_transaction();
    $stmtHonorarios->execute();
    $honorarios = $stmtHonorarios->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmtHonorarios->close();
    if (count($honorarios) !== count($ids)) {
        throw new RuntimeException('Uno o mas honorarios no existen');
    }

    $stmtActualizar = $conn->prepare("UPDATE honorarios_medicos_movimientos SET estado_pago_medico = 'pagado', fecha_pago_medico = CURDATE(), metodo_pago_medico = ?, fuente_pago_medico = ?, referencia_pago_medico = ?, caja_id = ? WHERE id = ? AND estado_pago_medico = 'pendiente'");
    $stmtEgreso = $conn->prepare("INSERT INTO egresos (fecha, tipo, tipo_egreso, categoria, descripcion, concepto, monto, metodo_pago, usuario_id, turno, estado, medico_id, honorario_movimiento_id, caja_id, responsable, fuente_fondos, tercero_nombre, referencia_pago) VALUES (CURDATE(), 'honorario', 'honorario_medico', 'Honorarios Médicos', ?, ?, ?, ?, ?, ?, 'pagado', ?, ?, ?, ?, ?, ?, ?)");
    $stmtCuentaTercero = $conn->prepare("INSERT INTO cuenta_corriente_terceros (caja_id, tercero_nombre, tipo_movimiento, monto, metodo_pago, referencia_pago, honorario_movimiento_id, usuario_id, observaciones) VALUES (?, ?, 'adelanto_honorario', ?, ?, ?, ?, ?, ?)");

    $total = 0.0;
    foreach ($honorarios as $honorario) {
        if (strtolower((string)$honorario['estado_pago_medico']) !== 'pendiente') {
            throw new RuntimeException('El honorario #' . (int)$honorario['id'] . ' ya fue liquidado o no esta disponible');
        }
        $honorarioId = (int)$honorario['id'];
        $medicoId = (int)$honorario['medico_id'];
        $monto = (float)$honorario['monto_medico'];
        $stmtActualizar->bind_param('sssii', $metodoPago, $fuenteFondos, $referenciaPago, $cajaId, $honorarioId);
        $stmtActualizar->execute();
        if ($stmtActualizar->affected_rows !== 1) {
            throw new RuntimeException('No se pudo liquidar el honorario #' . $honorarioId);
        }

        $descripcion = 'Liquidación de honorario médico #' . $honorarioId;
        $concepto = $descripcion;
        $responsable = (string)($usuario['nombre'] ?? '');
        $tercero = $fuenteFondos === 'clinica' ? null : $terceroNombre;
        $stmtEgreso->bind_param('ssdsisiiissss', $descripcion, $concepto, $monto, $metodoPago, $usuarioId, $turno, $medicoId, $honorarioId, $cajaId, $responsable, $fuenteFondos, $tercero, $referenciaPago);
        $stmtEgreso->execute();

        if ($fuenteFondos !== 'clinica') {
            $stmtCuentaTercero->bind_param('isdssiis', $cajaId, $terceroNombre, $monto, $metodoPago, $referenciaPago, $honorarioId, $usuarioId, $observaciones);
            $stmtCuentaTercero->execute();
        }
        $total += $monto;
    }
    $stmtActualizar->close();
    $stmtEgreso->close();
    $stmtCuentaTercero->close();
    $conn->commit();

    echo json_encode(['success' => true, 'message' => 'Honorarios liquidados correctamente', 'total' => $total, 'caja_id' => $cajaId]);
} catch (Throwable $e) {
    if ($conn->errno === 0) {
        // no-op: keeps compatibility with connections that did not begin a transaction
    }
    try { $conn->rollback(); } catch (Throwable $ignored) {}
    error_log('api_liquidar_honorario.php: ' . $e->getMessage());
    http_response_code(422);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
