<?php
/**
 * Script de migración para crear tablas de configuración de apariencia
 * Ejecutar desde: php api_migraciones_apariencia.php
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/init_api.php';

// Verificar que el usuario sea administrador
if (!isset($_SESSION['usuario']) || $_SESSION['usuario']['rol'] !== 'administrador') {
    // En entrada CLI, permitir sin autenticación
    if (php_sapi_name() !== 'cli') {
        http_response_code(403);
        echo json_encode(['error' => 'Acceso denegado. Solo administradores.']);
        exit;
    }
}

try {
    // Crear tabla config_apariencia
    $sql = "CREATE TABLE IF NOT EXISTS config_apariencia (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tipo VARCHAR(50) NOT NULL DEFAULT 'avatar',
        clave VARCHAR(100) NOT NULL UNIQUE,
        valor TEXT NOT NULL,
        descripcion VARCHAR(255) NULL,
        activo BOOLEAN DEFAULT 0,
        order_index INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_config_tipo_clave (tipo, clave),
        KEY idx_config_activo (activo),
        KEY idx_config_apariencia_tipo (tipo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

    $pdo->exec($sql);
    echo "✓ Tabla config_apariencia creada exitosamente.\n";

    // Insertar datos por defecto
    $sql_insert = "INSERT IGNORE INTO config_apariencia (tipo, clave, valor, descripcion, activo, order_index) 
        VALUES 
          ('color', 'color_primario', '#3B82F6', 'Color primario del sistema', 1, 0),
          ('avatar', 'avatar_medico_defecto', '', 'Avatar predefinido para médicos', 0, 1),
          ('avatar', 'avatar_doctora_defecto', '', 'Avatar predefinido para doctoras', 0, 2),
          ('avatar', 'avatar_asistente_defecto', '', 'Avatar predefinido para asistentes', 0, 3)";

    $pdo->exec($sql_insert);
    echo "✓ Valores por defecto insertados exitosamente.\n";

    // Crear directorio de uploads si no existe
    $uploadDir = __DIR__ . '/uploads/avatars';
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0755, true);
        echo "✓ Directorio /uploads/avatars creado exitosamente.\n";
    }

    echo "\n📋 Migracion completada exitosamente.\n";

    if (php_sapi_name() !== 'cli') {
        http_response_code(200);
        echo json_encode([
            'success' => true,
            'message' => 'Migración completada exitosamente',
            'timestamp' => date('Y-m-d H:i:s')
        ]);
    }

} catch (Exception $e) {
    $error_msg = $e->getMessage();
    echo "❌ Error en migración: $error_msg\n";

    if (php_sapi_name() !== 'cli') {
        http_response_code(500);
        echo json_encode([
            'error' => 'Error en migración',
            'message' => $error_msg,
            'timestamp' => date('Y-m-d H:i:s')
        ]);
    }
    exit(1);
}
