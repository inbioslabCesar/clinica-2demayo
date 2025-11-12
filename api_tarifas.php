<?php
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'domain' => '.clinica2demayo.com',
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
        'http://localhost:5176',
        'https://clinica2demayo.com',
        'https://www.clinica2demayo.com'
    ];
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if (in_array($origin, $allowedOrigins)) {
        header('Access-Control-Allow-Origin: ' . $origin);
    }
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Methods: POST, GET, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(200);
        exit();
    }
    // API para gestionar tarifas
header('Content-Type: application/json');

require_once "config.php";
require_once "auth_check.php";
// Función para obtener los tipos de servicio
function getTiposServicio() {
    return [
        'consulta' => 'Consulta Médica',
        'laboratorio' => 'Exámenes de Laboratorio',
        'rayosx' => 'Rayos X',
        'ecografia' => 'Ecografía',
        'farmacia' => 'Farmacia',
        'ocupacional' => 'Medicina Ocupacional',
        'procedimientos' => 'Procedimientos Médicos',
        'cirugias' => 'Cirugías Menores',
        'tratamientos' => 'Tratamientos Especializados',
        'emergencias' => 'Atención de Emergencias'
    ];
}

// Función para obtener tarifas incluyendo medicamentos y exámenes existentes
function obtenerTodasLasTarifas($conn) {
    $tarifas = array();
    
    // 1. Obtener tarifas de la tabla 'tarifas' (servicios generales y específicos por médico)
    // Verificar si la columna medico_id existe
    $checkColumn = $conn->query("SHOW COLUMNS FROM tarifas LIKE 'medico_id'");
    $hasMedicoId = $checkColumn->num_rows > 0;
    
    if ($hasMedicoId) {
        $query = "SELECT t.*, m.nombre as medico_nombre, m.especialidad as medico_especialidad 
                  FROM tarifas t 
                  LEFT JOIN medicos m ON t.medico_id = m.id 
                  WHERE t.activo = 1 
                  ORDER BY t.servicio_tipo, t.medico_id, t.descripcion";
    } else {
        $query = "SELECT t.* FROM tarifas t WHERE t.activo = 1 ORDER BY t.servicio_tipo, t.descripcion";
    }
    
    $result = $conn->query($query);
    while ($row = $result->fetch_assoc()) {
        $tarifas[] = array(
            'id' => $row['id'],
            'servicio_tipo' => $row['servicio_tipo'],
            'descripcion' => $row['descripcion'],
            'precio_particular' => floatval($row['precio_particular']),
            'precio_seguro' => $row['precio_seguro'] ? floatval($row['precio_seguro']) : null,
            'precio_convenio' => $row['precio_convenio'] ? floatval($row['precio_convenio']) : null,
            'activo' => intval($row['activo']),
            'medico_id' => $hasMedicoId ? $row['medico_id'] : null,
            'medico_nombre' => $hasMedicoId ? $row['medico_nombre'] : null,
            'medico_especialidad' => $hasMedicoId ? $row['medico_especialidad'] : null,
            'porcentaje_medico' => isset($row['porcentaje_medico']) ? floatval($row['porcentaje_medico']) : null,
            'porcentaje_clinica' => isset($row['porcentaje_clinica']) ? floatval($row['porcentaje_clinica']) : null,
            'monto_medico' => isset($row['monto_medico']) ? floatval($row['monto_medico']) : null,
            'monto_clinica' => isset($row['monto_clinica']) ? floatval($row['monto_clinica']) : null,
            'fuente' => 'tarifas'
        );
    }
    
    // 2. Obtener medicamentos con precios calculados
    $query = "SELECT id, codigo, nombre, presentacion, concentracion, 
              precio_compra, margen_ganancia,
              ROUND(precio_compra * (1 + margen_ganancia/100), 2) as precio_venta
              FROM medicamentos WHERE estado = 'activo' ORDER BY nombre";
    $result = $conn->query($query);
    while ($row = $result->fetch_assoc()) {
        $descripcion = $row['nombre'];
        if ($row['presentacion']) $descripcion .= ' - ' . $row['presentacion'];
        if ($row['concentracion']) $descripcion .= ' (' . $row['concentracion'] . ')';
        
        $tarifas[] = array(
            'id' => 'med_' . $row['id'],
            'servicio_tipo' => 'farmacia',
            'descripcion' => $descripcion,
            'precio_particular' => floatval($row['precio_venta']),
            'precio_seguro' => floatval($row['precio_venta'] * 0.9), // 10% descuento
            'precio_convenio' => floatval($row['precio_venta'] * 0.8), // 20% descuento
            'activo' => 1,
            'fuente' => 'medicamentos',
            'medicamento_id' => $row['id']
        );
    }
    
    // 3. Obtener exámenes de laboratorio
    $query = "SELECT id, nombre, precio_publico, precio_convenio 
              FROM examenes_laboratorio WHERE activo = 1 ORDER BY nombre";
    $result = $conn->query($query);
    while ($row = $result->fetch_assoc()) {
        $tarifas[] = array(
            'id' => 'lab_' . $row['id'],
            'servicio_tipo' => 'laboratorio',
            'descripcion' => $row['nombre'],
            'precio_particular' => floatval($row['precio_publico']),
            'precio_seguro' => floatval($row['precio_publico'] * 0.9), // 10% descuento
            'precio_convenio' => floatval($row['precio_convenio'] ?: $row['precio_publico']),
            'activo' => 1,
            'fuente' => 'examenes_laboratorio',
            'examen_id' => $row['id']
        );
    }
    
    return $tarifas;
}

$method = $_SERVER['REQUEST_METHOD'];

switch($method) {
    case 'GET':
        // Si hay filtro por tipo de servicio
        $tipo = $_GET['servicio_tipo'] ?? $_GET['tipo'] ?? '';
        
        if ($tipo) {
            // Obtener todas las tarifas y filtrar por tipo
            $tarifas = obtenerTodasLasTarifas($conn);
            $tarifasFiltradas = array_filter($tarifas, function($tarifa) use ($tipo) {
                return $tarifa['servicio_tipo'] === $tipo;
            });
            echo json_encode(['success' => true, 'tarifas' => array_values($tarifasFiltradas)]);
        } else {
            // Obtener todas las tarifas
            $tarifas = obtenerTodasLasTarifas($conn);
            echo json_encode(['success' => true, 'tarifas' => $tarifas]);
        }
        break;
        
    case 'POST':
        // Crear nueva tarifa (solo servicios médicos)
        $data = json_decode(file_get_contents('php://input'), true);
        
    $servicio_tipo = $data['servicio_tipo'] ?? '';
    // Si servicio_tipo es vacío o null, obtener el actual de la BD
    if (empty($servicio_tipo)) {
        $stmt_actual = $conn->prepare("SELECT servicio_tipo FROM tarifas WHERE id = ? LIMIT 1");
        $stmt_actual->bind_param("i", $id);
        $stmt_actual->execute();
        $res_actual = $stmt_actual->get_result();
        if ($row_actual = $res_actual->fetch_assoc()) {
            $servicio_tipo = $row_actual['servicio_tipo'];
        }
        $stmt_actual->close();
    }
    $descripcion = $data['descripcion'] ?? '';
    $precio_particular = $data['precio_particular'] ?? 0;
    $precio_seguro = $data['precio_seguro'] ?? null;
    $precio_convenio = $data['precio_convenio'] ?? null;
    $medico_id = isset($data['medico_id']) && $data['medico_id'] !== 'general' && $data['medico_id'] !== '' ? intval($data['medico_id']) : null;
    $porcentaje_medico = isset($data['porcentaje_medico']) ? floatval($data['porcentaje_medico']) : null;
    $porcentaje_clinica = isset($data['porcentaje_clinica']) ? floatval($data['porcentaje_clinica']) : null;
    $monto_medico = isset($data['monto_medico']) ? floatval($data['monto_medico']) : null;
    $monto_clinica = isset($data['monto_clinica']) ? floatval($data['monto_clinica']) : null;
        
        // Validar que no sea farmacia o laboratorio
        if ($servicio_tipo === 'farmacia' || $servicio_tipo === 'laboratorio') {
            echo json_encode(['success' => false, 'error' => 'Los precios de farmacia y laboratorio se gestionan desde sus módulos específicos']);
            break;
        }
        
        if (empty($servicio_tipo) || empty($descripcion) || $precio_particular <= 0) {
            echo json_encode(['success' => false, 'error' => 'Datos incompletos']);
            break;
        }
        
    $stmt = $conn->prepare("INSERT INTO tarifas (servicio_tipo, descripcion, precio_particular, precio_seguro, precio_convenio, medico_id, porcentaje_medico, porcentaje_clinica, monto_medico, monto_clinica) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    $stmt->bind_param("ssdddidddd", $servicio_tipo, $descripcion, $precio_particular, $precio_seguro, $precio_convenio, $medico_id, $porcentaje_medico, $porcentaje_clinica, $monto_medico, $monto_clinica);
        
        if ($stmt->execute()) {
            echo json_encode(['success' => true, 'id' => $conn->insert_id]);
        } else {
            echo json_encode(['success' => false, 'error' => 'Error al crear tarifa']);
        }
        break;
        
    case 'PUT':
        // Actualizar tarifa (solo servicios médicos)
        $data = json_decode(file_get_contents('php://input'), true);
        
    $id = $data['id'] ?? 0;
    $servicio_tipo = $data['servicio_tipo'] ?? '';
    // Si servicio_tipo es vacío o null, obtener el actual de la BD
    if (empty($servicio_tipo)) {
        $stmt_actual = $conn->prepare("SELECT servicio_tipo FROM tarifas WHERE id = ? LIMIT 1");
        $stmt_actual->bind_param("i", $id);
        $stmt_actual->execute();
        $res_actual = $stmt_actual->get_result();
        if ($row_actual = $res_actual->fetch_assoc()) {
            $servicio_tipo = $row_actual['servicio_tipo'];
        }
        $stmt_actual->close();
    }
    $descripcion = $data['descripcion'] ?? '';
    $precio_particular = $data['precio_particular'] ?? 0;
    $precio_seguro = $data['precio_seguro'] ?? null;
    $precio_convenio = $data['precio_convenio'] ?? null;
    $activo = $data['activo'] ?? 1;
    $medico_id = isset($data['medico_id']) && $data['medico_id'] !== 'general' && $data['medico_id'] !== '' ? intval($data['medico_id']) : null;
    $porcentaje_medico = isset($data['porcentaje_medico']) ? floatval($data['porcentaje_medico']) : null;
    $porcentaje_clinica = isset($data['porcentaje_clinica']) ? floatval($data['porcentaje_clinica']) : null;
    $monto_medico = isset($data['monto_medico']) ? floatval($data['monto_medico']) : null;
    $monto_clinica = isset($data['monto_clinica']) ? floatval($data['monto_clinica']) : null;
        
        // Validar que el ID no sea de medicamentos o laboratorio (tienen prefijos)
        if (strpos($id, 'med_') === 0 || strpos($id, 'lab_') === 0) {
            echo json_encode(['success' => false, 'error' => 'Los precios de farmacia y laboratorio se gestionan desde sus módulos específicos']);
            break;
        }
        
        if ($id <= 0) {
            echo json_encode(['success' => false, 'error' => 'ID inválido']);
            break;
        }
        
    $stmt = $conn->prepare("UPDATE tarifas SET servicio_tipo = ?, descripcion = ?, precio_particular = ?, precio_seguro = ?, precio_convenio = ?, activo = ?, medico_id = ?, porcentaje_medico = ?, porcentaje_clinica = ?, monto_medico = ?, monto_clinica = ? WHERE id = ?");
    $stmt->bind_param("ssdddiiidddi", $servicio_tipo, $descripcion, $precio_particular, $precio_seguro, $precio_convenio, $activo, $medico_id, $porcentaje_medico, $porcentaje_clinica, $monto_medico, $monto_clinica, $id);
        
        if ($stmt->execute()) {
            echo json_encode(['success' => true]);
        } else {
            echo json_encode(['success' => false, 'error' => 'Error al actualizar tarifa']);
        }
        break;
        
    case 'DELETE':
        // Desactivar tarifa (soft delete, solo servicios médicos)
        $data = json_decode(file_get_contents('php://input'), true);
        $id = $data['id'] ?? 0;
        
        // Validar que el ID no sea de medicamentos o laboratorio (tienen prefijos)
        if (strpos($id, 'med_') === 0 || strpos($id, 'lab_') === 0) {
            echo json_encode(['success' => false, 'error' => 'Los precios de farmacia y laboratorio se gestionan desde sus módulos específicos']);
            break;
        }
        
        if ($id <= 0) {
            echo json_encode(['success' => false, 'error' => 'ID inválido']);
            break;
        }
        
        $stmt = $conn->prepare("UPDATE tarifas SET activo = 0 WHERE id = ?");
        $stmt->bind_param("i", $id);
        
        if ($stmt->execute()) {
            echo json_encode(['success' => true]);
        } else {
            echo json_encode(['success' => false, 'error' => 'Error al eliminar tarifa']);
        }
        break;
        
    default:
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
        break;
}
?>
