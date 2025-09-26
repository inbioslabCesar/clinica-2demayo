<?php
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '',
    'secure' => false, // Cambiado a false para desarrollo local (HTTP)
    'httponly' => true,
    'samesite' => 'Lax', // Cambiado de None a Lax para mejor compatibilidad
]);
session_start();
// CORS para localhost y producción
$allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',
    'https://darkcyan-gnu-615778.hostingersite.com'
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins)) {
    header('Access-Control-Allow-Origin: ' . $origin);
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS, DELETE');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Capturar errores fatales y enviar JSON con CORS
set_exception_handler(function($e) use ($origin, $allowedOrigins) {
    http_response_code(500);
    if (in_array($origin, $allowedOrigins)) {
        header('Access-Control-Allow-Origin: ' . $origin);
    }
    header('Access-Control-Allow-Credentials: true');
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => 'Error del servidor: ' . $e->getMessage()]);
    exit();
});
header('Content-Type: application/json');
require_once __DIR__ . '/config.php';

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
        // Prefijo automático HC si no lo tiene
        if ($historia && stripos($historia, 'HC') !== 0) {
            $historia = 'HC' . $historia;
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
        if (!$historia) {
            echo json_encode(['success' => false, 'error' => 'El campo Historia Clínica no debe estar vacío']);
            exit;
        }

        if ($id > 0) {
            // Actualizar paciente existente
        $stmt = $conn->prepare("UPDATE pacientes SET dni=?, nombre=?, apellido=?, historia_clinica=?, fecha_nacimiento=?, edad=?, edad_unidad=?, procedencia=?, tipo_seguro=?, sexo=?, direccion=?, telefono=?, email=? WHERE id=?");
        $stmt->bind_param('sssssssssssssi', $dni, $nombre, $apellido, $historia, $fecha_nacimiento, $edad, $edad_unidad, $procedencia, $tipo_seguro, $sexo, $direccion, $telefono, $email, $id);
            if ($stmt->execute()) {
                $res = $conn->query("SELECT * FROM pacientes WHERE id = $id");
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
                $res = $conn->query("SELECT * FROM pacientes WHERE id = $id");
                $paciente = $res->fetch_assoc();
                echo json_encode(['success' => true, 'paciente' => $paciente]);
            } else {
                echo json_encode(['success' => false, 'error' => 'Error al registrar paciente: ' . $stmt->error]);
            }
            $stmt->close();
        }
        exit;
}



// Listar un paciente por id (GET ?id=...)
if ($_SERVER['REQUEST_METHOD'] === 'GET' && isset($_GET['id'])) {
    $id = intval($_GET['id']);
    $stmt = $conn->prepare("SELECT id, historia_clinica, nombre, apellido, fecha_nacimiento, edad, edad_unidad, procedencia, tipo_seguro, direccion, telefono, email, dni, creado_en, sexo FROM pacientes WHERE id = ?");
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
    $result = $conn->query("SELECT id, historia_clinica, nombre, apellido, fecha_nacimiento, edad, edad_unidad, procedencia, tipo_seguro, direccion, telefono, email, dni, creado_en FROM pacientes ORDER BY id DESC");
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
    echo json_encode(['success' => true, 'pacientes' => $pacientes]);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'error' => 'Método no permitido']);
