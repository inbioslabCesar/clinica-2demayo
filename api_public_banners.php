<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/db.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Método no permitido']);
    exit;
}

function getBaseUrlPrefix() {
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? '';
    $scriptName = $_SERVER['SCRIPT_NAME'] ?? '';
    $basePath = rtrim(str_replace('\\', '/', dirname($scriptName)), '/');
    if ($basePath === '.' || $basePath === '/') $basePath = '';
    return [$scheme . '://' . $host, $basePath];
}

function normalizeImageUrl($url) {
    $url = trim((string)$url);
    if ($url === '') return $url;

    [$origin, $basePath] = getBaseUrlPrefix();
    $prefix = $origin . $basePath;

    if (str_starts_with($url, '/uploads/')) {
        return $prefix . $url;
    }
    if (str_starts_with($url, 'uploads/')) {
        return $prefix . '/' . $url;
    }

    if (preg_match('#^https?://#i', $url)) {
        $parts = parse_url($url);
        $host = $parts['host'] ?? null;
        $path = $parts['path'] ?? '';
        $currentHost = $_SERVER['HTTP_HOST'] ?? '';

        // Si fue guardado como http://localhost/uploads/... en vez de http://localhost/clinica-2demayo/uploads/...
        if ($host && $currentHost && strcasecmp($host, $currentHost) === 0) {
            if (str_starts_with($path, '/uploads/') && $basePath !== '' && !str_starts_with($path, $basePath . '/uploads/')) {
                return $origin . $basePath . $path;
            }
        }
    }

    return $url;
}

try {
    try {
        $stmt = $pdo->query("SELECT id, titulo, subtitulo, imagen_url, imagen_fija_url, overlay_blanco, texto_lado, titulo_color, subtitulo_color, titulo_tamano, subtitulo_tamano, orden FROM public_banners WHERE activo = 1 ORDER BY orden ASC, id DESC");
        $banners = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (PDOException $e2) {
        // Compatibilidad si aún no se ejecutaron algunas migraciones
        $msg = $e2->getMessage() ?? '';
        if (stripos($msg, 'Unknown column') !== false) {
            $stmt = $pdo->query("SELECT id, titulo, subtitulo, imagen_url, imagen_fija_url, orden FROM public_banners WHERE activo = 1 ORDER BY orden ASC, id DESC");
            $banners = $stmt->fetchAll(PDO::FETCH_ASSOC);
            foreach ($banners as &$b2) {
                $b2['overlay_blanco'] = 1;
                $b2['texto_lado'] = 'left';
                $b2['titulo_color'] = null;
                $b2['subtitulo_color'] = null;
                $b2['titulo_tamano'] = 'lg';
                $b2['subtitulo_tamano'] = 'md';
            }
            unset($b2);
        } else {
            throw $e2;
        }
    }
    foreach ($banners as &$b) {
        $b['imagen_url'] = normalizeImageUrl($b['imagen_url'] ?? '');
        $b['imagen_fija_url'] = normalizeImageUrl($b['imagen_fija_url'] ?? '');
        $b['overlay_blanco'] = isset($b['overlay_blanco']) ? intval($b['overlay_blanco']) : 1;
        $b['texto_lado'] = (($b['texto_lado'] ?? 'left') === 'right') ? 'right' : 'left';
        $b['titulo_color'] = isset($b['titulo_color']) ? trim((string)$b['titulo_color']) : '';
        if ($b['titulo_color'] === '') $b['titulo_color'] = null;
        $b['subtitulo_color'] = isset($b['subtitulo_color']) ? trim((string)$b['subtitulo_color']) : '';
        if ($b['subtitulo_color'] === '') $b['subtitulo_color'] = null;
        $b['titulo_tamano'] = isset($b['titulo_tamano']) ? trim((string)$b['titulo_tamano']) : '';
        if ($b['titulo_tamano'] === '') $b['titulo_tamano'] = 'lg';
        $b['subtitulo_tamano'] = isset($b['subtitulo_tamano']) ? trim((string)$b['subtitulo_tamano']) : '';
        if ($b['subtitulo_tamano'] === '') $b['subtitulo_tamano'] = 'md';
    }
    unset($b);

    echo json_encode([
        'success' => true,
        'banners' => $banners,
    ]);
} catch (PDOException $e) {
    // Tabla no existe aún (primera vez en despliegue)
    if (($e->getCode() ?? '') === '42S02') {
        echo json_encode([
            'success' => true,
            'banners' => [],
            'warning' => 'Tabla public_banners no existe aún'
        ]);
        exit;
    }

    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Error al obtener banners']);
}
