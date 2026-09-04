<?php
require_once __DIR__ . '/init_api.php'; 
require_once "config.php";
require_once "auth_check.php";

function ensure_medicos_profesional_columns_tarifas($conn) {
    $checks = [
        'tipo_profesional' => "ALTER TABLE medicos ADD COLUMN tipo_profesional VARCHAR(30) NOT NULL DEFAULT 'medico'",
        'abreviatura_profesional' => "ALTER TABLE medicos ADD COLUMN abreviatura_profesional VARCHAR(20) NOT NULL DEFAULT 'Dr(a).'",
        'colegio_sigla' => "ALTER TABLE medicos ADD COLUMN colegio_sigla VARCHAR(20) NULL",
        'nro_colegiatura' => "ALTER TABLE medicos ADD COLUMN nro_colegiatura VARCHAR(30) NULL",
    ];

    foreach ($checks as $col => $sqlAlter) {
        $exists = $conn->query("SHOW COLUMNS FROM medicos LIKE '{$col}'");
        if ($exists && $exists->num_rows === 0) {
            $conn->query($sqlAlter);
        }
    }
}

// Función para obtener los tipos de servicio
function getTiposServicio() {
    return [
        'consulta' => 'Consulta Médica',
        'laboratorio' => 'Exámenes de Laboratorio',
        'rayosx' => 'Rayos X',
        'ecografia' => 'Ecografía',
        'farmacia' => 'Farmacia',
        'procedimientos' => 'Procedimientos Médicos',
        'operacion' => 'Operaciones/Cirugías Mayores'
    ];
}

function obtenerTarifasServiciosGestionables($conn, $tipo = '') {
    $serviciosGestionables = ['consulta', 'rayosx', 'ecografia', 'operacion', 'procedimientos'];
    $tipo = trim((string)$tipo);

    $checkColumn = $conn->query("SHOW COLUMNS FROM tarifas LIKE 'medico_id'");
    $hasMedicoId = $checkColumn && $checkColumn->num_rows > 0;

    $placeholders = implode(',', array_fill(0, count($serviciosGestionables), '?'));
    $types = str_repeat('s', count($serviciosGestionables));
    $params = $serviciosGestionables;

    $sql = $hasMedicoId
        ? "SELECT t.id, t.servicio_tipo, t.descripcion, t.precio_particular, t.precio_seguro, t.precio_convenio, t.activo,
                  t.medico_id,
                  m.nombre as medico_nombre, m.apellido as medico_apellido, m.especialidad as medico_especialidad,
                  m.tipo_profesional as medico_tipo_profesional, m.abreviatura_profesional as medico_abreviatura_profesional,
                  m.colegio_sigla as medico_colegio_sigla, m.nro_colegiatura as medico_nro_colegiatura,
                  t.porcentaje_medico, t.porcentaje_clinica, t.monto_medico, t.monto_clinica
           FROM tarifas t
           LEFT JOIN medicos m ON t.medico_id = m.id
           WHERE t.activo = 1 AND t.servicio_tipo IN ($placeholders)"
        : "SELECT t.id, t.servicio_tipo, t.descripcion, t.precio_particular, t.precio_seguro, t.precio_convenio, t.activo,
                  NULL as medico_id,
                  NULL as medico_nombre, NULL as medico_apellido, NULL as medico_especialidad,
                  NULL as medico_tipo_profesional, NULL as medico_abreviatura_profesional,
                  NULL as medico_colegio_sigla, NULL as medico_nro_colegiatura,
                  t.porcentaje_medico, t.porcentaje_clinica, t.monto_medico, t.monto_clinica
           FROM tarifas t
           WHERE t.activo = 1 AND t.servicio_tipo IN ($placeholders)";

    if ($tipo !== '' && in_array($tipo, $serviciosGestionables, true)) {
        $sql .= " AND t.servicio_tipo = ?";
        $types .= 's';
        $params[] = $tipo;
    }

    $sql .= " ORDER BY t.servicio_tipo, t.medico_id, t.descripcion";

    $stmt = $conn->prepare($sql);
    if (!$stmt) return [];
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $result = $stmt->get_result();
    $tarifas = [];

    while ($row = $result->fetch_assoc()) {
        $tarifas[] = [
            'id' => $row['id'],
            'servicio_tipo' => $row['servicio_tipo'],
            'descripcion' => $row['descripcion'],
            'precio_particular' => floatval($row['precio_particular']),
            'precio_seguro' => $row['precio_seguro'] ? floatval($row['precio_seguro']) : null,
            'precio_convenio' => $row['precio_convenio'] ? floatval($row['precio_convenio']) : null,
            'activo' => intval($row['activo']),
            'medico_id' => $row['medico_id'],
            'medico_nombre' => $row['medico_nombre'],
            'medico_apellido' => $row['medico_apellido'],
            'medico_especialidad' => $row['medico_especialidad'],
            'medico_tipo_profesional' => $row['medico_tipo_profesional'],
            'medico_abreviatura_profesional' => $row['medico_abreviatura_profesional'],
            'medico_colegio_sigla' => $row['medico_colegio_sigla'],
            'medico_nro_colegiatura' => $row['medico_nro_colegiatura'],
            'porcentaje_medico' => isset($row['porcentaje_medico']) ? floatval($row['porcentaje_medico']) : null,
            'porcentaje_clinica' => isset($row['porcentaje_clinica']) ? floatval($row['porcentaje_clinica']) : null,
            'monto_medico' => isset($row['monto_medico']) ? floatval($row['monto_medico']) : null,
            'monto_clinica' => isset($row['monto_clinica']) ? floatval($row['monto_clinica']) : null,
            'fuente' => 'tarifas'
        ];
    }

    $stmt->close();
    return $tarifas;
}

// Función para obtener tarifas incluyendo medicamentos y exámenes existentes
function obtenerTodasLasTarifas($conn) {
    $tarifas = array();
    
    // 1. Obtener tarifas de la tabla 'tarifas' (servicios generales y específicos por médico)
    // Verificar si la columna medico_id existe
    $checkColumn = $conn->query("SHOW COLUMNS FROM tarifas LIKE 'medico_id'");
    $hasMedicoId = $checkColumn->num_rows > 0;
    
    if ($hasMedicoId) {
        $query = "SELECT t.*, m.nombre as medico_nombre, m.apellido as medico_apellido, m.especialidad as medico_especialidad,
                         m.tipo_profesional as medico_tipo_profesional, m.abreviatura_profesional as medico_abreviatura_profesional,
                         m.colegio_sigla as medico_colegio_sigla, m.nro_colegiatura as medico_nro_colegiatura
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
            'medico_apellido' => $hasMedicoId ? $row['medico_apellido'] : null,
            'medico_especialidad' => $hasMedicoId ? $row['medico_especialidad'] : null,
            'medico_tipo_profesional' => $hasMedicoId ? $row['medico_tipo_profesional'] : null,
            'medico_abreviatura_profesional' => $hasMedicoId ? $row['medico_abreviatura_profesional'] : null,
            'medico_colegio_sigla' => $hasMedicoId ? $row['medico_colegio_sigla'] : null,
            'medico_nro_colegiatura' => $hasMedicoId ? $row['medico_nro_colegiatura'] : null,
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
        // En lectura evitamos lógica de alteración de esquema para no penalizar rutas críticas.
        // Si hay filtro por tipo de servicio
        $tipo = $_GET['servicio_tipo'] ?? $_GET['tipo'] ?? '';

        $tarifas = obtenerTarifasServiciosGestionables($conn, $tipo);
        echo json_encode(['success' => true, 'tarifas' => array_values($tarifas)]);
        break;
        
    case 'POST':
        ensure_medicos_profesional_columns_tarifas($conn);
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
        
        // Validar tipos no gestionables desde este módulo
        $tiposNoGestionables = ['farmacia', 'laboratorio', 'ocupacional', 'cirugias', 'tratamientos', 'emergencias', 'hospitalizacion'];
        if (in_array($servicio_tipo, $tiposNoGestionables)) {
            echo json_encode(['success' => false, 'error' => 'Este tipo de servicio no se gestiona desde Gestión de Tarifas']);
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
        ensure_medicos_profesional_columns_tarifas($conn);
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

        $tiposNoGestionables = ['farmacia', 'laboratorio', 'ocupacional', 'cirugias', 'tratamientos', 'emergencias', 'hospitalizacion'];
        if (in_array($servicio_tipo, $tiposNoGestionables)) {
            echo json_encode(['success' => false, 'error' => 'Este tipo de servicio no se gestiona desde Gestión de Tarifas']);
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
            echo json_encode(['success' => false, 'error' => 'Error al desactivar tarifa']);
        }
        break;
        
    default:
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
        break;
}
?>
