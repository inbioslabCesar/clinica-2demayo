<?php
/**
 * API: Plantillas de Imagenología
 * Propósito: Obtener plantillas estándar por tipo de examen para formularios dinámicos
 * 
 * GET /api_imagenologia_plantillas.php?tipo=ecografia
 */

require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/auth_check.php';

header('Content-Type: application/json; charset=utf-8');

// Validar autenticación y permisos
$usuario = $_SESSION['usuario'] ?? $_SESSION['medico'] ?? null;
$rol = strtolower(trim((string)($usuario['rol'] ?? '')));

if (!$usuario || !in_array($rol, ['medico', 'administrador'])) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Acceso denegado']);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    // ─ GET: Obtener plantilla(s) por tipo de examen ─────────────────────────
    $tipo = isset($_GET['tipo']) ? strtolower(trim((string)$_GET['tipo'])) : '';
    
    if (empty($tipo)) {
        // Sin tipo: obtener todas las plantillas activas
        $stmt = $mysqli->prepare('
            SELECT id, nombre, tipo_examen, descripcion, estructura_json, es_activa
            FROM imagenologia_plantillas
            WHERE es_activa = 1
            ORDER BY tipo_examen, nombre
        ');
    } else {
        // Con tipo: obtener plantillas de ese tipo
        $stmt = $mysqli->prepare('
            SELECT id, nombre, tipo_examen, descripcion, estructura_json, es_activa
            FROM imagenologia_plantillas
            WHERE tipo_examen = ? AND es_activa = 1
            ORDER BY nombre
        ');
        $stmt->bind_param('s', $tipo);
    }
    
    $stmt->execute();
    $result = $stmt->get_result();
    $plantillas = [];
    
    while ($row = $result->fetch_assoc()) {
        // Decodificar JSON para estructura
        $row['estructura_json'] = $row['estructura_json'] ? json_decode($row['estructura_json'], true) : null;
        $plantillas[] = $row;
    }
    $stmt->close();
    
    echo json_encode([
        'success' => true,
        'plantillas' => $plantillas,
        'total' => count($plantillas)
    ]);
    
} else {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Método no permitido']);
}
?>
