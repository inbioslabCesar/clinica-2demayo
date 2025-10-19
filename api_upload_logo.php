<?php
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '',
    'secure' => false,
    'httponly' => true,
    'samesite' => 'Lax'
]);
session_start();

// CORS — permitir llamadas desde el frontend (ajustar según sea necesario)
$allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176'
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins)) {
    header('Access-Control-Allow-Origin: ' . $origin);
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Access-Control-Allow-Methods: POST, OPTIONS');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    // Responder preflight
    http_response_code(200);
    exit;
}

header('Content-Type: application/json');
require_once __DIR__ . '/config.php';

// Solo permitir POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Método no permitido']);
    exit;
}

// Verificar que llegue archivo
if (!isset($_FILES['logo']) || $_FILES['logo']['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'No se recibió archivo o hubo un error en la subida']);
    exit;
}

$file = $_FILES['logo'];

// Validar tamaño (máx 2.5 MB)
$maxBytes = 2.5 * 1024 * 1024;
if ($file['size'] > $maxBytes) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'El archivo es demasiado grande (máx 2.5 MB)']);
    exit;
}

// Detectar tipo mime real
$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mime = finfo_file($finfo, $file['tmp_name']);
finfo_close($finfo);

$allowed = [
    'image/png' => 'png',
    'image/jpeg' => 'jpg',
    'image/svg+xml' => 'svg'
];

if (!isset($allowed[$mime])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Tipo de archivo no permitido']);
    exit;
}

$ext = $allowed[$mime];

// Preparar carpeta destino
$uploadDir = __DIR__ . '/public/uploads';
if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

// Nombre seguro
$base = 'logo_' . time() . '_' . bin2hex(random_bytes(6));
$filename = $base . '.' . $ext;
$dest = $uploadDir . '/' . $filename;

if (!move_uploaded_file($file['tmp_name'], $dest)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'No se pudo mover el archivo al destino']);
    exit;
}

// Devolver la ruta relativa que puede guardarse en logo_url
$relativePath = 'public/uploads/' . $filename;

echo json_encode(['success' => true, 'path' => $relativePath]);
exit;

?>