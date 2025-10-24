<?php
header('Access-Control-Allow-Origin: http://localhost:5173');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Credentials: true');
header('Content-Type: application/json');

// Manejar preflight OPTIONS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

session_start();

require_once 'config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
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

    // Obtener datos del POST
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!$input) {
        echo json_encode(['success' => false, 'error' => 'Datos inválidos']);
        exit;
    }

    // Validar campos requeridos
    $requiredFields = ['caja_id', 'efectivo_contado'];
    foreach ($requiredFields as $field) {
        if (!isset($input[$field])) {
            echo json_encode(['success' => false, 'error' => "Campo requerido: $field"]);
            exit;
        }
    }

    $caja_id = intval($input['caja_id']);
    $efectivo_contado = floatval($input['efectivo_contado']);
    $tarjetas_contado = floatval($input['tarjetas_contado'] ?? 0);
    $transferencias_contado = floatval($input['transferencias_contado'] ?? 0);
    $otros_contado = floatval($input['otros_contado'] ?? 0);
    $observaciones = trim($input['observaciones'] ?? '');
    $diferencias = $input['diferencias'] ?? [];

    // Verificar que la caja existe y está abierta
    $sqlVerificar = "SELECT * FROM cajas WHERE id = ? AND estado = 'abierta'";
    $stmtVerificar = $pdo->prepare($sqlVerificar);
    $stmtVerificar->execute([$caja_id]);
    $caja = $stmtVerificar->fetch(PDO::FETCH_ASSOC);

    if (!$caja) {
        throw new Exception('Caja no encontrada o ya cerrada');
    }

    // Calcular diferencia total
    $diferencia_total = floatval($diferencias['total'] ?? 0);

    // Verificar si la tabla de auditoría existe, si no, la creamos
    $sqlCreateTable = "CREATE TABLE IF NOT EXISTS cierre_caja_detalle (
        id INT PRIMARY KEY AUTO_INCREMENT,
        caja_id INT NOT NULL,
        usuario_cierre_id INT NOT NULL,
        efectivo_sistema DECIMAL(10,2) DEFAULT 0,
        efectivo_contado DECIMAL(10,2) DEFAULT 0,
        diferencia_efectivo DECIMAL(10,2) DEFAULT 0,
        tarjetas_sistema DECIMAL(10,2) DEFAULT 0,
        tarjetas_contado DECIMAL(10,2) DEFAULT 0,
        diferencia_tarjetas DECIMAL(10,2) DEFAULT 0,
        transferencias_sistema DECIMAL(10,2) DEFAULT 0,
        transferencias_contado DECIMAL(10,2) DEFAULT 0,
        diferencia_transferencias DECIMAL(10,2) DEFAULT 0,
        otros_sistema DECIMAL(10,2) DEFAULT 0,
        otros_contado DECIMAL(10,2) DEFAULT 0,
        diferencia_otros DECIMAL(10,2) DEFAULT 0,
        diferencia_total DECIMAL(10,2) DEFAULT 0,
        observaciones TEXT,
        fecha_cierre TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (caja_id) REFERENCES cajas(id),
        FOREIGN KEY (usuario_cierre_id) REFERENCES usuarios(id)
    )";
    $pdo->exec($sqlCreateTable);

    // Obtener los totales del sistema
    $sqlTotales = "SELECT 
        COALESCE(SUM(CASE WHEN metodo_pago = 'efectivo' THEN monto ELSE 0 END), 0) as total_efectivo_sistema,
        COALESCE(SUM(CASE WHEN metodo_pago = 'tarjeta' THEN monto ELSE 0 END), 0) as total_tarjetas_sistema,
        COALESCE(SUM(CASE WHEN metodo_pago IN ('transferencia', 'yape', 'plin') THEN monto ELSE 0 END), 0) as total_transferencias_sistema,
        COALESCE(SUM(CASE WHEN metodo_pago IN ('seguro', 'otros') THEN monto ELSE 0 END), 0) as total_otros_sistema
        FROM ingresos_diarios 
        WHERE caja_id = ?";
    
    $stmtTotales = $pdo->prepare($sqlTotales);
    $stmtTotales->execute([$caja_id]);
    $totales = $stmtTotales->fetch(PDO::FETCH_ASSOC);

    // Iniciar transacción
    $pdo->beginTransaction();

    try {
        // Actualizar la caja con los datos de cierre
        $sqlCerrar = "UPDATE cajas SET 
            estado = 'cerrada',
            hora_cierre = NOW(),
            observaciones_cierre = ?,
            monto_cierre = ?,
            diferencia = ?
            WHERE id = ?";

        $stmtCerrar = $pdo->prepare($sqlCerrar);
        $stmtCerrar->execute([
            $observaciones,
            $efectivo_contado + $tarjetas_contado + $transferencias_contado + $otros_contado,
            $diferencia_total,
            $caja_id
        ]);

        // Insertar registro de cierre detallado en tabla de auditoría
        $sqlAuditoria = "INSERT INTO cierre_caja_detalle (
            caja_id,
            usuario_cierre_id,
            efectivo_sistema,
            efectivo_contado,
            diferencia_efectivo,
            tarjetas_sistema,
            tarjetas_contado,
            diferencia_tarjetas,
            transferencias_sistema,
            transferencias_contado,
            diferencia_transferencias,
            otros_sistema,
            otros_contado,
            diferencia_otros,
            diferencia_total,
            observaciones,
            fecha_cierre
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())";

        $stmtAuditoria = $pdo->prepare($sqlAuditoria);
        $stmtAuditoria->execute([
            $caja_id,
            $_SESSION['usuario']['id'],
            $totales['total_efectivo_sistema'],
            $efectivo_contado,
            floatval($diferencias['efectivo'] ?? 0),
            $totales['total_tarjetas_sistema'],
            $tarjetas_contado,
            floatval($diferencias['tarjetas'] ?? 0),
            $totales['total_transferencias_sistema'],
            $transferencias_contado,
            floatval($diferencias['transferencias'] ?? 0),
            $totales['total_otros_sistema'],
            $otros_contado,
            floatval($diferencias['otros'] ?? 0),
            $diferencia_total,
            $observaciones
        ]);

        // Confirmar la transacción
        $pdo->commit();

        echo json_encode([
            'success' => true,
            'message' => 'Caja cerrada exitosamente',
            'caja_id' => $caja_id,
            'diferencia_total' => $diferencia_total
        ]);

    } catch (Exception $e) {
        // Solo hacer rollback si hay transacción activa
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }

} catch (PDOException $e) {
    // Solo hacer rollback si hay transacción activa
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Error de base de datos: ' . $e->getMessage()
    ]);
} catch (Exception $e) {
    // Solo hacer rollback si hay transacción activa
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Error del servidor: ' . $e->getMessage()
    ]);
}
?>