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
    // Garantizar columnas añadidas recientemente existen antes del SELECT
    $late_columns = [
        'celular'             => "ALTER TABLE configuracion_clinica ADD COLUMN celular VARCHAR(30) DEFAULT NULL",
        'slogan'              => "ALTER TABLE configuracion_clinica ADD COLUMN slogan VARCHAR(255) DEFAULT NULL",
        'slogan_color'        => "ALTER TABLE configuracion_clinica ADD COLUMN slogan_color VARCHAR(7) DEFAULT NULL",
        'nombre_color'        => "ALTER TABLE configuracion_clinica ADD COLUMN nombre_color VARCHAR(7) DEFAULT NULL",
        'nombre_font_size'    => "ALTER TABLE configuracion_clinica ADD COLUMN nombre_font_size VARCHAR(20) DEFAULT NULL",
        'logo_size_sistema'   => "ALTER TABLE configuracion_clinica ADD COLUMN logo_size_sistema VARCHAR(10) DEFAULT NULL",
        'logo_size_publico'   => "ALTER TABLE configuracion_clinica ADD COLUMN logo_size_publico VARCHAR(10) DEFAULT NULL",
        'logo_shape_sistema'  => "ALTER TABLE configuracion_clinica ADD COLUMN logo_shape_sistema VARCHAR(10) NOT NULL DEFAULT 'auto'",
        'caratula_fondo_url'  => "ALTER TABLE configuracion_clinica ADD COLUMN caratula_fondo_url VARCHAR(500) DEFAULT NULL",
        'google_maps_embed'   => "ALTER TABLE configuracion_clinica ADD COLUMN google_maps_embed TEXT DEFAULT NULL",
        'website'             => "ALTER TABLE configuracion_clinica ADD COLUMN website VARCHAR(255) DEFAULT NULL",
        'contacto_emergencias'=> "ALTER TABLE configuracion_clinica ADD COLUMN contacto_emergencias VARCHAR(100) DEFAULT NULL",
    ];
    foreach ($late_columns as $col => $sql) {
        $exists = $pdo->query("SHOW COLUMNS FROM configuracion_clinica LIKE '$col'");
        if (!$exists->fetch()) {
            $pdo->exec($sql);
        }
    }

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
            'caratula_fondo_url' => null,
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
