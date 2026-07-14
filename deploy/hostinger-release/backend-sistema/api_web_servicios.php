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

function normalizeOrdenValue($orden) {
    $n = intval($orden);
    return ($n > 0) ? $n : 1;
}

function reordenarServicios(PDO $pdo, $focusId, $targetOrden) {
    $focusId = intval($focusId);
    if ($focusId <= 0) return;

    $stmt = $pdo->query("SELECT id FROM public_servicios ORDER BY orden ASC, id ASC");
    $ids = array_map(static function ($row) {
        return intval($row['id'] ?? 0);
    }, $stmt->fetchAll(PDO::FETCH_ASSOC));

    $ids = array_values(array_filter($ids, static function ($id) {
        return $id > 0;
    }));

    $ids = array_values(array_filter($ids, static function ($id) use ($focusId) {
        return $id !== $focusId;
    }));

    $targetIndex = normalizeOrdenValue($targetOrden) - 1;
    $count = count($ids);
    if ($targetIndex < 0) $targetIndex = 0;
    if ($targetIndex > $count) $targetIndex = $count;

    array_splice($ids, $targetIndex, 0, [$focusId]);

    $upd = $pdo->prepare("UPDATE public_servicios SET orden=? WHERE id=?");
    $orden = 1;
    foreach ($ids as $id) {
        $upd->execute([$orden, $id]);
        $orden++;
    }
}

try {
    if ($method === 'GET') {
        try {
            $stmt = $pdo->query("SELECT id, titulo, descripcion, precio, icono, imagen_url, tipo, imagen_shape, imagen_tipo, orden, activo FROM public_servicios ORDER BY orden ASC, id DESC");
            $servicios = $stmt->fetchAll(PDO::FETCH_ASSOC);
        } catch (PDOException $e) {
            // Fallback si las columnas no existen
            try {
                $stmt = $pdo->query("SELECT id, titulo, descripcion, precio, icono, imagen_url, tipo, orden, activo FROM public_servicios ORDER BY orden ASC, id DESC");
                $servicios = $stmt->fetchAll(PDO::FETCH_ASSOC);
                foreach ($servicios as &$s) {
                    $s['imagen_shape'] = 'rounded';
                    $s['imagen_tipo'] = 'normal';
                }
                unset($s);
            } catch (PDOException $e2) {
                // Fallback si ni tipo existe
                $stmt = $pdo->query("SELECT id, titulo, descripcion, precio, icono, imagen_url, orden, activo FROM public_servicios ORDER BY orden ASC, id DESC");
                $servicios = $stmt->fetchAll(PDO::FETCH_ASSOC);
                foreach ($servicios as &$s) {
                    $s['tipo'] = 'clasico';
                    $s['imagen_shape'] = 'rounded';
                    $s['imagen_tipo'] = 'normal';
                }
                unset($s);
            }
        }
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
        $tipo = trim((string)($data['tipo'] ?? 'clasico'));
        if (!in_array($tipo, ['clasico', 'premium'], true)) {
            $tipo = 'clasico';
        }
        $imagenShape = trim((string)($data['imagen_shape'] ?? 'rounded'));
        if (!in_array($imagenShape, ['square', 'rounded', 'circle'], true)) {
            $imagenShape = 'rounded';
        }
        $imagenTipo = trim((string)($data['imagen_tipo'] ?? 'normal'));
        if (!in_array($imagenTipo, ['normal', 'overlay'], true)) {
            $imagenTipo = 'normal';
        }
        $orden = normalizeOrdenValue($data['orden'] ?? 1);
        $activo = isset($data['activo']) ? intval((bool)$data['activo']) : 1;

        if ($titulo === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Título requerido']);
            exit;
        }

        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare("INSERT INTO public_servicios (titulo, descripcion, precio, icono, imagen_url, tipo, imagen_shape, imagen_tipo, orden, activo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$titulo, $descripcion, $precio, $icono, $imagenUrl, $tipo, $imagenShape, $imagenTipo, $orden, $activo]);
        } catch (PDOException $e) {
            // Fallback si las nuevas columnas no existen
            try {
                $stmt = $pdo->prepare("INSERT INTO public_servicios (titulo, descripcion, precio, icono, imagen_url, tipo, orden, activo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                $stmt->execute([$titulo, $descripcion, $precio, $icono, $imagenUrl, $tipo, $orden, $activo]);
            } catch (PDOException $e2) {
                $stmt = $pdo->prepare("INSERT INTO public_servicios (titulo, descripcion, precio, icono, imagen_url, orden, activo) VALUES (?, ?, ?, ?, ?, ?, ?)");
                $stmt->execute([$titulo, $descripcion, $precio, $icono, $imagenUrl, $orden, $activo]);
            }
        }
        $newId = intval($pdo->lastInsertId());
        reordenarServicios($pdo, $newId, $orden);
        $pdo->commit();
        echo json_encode(['success' => true, 'id' => $newId]);
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
        $tipo = trim((string)($data['tipo'] ?? 'clasico'));
        if (!in_array($tipo, ['clasico', 'premium'], true)) {
            $tipo = 'clasico';
        }
        $imagenShape = trim((string)($data['imagen_shape'] ?? 'rounded'));
        if (!in_array($imagenShape, ['square', 'rounded', 'circle'], true)) {
            $imagenShape = 'rounded';
        }
        $imagenTipo = trim((string)($data['imagen_tipo'] ?? 'normal'));
        if (!in_array($imagenTipo, ['normal', 'overlay'], true)) {
            $imagenTipo = 'normal';
        }
        $orden = normalizeOrdenValue($data['orden'] ?? 1);
        $activo = isset($data['activo']) ? intval((bool)$data['activo']) : 1;

        if ($titulo === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Título requerido']);
            exit;
        }

        $pdo->beginTransaction();
        try {
            $stmt = $pdo->prepare("UPDATE public_servicios SET titulo=?, descripcion=?, precio=?, icono=?, imagen_url=?, tipo=?, imagen_shape=?, imagen_tipo=?, orden=?, activo=? WHERE id=?");
            $stmt->execute([$titulo, $descripcion, $precio, $icono, $imagenUrl, $tipo, $imagenShape, $imagenTipo, $orden, $activo, $id]);
        } catch (PDOException $e) {
            // Fallback si las nuevas columnas no existen
            try {
                $stmt = $pdo->prepare("UPDATE public_servicios SET titulo=?, descripcion=?, precio=?, icono=?, imagen_url=?, tipo=?, orden=?, activo=? WHERE id=?");
                $stmt->execute([$titulo, $descripcion, $precio, $icono, $imagenUrl, $tipo, $orden, $activo, $id]);
            } catch (PDOException $e2) {
                $stmt = $pdo->prepare("UPDATE public_servicios SET titulo=?, descripcion=?, precio=?, icono=?, imagen_url=?, orden=?, activo=? WHERE id=?");
                $stmt->execute([$titulo, $descripcion, $precio, $icono, $imagenUrl, $orden, $activo, $id]);
            }
        }
        reordenarServicios($pdo, $id, $orden);
        $pdo->commit();
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
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Error en servicios web']);
}
