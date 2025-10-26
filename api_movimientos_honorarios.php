<?php
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '',
    'secure' => false,
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

// CORS
$allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',
    'https://clinica2demayo.com'
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins)) {
    header('Access-Control-Allow-Origin: ' . $origin);
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS, PUT, DELETE');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

header('Content-Type: application/json');
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/auth_check.php';

if (isset($conn) && method_exists($conn, 'set_charset')) {
    $conn->set_charset('utf8mb4');
}

$method = $_SERVER['REQUEST_METHOD'];

switch($method) {
    case 'GET':
        if (isset($_GET['medico_id'])) {
            obtenerMovimientosMedico($conn);
        } elseif (isset($_GET['liquidacion_id'])) {
            obtenerMovimientosLiquidacion($conn);
        } else {
            obtenerTodosMovimientos($conn);
        }
        break;
        
    case 'POST':
        if (isset($_GET['tipo']) && $_GET['tipo'] === 'manual') {
            registrarMovimientoManual($conn);
        } else {
            registrarMovimientoConsulta($conn);
        }
        break;
        
    case 'PUT':
        actualizarEstadoPago($conn);
        break;
        
    default:
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
        break;
}

/**
 * Registrar movimiento automático cuando se realiza una consulta
 */
function registrarMovimientoConsulta($conn) {
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!isset($input['consulta_id']) || !isset($input['tarifa_id']) || !isset($input['medico_id'])) {
        echo json_encode(['success' => false, 'error' => 'Datos requeridos faltantes']);
        return;
    }
    
    $consulta_id = intval($input['consulta_id']);
    $tarifa_id = intval($input['tarifa_id']);
    $medico_id = intval($input['medico_id']);
    $paciente_id = intval($input['paciente_id'] ?? 0);
    $cobro_id = intval($input['cobro_id'] ?? 0);
    $tipo_precio = $input['tipo_precio'] ?? 'particular';
    
    try {
        // Calcular honorarios usando la API de configuración
        $calculo = calcularHonorariosParaTarifa($conn, $tarifa_id, $medico_id, $tipo_precio);
        
        if (!$calculo['success']) {
            echo json_encode($calculo);
            return;
        }
        
        $datos = $calculo['datos'];
        
        // Registrar movimiento
        $sql = "INSERT INTO honorarios_medicos_movimientos 
                (consulta_id, cobro_id, medico_id, paciente_id, tarifa_id, tipo_precio, fecha, hora, 
                 tipo_servicio, especialidad, tarifa_total, monto_clinica, monto_medico, 
                 porcentaje_aplicado_clinica, porcentaje_aplicado_medico, estado_pago_medico)
                VALUES (?, ?, ?, ?, ?, ?, CURDATE(), CURTIME(), ?, ?, ?, ?, ?, ?, ?, 'pendiente')";
        
        $stmt = $conn->prepare($sql);
        $stmt->bind_param('iiiiiissdddd', 
                         $consulta_id, $cobro_id, $medico_id, $paciente_id, $tarifa_id, $tipo_precio,
                         $datos['tarifa']['servicio_tipo'], $datos['configuracion_honorarios']['especialidad'],
                         $datos['calculo']['precio_base'], $datos['calculo']['monto_clinica'], 
                         $datos['calculo']['monto_medico'], $datos['calculo']['porcentaje_clinica'],
                         $datos['calculo']['porcentaje_medico']);
        
        if ($stmt->execute()) {
            $movimiento_id = $conn->insert_id;
            
            // Registrar en egresos (para la clínica)
            registrarEgresoClinica($conn, $movimiento_id, $datos['calculo']['monto_clinica']);
            
            echo json_encode([
                'success' => true, 
                'message' => 'Movimiento de honorarios registrado exitosamente',
                'movimiento_id' => $movimiento_id,
                'datos_calculo' => $datos['calculo']
            ]);
        } else {
            echo json_encode(['success' => false, 'error' => 'Error al registrar movimiento']);
        }
        
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'error' => 'Error al registrar movimiento: ' . $e->getMessage()]);
    }
}

/**
 * Función auxiliar para calcular honorarios
 */
function calcularHonorariosParaTarifa($conn, $tarifa_id, $medico_id, $tipo_precio) {
    // Obtener precio de la tarifa
    $sql_tarifa = "SELECT id, descripcion, precio_particular, precio_seguro, precio_convenio, servicio_tipo 
                   FROM tarifas WHERE id = ? AND activo = 1";
    $stmt = $conn->prepare($sql_tarifa);
    $stmt->bind_param('i', $tarifa_id);
    $stmt->execute();
    $tarifa = $stmt->get_result()->fetch_assoc();
    
    if (!$tarifa) {
        return ['success' => false, 'error' => 'Tarifa no encontrada'];
    }
    
    // Determinar precio según tipo
    $precio_base = 0;
    switch($tipo_precio) {
        case 'seguro':
            $precio_base = $tarifa['precio_seguro'] ?? $tarifa['precio_particular'];
            break;
        case 'convenio':
            $precio_base = $tarifa['precio_convenio'] ?? $tarifa['precio_particular'];
            break;
        default:
            $precio_base = $tarifa['precio_particular'];
            break;
    }
    
    // Buscar configuración de honorarios
    $sql_honorario = "SELECT h.*, m.nombre, m.apellido, m.especialidad
                      FROM configuracion_honorarios_medicos h
                      INNER JOIN medicos m ON h.medico_id = m.id
                      WHERE h.medico_id = ? 
                      AND (h.tarifa_id = ? OR h.tarifa_id IS NULL)
                      AND h.tipo_servicio = ?
                      AND h.activo = 1
                      AND (h.vigencia_hasta IS NULL OR h.vigencia_hasta >= CURDATE())
                      ORDER BY h.tarifa_id DESC, h.vigencia_desde DESC
                      LIMIT 1";
    
    $stmt = $conn->prepare($sql_honorario);
    $stmt->bind_param('iis', $medico_id, $tarifa_id, $tarifa['servicio_tipo']);
    $stmt->execute();
    $configuracion = $stmt->get_result()->fetch_assoc();
    
    if (!$configuracion) {
        return ['success' => false, 'error' => 'No hay configuración de honorarios para este médico y servicio'];
    }
    
    // Calcular montos
    $monto_clinica = 0;
    $monto_medico = 0;
    
    if ($configuracion['monto_fijo_clinica'] && $configuracion['monto_fijo_medico']) {
        $monto_clinica = floatval($configuracion['monto_fijo_clinica']);
        $monto_medico = floatval($configuracion['monto_fijo_medico']);
    } else {
        $porcentaje_clinica = floatval($configuracion['porcentaje_clinica']);
        $porcentaje_medico = floatval($configuracion['porcentaje_medico']);
        
        $monto_clinica = ($precio_base * $porcentaje_clinica) / 100;
        $monto_medico = ($precio_base * $porcentaje_medico) / 100;
    }
    
    return [
        'success' => true,
        'datos' => [
            'tarifa' => $tarifa,
            'configuracion_honorarios' => $configuracion,
            'calculo' => [
                'precio_base' => floatval($precio_base),
                'tipo_precio' => $tipo_precio,
                'monto_clinica' => round($monto_clinica, 2),
                'monto_medico' => round($monto_medico, 2),
                'total' => round($monto_clinica + $monto_medico, 2),
                'porcentaje_clinica' => floatval($configuracion['porcentaje_clinica']),
                'porcentaje_medico' => floatval($configuracion['porcentaje_medico'])
            ]
        ]
    ];
}

/**
 * Registrar egreso para la clínica
 */
function registrarEgresoClinica($conn, $movimiento_id, $monto_clinica) {
    $sql = "INSERT INTO egresos 
            (fecha, tipo, categoria, concepto, monto, responsable, estado, honorario_movimiento_id)
            VALUES (CURDATE(), 'operativo', 'honorarios_medicos', 
                   'Honorario médico por consulta', ?, ?, 'confirmado', ?)";
    
    $responsable = $_SESSION['usuario_nombre'] ?? 'Sistema';
    
    $stmt = $conn->prepare($sql);
    $stmt->bind_param('dsi', $monto_clinica, $responsable, $movimiento_id);
    $stmt->execute();
}

function obtenerMovimientosMedico($conn) {
    $medico_id = intval($_GET['medico_id']);
    $fecha_desde = $_GET['fecha_desde'] ?? date('Y-m-01');
    $fecha_hasta = $_GET['fecha_hasta'] ?? date('Y-m-d');
    
    try {
        $sql = "SELECT h.*, m.nombre as medico_nombre, m.apellido as medico_apellido,
                       p.nombre as paciente_nombre, p.apellido as paciente_apellido, p.dni,
                       t.descripcion as tarifa_descripcion
                FROM honorarios_medicos_movimientos h
                INNER JOIN medicos m ON h.medico_id = m.id
                LEFT JOIN pacientes p ON h.paciente_id = p.id
                LEFT JOIN tarifas t ON h.tarifa_id = t.id
                WHERE h.medico_id = ? AND h.fecha BETWEEN ? AND ?
                ORDER BY h.fecha DESC, h.hora DESC";
        
        $stmt = $conn->prepare($sql);
        $stmt->bind_param('iss', $medico_id, $fecha_desde, $fecha_hasta);
        $stmt->execute();
        $result = $stmt->get_result();
        
        $movimientos = [];
        while ($row = $result->fetch_assoc()) {
            $movimientos[] = $row;
        }
        
        echo json_encode(['success' => true, 'movimientos' => $movimientos]);
        
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'error' => 'Error al obtener movimientos: ' . $e->getMessage()]);
    }
}

function obtenerTodosMovimientos($conn) {
    $fecha_desde = $_GET['fecha_desde'] ?? date('Y-m-01');
    $fecha_hasta = $_GET['fecha_hasta'] ?? date('Y-m-d');
    $estado_pago = $_GET['estado_pago'] ?? '';
    
    try {
        $sql = "SELECT h.*, m.nombre as medico_nombre, m.apellido as medico_apellido,
                   p.nombre as paciente_nombre, p.apellido as paciente_apellido, p.dni,
                   t.descripcion as tarifa_descripcion,
                   c.tipo_consulta
            FROM honorarios_medicos_movimientos h
            INNER JOIN medicos m ON h.medico_id = m.id
            LEFT JOIN pacientes p ON h.paciente_id = p.id
            LEFT JOIN tarifas t ON h.tarifa_id = t.id
            LEFT JOIN consultas c ON h.consulta_id = c.id
            WHERE h.fecha BETWEEN ? AND ?";

        $params = [$fecha_desde, $fecha_hasta];
        $types = 'ss';

        if ($estado_pago) {
            $sql .= " AND h.estado_pago_medico = ?";
            $params[] = $estado_pago;
            $types .= 's';
        }

        if (isset($_GET['tipo_consulta']) && $_GET['tipo_consulta'] !== '') {
            // Comparación case-insensitive y manejar NULL en c.tipo_consulta
            $sql .= " AND LOWER(COALESCE(c.tipo_consulta, '')) = LOWER(?)";
            $params[] = $_GET['tipo_consulta'];
            $types .= 's';
        }

        $sql .= " ORDER BY h.fecha DESC, h.hora DESC";

        $stmt = $conn->prepare($sql);
        $stmt->bind_param($types, ...$params);
        $stmt->execute();
        $result = $stmt->get_result();

        $movimientos = [];
        while ($row = $result->fetch_assoc()) {
            $movimientos[] = $row;
        }

        echo json_encode(['success' => true, 'movimientos' => $movimientos]);

    } catch (Exception $e) {
        echo json_encode(['success' => false, 'error' => 'Error al obtener movimientos: ' . $e->getMessage()]);
    }
}

function actualizarEstadoPago($conn) {
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!isset($input['id']) || !isset($input['estado_pago_medico'])) {
        echo json_encode(['success' => false, 'error' => 'Datos requeridos faltantes']);
        return;
    }
    
    $id = intval($input['id']);
    $estado_pago = $input['estado_pago_medico'];
    $fecha_pago = ($estado_pago === 'pagado') ? date('Y-m-d') : null;
    $metodo_pago = $input['metodo_pago_medico'] ?? null;
    
    try {
        $sql = "UPDATE honorarios_medicos_movimientos 
                SET estado_pago_medico = ?, fecha_pago_medico = ?, metodo_pago_medico = ?
                WHERE id = ?";
        
        $stmt = $conn->prepare($sql);
        $stmt->bind_param('sssi', $estado_pago, $fecha_pago, $metodo_pago, $id);
        
        if ($stmt->execute()) {
            echo json_encode(['success' => true, 'message' => 'Estado de pago actualizado exitosamente']);
        } else {
            echo json_encode(['success' => false, 'error' => 'Error al actualizar estado']);
        }
        
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'error' => 'Error al actualizar estado: ' . $e->getMessage()]);
    }
}

function obtenerMovimientosLiquidacion($conn) {
    $liquidacion_id = intval($_GET['liquidacion_id']);
    
    try {
        $sql = "SELECT h.*, m.nombre as medico_nombre, m.apellido as medico_apellido,
                       p.nombre as paciente_nombre, p.apellido as paciente_apellido, p.dni,
                       t.descripcion as tarifa_descripcion
                FROM honorarios_medicos_movimientos h
                INNER JOIN medicos m ON h.medico_id = m.id
                LEFT JOIN pacientes p ON h.paciente_id = p.id
                LEFT JOIN tarifas t ON h.tarifa_id = t.id
                WHERE h.liquidacion_id = ?
                ORDER BY h.fecha DESC, h.hora DESC";
        
        $stmt = $conn->prepare($sql);
        $stmt->bind_param('i', $liquidacion_id);
        $stmt->execute();
        $result = $stmt->get_result();
        
        $movimientos = [];
        while ($row = $result->fetch_assoc()) {
            $movimientos[] = $row;
        }
        
        echo json_encode(['success' => true, 'movimientos' => $movimientos]);
        
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'error' => 'Error al obtener movimientos de liquidación: ' . $e->getMessage()]);
    }
}

function registrarMovimientoManual($conn) {
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!isset($input['medico_id']) || !isset($input['monto_medico']) || !isset($input['concepto'])) {
        echo json_encode(['success' => false, 'error' => 'Datos requeridos faltantes']);
        return;
    }
    
    $medico_id = intval($input['medico_id']);
    $paciente_id = intval($input['paciente_id'] ?? 0);
    $fecha = $input['fecha'] ?? date('Y-m-d');
    $hora = $input['hora'] ?? date('H:i:s');
    $tipo_servicio = $input['tipo_servicio'] ?? 'otros';
    $especialidad = $input['especialidad'] ?? '';
    $monto_medico = floatval($input['monto_medico']);
    $monto_clinica = floatval($input['monto_clinica'] ?? 0);
    $tarifa_total = $monto_clinica + $monto_medico;
    $concepto = $input['concepto'];
    $observaciones = $input['observaciones'] ?? '';
    
    try {
        $sql = "INSERT INTO honorarios_medicos_movimientos 
                (medico_id, paciente_id, fecha, hora, tipo_servicio, especialidad, 
                 tarifa_total, monto_clinica, monto_medico, porcentaje_aplicado_clinica, 
                 porcentaje_aplicado_medico, estado_pago_medico, observaciones)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?)";
        
        // Calcular porcentajes para registro
        $porcentaje_clinica = $tarifa_total > 0 ? ($monto_clinica / $tarifa_total) * 100 : 0;
        $porcentaje_medico = $tarifa_total > 0 ? ($monto_medico / $tarifa_total) * 100 : 100;
        
        $stmt = $conn->prepare($sql);
        $stmt->bind_param('iissssddds', 
                         $medico_id, $paciente_id, $fecha, $hora, $tipo_servicio, $especialidad,
                         $tarifa_total, $monto_clinica, $monto_medico, $porcentaje_clinica,
                         $porcentaje_medico, $observaciones);
        
        if ($stmt->execute()) {
            $movimiento_id = $conn->insert_id;
            
            // Registrar egreso si hay monto para la clínica
            if ($monto_clinica > 0) {
                registrarEgresoClinica($conn, $movimiento_id, $monto_clinica);
            }
            
            echo json_encode([
                'success' => true, 
                'message' => 'Movimiento manual registrado exitosamente',
                'movimiento_id' => $movimiento_id
            ]);
        } else {
            echo json_encode(['success' => false, 'error' => 'Error al registrar movimiento manual']);
        }
        
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'error' => 'Error al registrar movimiento manual: ' . $e->getMessage()]);
    }
}

?>