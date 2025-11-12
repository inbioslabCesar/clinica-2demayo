<?php
file_put_contents(__DIR__.'/debug_registro_ingreso_inicio.log', date('Y-m-d H:i:s') . " - Endpoint ejecutado\n", FILE_APPEND);
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '.clinica2demayo.com', // Compartir cookie entre www y sin www
    'secure' => true,
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

// CORS para localhost y producción
$allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'https://clinica2demayo.com',
    'https://www.clinica2demayo.com'
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins)) {
    header('Access-Control-Allow-Origin: ' . $origin);
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}
header('Content-Type: application/json');
require_once __DIR__ . '/config.php';

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

    // Verificar que el usuario actual tiene una caja abierta
    $sqlCaja = "SELECT id FROM cajas WHERE estado = 'abierta' AND usuario_id = ? ORDER BY created_at DESC LIMIT 1";
    $stmtCaja = $pdo->prepare($sqlCaja);
    $stmtCaja->execute([$_SESSION['usuario']['id']]);
    $cajaAbierta = $stmtCaja->fetch(PDO::FETCH_ASSOC);

    if (!$cajaAbierta) {
        echo json_encode(['success' => false, 'error' => 'No tienes una caja abierta para registrar ingresos']);
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

        // --- Lógica de honorarios médicos ---
        // Buscar tarifa asociada por ID si existe en el input
        $tarifa = null;
        if (isset($input['servicio_id']) && $input['servicio_id']) {
            $sqlTarifa = "SELECT * FROM tarifas WHERE id = ? LIMIT 1";
            $stmtTarifa = $pdo->prepare($sqlTarifa);
            $stmtTarifa->execute([$input['servicio_id']]);
            $tarifa = $stmtTarifa->fetch(PDO::FETCH_ASSOC);
        } else {
            // Fallback: buscar por descripción y tipo como antes
            $sqlTarifa = "SELECT * FROM tarifas WHERE descripcion = ? AND servicio_tipo = ? LIMIT 1";
            $stmtTarifa = $pdo->prepare($sqlTarifa);
            $stmtTarifa->execute([trim($input['descripcion']), $input['tipo_ingreso']]);
            $tarifa = $stmtTarifa->fetch(PDO::FETCH_ASSOC);
        }

        if ($tarifa) {
            // DEBUG: Verificar valor de cajaAbierta
            var_dump($cajaAbierta);
            file_put_contents(__DIR__.'/debug/debug_cajaAbierta.log', print_r($cajaAbierta, true));
            file_put_contents(__DIR__.'/debug_cajaAbierta_root.log', print_r($cajaAbierta, true));
            // Determinar tipo de precio
            $tipo_precio = 'particular';
            if ($input['metodo_pago'] === 'seguro') {
                $tipo_precio = 'seguro';
            } elseif ($input['metodo_pago'] === 'convenio') {
                $tipo_precio = 'convenio';
            }
            $tarifa_total = floatval($tarifa['precio_' . $tipo_precio]);

            // Calcular honorarios
            $monto_medico = null;
            $monto_clinica = null;
            $porcentaje_aplicado_medico = null;
            $porcentaje_aplicado_clinica = null;
            if (!empty($tarifa['monto_medico'])) {
                $monto_medico = floatval($tarifa['monto_medico']);
                $porcentaje_aplicado_medico = 0;
            } elseif (!empty($tarifa['porcentaje_medico'])) {
                $monto_medico = round($tarifa_total * floatval($tarifa['porcentaje_medico']) / 100, 2);
                $porcentaje_aplicado_medico = floatval($tarifa['porcentaje_medico']);
            } else {
                $porcentaje_aplicado_medico = 0;
            }
            if (!empty($tarifa['monto_clinica'])) {
                $monto_clinica = floatval($tarifa['monto_clinica']);
                $porcentaje_aplicado_clinica = 0;
            } elseif (!empty($tarifa['porcentaje_clinica'])) {
                $monto_clinica = round($tarifa_total * floatval($tarifa['porcentaje_clinica']) / 100, 2);
                $porcentaje_aplicado_clinica = floatval($tarifa['porcentaje_clinica']);
            } else {
                $porcentaje_aplicado_clinica = 0;
            }

            // Usar consulta_id y paciente_id si están presentes en el input
            $consulta_id = isset($input['consulta_id']) ? $input['consulta_id'] : null;
            $paciente_id = isset($input['paciente_id']) ? $input['paciente_id'] : null;

            // Insertar movimiento de honorario
            $sqlHonorario = "INSERT INTO honorarios_medicos_movimientos (
                consulta_id, medico_id, paciente_id, tarifa_id, tipo_precio, fecha, hora, tipo_servicio, especialidad, tarifa_total,
                monto_clinica, monto_medico, porcentaje_aplicado_clinica, porcentaje_aplicado_medico, estado_pago_medico, metodo_pago_medico, caja_id, created_at
            ) VALUES (?, ?, ?, ?, ?, CURDATE(), CURTIME(), ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?, ?, NOW())";
            $stmtHonorario = $pdo->prepare($sqlHonorario);
            $stmtHonorario->execute([
                $consulta_id,
                $tarifa['medico_id'] ?? null,
                $paciente_id,
                $tarifa['id'],
                $tipo_precio,
                $input['tipo_ingreso'],
                $tarifa['descripcion'],
                $tarifa_total,
                $monto_clinica,
                $monto_medico,
                $porcentaje_aplicado_clinica,
                $porcentaje_aplicado_medico,
                $input['metodo_pago'],
                $cajaAbierta['id']
            ]);
        }

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