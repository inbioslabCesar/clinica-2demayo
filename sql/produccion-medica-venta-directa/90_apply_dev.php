<?php
require __DIR__ . '/../../config.php';

$sqlPath = __DIR__ . '/01_schema_produccion_medica_detalle_idempotente.sql';
$sql = file_get_contents($sqlPath);
if (!is_string($sql) || trim($sql) === '') {
    fwrite(STDERR, "No se pudo leer el SQL: {$sqlPath}" . PHP_EOL);
    exit(1);
}

if (!$conn->multi_query($sql)) {
    fwrite(STDERR, "Error SQL: " . $conn->error . PHP_EOL);
    exit(1);
}

do {
    if ($res = $conn->store_result()) {
        $res->free();
    }
} while ($conn->more_results() && $conn->next_result());

if ($conn->errno) {
    fwrite(STDERR, "Error SQL: " . $conn->error . PHP_EOL);
    exit(1);
}

echo "Schema aplicado en desarrollo" . PHP_EOL;
