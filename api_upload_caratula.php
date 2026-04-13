<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Método no permitido']);
    exit;
}

if (!isset($_FILES['caratula']) || $_FILES['caratula']['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'No se recibió archivo o hubo un error en la subida']);
    exit;
}

$file = $_FILES['caratula'];
$maxBytes = 4 * 1024 * 1024;
if ($file['size'] > $maxBytes) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'El archivo es demasiado grande (máx 4 MB)']);
    exit;
}

$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mime = finfo_file($finfo, $file['tmp_name']);
finfo_close($finfo);

if ($mime !== 'image/png') {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Solo se permite PNG para la carátula']);
    exit;
}

$uploadDir = __DIR__ . '/uploads/caratulas';
if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0755, true);
}

$filename = 'caratula_' . time() . '_' . bin2hex(random_bytes(6)) . '.png';
$dest = $uploadDir . '/' . $filename;

if (!move_uploaded_file($file['tmp_name'], $dest)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'No se pudo mover el archivo al destino']);
    exit;
}

$relativePath = 'uploads/caratulas/' . $filename;
echo json_encode(['success' => true, 'path' => $relativePath]);
exit;
?>