<?php
/**
 * Script de mantenimiento para corregir permisos de carpetas de upload
 * Uso: php maintenance/fix_upload_permissions.php
 */

error_reporting(E_ALL);
ini_set('display_errors', 1);

$uploadDir = __DIR__ . '/../uploads/avatars';

echo "=== VERIFICADOR DE PERMISOS DE UPLOAD ===\n\n";

// 1. Verificar si existe la carpeta
echo "1. Verificando carpeta: $uploadDir\n";
if (!is_dir($uploadDir)) {
    echo "   ❌ Carpeta NO existe. Creando...\n";
    if (@mkdir($uploadDir, 0755, true)) {
        echo "   ✅ Carpeta creada exitosamente\n";
    } else {
        echo "   ❌ ERROR: No se puede crear la carpeta\n";
        echo "      Solución: ejecuta manualmente: mkdir -m 755 uploads/avatars\n";
        exit(1);
    }
}

// 2. Verificar permisos
echo "\n2. Verificando permisos de $uploadDir\n";
$perms = fileperms($uploadDir);
$permsOctal = substr(sprintf('%o', $perms), -4);
echo "   Permisos actuales: $permsOctal\n";

if (!is_readable($uploadDir)) {
    echo "   ❌ Carpeta NO es legible\n";
} else {
    echo "   ✅ Carpeta es legible\n";
}

if (!is_writable($uploadDir)) {
    echo "   ❌ Carpeta NO es escribible (PROBLEMA)\n";
    echo "      Intentando corregir...\n";
    if (@chmod($uploadDir, 0755)) {
        echo "      ✅ Permisos corregidos a 755\n";
    } else {
        echo "      ❌ No se pueden cambiar permisos\n";
        echo "      Solución: ejecuta manualmente: chmod 755 uploads/avatars\n";
    }
} else {
    echo "   ✅ Carpeta es escribible\n";
}

// 3. Probar escritura
echo "\n3. Probando escritura en carpeta\n";
$testFile = $uploadDir . '/test_' . time() . '.txt';
if (@touch($testFile)) {
    echo "   ✅ Se puede escribir archivos\n";
    @unlink($testFile);
} else {
    echo "   ❌ NO se pueden escribir archivos\n";
    echo "      Posibles causas:\n";
    echo "      - Carpeta sin permisos de escritura (chown/chmod)\n";
    echo "      - Propietario del proceso diferente al usuario\n";
    echo "      - Disco lleno o en solo lectura\n";
}

// 4. Verificar BD
echo "\n4. Verificando tabla config_apariencia en BD\n";
try {
    require_once __DIR__ . '/../init_api.php';
    
    $stmt = $pdo->query("SELECT COUNT(*) as cnt FROM config_apariencia WHERE tipo = 'avatar'");
    $result = $stmt->fetch(PDO::FETCH_ASSOC);
    $count = $result['cnt'] ?? 0;
    echo "   ✅ Tabla existe. Avatares guardados: $count\n";
} catch (Exception $e) {
    echo "   ❌ Error en BD: " . $e->getMessage() . "\n";
}

// 5. Resumen
echo "\n=== RESUMEN ===\n";
echo "✅ Si todos los checks pasaron, la subida de avatares debe funcionar.\n";
echo "\n⚠️  SI AÚN HAY PROBLEMAS:\n";
echo "   a) Contacta a tu proveedor de hosting para verificar permisos\n";
echo "   b) Verifica el error específico en la consola del navegador (F12)\n";
echo "   c) Revisa los logs del servidor en /var/log/apache2/ o /var/log/nginx/\n";
