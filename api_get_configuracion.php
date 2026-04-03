<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

// Solo permitir método GET para obtener configuración
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    echo json_encode(['error' => 'Método no permitido']);
    http_response_code(405);
    exit;
}

try {
    // Obtener configuración actual sin restricciones de usuario
    // Esta API es solo de lectura para la información pública de la clínica
    $stmt = $pdo->query("SELECT * FROM configuracion_clinica ORDER BY created_at DESC LIMIT 1");
    $configuracion = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$configuracion) {
        // Si no hay configuración, devolver valores por defecto
        $configuracion = [
            'nombre_clinica' => 'Mi Clínica',
            'direccion' => '',
            'telefono' => '',
            'email' => '',
            'horario_atencion' => 'Lunes a Viernes: 7:00 AM - 8:00 PM\nSábados: 7:00 AM - 2:00 PM',
            'logo_url' => null,
            'logo_laboratorio_url' => null,
            'website' => null,
            'ruc' => null,
            'especialidades' => null,
            'mision' => null,
            'vision' => null,
            'valores' => null,
            'director_general' => null,
            'jefe_enfermeria' => null,
            'contacto_emergencias' => null,
            'celular' => null,
            'google_maps_embed' => null,
            'slogan' => null,
            'slogan_color' => null,
            'nombre_color' => null,
            'nombre_font_size' => null,
            'logo_size_sistema' => null,
            'logo_size_publico' => null,
            'logo_shape_sistema' => 'auto',
            'hc_template_mode' => 'auto',
            'hc_template_single_id' => null,
        ];
    }
    
    echo json_encode([
        'success' => true,
        'data' => $configuracion
    ]);

} catch (PDOException $e) {
    echo json_encode([
        'error' => 'Error al obtener configuración',
        'details' => $e->getMessage()
    ]);
    http_response_code(500);
} catch (Exception $e) {
    echo json_encode([
        'error' => 'Error interno del servidor',
        'details' => $e->getMessage()
    ]);
    http_response_code(500);
}
?>
