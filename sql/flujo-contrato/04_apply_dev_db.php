<?php
// Script de conveniencia para aplicar migraciones del flujo contrato en entorno DEV.

require_once __DIR__ . '/../../config.php';

$baseDir = __DIR__;
$scripts = [
    $baseDir . '/01_schema_contratos.sql',
    $baseDir . '/02_alter_cotizaciones_detalle_contrato.sql',
    $baseDir . '/03_verificacion_flujo_contrato.sql',
    $baseDir . '/11_anchor_offsets.sql',
    $baseDir . '/12_agenda_estado_extendido.sql',
    $baseDir . '/13_contratos_inteligentes_schema.sql',
    $baseDir . '/07_indices_finanzas_alerta_liquidacion.sql',
    $baseDir . '/09_backfill_fecha_limite_liquidacion.sql',
    $baseDir . '/08_verificacion_finanzas_alerta.sql',
    $baseDir . '/10_auditoria_consolidada_contratos.sql',
];

foreach ($scripts as $file) {
    if (!file_exists($file)) {
        throw new RuntimeException('No existe script: ' . $file);
    }
}

$conn->begin_transaction();

try {
    foreach ($scripts as $file) {
        $sql = file_get_contents($file);
        if ($sql === false) {
            throw new RuntimeException('No se pudo leer: ' . $file);
        }
        if (!$conn->multi_query($sql)) {
            throw new RuntimeException('Error ejecutando ' . basename($file) . ': ' . $conn->error);
        }

        do {
            if ($result = $conn->store_result()) {
                $result->free();
            }
        } while ($conn->more_results() && $conn->next_result());

        if ($conn->errno) {
            throw new RuntimeException('Error en resultados de ' . basename($file) . ': ' . $conn->error);
        }

        echo '[OK] ' . basename($file) . PHP_EOL;
    }

    $conn->commit();
    echo 'Migracion flujo-contrato aplicada correctamente.' . PHP_EOL;
} catch (Throwable $e) {
    $conn->rollback();
    fwrite(STDERR, '[ERROR] ' . $e->getMessage() . PHP_EOL);
    exit(1);
}
