<?php
require_once __DIR__ . '/../db.php';

function index_exists(PDO $pdo, string $table, string $indexName): bool {
    $sql = 'SELECT COUNT(1) FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = :table AND index_name = :index_name';
    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        ':table' => $table,
        ':index_name' => $indexName,
    ]);
    return intval($stmt->fetchColumn() ?: 0) > 0;
}

function column_exists(PDO $pdo, string $table, string $column): bool {
    $sql = 'SELECT COUNT(1) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = :table AND column_name = :column';
    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        ':table' => $table,
        ':column' => $column,
    ]);
    return intval($stmt->fetchColumn() ?: 0) > 0;
}

function ensure_index(PDO $pdo, string $table, string $indexName, string $definition): void {
    if (index_exists($pdo, $table, $indexName)) {
        echo "[OK] $table.$indexName ya existe" . PHP_EOL;
        return;
    }

    $sql = "ALTER TABLE `$table` ADD INDEX `$indexName` ($definition)";
    $pdo->exec($sql);
    echo "[CREADO] $table.$indexName" . PHP_EOL;
}

try {
    // Acelera filtros y orden del listado principal.
    ensure_index($pdo, 'cotizaciones', 'idx_cot_fecha', '`fecha`');
    ensure_index($pdo, 'cotizaciones', 'idx_cot_estado_fecha', '`estado`, `fecha`');
    ensure_index($pdo, 'cotizaciones', 'idx_cot_usuario_fecha', '`usuario_id`, `fecha`');
    ensure_index($pdo, 'cotizaciones', 'idx_cot_paciente_fecha', '`paciente_id`, `fecha`');

    // Acelera agrupación de servicios por la página actual de cotizaciones.
    if (column_exists($pdo, 'cotizaciones_detalle', 'estado_item')) {
        ensure_index($pdo, 'cotizaciones_detalle', 'idx_cd_cot_estado_serv', '`cotizacion_id`, `estado_item`, `servicio_tipo`');
    } else {
        ensure_index($pdo, 'cotizaciones_detalle', 'idx_cd_cot_serv', '`cotizacion_id`, `servicio_tipo`');
    }

    // Acelera cálculo batch de lab_completado por cotizacion.
    if (column_exists($pdo, 'ordenes_laboratorio', 'cotizacion_id') && column_exists($pdo, 'ordenes_laboratorio', 'estado')) {
        ensure_index($pdo, 'ordenes_laboratorio', 'idx_ol_cot_estado', '`cotizacion_id`, `estado`');
    }

    echo "Completado: indices de cotizaciones optimizados." . PHP_EOL;
} catch (Throwable $e) {
    fwrite(STDERR, "Error optimizando indices de cotizaciones: " . $e->getMessage() . PHP_EOL);
    exit(1);
}
