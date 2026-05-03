<?php
// 90_apply_dev.php
// Aplica en desarrollo el esquema de sincronizacion receta HC -> cotizacion.

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

require __DIR__ . '/../../config.php';

$schemaPath = __DIR__ . '/01_schema_receta_hc_cotizacion_automatica.sql';
if (!is_file($schemaPath)) {
    fwrite(STDERR, "No se encontro el archivo de esquema: {$schemaPath}\n");
    exit(1);
}

$sql = file_get_contents($schemaPath);
if ($sql === false) {
    fwrite(STDERR, "No se pudo leer el archivo de esquema.\n");
    exit(1);
}

$conn->begin_transaction();

try {
    if (!$conn->multi_query($sql)) {
        throw new RuntimeException('No se pudo ejecutar el script SQL.');
    }

    do {
        if ($result = $conn->store_result()) {
            $result->free();
        }
    } while ($conn->more_results() && $conn->next_result());

    if ($conn->errno) {
        throw new RuntimeException('Error SQL: ' . $conn->error);
    }

    $conn->commit();

    $tables = [];
    $res = $conn->query("SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN ('hc_receta_cotizacion_sync', 'hc_receta_cotizacion_items_pendientes') ORDER BY table_name");
    while ($row = $res->fetch_assoc()) {
        $vals = array_values($row);
        $tables[] = (string)($vals[0] ?? '');
    }

    echo "Schema aplicado correctamente.\n";
    echo "Tablas detectadas: " . implode(', ', $tables) . "\n";
    exit(0);
} catch (Throwable $e) {
    $conn->rollback();
    fwrite(STDERR, "Error aplicando esquema: " . $e->getMessage() . "\n");
    exit(1);
}
