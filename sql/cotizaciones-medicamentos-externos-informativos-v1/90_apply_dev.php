<?php
// 90_apply_dev.php
// Aplica en desarrollo el esquema y backfill para medicamentos externos informativos.

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);

require __DIR__ . '/../../config.php';

$conn = $mysqli ?? ($conn ?? null);
if (!$conn instanceof mysqli) {
    fwrite(STDERR, "No se pudo inicializar la conexion MySQLi desde config.php\n");
    exit(1);
}

$scripts = [
    __DIR__ . '/01_schema_cotizaciones_medicamentos_externos_v1.sql',
    __DIR__ . '/02_backfill_medicamentos_externos_v1.sql',
];

foreach ($scripts as $path) {
    if (!is_file($path)) {
        fwrite(STDERR, "No se encontro el archivo SQL: {$path}\n");
        exit(1);
    }
}

$conn->begin_transaction();

try {
    foreach ($scripts as $path) {
        $sql = file_get_contents($path);
        if ($sql === false) {
            throw new RuntimeException("No se pudo leer: {$path}");
        }

        if (!$conn->multi_query($sql)) {
            throw new RuntimeException("No se pudo ejecutar: {$path}");
        }

        do {
            if ($result = $conn->store_result()) {
                $result->free();
            }
        } while ($conn->more_results() && $conn->next_result());

        if ($conn->errno) {
            throw new RuntimeException('Error SQL: ' . $conn->error);
        }
    }

    $conn->commit();

    $sqlInfo = "SELECT 
        COUNT(*) AS total_detalles_externos,
        SUM(CASE WHEN incluir_en_cobro = 0 THEN 1 ELSE 0 END) AS externos_no_cobrables
      FROM cotizaciones_detalle
      WHERE COALESCE(es_externo, 0) = 1";
    $resInfo = $conn->query($sqlInfo);
    $rowInfo = $resInfo ? $resInfo->fetch_assoc() : [];

    echo "Migracion aplicada correctamente.\n";
    echo "Detalles externos: " . (int)($rowInfo['total_detalles_externos'] ?? 0) . "\n";
    echo "Externos no cobrables: " . (int)($rowInfo['externos_no_cobrables'] ?? 0) . "\n";
    exit(0);
} catch (Throwable $e) {
    $conn->rollback();
    fwrite(STDERR, "Error aplicando migracion: " . $e->getMessage() . "\n");
    exit(1);
}
