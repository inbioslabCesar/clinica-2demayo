

<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_BLOCK_SECONDS = 300;

function normalizarPermisosLogin($raw) {
    if (is_string($raw)) {
        $decoded = json_decode($raw, true);
        if (json_last_error() === JSON_ERROR_NONE) {
            $raw = $decoded;
        } else {
            $raw = [];
        }
    }
    if (!is_array($raw)) {
        return [];
    }
    return array_values(array_filter(array_map('strval', $raw), fn($v) => trim($v) !== ''));
}

function obtenerRateLimitLogin(string $usuario): array {
    $usuarioKey = mb_strtolower(trim($usuario), 'UTF-8');
    if (!isset($_SESSION['login_rate_limit']) || !is_array($_SESSION['login_rate_limit'])) {
        $_SESSION['login_rate_limit'] = [];
    }
    $entry = $_SESSION['login_rate_limit'][$usuarioKey] ?? [
        'attempts' => 0,
        'blocked_until' => 0,
    ];
    return [
        'key' => $usuarioKey,
        'attempts' => (int)($entry['attempts'] ?? 0),
        'blocked_until' => (int)($entry['blocked_until'] ?? 0),
    ];
}

function registrarFalloLogin(string $usuario): array {
    $limit = obtenerRateLimitLogin($usuario);
    $attempts = $limit['attempts'] + 1;
    $blockedUntil = 0;

    if ($attempts >= LOGIN_MAX_ATTEMPTS) {
        $blockedUntil = time() + LOGIN_BLOCK_SECONDS;
        $attempts = 0;
    }

    $_SESSION['login_rate_limit'][$limit['key']] = [
        'attempts' => $attempts,
        'blocked_until' => $blockedUntil,
    ];

    return [
        'blocked_until' => $blockedUntil,
        'retry_after' => max(0, $blockedUntil - time()),
    ];
}

function limpiarRateLimitLogin(string $usuario): void {
    $limit = obtenerRateLimitLogin($usuario);
    unset($_SESSION['login_rate_limit'][$limit['key']]);
}

// Obtener datos del POST
$data = json_decode(file_get_contents('php://input'), true);
$usuario = $data['usuario'] ?? '';
$password = $data['password'] ?? '';

if (!$usuario || !$password) {
    http_response_code(400);
    echo json_encode(['error' => 'Usuario y contraseña requeridos']);
    exit;
}

$loginLimit = obtenerRateLimitLogin($usuario);
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

// Consulta segura usando SHA2 para la contraseña
$stmt = $mysqli->prepare('SELECT id, usuario, nombre, rol, permisos FROM usuarios WHERE usuario = ? AND password = SHA2(?, 256) LIMIT 1');
$stmt->bind_param('ss', $usuario, $password);
$stmt->execute();
$result = $stmt->get_result();

if ($row = $result->fetch_assoc()) {
    $row['permisos'] = normalizarPermisosLogin($row['permisos'] ?? '[]');
    limpiarRateLimitLogin($usuario);
    session_regenerate_id(true);
    // Guardar usuario en sesión
    $_SESSION['usuario'] = $row;
    echo json_encode(['success' => true, 'usuario' => $row]);
} else {
    $limitState = registrarFalloLogin($usuario);
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

$stmt->close();
$mysqli->close();
