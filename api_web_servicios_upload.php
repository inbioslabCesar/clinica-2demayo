<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/auth_check.php';

$rol = $_SESSION['usuario']['rol'] ?? null;
if ($rol !== 'administrador') {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Solo administradores']);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Método no permitido']);
    exit;
}

if (!isset($_FILES['imagen']) || !is_uploaded_file($_FILES['imagen']['tmp_name'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Archivo requerido (campo: imagen)']);
    exit;
}

$file = $_FILES['imagen'];
if (($file['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Error al subir archivo']);
    exit;
}

$maxBytes = 5 * 1024 * 1024; // 5MB
if (!empty($file['size']) && $file['size'] > $maxBytes) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Archivo demasiado grande (máx 5MB)']);
    exit;
}

$tmpPath = $file['tmp_name'];
$finfo = new finfo(FILEINFO_MIME_TYPE);
$mime = $finfo->file($tmpPath);

$allowed = [
    'image/png' => 'png',
    'image/jpeg' => 'jpg',
];

if (!isset($allowed[$mime])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Formato no permitido. Solo PNG o JPG']);
    exit;
}

$ext = $allowed[$mime];

try {
    $bytes = random_bytes(8);
    $suffix = bin2hex($bytes);
} catch (Exception $e) {
    $suffix = bin2hex(pack('N', mt_rand())) . bin2hex(pack('N', mt_rand()));
}

$filename = 'servicio_' . date('Ymd_His') . '_' . $suffix . '.' . $ext;
$relativeDir = '/uploads/web/servicios';
$targetDir = __DIR__ . $relativeDir;

function getBaseUrlPrefix() {
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? '';
    $scriptName = $_SERVER['SCRIPT_NAME'] ?? '';
    $basePath = rtrim(str_replace('\\', '/', dirname($scriptName)), '/');
    if ($basePath === '.' || $basePath === '/') $basePath = '';
    return $scheme . '://' . $host . $basePath;
}

if (!is_dir($targetDir)) {
    @mkdir($targetDir, 0775, true);
}

$targetPath = $targetDir . '/' . $filename;
if (!move_uploaded_file($tmpPath, $targetPath)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'No se pudo guardar la imagen']);
    exit;
}

$absoluteUrl = getBaseUrlPrefix() . $relativeDir . '/' . $filename;

echo json_encode([
    'success' => true,
    'url' => $absoluteUrl,
    'mime' => $mime,
]);
