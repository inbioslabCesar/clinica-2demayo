<?php

require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/modules/ModulosInstalacion.php';
ModulosInstalacion::exigir($mysqli ?? ($pdo ?? null), 'ocupacional');

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Metodo no permitido']);
    exit;
}

$usuario = $_SESSION['usuario'] ?? null;
if (!is_array($usuario) || strtolower(trim((string)($usuario['rol'] ?? ''))) !== 'administrador') {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Solo administradores pueden subir el logo ocupacional']);
    exit;
}

if (!isset($_FILES['logo_ocupacional']) || $_FILES['logo_ocupacional']['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'No se recibio el logo ocupacional']);
    exit;
}

$file = $_FILES['logo_ocupacional'];
if ((int)$file['size'] > 5 * 1024 * 1024) {
    http_response_code(422);
    echo json_encode(['success' => false, 'error' => 'El logo excede el maximo de 5 MB']);
    exit;
}

$imageInfo = @getimagesize($file['tmp_name']);
if (!is_array($imageInfo) || !isset($imageInfo[0], $imageInfo[1], $imageInfo['mime'])) {
    http_response_code(422);
    echo json_encode(['success' => false, 'error' => 'El archivo no es una imagen valida']);
    exit;
}

$allowed = ['image/png' => 'png', 'image/jpeg' => 'jpg'];
$mime = strtolower((string)$imageInfo['mime']);
if (!isset($allowed[$mime])) {
    http_response_code(422);
    echo json_encode(['success' => false, 'error' => 'Use una imagen PNG o JPG']);
    exit;
}

$width = (int)$imageInfo[0];
$height = (int)$imageInfo[1];
$ratio = $height > 0 ? $width / $height : 0;
if ($width < 600 || $height < 120) {
    http_response_code(422);
    echo json_encode(['success' => false, 'error' => 'El logo debe medir como minimo 600 x 120 px']);
    exit;
}
if ($ratio < 2.5 || $ratio > 6.5) {
    http_response_code(422);
    echo json_encode(['success' => false, 'error' => 'El logo debe ser horizontal, con proporcion entre 2.5:1 y 6.5:1']);
    exit;
}

$uploadDir = __DIR__ . '/uploads';
if (!is_dir($uploadDir) && !mkdir($uploadDir, 0755, true)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'No se pudo preparar la carpeta de carga']);
    exit;
}

$filename = 'logo_ocupacional_' . date('Ymd_His') . '_' . bin2hex(random_bytes(5)) . '.' . $allowed[$mime];
$destination = $uploadDir . '/' . $filename;
if (!move_uploaded_file($file['tmp_name'], $destination)) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'No se pudo guardar el logo ocupacional']);
    exit;
}

echo json_encode([
    'success' => true,
    'path' => 'uploads/' . $filename,
    'width' => $width,
    'height' => $height,
]);
exit;