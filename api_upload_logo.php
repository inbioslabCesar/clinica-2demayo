<?php
require_once __DIR__ . '/init_api.php';
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

function is_safe_svg(string $tmpPath): bool {
    $content = @file_get_contents($tmpPath);
    if ($content === false) return false;

    $lower = strtolower($content);
    if (strpos($lower, '<svg') === false) return false;

    // Bloquear vectores comunes de XSS en SVG
    if (preg_match('/<\s*script\b/i', $content)) return false;
    if (preg_match('/on[a-z]+\s*=\s*/i', $content)) return false;
    if (preg_match('/javascript\s*:/i', $content)) return false;

    return true;
}

// Detectar tipo mime real
$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mime = finfo_file($finfo, $file['tmp_name']);
finfo_close($finfo);

$originalExt = strtolower(pathinfo($file['name'] ?? '', PATHINFO_EXTENSION));

$allowed = [
    'image/png' => 'png',
    'image/jpeg' => 'jpg',
    'image/svg+xml' => 'svg'
];

$ext = null;

if (isset($allowed[$mime])) {
    $ext = $allowed[$mime];
} elseif ($originalExt === 'svg' && in_array($mime, ['text/plain', 'text/xml', 'application/xml'], true) && is_safe_svg($file['tmp_name'])) {
    // Algunos entornos detectan SVG como text/plain o XML.
    $ext = 'svg';
}

if ($ext === null) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Tipo de archivo no permitido. Use PNG, JPG o SVG']);
    exit;
}

if ($ext === 'svg' && !is_safe_svg($file['tmp_name'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'El archivo SVG contiene contenido no permitido']);
    exit;
}

// Preparar carpeta destino
$uploadDir = __DIR__ . '/uploads';
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
$relativePath = 'uploads/' . $filename;

echo json_encode(['success' => true, 'path' => $relativePath]);
exit;

?>