<?php
/**
 * Script de instalación: Ejecuta scripts SQL para el módulo de imagenología informes
 * Este script debe ejecutarse UNA SOLA VEZ en desarrollo
 * 
 * Uso: php install_imagenologia_informes.php
 */

// Cargar configuración de BD
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/init_api.php';

// Usar la conexión mysqli ya configurada
global $mysqli;

if (!$mysqli || $mysqli->connect_errno) {
    die("ERROR: No se pudo conectar a la base de datos.\n");
}

echo "═════════════════════════════════════════════════════════════════\n";
echo "Instalación: Módulo de Informes de Imagenología\n";
echo "═════════════════════════════════════════════════════════════════\n\n";

// Array de scripts a ejecutar en orden
$scripts = [
    'sql/imagenologia-informes/01_crear_tablas_imagenologia_informes.sql',
    'sql/imagenologia-informes/02_seed_plantillas_imagenologia.sql',
];

$totalScripts = count($scripts);
$completados = 0;
$errores = [];

foreach ($scripts as $index => $scriptPath) {
    $fullPath = __DIR__ . '/' . $scriptPath;
    
    if (!is_file($fullPath)) {
        $errores[] = "❌ Script no encontrado: {$scriptPath}";
        echo "❌ Script no encontrado: {$scriptPath}\n";
        continue;
    }
    
    echo "[" . ($index + 1) . "/{$totalScripts}] Ejecutando: {$scriptPath}\n";
    
    // Leer contenido del archivo
    $sql = file_get_contents($fullPath);
    if ($sql === false) {
        $errores[] = "❌ No se pudo leer: {$scriptPath}";
        echo "❌ No se pudo leer: {$scriptPath}\n";
        continue;
    }
    
    // Dividir por `;` y filtrar comentarios y líneas vacías
    $queries = explode(';', $sql);
    $queriesValidas = [];
    
    foreach ($queries as $query) {
        $query = trim($query);
        // Saltar comentarios y líneas vacías
        if (strlen($query) > 0 && strpos($query, '--') !== 0 && strpos($query, '/*') !== 0) {
            $queriesValidas[] = $query;
        }
    }
    
    $subErrores = 0;
    foreach ($queriesValidas as $query) {
        if (!$mysqli->query($query)) {
            $subErrores++;
            $errores[] = "Query error en {$scriptPath}: " . $mysqli->error;
            echo "  ⚠️  Error: " . $mysqli->error . "\n";
        }
    }
    
    if ($subErrores === 0) {
        echo "✅ Script ejecutado exitosamente (" . count($queriesValidas) . " queries)\n";
        $completados++;
    } else {
        echo "⚠️  Script completado con {$subErrores} errores\n";
    }
    
    echo "\n";
}

// Resumen final
echo "═════════════════════════════════════════════════════════════════\n";
echo "RESUMEN DE INSTALACIÓN\n";
echo "═════════════════════════════════════════════════════════════════\n";
echo "Scripts completados: {$completados}/{$totalScripts}\n";

if (empty($errores)) {
    echo "✅ INSTALACIÓN EXITOSA - Todas las tablas y datos cargados\n";
} else {
    echo "⚠️  Se encontraron " . count($errores) . " errores:\n";
    foreach ($errores as $error) {
        echo "  - {$error}\n";
    }
}

echo "\n═════════════════════════════════════════════════════════════════\n";

// Verificar que las tablas se crearon
echo "\nVerificando tablas creadas...\n";
$tablasEsperadas = ['imagenologia_plantillas', 'imagenologia_informes', 'imagenologia_informes_historial'];

foreach ($tablasEsperadas as $tabla) {
    $result = $mysqli->query("SHOW TABLES LIKE '{$tabla}'");
    if ($result && $result->num_rows > 0) {
        // Contar registros en plantillas
        if ($tabla === 'imagenologia_plantillas') {
            $countResult = $mysqli->query("SELECT COUNT(*) as cnt FROM {$tabla}");
            $row = $countResult->fetch_assoc();
            $count = $row['cnt'] ?? 0;
            echo "✅ {$tabla}: OK ({$count} plantillas cargadas)\n";
        } else {
            echo "✅ {$tabla}: OK\n";
        }
    } else {
        echo "❌ {$tabla}: NO ENCONTRADA\n";
    }
}

echo "\n═════════════════════════════════════════════════════════════════\n";
echo "Instalación completada.\n";
echo "═════════════════════════════════════════════════════════════════\n";

// Cerrar conexión
$mysqli->close();
?>
