
<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

const LOGIN_MEDICO_MAX_ATTEMPTS = 5;
const LOGIN_MEDICO_BLOCK_SECONDS = 300;

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

function obtenerRateLimitLoginMedico(string $email): array {
    $emailKey = mb_strtolower(trim($email), 'UTF-8');
    if (!isset($_SESSION['login_medico_rate_limit']) || !is_array($_SESSION['login_medico_rate_limit'])) {
        $_SESSION['login_medico_rate_limit'] = [];
    }
    $entry = $_SESSION['login_medico_rate_limit'][$emailKey] ?? [
        'attempts' => 0,
        'blocked_until' => 0,
    ];
    return [
        'key' => $emailKey,
        'attempts' => (int)($entry['attempts'] ?? 0),
        'blocked_until' => (int)($entry['blocked_until'] ?? 0),
    ];
}

function registrarFalloLoginMedico(string $email): array {
    $limit = obtenerRateLimitLoginMedico($email);
    $attempts = $limit['attempts'] + 1;
    $blockedUntil = 0;

    if ($attempts >= LOGIN_MEDICO_MAX_ATTEMPTS) {
        $blockedUntil = time() + LOGIN_MEDICO_BLOCK_SECONDS;
        $attempts = 0;
    }

    $_SESSION['login_medico_rate_limit'][$limit['key']] = [
        'attempts' => $attempts,
        'blocked_until' => $blockedUntil,
    ];

    return [
        'blocked_until' => $blockedUntil,
        'retry_after' => max(0, $blockedUntil - time()),
    ];
}

function limpiarRateLimitLoginMedico(string $email): void {
    $limit = obtenerRateLimitLoginMedico($email);
    unset($_SESSION['login_medico_rate_limit'][$limit['key']]);
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

$loginLimit = obtenerRateLimitLoginMedico($email);
if ($loginLimit['blocked_until'] > time()) {
    $retryAfter = $loginLimit['blocked_until'] - time();
    http_response_code(429);
    header('Retry-After: ' . $retryAfter);
    echo json_encode([
        'error' => 'Demasiados intentos fallidos. Intenta nuevamente en unos minutos.',
        'retry_after' => $retryAfter,
    ]);
    exit;
}

$stmt = $conn->prepare('SELECT id, nombre, apellido, especialidad, email, password, cmp, rne, firma, tipo_profesional, abreviatura_profesional, colegio_sigla, nro_colegiatura FROM medicos WHERE email = ? LIMIT 1');
$stmt->bind_param('s', $email);
$stmt->execute();
$result = $stmt->get_result();

if ($row = $result->fetch_assoc()) {
    if (password_verify($password, $row['password'])) {
    limpiarRateLimitLoginMedico($email);
    session_regenerate_id(true);
    // Guardar el id y datos del médico en la sesión para compatibilidad
    $_SESSION['medico_id'] = $row['id'];
    $row['rol'] = 'medico';
    $row['permisos'] = [];
    unset($row['password']); // No enviar la contraseña al frontend
    $_SESSION['usuario'] = $row;
    echo json_encode(['success' => true, 'medico' => $row]);
    } else {
        $limitState = registrarFalloLoginMedico($email);
        if (($limitState['retry_after'] ?? 0) > 0) {
            http_response_code(429);
            header('Retry-After: ' . (int)$limitState['retry_after']);
            echo json_encode([
                'error' => 'Demasiados intentos fallidos. Intenta nuevamente en unos minutos.',
                'retry_after' => (int)$limitState['retry_after'],
            ]);
        } else {
            http_response_code(401);
            echo json_encode(['error' => 'Credenciales incorrectas']);
        }
    }
} else {
    $limitState = registrarFalloLoginMedico($email);
    if (($limitState['retry_after'] ?? 0) > 0) {
        http_response_code(429);
        header('Retry-After: ' . (int)$limitState['retry_after']);
        echo json_encode([
            'error' => 'Demasiados intentos fallidos. Intenta nuevamente en unos minutos.',
            'retry_after' => (int)$limitState['retry_after'],
        ]);
    } else {
        http_response_code(401);
        echo json_encode(['error' => 'Credenciales incorrectas']);
    }
}
?>
