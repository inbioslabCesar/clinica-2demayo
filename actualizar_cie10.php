<?php
require_once 'config.php';

// Leer el archivo SQL
$sql = file_get_contents('sql/cie10.sql');

// Dividir en declaraciones individuales
$statements = explode(';', $sql);

$errores = [];
$insertados = 0;

foreach ($statements as $statement) {
    $statement = trim($statement);
    if (empty($statement)) continue;
    
    try {
        $mysqli->query($statement);
        if (strpos($statement, 'INSERT INTO') !== false) {
            $insertados += $mysqli->affected_rows;
        }
    } catch (Exception $e) {
        $errores[] = "Error en: " . substr($statement, 0, 50) . "... - " . $e->getMessage();
    }
}

echo "Proceso completado:\n";
echo "- Registros insertados/actualizados: $insertados\n";
echo "- Errores: " . count($errores) . "\n";

if (!empty($errores)) {
    echo "\nErrores encontrados:\n";
    foreach ($errores as $error) {
        echo "- $error\n";
    }
}

$mysqli->close();
?>