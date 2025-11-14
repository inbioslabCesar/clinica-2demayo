<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

// Función para generar el próximo número de historia clínica
function generarProximaHistoriaClinica($conn) {
    // Obtener el último número de HC de la base de datos
    $query = "SELECT historia_clinica FROM pacientes 
              WHERE historia_clinica LIKE 'HC%' 
              ORDER BY CAST(SUBSTRING(historia_clinica, 3) AS UNSIGNED) DESC 
              LIMIT 1";
    
    $result = $conn->query($query);
    
    if ($result && $result->num_rows > 0) {
        $row = $result->fetch_assoc();
        $ultimaHC = $row['historia_clinica'];
        
        // Extraer el número de la HC (por ejemplo: HC00123 -> 123)
        $numero = intval(substr($ultimaHC, 2));
        $proximoNumero = $numero + 1;
        
        // Formatear con 5 dígitos con ceros a la izquierda
        return 'HC' . str_pad($proximoNumero, 5, '0', STR_PAD_LEFT);
    } else {
        // Si no hay registros, empezar con HC00001
        return 'HC00001';
    }
}

// Eliminar paciente (DELETE)
if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $data = json_decode(file_get_contents('php://input'), true);
    $id = isset($data['id']) ? intval($data['id']) : 0;
    if ($id > 0) {
        // Verificar si el paciente tiene atenciones asociadas
        $stmt = $conn->prepare("SELECT COUNT(*) as total FROM atenciones WHERE paciente_id = ?");
        $stmt->bind_param('i', $id);
        $stmt->execute();
        $res = $stmt->get_result();
        $row = $res->fetch_assoc();
        $stmt->close();
        if ($row && $row['total'] > 0) {
            echo json_encode(['success' => false, 'error' => 'No se puede eliminar el paciente porque tiene atenciones registradas.']);
            exit;
        }
        // Si no tiene atenciones, eliminar normalmente
        $stmt = $conn->prepare("DELETE FROM pacientes WHERE id = ?");
        $stmt->bind_param('i', $id);
        if ($stmt->execute()) {
            echo json_encode(['success' => true]);
        } else {
            echo json_encode(['success' => false, 'error' => 'Error al eliminar paciente: ' . $stmt->error]);
        }
        $stmt->close();
    } else {
        echo json_encode(['success' => false, 'error' => 'ID de paciente no válido']);
    }
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    
    $id = isset($data['id']) ? intval($data['id']) : 0;
    $dni = $data['dni'] ?? '';
    $nombre = $data['nombre'] ?? '';
    $apellido = $data['apellido'] ?? '';
        $historia = $data['historia_clinica'] ?? '';
        
        // Si no se proporciona historia clínica, generar automáticamente
        if (empty($historia)) {
            $historia = generarProximaHistoriaClinica($conn);
        } else {
            // Prefijo automático HC si no lo tiene
            if (stripos($historia, 'HC') !== 0) {
                $historia = 'HC' . $historia;
            }
        }
        
        // Validar que la historia clínica no esté duplicada (solo para nuevos pacientes)
        if ($id == 0) {
            $stmtCheck = $conn->prepare("SELECT id FROM pacientes WHERE historia_clinica = ?");
            $stmtCheck->bind_param('s', $historia);
            $stmtCheck->execute();
            $resultCheck = $stmtCheck->get_result();
            
            if ($resultCheck->num_rows > 0) {
                // Si está duplicada, generar una nueva automáticamente
                $historia = generarProximaHistoriaClinica($conn);
            }
            $stmtCheck->close();
        }
    $fecha_nacimiento = isset($data['fecha_nacimiento']) && $data['fecha_nacimiento'] !== '' ? $data['fecha_nacimiento'] : null;
    $edad = $data['edad'] ?? null;
    $edad_unidad = $data['edad_unidad'] ?? null;
    $procedencia = $data['procedencia'] ?? null;
    $tipo_seguro = $data['tipo_seguro'] ?? null;
    $sexo = $data['sexo'] ?? 'M';
    $direccion = $data['direccion'] ?? null;
    $telefono = $data['telefono'] ?? null;
    $email = $data['email'] ?? null;

        // Validar campos obligatorios
        if (!$dni) {
            echo json_encode(['success' => false, 'error' => 'El campo DNI no debe estar vacío']);
            exit;
        }
        if (!$nombre) {
            echo json_encode(['success' => false, 'error' => 'El campo Nombre no debe estar vacío']);
            exit;
        }
        if (!$apellido) {
            echo json_encode(['success' => false, 'error' => 'El campo Apellido no debe estar vacío']);
            exit;
        }
        // La historia clínica ya no es obligatoria desde el frontend
        // Se genera automáticamente si está vacía

        if ($id > 0) {
            // Actualizar paciente existente
        $stmt = $conn->prepare("UPDATE pacientes SET dni=?, nombre=?, apellido=?, historia_clinica=?, fecha_nacimiento=?, edad=?, edad_unidad=?, procedencia=?, tipo_seguro=?, sexo=?, direccion=?, telefono=?, email=? WHERE id=?");
        $stmt->bind_param('sssssssssssssi', $dni, $nombre, $apellido, $historia, $fecha_nacimiento, $edad, $edad_unidad, $procedencia, $tipo_seguro, $sexo, $direccion, $telefono, $email, $id);
            if ($stmt->execute()) {
                $res = $conn->query("SELECT id, historia_clinica, nombre, apellido, fecha_nacimiento, edad, edad_unidad, procedencia, tipo_seguro, direccion, telefono, email, dni, sexo, creado_en FROM pacientes WHERE id = $id");
                $paciente = $res->fetch_assoc();
                echo json_encode(['success' => true, 'paciente' => $paciente]);
            } else {
                echo json_encode(['success' => false, 'error' => 'Error al actualizar paciente: ' . $stmt->error]);
            }
            $stmt->close();
        } else {
            // Registrar nuevo paciente
        $stmt = $conn->prepare("INSERT INTO pacientes (dni, nombre, apellido, historia_clinica, fecha_nacimiento, edad, edad_unidad, procedencia, tipo_seguro, sexo, direccion, telefono, email) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->bind_param('sssssssssssss', $dni, $nombre, $apellido, $historia, $fecha_nacimiento, $edad, $edad_unidad, $procedencia, $tipo_seguro, $sexo, $direccion, $telefono, $email);
        if ($stmt->execute()) {
            $id = $conn->insert_id;
            $res = $conn->query("SELECT id, historia_clinica, nombre, apellido, fecha_nacimiento, edad, edad_unidad, procedencia, tipo_seguro, direccion, telefono, email, dni, sexo, creado_en FROM pacientes WHERE id = $id");
            $paciente = $res->fetch_assoc();
            echo json_encode(['success' => true, 'paciente' => $paciente]);
        } else {
            // Detectar error de DNI duplicado y devolver mensaje en español
            if (strpos($stmt->error, 'Duplicate entry') !== false && strpos($stmt->error, 'dni') !== false) {
                echo json_encode(['success' => false, 'error' => 'El DNI ingresado ya está registrado en el sistema.']);
            } else {
                echo json_encode(['success' => false, 'error' => 'Error al registrar paciente: ' . $stmt->error]);
            }
        }
        $stmt->close();
        }
        exit;
}



// Listar un paciente por id (GET ?id=...)
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['id'])) {
    $id = intval($_GET['id']);
    $stmt = $conn->prepare("SELECT id, historia_clinica, nombre, apellido, fecha_nacimiento, edad, edad_unidad, procedencia, tipo_seguro, direccion, telefono, email, dni, sexo, creado_en FROM pacientes WHERE id = ?");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $res = $stmt->get_result();
    $row = $res->fetch_assoc();
    if ($row) {
        // Calcular edad si no está
        if (empty($row['edad']) && !empty($row['fecha_nacimiento'])) {
            $birth = new DateTime($row['fecha_nacimiento']);
            $today = new DateTime();
            $row['edad'] = $today->diff($birth)->y;
            $row['edad_unidad'] = 'años';
        }
        echo json_encode(['success' => true, 'paciente' => $row]);
    } else {
        echo json_encode(['success' => false, 'error' => 'Paciente no encontrado']);
    }
    $stmt->close();
    exit;
}

// Listar todos los pacientes (GET)
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    // Paginación: page y limit por GET
    $page = isset($_GET['page']) ? max(1, intval($_GET['page'])) : 1;
    $limit = isset($_GET['limit']) ? max(1, intval($_GET['limit'])) : 20;
    $offset = ($page - 1) * $limit;

    // Filtro de búsqueda
    $busqueda = isset($_GET['busqueda']) ? trim($_GET['busqueda']) : '';
    $where = '';
    $params = [];
    $types = '';
    if ($busqueda !== '') {
        $where = "WHERE nombre LIKE ? OR apellido LIKE ? OR dni LIKE ? OR historia_clinica LIKE ? OR CONCAT(nombre, ' ', apellido) LIKE ?";
        $busquedaLike = "%$busqueda%";
        $params = [$busquedaLike, $busquedaLike, $busquedaLike, $busquedaLike, $busquedaLike];
        $types = 'sssss';
    }

    // Obtener el total de pacientes filtrados
    if ($where) {
        $sqlTotal = "SELECT COUNT(*) as total FROM pacientes $where";
        $stmtTotal = $conn->prepare($sqlTotal);
        $stmtTotal->bind_param($types, ...$params);
        $stmtTotal->execute();
        $resTotal = $stmtTotal->get_result();
        $rowTotal = $resTotal->fetch_assoc();
        $total = intval($rowTotal['total']);
        $stmtTotal->close();
    } else {
        $resTotal = $conn->query("SELECT COUNT(*) as total FROM pacientes");
        $rowTotal = $resTotal->fetch_assoc();
        $total = intval($rowTotal['total']);
    }

    // Obtener solo los pacientes de la página actual filtrados
    if ($where) {
        $sql = "SELECT id, historia_clinica, nombre, apellido, fecha_nacimiento, edad, edad_unidad, procedencia, tipo_seguro, direccion, telefono, email, dni, sexo, creado_en FROM pacientes $where ORDER BY id DESC LIMIT ? OFFSET ?";
        $stmt = $conn->prepare($sql);
        $params[] = $limit;
        $params[] = $offset;
        $types .= 'ii';
        $stmt->bind_param($types, ...$params);
        $stmt->execute();
        $result = $stmt->get_result();
    } else {
        $stmt = $conn->prepare("SELECT id, historia_clinica, nombre, apellido, fecha_nacimiento, edad, edad_unidad, procedencia, tipo_seguro, direccion, telefono, email, dni, sexo, creado_en FROM pacientes ORDER BY id DESC LIMIT ? OFFSET ?");
        $stmt->bind_param('ii', $limit, $offset);
        $stmt->execute();
        $result = $stmt->get_result();
    }
    $pacientes = [];
    while ($row = $result->fetch_assoc()) {
        // Si edad está en la BD, úsala; si no, calcula desde fecha_nacimiento
        if (!empty($row['edad'])) {
            // Ya viene de la BD
        } else if (!empty($row['fecha_nacimiento'])) {
            $birth = new DateTime($row['fecha_nacimiento']);
            $today = new DateTime();
            $row['edad'] = $today->diff($birth)->y;
            $row['edad_unidad'] = 'años';
        } else {
            $row['edad'] = null;
        }
        $pacientes[] = $row;
    }
    $stmt->close();
    echo json_encode([
        'success' => true,
        'pacientes' => $pacientes,
        'total' => $total,
        'page' => $page,
        'limit' => $limit,
        'totalPages' => ceil($total / $limit)
    ]);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'error' => 'Método no permitido']);
