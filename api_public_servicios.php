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
        if ($host && $currentHost && strcasecmp($host, $currentHost) === 0) {
            if (str_starts_with($path, '/uploads/') && $basePath !== '' && !str_starts_with($path, $basePath . '/uploads/')) {
                return $origin . $basePath . $path;
            }
        }
    }

    return $url;
}

try {
    $stmt = $pdo->query("SELECT id, titulo, descripcion, precio, icono, imagen_url, orden FROM public_servicios WHERE activo = 1 ORDER BY orden ASC, id DESC");
    $servicios = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($servicios as &$s) {
        $s['imagen_url'] = normalizeImageUrl($s['imagen_url'] ?? '');
    }
    unset($s);

    echo json_encode([
        'success' => true,
        'servicios' => $servicios,
    ]);
} catch (PDOException $e) {
    // Tabla no existe aún (primera vez en despliegue)
    if (($e->getCode() ?? '') === '42S02') {
        echo json_encode([
            'success' => true,
            'servicios' => [],
            'warning' => 'Tabla public_servicios no existe aún'
        ]);
        exit;
    }

    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Error al obtener servicios']);
}
