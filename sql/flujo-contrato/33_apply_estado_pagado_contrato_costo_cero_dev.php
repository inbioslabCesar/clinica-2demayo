<?php
// Aplica migracion 33 en entorno de desarrollo usando la conexion del proyecto.

require_once __DIR__ . '/../../config.php';

$sqlFile = __DIR__ . '/33_estado_pagado_contrato_costo_cero.sql';
if (!file_exists($sqlFile)) {
    throw new RuntimeException('No existe script: ' . $sqlFile);
}

$sql = file_get_contents($sqlFile);
if ($sql === false) {
    throw new RuntimeException('No se pudo leer: ' . $sqlFile);
}

$conn->begin_transaction();

try {
    if (!$conn->multi_query($sql)) {
        throw new RuntimeException('Error ejecutando migracion: ' . $conn->error);
    }

    do {
        if ($result = $conn->store_result()) {
            $rows = $result->fetch_all(MYSQLI_ASSOC);
            if (!empty($rows)) {
                echo json_encode($rows, JSON_UNESCAPED_UNICODE) . PHP_EOL;
            }
            $result->free();
        }
    } while ($conn->more_results() && $conn->next_result());

    if ($conn->errno) {
        throw new RuntimeException('Error en resultados de migracion: ' . $conn->error);
    }

    $conn->commit();
    echo '[OK] 33_estado_pagado_contrato_costo_cero.sql aplicado correctamente.' . PHP_EOL;
} catch (Throwable $e) {
    $conn->rollback();
    fwrite(STDERR, '[ERROR] ' . $e->getMessage() . PHP_EOL);
    exit(1);
}
