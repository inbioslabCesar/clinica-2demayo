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
    if ($host !== '') {
        $hostOnly = preg_replace('/:\\d+$/', '', $host);
        $port = null;
        if (preg_match('/:(\\d+)$/', $host, $mPort)) {
            $port = intval($mPort[1]);
        }
        $isLocal = in_array(strtolower($hostOnly), ['localhost', '127.0.0.1', '::1'], true);
        if ($isLocal && in_array($port, [5173, 5174], true)) {
            $host = $hostOnly;
        }
    }
    $scriptName = $_SERVER['SCRIPT_NAME'] ?? '';
    $basePath = rtrim(str_replace('\\', '/', dirname($scriptName)), '/');
    if ($basePath === '.' || $basePath === '/') $basePath = '';
    return [$scheme . '://' . $host, $basePath];
}

function startsWithCompat($haystack, $needle) {
    $haystack = (string)$haystack;
    $needle = (string)$needle;
    if ($needle === '') return true;
    return substr($haystack, 0, strlen($needle)) === $needle;
}

function normalizeImageUrl($url) {
    $url = trim((string)$url);
    if ($url === '') return $url;

    [$origin, $basePath] = getBaseUrlPrefix();
    $prefix = $origin . $basePath;

    if (startsWithCompat($url, '/uploads/')) {
        return $prefix . $url;
    }
    if (startsWithCompat($url, 'uploads/')) {
        return $prefix . '/' . $url;
    }

    if (preg_match('#^https?://#i', $url)) {
        $parts = parse_url($url);
        $host = $parts['host'] ?? null;
        $path = $parts['path'] ?? '';
        $currentHost = $_SERVER['HTTP_HOST'] ?? '';

        if ($host && $currentHost && strcasecmp($host, $currentHost) !== 0) {
            if (startsWithCompat($path, $basePath . '/uploads/')) {
                return $prefix . substr($path, strlen($basePath));
            }
            if (startsWithCompat($path, '/uploads/')) {
                return $prefix . $path;
            }
            if (preg_match('#/[a-z0-9_-]+/uploads/#i', $path)) {
                $pos = strpos($path, '/uploads/');
                if ($pos !== false) {
                    return $prefix . substr($path, $pos);
                }
            }
        }

        if ($host && $currentHost && strcasecmp($host, $currentHost) === 0) {
            if (startsWithCompat($path, '/uploads/') && $basePath !== '' && !startsWithCompat($path, $basePath . '/uploads/')) {
                return $origin . $basePath . $path;
            }
        }
    }

    return $url;
}

try {
    $sql = "
        SELECT 
            id,
            titulo,
            descripcion,
            precio_antes,
            precio_oferta,
            fecha_inicio,
            fecha_fin,
            imagen_url,
            orden
        FROM public_ofertas
        WHERE activo = 1
        AND (fecha_inicio IS NULL OR fecha_inicio <= CURDATE())
        AND (fecha_fin IS NULL OR fecha_fin >= CURDATE())
        ORDER BY orden ASC, id DESC
    ";

    $stmt = $pdo->query($sql);
    $ofertas = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Campo amigable de vigencia para mostrar en frontend sin logica adicional
    foreach ($ofertas as &$o) {
        $o['imagen_url'] = normalizeImageUrl($o['imagen_url'] ?? '');
        $inicio = $o['fecha_inicio'] ?? null;
        $fin = $o['fecha_fin'] ?? null;
        $inicioFmt = $inicio ? date('d/m/Y', strtotime($inicio)) : null;
        $finFmt = $fin ? date('d/m/Y', strtotime($fin)) : null;

        if ($inicioFmt && $finFmt) $o['vigencia'] = $inicioFmt . ' al ' . $finFmt;
        elseif ($inicioFmt) $o['vigencia'] = 'Desde ' . $inicioFmt;
        elseif ($finFmt) $o['vigencia'] = 'Hasta ' . $finFmt;
        else $o['vigencia'] = 'Vigencia permanente';
    }
    unset($o);

    echo json_encode([
        'success' => true,
        'ofertas' => $ofertas,
    ]);
} catch (PDOException $e) {
    if (($e->getCode() ?? '') === '42S02') {
        echo json_encode([
            'success' => true,
            'ofertas' => [],
            'warning' => 'Tabla public_ofertas no existe aún'
        ]);
        exit;
    }

    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Error al obtener ofertas']);
}
