<?php
// Aplica el seed de ejemplo prenatal en entorno DEV.

require_once __DIR__ . '/../../config.php';

$file = __DIR__ . '/05_seed_ejemplo_prenatal_femcare_dev.sql';
if (!file_exists($file)) {
    throw new RuntimeException('No existe script: ' . $file);
}

$sql = file_get_contents($file);
if ($sql === false) {
    throw new RuntimeException('No se pudo leer: ' . $file);
}

if (!$conn->multi_query($sql)) {
    throw new RuntimeException('Error ejecutando seed: ' . $conn->error);
}

$lastSummary = null;
do {
    if ($result = $conn->store_result()) {
        $rows = $result->fetch_all(MYSQLI_ASSOC);
        if (!empty($rows)) {
            $lastSummary = $rows;
        }
        $result->free();
    }
} while ($conn->more_results() && $conn->next_result());

if ($conn->errno) {
    throw new RuntimeException('Error posterior a multi_query: ' . $conn->error);
}

echo "Seed prenatal aplicado correctamente." . PHP_EOL;
if ($lastSummary) {
    echo json_encode($lastSummary, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . PHP_EOL;
}
