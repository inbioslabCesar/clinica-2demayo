<?php

require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/modules/ModulosInstalacion.php';
ModulosInstalacion::exigir($mysqli ?? ($pdo ?? null), 'ocupacional');

function respond($statusCode, $payload)
{
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload);
    exit;
}

function parseSessionPermisos()
{
    $raw = $_SESSION['usuario']['permisos'] ?? [];
    if (is_string($raw)) {
        $decoded = json_decode($raw, true);
        $raw = is_array($decoded) ? $decoded : [];
    }
    if (!is_array($raw)) {
        return [];
    }
    return array_values(array_filter(array_map('strval', $raw), fn($v) => trim($v) !== ''));
}

function requireOcupPermiso($permiso)
{
    $usuario = $_SESSION['usuario'] ?? null;
    if (!is_array($usuario)) {
        respond(401, ['success' => false, 'error' => 'No autenticado']);
    }
    $rol = strtolower(trim((string) ($usuario['rol'] ?? '')));
    if ($rol === 'administrador') {
        return;
    }
    $permisos = parseSessionPermisos();
    if (!in_array('access_salud_ocupacional', $permisos, true) || !in_array($permiso, $permisos, true)) {
        respond(403, ['success' => false, 'error' => 'No autorizado para esta accion']);
    }
}

function pacienteBioColumnsAvailable($conn)
{
        $sql = "SELECT COUNT(*) AS total FROM information_schema.COLUMNS
                        WHERE TABLE_SCHEMA = DATABASE()
                            AND TABLE_NAME = 'pacientes'
                            AND COLUMN_NAME IN ('firma_digital', 'huella_digital', 'fotografia')";
        $res = $conn->query($sql);
        $row = $res ? $res->fetch_assoc() : ['total' => 0];
        return (int) ($row['total'] ?? 0) === 3;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    respond(405, ['success' => false, 'error' => 'Metodo no permitido']);
}

requireOcupPermiso('registrar_trabajadores_ocupacional');

$sharedKey = trim((string) (getenv('OCUPACIONAL_SHARED_KEY') ?: ''));
if ($sharedKey !== '') {
    $incomingKey = trim((string) ($_SERVER['HTTP_X_OCUPACIONAL_KEY'] ?? ''));
    if ($incomingKey === '' || !hash_equals($sharedKey, $incomingKey)) {
        respond(401, ['success' => false, 'error' => 'No autorizado']);
    }
}

$documentoTipo = strtoupper(trim((string) ($_GET['documento_tipo'] ?? 'DNI')));
$documentoNumero = strtoupper(trim((string) ($_GET['documento_numero'] ?? $_GET['dni'] ?? '')));

if ($documentoNumero === '') {
    respond(422, ['success' => false, 'error' => 'Documento requerido']);
}

if (!preg_match('/^[A-Z0-9]{6,15}$/', $documentoNumero)) {
    respond(422, ['success' => false, 'error' => 'Documento invalido. Debe ser alfanumerico de 6 a 15 caracteres']);
}

$hasBioColumns = pacienteBioColumnsAvailable($mysqli);

if ($hasBioColumns) {
    $stmt = $mysqli->prepare('SELECT id, nombre, apellido, sexo, fecha_nacimiento, dni, firma_digital, huella_digital, fotografia FROM pacientes WHERE UPPER(dni) = ? LIMIT 1');
} else {
    $stmt = $mysqli->prepare('SELECT id, nombre, apellido, sexo, fecha_nacimiento, dni FROM pacientes WHERE UPPER(dni) = ? LIMIT 1');
}
if (!$stmt) {
    respond(500, ['success' => false, 'error' => 'No se pudo preparar la consulta']);
}

$stmt->bind_param('s', $documentoNumero);
$stmt->execute();
$result = $stmt->get_result();
$row = $result ? $result->fetch_assoc() : null;
$stmt->close();

if (!$row) {
    respond(404, ['success' => false, 'error' => 'Paciente no encontrado']);
}

respond(200, [
    'success' => true,
    'data' => [
        'id' => (int) $row['id'],
        'nombre' => (string) ($row['nombre'] ?? ''),
        'apellido_paterno' => (string) ($row['apellido'] ?? ''),
        'apellido_materno' => '',
        'apellidos' => (string) ($row['apellido'] ?? ''),
        'sexo' => (string) ($row['sexo'] ?? ''),
        'fecha_nacimiento' => (string) ($row['fecha_nacimiento'] ?? ''),
        'documento_tipo' => $documentoTipo,
        'documento_numero' => (string) ($row['dni'] ?? $documentoNumero),
        'tiene_firma_digital' => $hasBioColumns ? (trim((string) ($row['firma_digital'] ?? '')) !== '') : false,
        'tiene_huella_digital' => $hasBioColumns ? (trim((string) ($row['huella_digital'] ?? '')) !== '') : false,
        'tiene_fotografia' => $hasBioColumns ? (trim((string) ($row['fotografia'] ?? '')) !== '') : false
    ]
]);
