<?php
// Verifica la fecha y hora del servidor y muestra las cajas existentes
header('Content-Type: text/plain');
date_default_timezone_set('America/Lima');

try {
    echo "Fecha y hora del servidor: " . date('Y-m-d H:i:s') . "\n\n";
    
    require_once 'config.php'; // $pdo ya está definido aquí
    
    $stmt = $pdo->query("SELECT id, fecha, usuario_id, estado FROM cajas ORDER BY id DESC LIMIT 10");
    $cajas = $stmt->fetchAll();
    
    if (count($cajas) === 0) {
        echo "No hay cajas en la base de datos.\n";
    } else {
        echo "Cajas en la base de datos:\n";
        foreach ($cajas as $caja) {
            echo "ID: {$caja['id']}, Fecha: {$caja['fecha']}, Usuario: {$caja['usuario_id']}, Estado: {$caja['estado']}\n";
        }
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}
?>
