<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/auth_check.php';

// Forzar codificación utf8mb4 en la conexión MySQLi
if (isset($conn) && method_exists($conn, 'set_charset')) {
    $conn->set_charset('utf8mb4');
}

$method = $_SERVER['REQUEST_METHOD'];

switch($method) {
    case 'GET':
        // Obtener configuraciones de honorarios
        if (isset($_GET['medico_id'])) {
            // Configuraciones específicas de un médico
            $medico_id = intval($_GET['medico_id']);
            obtenerConfiguracionesMedico($conn, $medico_id);
        } else {
            // Todas las configuraciones con datos de médicos
            obtenerTodasConfiguraciones($conn);
        }
        break;
        
    case 'POST':
        // Crear nueva configuración
        crearConfiguracion($conn);
        break;
        
    case 'PUT':
        // Actualizar configuración existente
        actualizarConfiguracion($conn);
        break;
        
    case 'DELETE':
        // Desactivar configuración
        desactivarConfiguracion($conn);
        break;
        
    default:
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
        break;
}

function obtenerConfiguracionesMedico($conn, $medico_id) {
    $sql = "SELECT h.*, m.nombre, m.apellido, m.especialidad 
            FROM configuracion_honorarios_medicos h
            INNER JOIN medicos m ON h.medico_id = m.id
            WHERE h.medico_id = ? AND h.activo = 1
            ORDER BY h.especialidad, h.tipo_servicio";
    
    $stmt = $conn->prepare($sql);
    $stmt->bind_param('i', $medico_id);
    $stmt->execute();
    $result = $stmt->get_result();
    
    $configuraciones = [];
    while ($row = $result->fetch_assoc()) {
        $configuraciones[] = $row;
    }
    
    echo json_encode([
        'success' => true, 
        'configuraciones' => $configuraciones
    ]);
    $stmt->close();
}

function obtenerTodasConfiguraciones($conn) {
    $sql = "SELECT h.*, m.nombre, m.apellido, m.especialidad as especialidad_medico,
                   CONCAT(m.nombre, ' ', m.apellido) as nombre_completo
            FROM configuracion_honorarios_medicos h
            INNER JOIN medicos m ON h.medico_id = m.id
            WHERE h.activo = 1
            ORDER BY m.nombre, m.apellido, h.especialidad, h.tipo_servicio";
    
    $result = $conn->query($sql);
    
    $configuraciones = [];
    while ($row = $result->fetch_assoc()) {
        $configuraciones[] = $row;
    }
    
    echo json_encode([
        'success' => true, 
        'configuraciones' => $configuraciones
    ]);
}

function crearConfiguracion($conn) {
    $data = json_decode(file_get_contents('php://input'), true);
    
    // Validar datos requeridos
    $required_fields = ['medico_id', 'tipo_servicio', 'tarifa_total'];
    foreach ($required_fields as $field) {
        if (!isset($data[$field]) || empty($data[$field])) {
            echo json_encode(['success' => false, 'error' => "Campo requerido: $field"]);
            return;
        }
    }
    
    $medico_id = intval($data['medico_id']);
    $especialidad = $data['especialidad'] ?? null;
    $tipo_servicio = $data['tipo_servicio'];
    $tarifa_total = floatval($data['tarifa_total']);
    
    // Validar que tenga porcentajes O montos fijos, pero no ambos
    $tiene_porcentajes = isset($data['porcentaje_clinica']) && isset($data['porcentaje_medico']);
    $tiene_montos_fijos = isset($data['monto_fijo_clinica']) && isset($data['monto_fijo_medico']);
    
    if (!$tiene_porcentajes && !$tiene_montos_fijos) {
        echo json_encode(['success' => false, 'error' => 'Debe especificar porcentajes o montos fijos']);
        return;
    }
    
    if ($tiene_porcentajes && $tiene_montos_fijos) {
        echo json_encode(['success' => false, 'error' => 'No puede especificar porcentajes y montos fijos al mismo tiempo']);
        return;
    }
    
    // Calcular valores
    if ($tiene_porcentajes) {
        $porcentaje_clinica = floatval($data['porcentaje_clinica']);
        $porcentaje_medico = floatval($data['porcentaje_medico']);
        
        if (abs(($porcentaje_clinica + $porcentaje_medico) - 100) > 0.01) {
            echo json_encode(['success' => false, 'error' => 'Los porcentajes deben sumar 100%']);
            return;
        }
        
        $monto_fijo_clinica = null;
        $monto_fijo_medico = null;
    } else {
        $monto_fijo_clinica = floatval($data['monto_fijo_clinica']);
        $monto_fijo_medico = floatval($data['monto_fijo_medico']);
        
        if (abs(($monto_fijo_clinica + $monto_fijo_medico) - $tarifa_total) > 0.01) {
            echo json_encode(['success' => false, 'error' => 'Los montos fijos deben sumar la tarifa total']);
            return;
        }
        
        $porcentaje_clinica = ($monto_fijo_clinica / $tarifa_total) * 100;
        $porcentaje_medico = ($monto_fijo_medico / $tarifa_total) * 100;
    }
    
    $vigencia_desde = $data['vigencia_desde'] ?? date('Y-m-d');
    $vigencia_hasta = $data['vigencia_hasta'] ?? null;
    
    // Verificar que no exista configuración duplicada activa
    $check_sql = "SELECT id FROM configuracion_honorarios_medicos 
                  WHERE medico_id = ? AND tipo_servicio = ? 
                  AND (especialidad = ? OR (especialidad IS NULL AND ? IS NULL))
                  AND activo = 1 
                  AND (vigencia_hasta IS NULL OR vigencia_hasta >= CURDATE())";
    
    $stmt_check = $conn->prepare($check_sql);
    $stmt_check->bind_param('isss', $medico_id, $tipo_servicio, $especialidad, $especialidad);
    $stmt_check->execute();
    $result_check = $stmt_check->get_result();
    
    if ($result_check->num_rows > 0) {
        echo json_encode(['success' => false, 'error' => 'Ya existe una configuración activa para este médico, especialidad y tipo de servicio']);
        $stmt_check->close();
        return;
    }
    $stmt_check->close();
    
    // Insertar nueva configuración
    $sql = "INSERT INTO configuracion_honorarios_medicos 
            (medico_id, especialidad, tipo_servicio, tarifa_total, 
             porcentaje_clinica, porcentaje_medico, monto_fijo_clinica, monto_fijo_medico,
             vigencia_desde, vigencia_hasta) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    
    $stmt = $conn->prepare($sql);
    $stmt->bind_param('issdddddss', $medico_id, $especialidad, $tipo_servicio, $tarifa_total,
                     $porcentaje_clinica, $porcentaje_medico, $monto_fijo_clinica, $monto_fijo_medico,
                     $vigencia_desde, $vigencia_hasta);
    
    if ($stmt->execute()) {
        $new_id = $conn->insert_id;
        
        // Obtener la configuración creada con datos del médico
        $get_sql = "SELECT h.*, m.nombre, m.apellido, m.especialidad as especialidad_medico,
                           CONCAT(m.nombre, ' ', m.apellido) as nombre_completo
                    FROM configuracion_honorarios_medicos h
                    INNER JOIN medicos m ON h.medico_id = m.id
                    WHERE h.id = ?";
        
        $stmt_get = $conn->prepare($get_sql);
        $stmt_get->bind_param('i', $new_id);
        $stmt_get->execute();
        $result_get = $stmt_get->get_result();
        $configuracion = $result_get->fetch_assoc();
        
        echo json_encode(['success' => true, 'configuracion' => $configuracion]);
        $stmt_get->close();
    } else {
        echo json_encode(['success' => false, 'error' => 'Error al crear configuración: ' . $stmt->error]);
    }
    
    $stmt->close();
}

function actualizarConfiguracion($conn) {
    $data = json_decode(file_get_contents('php://input'), true);
    
    if (!isset($data['id']) || !is_numeric($data['id'])) {
        echo json_encode(['success' => false, 'error' => 'ID de configuración requerido']);
        return;
    }
    
    $id = intval($data['id']);
    
    // Verificar que la configuración existe
    $check_sql = "SELECT id FROM configuracion_honorarios_medicos WHERE id = ?";
    $stmt_check = $conn->prepare($check_sql);
    $stmt_check->bind_param('i', $id);
    $stmt_check->execute();
    $result_check = $stmt_check->get_result();
    
    if ($result_check->num_rows === 0) {
        echo json_encode(['success' => false, 'error' => 'Configuración no encontrada']);
        $stmt_check->close();
        return;
    }
    $stmt_check->close();
    
    // Construir query de actualización dinámicamente
    $update_fields = [];
    $types = '';
    $values = [];
    
    $allowed_fields = [
        'especialidad' => 's',
        'tipo_servicio' => 's', 
        'tarifa_total' => 'd',
        'porcentaje_clinica' => 'd',
        'porcentaje_medico' => 'd',
        'monto_fijo_clinica' => 'd',
        'monto_fijo_medico' => 'd',
        'vigencia_desde' => 's',
        'vigencia_hasta' => 's',
        'activo' => 'i'
    ];
    
    foreach ($allowed_fields as $field => $type) {
        if (isset($data[$field])) {
            $update_fields[] = "$field = ?";
            $types .= $type;
            $values[] = $data[$field];
        }
    }
    
    if (empty($update_fields)) {
        echo json_encode(['success' => false, 'error' => 'No hay campos para actualizar']);
        return;
    }
    
    $sql = "UPDATE configuracion_honorarios_medicos SET " . implode(', ', $update_fields) . " WHERE id = ?";
    $types .= 'i';
    $values[] = $id;
    
    $stmt = $conn->prepare($sql);
    $stmt->bind_param($types, ...$values);
    
    if ($stmt->execute()) {
        // Obtener la configuración actualizada
        $get_sql = "SELECT h.*, m.nombre, m.apellido, m.especialidad as especialidad_medico,
                           CONCAT(m.nombre, ' ', m.apellido) as nombre_completo
                    FROM configuracion_honorarios_medicos h
                    INNER JOIN medicos m ON h.medico_id = m.id
                    WHERE h.id = ?";
        
        $stmt_get = $conn->prepare($get_sql);
        $stmt_get->bind_param('i', $id);
        $stmt_get->execute();
        $result_get = $stmt_get->get_result();
        $configuracion = $result_get->fetch_assoc();
        
        echo json_encode(['success' => true, 'configuracion' => $configuracion]);
        $stmt_get->close();
    } else {
        echo json_encode(['success' => false, 'error' => 'Error al actualizar configuración: ' . $stmt->error]);
    }
    
    $stmt->close();
}

function desactivarConfiguracion($conn) {
    $data = json_decode(file_get_contents('php://input'), true);
    
    if (!isset($data['id']) || !is_numeric($data['id'])) {
        echo json_encode(['success' => false, 'error' => 'ID de configuración requerido']);
        return;
    }
    
    $id = intval($data['id']);
    
    $sql = "UPDATE configuracion_honorarios_medicos SET activo = 0 WHERE id = ?";
    $stmt = $conn->prepare($sql);
    $stmt->bind_param('i', $id);
    
    if ($stmt->execute()) {
        echo json_encode(['success' => true, 'message' => 'Configuración desactivada']);
    } else {
        echo json_encode(['success' => false, 'error' => 'Error al desactivar configuración: ' . $stmt->error]);
    }
    
    $stmt->close();
}
?>