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
        $stmt = $pdo->query("SELECT id, titulo, descripcion, precio, icono, imagen_url, orden, activo FROM public_servicios ORDER BY orden ASC, id DESC");
        $servicios = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($servicios as &$s) {
            $s['imagen_url'] = normalizeImageUrl($s['imagen_url'] ?? '');
        }
        unset($s);
        echo json_encode(['success' => true, 'servicios' => $servicios]);
        exit;
    }

    if ($method === 'POST') {
        $data = readJsonBody();
        $titulo = trim((string)($data['titulo'] ?? ''));
        $descripcion = $data['descripcion'] ?? null;
        $precio = $data['precio'] ?? null;
        $icono = $data['icono'] ?? null;
        $imagenUrl = $data['imagen_url'] ?? null;
        $orden = isset($data['orden']) ? intval($data['orden']) : 0;
        $activo = isset($data['activo']) ? intval((bool)$data['activo']) : 1;

        if ($titulo === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Título requerido']);
            exit;
        }

        $stmt = $pdo->prepare("INSERT INTO public_servicios (titulo, descripcion, precio, icono, imagen_url, orden, activo) VALUES (?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([$titulo, $descripcion, $precio, $icono, $imagenUrl, $orden, $activo]);
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

        $titulo = trim((string)($data['titulo'] ?? ''));
        $descripcion = $data['descripcion'] ?? null;
        $precio = $data['precio'] ?? null;
        $icono = $data['icono'] ?? null;
        $imagenUrl = $data['imagen_url'] ?? null;
        $orden = isset($data['orden']) ? intval($data['orden']) : 0;
        $activo = isset($data['activo']) ? intval((bool)$data['activo']) : 1;

        if ($titulo === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Título requerido']);
            exit;
        }

        $stmt = $pdo->prepare("UPDATE public_servicios SET titulo=?, descripcion=?, precio=?, icono=?, imagen_url=?, orden=?, activo=? WHERE id=?");
        $stmt->execute([$titulo, $descripcion, $precio, $icono, $imagenUrl, $orden, $activo, $id]);
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
        $stmt = $pdo->prepare("UPDATE public_servicios SET activo=0 WHERE id=?");
        $stmt->execute([$id]);
        echo json_encode(['success' => true]);
        exit;
    }

    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Método no permitido']);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Error en servicios web']);
}
