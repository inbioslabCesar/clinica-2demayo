<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/db.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Método no permitido']);
    exit;
}

try {
    $stmt = $pdo->query("SELECT id, titulo, descripcion, precio, icono, imagen_url, orden FROM public_servicios WHERE activo = 1 ORDER BY orden ASC, id DESC");
    $servicios = $stmt->fetchAll(PDO::FETCH_ASSOC);

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
