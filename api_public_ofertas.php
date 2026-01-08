<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/db.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Método no permitido']);
    exit;
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

    // Campo amigable opcional
    foreach ($ofertas as &$o) {
        $inicio = $o['fecha_inicio'] ?? null;
        $fin = $o['fecha_fin'] ?? null;
        if ($inicio && $fin) $o['vigencia'] = $inicio . ' al ' . $fin;
        elseif ($inicio) $o['vigencia'] = 'Desde ' . $inicio;
        elseif ($fin) $o['vigencia'] = 'Hasta ' . $fin;
        else $o['vigencia'] = null;
    }

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
