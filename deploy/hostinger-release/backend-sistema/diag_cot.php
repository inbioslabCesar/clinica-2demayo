<?php
// Archivo diagnóstico temporal - ELIMINAR después de usar
error_reporting(E_ALL);
ini_set('display_errors', 1);
header('Content-Type: text/plain; charset=utf-8');

echo "PHP version: " . PHP_VERSION . "\n\n";

// Test includes uno por uno
$files = [
    'init_api.php',
    'config.php',
    'modules/CotizacionSyncService.php',
    'modules/ContratoModule.php',
];

foreach ($files as $f) {
    echo "Loading $f... ";
    try {
        require_once __DIR__ . '/' . $f;
        echo "OK\n";
    } catch (Throwable $e) {
        echo "FAIL: " . $e->getMessage() . " in " . $e->getFile() . ":" . $e->getLine() . "\n";
    }
}

echo "\nPrueba column_exists:\n";
if (function_exists('column_exists')) {
    $r = column_exists($conn, 'cotizaciones_detalle', 'estado_item');
    echo "column_exists(estado_item) = " . ($r ? 'true' : 'false') . "\n";
    $r2 = column_exists($conn, 'cotizaciones', 'numero_comprobante');
    echo "column_exists(numero_comprobante) = " . ($r2 ? 'true' : 'false') . "\n";
} else {
    echo "column_exists NO existe\n";
}
