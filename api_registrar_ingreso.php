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

    // Verificar que hay una caja abierta
    $sqlCaja = "SELECT id FROM cajas WHERE estado = 'abierta' ORDER BY created_at DESC LIMIT 1";
    $stmtCaja = $pdo->prepare($sqlCaja);
    $stmtCaja->execute();
    $cajaAbierta = $stmtCaja->fetch(PDO::FETCH_ASSOC);

    if (!$cajaAbierta) {
        echo json_encode(['success' => false, 'error' => 'No hay caja abierta para registrar ingresos']);
        exit;
    }

    // Obtener datos del POST
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!$input) {
        echo json_encode(['success' => false, 'error' => 'Datos inválidos']);
        exit;
    }

    // Validar campos requeridos
    $requiredFields = ['tipo_ingreso', 'descripcion', 'monto', 'metodo_pago'];
    foreach ($requiredFields as $field) {
        if (!isset($input[$field]) || (is_string($input[$field]) && trim($input[$field]) === '')) {
            echo json_encode(['success' => false, 'error' => "Campo requerido: $field"]);
            exit;
        }
    }

    // Validar monto
    $monto = floatval($input['monto']);
    if ($monto <= 0) {
        echo json_encode(['success' => false, 'error' => 'El monto debe ser mayor a 0']);
        exit;
    }

    // Validar referencia para métodos que no sean efectivo
    if ($input['metodo_pago'] !== 'efectivo' && $input['metodo_pago'] !== 'otros') {
        if (!isset($input['referencia']) || trim($input['referencia']) === '') {
            echo json_encode(['success' => false, 'error' => 'Número de referencia requerido para este método de pago']);
            exit;
        }
    }

    $pdo->beginTransaction();

    try {
        // Insertar en ingresos_diarios
        $sqlIngreso = "INSERT INTO ingresos_diarios (
            caja_id, 
            tipo_ingreso, 
            area, 
            descripcion, 
            monto, 
            metodo_pago, 
            paciente_nombre, 
            fecha_hora, 
            usuario_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?)";

        $stmtIngreso = $pdo->prepare($sqlIngreso);
        $stmtIngreso->execute([
            $cajaAbierta['id'],
            $input['tipo_ingreso'],
            $input['area'] ?? 'Otros servicios',
            trim($input['descripcion']),
            $monto,
            $input['metodo_pago'],
            isset($input['paciente_nombre']) ? trim($input['paciente_nombre']) : null,
            $_SESSION['usuario']['id']
        ]);

        $ingresoId = $pdo->lastInsertId();

        // Actualizar el total de la caja según el método de pago
        $updateField = '';
        switch ($input['metodo_pago']) {
            case 'efectivo':
                $updateField = 'total_efectivo';
                break;
            case 'tarjeta':
                $updateField = 'total_tarjetas';
                break;
            case 'transferencia':
            case 'yape':
            case 'plin':
                $updateField = 'total_transferencias';
                break;
            default:
                $updateField = 'total_otros';
                break;
        }
        
        $sqlUpdateCaja = "UPDATE cajas SET $updateField = $updateField + ? WHERE id = ?";
        $stmtUpdateCaja = $pdo->prepare($sqlUpdateCaja);
        $stmtUpdateCaja->execute([$monto, $cajaAbierta['id']]);

        $pdo->commit();

        echo json_encode([
            'success' => true,
            'message' => 'Ingreso registrado correctamente',
            'ingreso_id' => $ingresoId,
            'monto' => $monto
        ]);

    } catch (Exception $e) {
        $pdo->rollBack();
        throw $e;
    }

} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Error de base de datos: ' . $e->getMessage()
    ]);
} catch (Exception $e) {
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