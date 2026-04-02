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
    // Resultado por orden (consulta principal de documentos).
    ensure_index($pdo, 'resultados_laboratorio', 'idx_rl_orden_fecha_id', '`orden_id`, `fecha`, `id`');

    // Fallback legacy por consulta sin orden_id.
    ensure_index($pdo, 'resultados_laboratorio', 'idx_rl_consulta_orden_fecha_id', '`consulta_id`, `orden_id`, `fecha`, `id`');

    // Resolucion de ordenes por paciente con referencia de documentos externos.
    ensure_index($pdo, 'documentos_externos_paciente', 'idx_dep_orden_paciente', '`orden_id`, `paciente_id`');

    // Acceso y orden temporal por paciente.
    ensure_index($pdo, 'documentos_externos_paciente', 'idx_dep_paciente_fecha', '`paciente_id`, `fecha`');

    echo "Completado: indices optimizados." . PHP_EOL;
} catch (Throwable $e) {
    fwrite(STDERR, "Error optimizando indices: " . $e->getMessage() . PHP_EOL);
    exit(1);
}
