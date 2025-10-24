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

// CORS para localhost y producción
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

// Forzar codificación utf8mb4
if (isset($conn) && method_exists($conn, 'set_charset')) {
    $conn->set_charset('utf8mb4');
}

$method = $_SERVER['REQUEST_METHOD'];

switch($method) {
    case 'GET':
        if (isset($_GET['calcular_honorario'])) {
            // Calcular honorario para una tarifa específica
            calcularHonorarioParaTarifa($conn);
        } elseif (isset($_GET['medico_id'])) {
            // Configuraciones específicas de un médico
            obtenerConfiguracionesMedico($conn);
        } elseif (isset($_GET['tarifas_con_honorarios'])) {
            // Obtener tarifas que tienen configuración de honorarios
            obtenerTarifasConHonorarios($conn);
        } else {
            // Todas las configuraciones
            obtenerTodasConfiguraciones($conn);
        }
        break;
        
    case 'POST':
        crearConfiguracion($conn);
        break;
        
    case 'PUT':
        actualizarConfiguracion($conn);
        break;
        
    case 'DELETE':
        desactivarConfiguracion($conn);
        break;
        
    default:
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
        break;
}

function calcularHonorarioParaTarifa($conn) {
    $tarifa_id = intval($_GET['tarifa_id'] ?? 0);
    $medico_id = intval($_GET['medico_id'] ?? 0);
    $tipo_precio = $_GET['tipo_precio'] ?? 'particular'; // particular, seguro, convenio
    
    if (!$tarifa_id || !$medico_id) {
        echo json_encode(['success' => false, 'error' => 'tarifa_id y medico_id son requeridos']);
        return;
    }
    
    try {
        // Obtener precio de la tarifa
        $sql_tarifa = "SELECT id, descripcion, precio_particular, precio_seguro, precio_convenio, servicio_tipo 
                       FROM tarifas WHERE id = ? AND activo = 1";
        $stmt = $conn->prepare($sql_tarifa);
        $stmt->bind_param('i', $tarifa_id);
        $stmt->execute();
        $tarifa = $stmt->get_result()->fetch_assoc();
        
        if (!$tarifa) {
            echo json_encode(['success' => false, 'error' => 'Tarifa no encontrada']);
            return;
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
        
        // Buscar configuración de honorarios para este médico y tipo de servicio
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
            echo json_encode(['success' => false, 'error' => 'No hay configuración de honorarios para este médico y servicio']);
            return;
        }
        
        // Calcular montos
        $monto_clinica = 0;
        $monto_medico = 0;
        
        if ($configuracion['monto_fijo_clinica'] && $configuracion['monto_fijo_medico']) {
            // Usar montos fijos si están configurados
            $monto_clinica = floatval($configuracion['monto_fijo_clinica']);
            $monto_medico = floatval($configuracion['monto_fijo_medico']);
        } else {
            // Usar porcentajes
            $porcentaje_clinica = floatval($configuracion['porcentaje_clinica']);
            $porcentaje_medico = floatval($configuracion['porcentaje_medico']);
            
            $monto_clinica = ($precio_base * $porcentaje_clinica) / 100;
            $monto_medico = ($precio_base * $porcentaje_medico) / 100;
        }
        
        $resultado = [
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
        
        echo json_encode($resultado);
        
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'error' => 'Error al calcular honorarios: ' . $e->getMessage()]);
    }
}

function obtenerTarifasConHonorarios($conn) {
    try {
        $sql = "SELECT DISTINCT t.id, t.descripcion, t.servicio_tipo, t.precio_particular,
                       COUNT(h.id) as configuraciones_honorarios
                FROM tarifas t
                LEFT JOIN configuracion_honorarios_medicos h ON (h.tarifa_id = t.id OR h.tarifa_id IS NULL)
                    AND h.tipo_servicio = t.servicio_tipo AND h.activo = 1
                WHERE t.activo = 1 AND t.servicio_tipo IN ('consulta', 'procedimientos', 'cirugias', 'rayosx', 'ecografia')
                GROUP BY t.id, t.descripcion, t.servicio_tipo, t.precio_particular
                ORDER BY t.servicio_tipo, t.descripcion";
        
        $result = $conn->query($sql);
        $tarifas = [];
        
        while ($row = $result->fetch_assoc()) {
            $tarifas[] = $row;
        }
        
        echo json_encode(['success' => true, 'tarifas' => $tarifas]);
        
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'error' => 'Error al obtener tarifas: ' . $e->getMessage()]);
    }
}

function obtenerConfiguracionesMedico($conn) {
    $medico_id = intval($_GET['medico_id']);
    
    try {
        $sql = "SELECT h.*, m.nombre, m.apellido, m.especialidad, t.descripcion as tarifa_descripcion,
                       t.precio_particular, t.servicio_tipo as tarifa_servicio_tipo
                FROM configuracion_honorarios_medicos h
                INNER JOIN medicos m ON h.medico_id = m.id
                LEFT JOIN tarifas t ON h.tarifa_id = t.id
                WHERE h.medico_id = ? AND h.activo = 1
                ORDER BY h.especialidad, h.tipo_servicio, t.descripcion";
        
        $stmt = $conn->prepare($sql);
        $stmt->bind_param('i', $medico_id);
        $stmt->execute();
        $result = $stmt->get_result();
        
        $configuraciones = [];
        while ($row = $result->fetch_assoc()) {
            $configuraciones[] = $row;
        }
        
        echo json_encode(['success' => true, 'configuraciones' => $configuraciones]);
        
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'error' => 'Error al obtener configuraciones: ' . $e->getMessage()]);
    }
}

function obtenerTodasConfiguraciones($conn) {
    try {
        $sql = "SELECT h.*, m.nombre, m.apellido, m.especialidad, t.descripcion as tarifa_descripcion,
                       t.precio_particular, t.servicio_tipo as tarifa_servicio_tipo
                FROM configuracion_honorarios_medicos h
                INNER JOIN medicos m ON h.medico_id = m.id
                LEFT JOIN tarifas t ON h.tarifa_id = t.id
                WHERE h.activo = 1
                ORDER BY m.nombre, h.especialidad, h.tipo_servicio";
        
        $result = $conn->query($sql);
        $configuraciones = [];
        
        while ($row = $result->fetch_assoc()) {
            $configuraciones[] = $row;
        }
        
        echo json_encode(['success' => true, 'configuraciones' => $configuraciones]);
        
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'error' => 'Error al obtener configuraciones: ' . $e->getMessage()]);
    }
}

function crearConfiguracion($conn) {
    $input = json_decode(file_get_contents('php://input'), true);
    
    // Validaciones
    if (!isset($input['medico_id']) || !isset($input['tipo_servicio']) || 
        !isset($input['porcentaje_clinica']) || !isset($input['porcentaje_medico'])) {
        echo json_encode(['success' => false, 'error' => 'Datos requeridos faltantes']);
        return;
    }
    
    $medico_id = intval($input['medico_id']);
    $tarifa_id = isset($input['tarifa_id']) && $input['tarifa_id'] !== '' ? intval($input['tarifa_id']) : null;
    $especialidad = $input['especialidad'] ?? '';
    $tipo_servicio = $input['tipo_servicio'];
    $porcentaje_clinica = floatval($input['porcentaje_clinica']);
    $porcentaje_medico = floatval($input['porcentaje_medico']);
    $monto_fijo_clinica = isset($input['monto_fijo_clinica']) && $input['monto_fijo_clinica'] !== '' ? floatval($input['monto_fijo_clinica']) : null;
    $monto_fijo_medico = isset($input['monto_fijo_medico']) && $input['monto_fijo_medico'] !== '' ? floatval($input['monto_fijo_medico']) : null;
    $vigencia_desde = isset($input['vigencia_desde']) && $input['vigencia_desde'] !== '' ? $input['vigencia_desde'] : date('Y-m-d');
    $vigencia_hasta = isset($input['vigencia_hasta']) && $input['vigencia_hasta'] !== '' ? $input['vigencia_hasta'] : null;
    $observaciones = $input['observaciones'] ?? '';
    
    // Validar que los porcentajes sumen 100%
    if (abs($porcentaje_clinica + $porcentaje_medico - 100) > 0.01) {
        echo json_encode(['success' => false, 'error' => 'Los porcentajes deben sumar 100%']);
        return;
    }
    
    try {
        // Convertir campos vacíos a NULL para evitar problemas con MySQL
        if ($tarifa_id === '') $tarifa_id = null;
        if ($vigencia_hasta === '') $vigencia_hasta = null;
        if ($monto_fijo_clinica === '') $monto_fijo_clinica = null;
        if ($monto_fijo_medico === '') $monto_fijo_medico = null;
        
        $sql = "INSERT INTO configuracion_honorarios_medicos 
                (medico_id, tarifa_id, especialidad, tipo_servicio, porcentaje_clinica, porcentaje_medico, 
                 monto_fijo_clinica, monto_fijo_medico, vigencia_desde, vigencia_hasta, observaciones) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
        
        $stmt = $conn->prepare($sql);
        
        if (!$stmt) {
            throw new Exception('Error en prepare: ' . $conn->error);
        }
        
        $stmt->bind_param('iissddddss', $medico_id, $tarifa_id, $especialidad, $tipo_servicio, 
                         $porcentaje_clinica, $porcentaje_medico, $monto_fijo_clinica, $monto_fijo_medico,
                         $vigencia_desde, $vigencia_hasta, $observaciones);
        
        if ($stmt->execute()) {
            $nuevo_id = $conn->insert_id;
            echo json_encode([
                'success' => true, 
                'message' => 'Configuración creada exitosamente',
                'id' => $nuevo_id
            ]);
        } else {
            throw new Exception('Error en execute: ' . $stmt->error);
        }
        
        $stmt->close();
        
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'error' => 'Error al crear configuración: ' . $e->getMessage()]);
    }
}

function actualizarConfiguracion($conn) {
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!isset($input['id'])) {
        echo json_encode(['success' => false, 'error' => 'ID requerido']);
        return;
    }
    
    $id = intval($input['id']);
    $tarifa_id = isset($input['tarifa_id']) && $input['tarifa_id'] !== '' ? intval($input['tarifa_id']) : null;
    $especialidad = $input['especialidad'] ?? '';
    $tipo_servicio = $input['tipo_servicio'];
    $porcentaje_clinica = floatval($input['porcentaje_clinica']);
    $porcentaje_medico = floatval($input['porcentaje_medico']);
    $monto_fijo_clinica = isset($input['monto_fijo_clinica']) && $input['monto_fijo_clinica'] !== '' ? floatval($input['monto_fijo_clinica']) : null;
    $monto_fijo_medico = isset($input['monto_fijo_medico']) && $input['monto_fijo_medico'] !== '' ? floatval($input['monto_fijo_medico']) : null;
    $vigencia_hasta = isset($input['vigencia_hasta']) && $input['vigencia_hasta'] !== '' ? $input['vigencia_hasta'] : null;
    $observaciones = $input['observaciones'] ?? '';
    $activo = isset($input['activo']) ? intval($input['activo']) : 1;
    
    // Validar porcentajes
    if (abs($porcentaje_clinica + $porcentaje_medico - 100) > 0.01) {
        echo json_encode(['success' => false, 'error' => 'Los porcentajes deben sumar 100%']);
        return;
    }
    
    try {
        // Convertir campos vacíos a NULL para MySQL
        if ($tarifa_id === '') $tarifa_id = null;
        if ($vigencia_hasta === '') $vigencia_hasta = null;
        if ($monto_fijo_clinica === '') $monto_fijo_clinica = null;
        if ($monto_fijo_medico === '') $monto_fijo_medico = null;
        
        $sql = "UPDATE configuracion_honorarios_medicos 
                SET tarifa_id = ?, especialidad = ?, tipo_servicio = ?, porcentaje_clinica = ?, 
                    porcentaje_medico = ?, monto_fijo_clinica = ?, monto_fijo_medico = ?, 
                    vigencia_hasta = ?, observaciones = ?, activo = ?
                WHERE id = ?";
        
        $stmt = $conn->prepare($sql);
        
        if (!$stmt) {
            throw new Exception('Error en prepare: ' . $conn->error);
        }
        
        $stmt->bind_param('issddddsiii', $tarifa_id, $especialidad, $tipo_servicio, 
                         $porcentaje_clinica, $porcentaje_medico, $monto_fijo_clinica, $monto_fijo_medico,
                         $vigencia_hasta, $observaciones, $activo, $id);
        
        if ($stmt->execute()) {
            echo json_encode(['success' => true, 'message' => 'Configuración actualizada exitosamente']);
        } else {
            throw new Exception('Error en execute: ' . $stmt->error);
        }
        
        $stmt->close();
        
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'error' => 'Error al actualizar configuración: ' . $e->getMessage()]);
    }
}

function desactivarConfiguracion($conn) {
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!isset($input['id'])) {
        echo json_encode(['success' => false, 'error' => 'ID requerido']);
        return;
    }
    
    $id = intval($input['id']);
    
    try {
        $sql = "UPDATE configuracion_honorarios_medicos SET activo = 0 WHERE id = ?";
        $stmt = $conn->prepare($sql);
        $stmt->bind_param('i', $id);
        
        if ($stmt->execute()) {
            echo json_encode(['success' => true, 'message' => 'Configuración desactivada exitosamente']);
        } else {
            echo json_encode(['success' => false, 'error' => 'Error al desactivar configuración']);
        }
        
    } catch (Exception $e) {
        echo json_encode(['success' => false, 'error' => 'Error al desactivar configuración: ' . $e->getMessage()]);
    }
}

?>