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

$allowed = [
    'image/png' => 'png',
    'image/jpeg' => 'jpg',
];

$maxBytes = 5 * 1024 * 1024; // 5MB
$relativeDir = '/uploads/web/banners';
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

function buildSuffix() {
    try {
        $bytes = random_bytes(8);
        return bin2hex($bytes);
    } catch (Exception $e) {
        return bin2hex(pack('N', mt_rand())) . bin2hex(pack('N', mt_rand()));
    }
}

function saveOneBannerImage($tmpPath, $size, $error, $targetDir, $relativeDir, $allowed, $maxBytes) {
    if (($error ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) {
        throw new RuntimeException('Error al subir archivo');
    }
    if (!is_uploaded_file($tmpPath)) {
        throw new RuntimeException('Archivo inválido');
    }
    if (!empty($size) && $size > $maxBytes) {
        throw new RuntimeException('Archivo demasiado grande (máx 5MB)');
    }

    $finfo = new finfo(FILEINFO_MIME_TYPE);
    $mime = $finfo->file($tmpPath);
    if (!isset($allowed[$mime])) {
        throw new RuntimeException('Formato no permitido. Solo PNG o JPG');
    }
    $ext = $allowed[$mime];

    $filename = 'banner_' . date('Ymd_His') . '_' . buildSuffix() . '.' . $ext;
    $targetPath = $targetDir . '/' . $filename;
    if (!move_uploaded_file($tmpPath, $targetPath)) {
        throw new RuntimeException('No se pudo guardar la imagen');
    }

    $absoluteUrl = getBaseUrlPrefix() . $relativeDir . '/' . $filename;

    return [$absoluteUrl, $mime];
}

$urls = [];
$mimes = [];

// Soporta single: imagen, y multiple: imagen[] (PHP expone en $_FILES['imagen'] como arrays)
$file = $_FILES['imagen'];
$isMultiple = is_array($file['name'] ?? null);

try {
    if ($isMultiple) {
        $count = count($file['tmp_name'] ?? []);
        for ($i = 0; $i < $count; $i++) {
            $tmpPath = $file['tmp_name'][$i] ?? null;
            if (!$tmpPath) continue;
            [$url, $mime] = saveOneBannerImage(
                $tmpPath,
                $file['size'][$i] ?? null,
                $file['error'][$i] ?? null,
                $targetDir,
                $relativeDir,
                $allowed,
                $maxBytes
            );
            $urls[] = $url;
            $mimes[] = $mime;
        }
    } else {
        [$url, $mime] = saveOneBannerImage(
            $file['tmp_name'] ?? null,
            $file['size'] ?? null,
            $file['error'] ?? null,
            $targetDir,
            $relativeDir,
            $allowed,
            $maxBytes
        );
        $urls[] = $url;
        $mimes[] = $mime;
    }
} catch (RuntimeException $e) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    exit;
}

if (count($urls) === 0) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Archivo requerido (campo: imagen)']);
    exit;
}

echo json_encode([
    'success' => true,
    'url' => $urls[0],
    'urls' => $urls,
    'mime' => $mimes[0] ?? null,
    'mimes' => $mimes,
]);
