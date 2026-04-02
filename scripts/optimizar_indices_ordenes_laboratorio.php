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
    // Listado principal por estado/fecha y ordenado por fecha.
    ensure_index($pdo, 'ordenes_laboratorio', 'idx_ol_estado_fecha_id', '`estado`, `fecha`, `id`');

    // Filtro por consulta y médico (vía join con consultas).
    ensure_index($pdo, 'ordenes_laboratorio', 'idx_ol_consulta_fecha_id', '`consulta_id`, `fecha`, `id`');

    // Filtros por paciente directo en ordenes.
    ensure_index($pdo, 'ordenes_laboratorio', 'idx_ol_paciente_fecha_id', '`paciente_id`, `fecha`, `id`');

    // Cálculo de resultados más recientes por orden.
    ensure_index($pdo, 'resultados_laboratorio', 'idx_rl_orden_fecha_id_v2', '`orden_id`, `fecha`, `id`');

    if (column_exists($pdo, 'ordenes_laboratorio', 'cotizacion_id')) {
      ensure_index($pdo, 'ordenes_laboratorio', 'idx_ol_cotizacion', '`cotizacion_id`');
    }

    echo "Completado: indices de ordenes de laboratorio optimizados." . PHP_EOL;
} catch (Throwable $e) {
    fwrite(STDERR, "Error optimizando indices de ordenes laboratorio: " . $e->getMessage() . PHP_EOL);
    exit(1);
}
