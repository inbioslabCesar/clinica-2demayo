<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth_check.php';

$rol = $_SESSION['usuario']['rol'] ?? null;
if ($rol !== 'administrador') {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Solo administradores']);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

function readJsonBody() {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
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
    if ($method === 'GET') {
        try {
            try {
                $stmt = $pdo->query("SELECT id, titulo, subtitulo, imagen_url, imagen_fija_url, overlay_blanco, texto_lado, titulo_color, subtitulo_color, titulo_tamano, subtitulo_tamano, orden, activo FROM public_banners ORDER BY orden ASC, id DESC");
                $banners = $stmt->fetchAll(PDO::FETCH_ASSOC);
            } catch (PDOException $e2) {
                // Compatibilidad si aún no se ejecutaron algunas migraciones
                $msg = $e2->getMessage() ?? '';
                if (stripos($msg, 'Unknown column') !== false) {
                    $stmt = $pdo->query("SELECT id, titulo, subtitulo, imagen_url, imagen_fija_url, orden, activo FROM public_banners ORDER BY orden ASC, id DESC");
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
            echo json_encode(['success' => true, 'banners' => $banners]);
            exit;
        } catch (PDOException $e) {
            // Tabla no existe aún (primera vez)
            if (($e->getCode() ?? '') === '42S02') {
                echo json_encode([
                    'success' => true,
                    'banners' => [],
                    'warning' => 'Tabla public_banners no existe aún'
                ]);
                exit;
            }
            throw $e;
        }
    }

    if ($method === 'POST') {
        $data = readJsonBody();
        $titulo = isset($data['titulo']) ? trim((string)$data['titulo']) : null;
        $subtitulo = isset($data['subtitulo']) ? trim((string)$data['subtitulo']) : null;
        $imagenUrl = trim((string)($data['imagen_url'] ?? ''));
        $imagenFijaUrl = trim((string)($data['imagen_fija_url'] ?? ''));
        $overlayBlanco = isset($data['overlay_blanco']) ? intval((bool)$data['overlay_blanco']) : 1;
        $textoLado = (($data['texto_lado'] ?? 'left') === 'right') ? 'right' : 'left';
        $tituloColor = trim((string)($data['titulo_color'] ?? ''));
        if ($tituloColor === '') $tituloColor = null;
        $subtituloColor = trim((string)($data['subtitulo_color'] ?? ''));
        if ($subtituloColor === '') $subtituloColor = null;
        $tituloTamano = trim((string)($data['titulo_tamano'] ?? ''));
        if ($tituloTamano === '') $tituloTamano = 'lg';
        $subtituloTamano = trim((string)($data['subtitulo_tamano'] ?? ''));
        if ($subtituloTamano === '') $subtituloTamano = 'md';
        $orden = isset($data['orden']) ? intval($data['orden']) : 0;
        $activo = isset($data['activo']) ? intval((bool)$data['activo']) : 1;

        if ($imagenUrl === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Imagen URL requerida']);
            exit;
        }

        if ($imagenFijaUrl === '') $imagenFijaUrl = null;

        try {
            $stmt = $pdo->prepare("INSERT INTO public_banners (titulo, subtitulo, imagen_url, imagen_fija_url, overlay_blanco, texto_lado, titulo_color, subtitulo_color, titulo_tamano, subtitulo_tamano, orden, activo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$titulo, $subtitulo, $imagenUrl, $imagenFijaUrl, $overlayBlanco, $textoLado, $tituloColor, $subtituloColor, $tituloTamano, $subtituloTamano, $orden, $activo]);
        } catch (PDOException $e2) {
            // Compatibilidad si aún no se ejecutaron algunas migraciones
            $msg = $e2->getMessage() ?? '';
            if (stripos($msg, 'Unknown column') !== false) {
                $stmt = $pdo->prepare("INSERT INTO public_banners (titulo, subtitulo, imagen_url, imagen_fija_url, orden, activo) VALUES (?, ?, ?, ?, ?, ?)");
                $stmt->execute([$titulo, $subtitulo, $imagenUrl, $imagenFijaUrl, $orden, $activo]);
            } else {
                throw $e2;
            }
        }
        echo json_encode(['success' => true, 'id' => intval($pdo->lastInsertId())]);
        exit;
    }

    if ($method === 'PUT') {
        $data = readJsonBody();
        $id = intval($data['id'] ?? 0);
        if ($id <= 0) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'ID inválido']);
            exit;
        }

        $titulo = isset($data['titulo']) ? trim((string)$data['titulo']) : null;
        $subtitulo = isset($data['subtitulo']) ? trim((string)$data['subtitulo']) : null;
        $imagenUrl = trim((string)($data['imagen_url'] ?? ''));
        $imagenFijaUrl = trim((string)($data['imagen_fija_url'] ?? ''));
        $overlayBlanco = isset($data['overlay_blanco']) ? intval((bool)$data['overlay_blanco']) : 1;
        $textoLado = (($data['texto_lado'] ?? 'left') === 'right') ? 'right' : 'left';
        $tituloColor = trim((string)($data['titulo_color'] ?? ''));
        if ($tituloColor === '') $tituloColor = null;
        $subtituloColor = trim((string)($data['subtitulo_color'] ?? ''));
        if ($subtituloColor === '') $subtituloColor = null;
        $tituloTamano = trim((string)($data['titulo_tamano'] ?? ''));
        if ($tituloTamano === '') $tituloTamano = 'lg';
        $subtituloTamano = trim((string)($data['subtitulo_tamano'] ?? ''));
        if ($subtituloTamano === '') $subtituloTamano = 'md';
        $orden = isset($data['orden']) ? intval($data['orden']) : 0;
        $activo = isset($data['activo']) ? intval((bool)$data['activo']) : 1;

        if ($imagenUrl === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Imagen URL requerida']);
            exit;
        }

        if ($imagenFijaUrl === '') $imagenFijaUrl = null;

        try {
            $stmt = $pdo->prepare("UPDATE public_banners SET titulo=?, subtitulo=?, imagen_url=?, imagen_fija_url=?, overlay_blanco=?, texto_lado=?, titulo_color=?, subtitulo_color=?, titulo_tamano=?, subtitulo_tamano=?, orden=?, activo=? WHERE id=?");
            $stmt->execute([$titulo, $subtitulo, $imagenUrl, $imagenFijaUrl, $overlayBlanco, $textoLado, $tituloColor, $subtituloColor, $tituloTamano, $subtituloTamano, $orden, $activo, $id]);
        } catch (PDOException $e2) {
            // Compatibilidad si aún no se ejecutaron algunas migraciones
            $msg = $e2->getMessage() ?? '';
            if (stripos($msg, 'Unknown column') !== false) {
                $stmt = $pdo->prepare("UPDATE public_banners SET titulo=?, subtitulo=?, imagen_url=?, imagen_fija_url=?, orden=?, activo=? WHERE id=?");
                $stmt->execute([$titulo, $subtitulo, $imagenUrl, $imagenFijaUrl, $orden, $activo, $id]);
            } else {
                throw $e2;
            }
        }
        echo json_encode(['success' => true]);
        exit;
    }

    if ($method === 'DELETE') {
        $data = readJsonBody();
        $id = intval($data['id'] ?? 0);
        if ($id <= 0) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'ID inválido']);
            exit;
        }

        // Soft delete
        $stmt = $pdo->prepare("UPDATE public_banners SET activo=0 WHERE id=?");
        $stmt->execute([$id]);
        echo json_encode(['success' => true]);
        exit;
    }

    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Método no permitido']);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Error en banners web']);
}
