<?php
// 90_apply_dev.php
// Aplica en desarrollo el esquema de soporte delta de receta HC (pendientes por item).

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

require __DIR__ . '/../../config.php';

$schemaPath = __DIR__ . '/01_schema_receta_hc_delta_pendientes_v1.sql';
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

    $res = $conn->query("SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'hc_receta_items_estado'");
    $row = $res ? $res->fetch_assoc() : null;
    $exists = (int)($row['total'] ?? 0) > 0;

    echo "Schema aplicado correctamente.\n";
    echo "Tabla detectada: " . ($exists ? 'hc_receta_items_estado' : 'NO') . "\n";
    exit(0);
} catch (Throwable $e) {
    $conn->rollback();
    fwrite(STDERR, "Error aplicando esquema: " . $e->getMessage() . "\n");
    exit(1);
}
