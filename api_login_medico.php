
<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

const LOGIN_MEDICO_MAX_ATTEMPTS = 5;
const LOGIN_MEDICO_BLOCK_SECONDS = 300;

function obtener_columnas_medicos_login($conn): array {
    static $columns = null;
    if (is_array($columns)) {
        return $columns;
    }

    $columns = [];
    $result = $conn->query('SHOW COLUMNS FROM medicos');
    if ($result) {
        while ($row = $result->fetch_assoc()) {
            $field = (string)($row['Field'] ?? '');
            if ($field !== '') {
                $columns[$field] = true;
            }
        }
        $result->free();
    }

    return $columns;
}

function resolver_select_medico_login($conn): string {
    $required = ['id', 'nombre', 'apellido', 'especialidad', 'email', 'password', 'cmp', 'rne', 'firma'];
    $optional = [
        'tipo_profesional' => "COALESCE(tipo_profesional, 'medico') AS tipo_profesional",
        'abreviatura_profesional' => "COALESCE(abreviatura_profesional, 'Dr(a).') AS abreviatura_profesional",
        'colegio_sigla' => 'colegio_sigla',
        'nro_colegiatura' => 'nro_colegiatura',
    ];

    $columns = obtener_columnas_medicos_login($conn);
    $parts = $required;
    foreach ($optional as $column => $expr) {
        if (!empty($columns[$column])) {
            $parts[] = $expr;
            continue;
        }

        if ($column === 'tipo_profesional') {
            $parts[] = "'medico' AS tipo_profesional";
        } elseif ($column === 'abreviatura_profesional') {
            $parts[] = "'Dr(a).' AS abreviatura_profesional";
        } else {
            $parts[] = "NULL AS {$column}";
        }
    }

    return implode(', ', $parts);
}

function resolver_where_medico_login($conn): array {
    $columns = obtener_columnas_medicos_login($conn);
    $whereParts = [
        'LOWER(TRIM(email)) = LOWER(TRIM(?))',
        'LOWER(TRIM(SUBSTRING_INDEX(email, "@", 1))) = LOWER(TRIM(?))',
        'TRIM(cmp) = TRIM(?)',
    ];
    $types = 'sss';
    $bindValues = ['identifier', 'identifier', 'identifier'];

    if (!empty($columns['nro_colegiatura'])) {
        $whereParts[] = 'TRIM(nro_colegiatura) = TRIM(?)';
        $types .= 's';
        $bindValues[] = 'identifier';
    }

    return [
        'sql' => implode(' OR ', $whereParts),
        'types' => $types,
        'bind_values' => $bindValues,
    ];
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

$email = trim((string)($data['email'] ?? ($data['usuario'] ?? '')));
$password = $data['password'] ?? '';

if (!$email || !$password) {
    http_response_code(400);
    echo json_encode(['error' => 'Usuario o email y contraseña requeridos']);
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

$selectMedico = resolver_select_medico_login($conn);
$whereLogin = resolver_where_medico_login($conn);
$stmt = $conn->prepare("SELECT {$selectMedico} FROM medicos WHERE {$whereLogin['sql']} LIMIT 1");

$bindParams = [];
foreach ($whereLogin['bind_values'] as $token) {
    $bindParams[] = $token === 'identifier' ? $email : '';
}

$stmt->bind_param($whereLogin['types'], ...$bindParams);
$stmt->execute();
$result = $stmt->get_result();

if ($row = $result->fetch_assoc()) {
    if (password_verify($password, $row['password'])) {
    limpiarRateLimitLoginMedico($email);
    session_regenerate_id(true);
    // Mantener sesion de medico separada para evitar cruces con usuarios internos.
    unset($_SESSION['usuario']);
    $_SESSION['medico_id'] = $row['id'];
    $row['rol'] = 'medico';
    $row['permisos'] = [];
    unset($row['password']); // No enviar la contraseña al frontend
    $_SESSION['medico'] = $row;
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
