
<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

function ensure_medicos_profesional_columns_login($conn) {
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

ensure_medicos_profesional_columns_login($conn);

$rawInput = file_get_contents('php://input');
$data = json_decode($rawInput, true);

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

$stmt = $conn->prepare('SELECT id, nombre, apellido, especialidad, email, password, cmp, rne, firma, tipo_profesional, abreviatura_profesional, colegio_sigla, nro_colegiatura FROM medicos WHERE email = ? LIMIT 1');
$stmt->bind_param('s', $email);
$stmt->execute();
$result = $stmt->get_result();

if ($row = $result->fetch_assoc()) {
    if (password_verify($password, $row['password'])) {
    // Guardar el id y datos del médico en la sesión para compatibilidad
    $_SESSION['medico_id'] = $row['id'];
    $row['rol'] = 'medico';
    $row['permisos'] = [];
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
