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
    'https://clinica2demayo.com',
    'https://www.clinica2demayo.com'
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins)) {
    header('Access-Control-Allow-Origin: ' . $origin);
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}
// API para buscar pacientes por dni, nombre+apellido o historia_clinica
header('Content-Type: application/json');
require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $tipo = $data['tipo'] ?? '';
    $valor = $data['valor'] ?? '';
    $sql = '';
    $params = [];
    $types = '';

    if ($tipo === 'dni') {
        $sql = 'SELECT * FROM pacientes WHERE dni = ?';
        $params[] = $valor;
        $types = 's';
    } elseif ($tipo === 'nombre') {
        // Separar por espacios y buscar cada palabra en nombre o apellido (OR)
        $palabras = preg_split('/\s+/', trim($valor));
        $where = [];
        $types = '';
        foreach ($palabras as $palabra) {
            $where[] = '(nombre LIKE ? OR apellido LIKE ?)';
            $params[] = "%$palabra%";
            $params[] = "%$palabra%";
            $types .= 'ss';
        }
        $sql = 'SELECT * FROM pacientes WHERE ' . implode(' OR ', $where);
    } elseif ($tipo === 'historia') {
        $sql = 'SELECT * FROM pacientes WHERE historia_clinica = ?';
        $params[] = $valor;
        $types = 's';
    } else {
        echo json_encode(['success' => false, 'error' => 'Tipo de búsqueda inválido']);
        exit;
    }

    $stmt = $conn->prepare($sql);
    if ($types) $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $res = $stmt->get_result();
    $pacientes = $res->fetch_all(MYSQLI_ASSOC);
    if ($pacientes && count($pacientes) > 0) {
        echo json_encode(['success' => true, 'pacientes' => $pacientes]);
    } else {
        echo json_encode(['success' => false, 'error' => 'Paciente no encontrado']);
    }
    $stmt->close();
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'error' => 'Método no permitido']);
