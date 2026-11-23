<?php
// Qué módulos tiene habilitados esta instalación. Solo lectura, cualquier sesión autenticada.
// Devuelve únicamente módulo => bool: nunca precios, planes ni fechas de licencia.
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/modules/ModulosInstalacion.php';

header('Content-Type: application/json; charset=utf-8');

if (!isset($_SESSION['usuario']) && !isset($_SESSION['medico_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'No autenticado']);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Metodo no permitido']);
    exit;
}

echo json_encode(['success' => true, 'modulos' => ModulosInstalacion::mapaActivo($pdo ?? ($mysqli ?? null))]);
