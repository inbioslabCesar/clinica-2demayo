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

try {
    if ($method === 'GET') {
        $stmt = $pdo->query("SELECT id, titulo, descripcion, precio_antes, precio_oferta, fecha_inicio, fecha_fin, imagen_url, orden, activo FROM public_ofertas ORDER BY orden ASC, id DESC");
        echo json_encode(['success' => true, 'ofertas' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
        exit;
    }

    if ($method === 'POST') {
        $data = readJsonBody();
        $titulo = trim((string)($data['titulo'] ?? ''));
        $descripcion = $data['descripcion'] ?? null;
        $precioAntes = $data['precio_antes'] ?? null;
        $precioOferta = $data['precio_oferta'] ?? null;
        $fechaInicio = $data['fecha_inicio'] ?? null;
        $fechaFin = $data['fecha_fin'] ?? null;
        $imagenUrl = $data['imagen_url'] ?? null;
        $orden = isset($data['orden']) ? intval($data['orden']) : 0;
        $activo = isset($data['activo']) ? intval((bool)$data['activo']) : 1;

        if ($titulo === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Título requerido']);
            exit;
        }

        $stmt = $pdo->prepare("INSERT INTO public_ofertas (titulo, descripcion, precio_antes, precio_oferta, fecha_inicio, fecha_fin, imagen_url, orden, activo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([$titulo, $descripcion, $precioAntes, $precioOferta, $fechaInicio, $fechaFin, $imagenUrl, $orden, $activo]);
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
        $precioAntes = $data['precio_antes'] ?? null;
        $precioOferta = $data['precio_oferta'] ?? null;
        $fechaInicio = $data['fecha_inicio'] ?? null;
        $fechaFin = $data['fecha_fin'] ?? null;
        $imagenUrl = $data['imagen_url'] ?? null;
        $orden = isset($data['orden']) ? intval($data['orden']) : 0;
        $activo = isset($data['activo']) ? intval((bool)$data['activo']) : 1;

        if ($titulo === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Título requerido']);
            exit;
        }

        $stmt = $pdo->prepare("UPDATE public_ofertas SET titulo=?, descripcion=?, precio_antes=?, precio_oferta=?, fecha_inicio=?, fecha_fin=?, imagen_url=?, orden=?, activo=? WHERE id=?");
        $stmt->execute([$titulo, $descripcion, $precioAntes, $precioOferta, $fechaInicio, $fechaFin, $imagenUrl, $orden, $activo, $id]);
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

        $stmt = $pdo->prepare("UPDATE public_ofertas SET activo=0 WHERE id=?");
        $stmt->execute([$id]);
        echo json_encode(['success' => true]);
        exit;
    }

    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Método no permitido']);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Error en ofertas web']);
}
