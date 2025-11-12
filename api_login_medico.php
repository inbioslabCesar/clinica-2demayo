
<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

// Debug temporal para producción
$rawInput = file_get_contents('php://input');
$data = json_decode($rawInput, true);

// Log para debugging (remover después de arreglar)
error_log("Login Debug - Raw input: " . $rawInput);
error_log("Login Debug - Parsed data: " . print_r($data, true));
error_log("Login Debug - Request method: " . $_SERVER['REQUEST_METHOD']);

// Si es GET, mostrar info de debug
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    echo json_encode([
        'info' => 'Este endpoint requiere método POST con email y password en el body',
        'method_received' => $_SERVER['REQUEST_METHOD'],
        'test_url' => 'Usa test_login_form.html para probar'
    ]);
    exit;
}

$email = $data['email'] ?? '';
$password = $data['password'] ?? '';

if (!$email || !$password) {
    http_response_code(400);
    echo json_encode(['error' => 'Email y contraseña requeridos']);
    exit;
}

$stmt = $conn->prepare('SELECT id, nombre, apellido, especialidad, email, password, cmp, rne, firma FROM medicos WHERE email = ? LIMIT 1');
$stmt->bind_param('s', $email);
$stmt->execute();
$result = $stmt->get_result();

if ($row = $result->fetch_assoc()) {
    if (password_verify($password, $row['password'])) {
    // Guardar el id y datos del médico en la sesión para compatibilidad
    $_SESSION['medico_id'] = $row['id'];
    $row['rol'] = 'medico';
    unset($row['password']); // No enviar la contraseña al frontend
    $_SESSION['usuario'] = $row;
    echo json_encode(['success' => true, 'medico' => $row]);
    } else {
        http_response_code(401);
        echo json_encode(['error' => 'Credenciales incorrectas']);
    }
} else {
    http_response_code(401);
    echo json_encode(['error' => 'Credenciales incorrectas']);
}
?>
