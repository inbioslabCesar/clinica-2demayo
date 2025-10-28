<?php
// Script para depurar el valor exacto del campo estado en la caja de hoy
header('Content-Type: text/plain');
require_once 'config.php';
session_start();

try {
    $usuario_id = isset($_SESSION['usuario']['id']) ? intval($_SESSION['usuario']['id']) : 'NO_SESSION';
    $fecha_hoy = date('Y-m-d');
    echo "usuario_id en sesión: $usuario_id\n";
    echo "fecha de hoy: $fecha_hoy\n";
    
    $stmt = $pdo->prepare("SELECT id, estado, LENGTH(estado) as len_estado FROM cajas WHERE fecha = ? AND usuario_id = ? ORDER BY id DESC LIMIT 1");
    $stmt->execute([$fecha_hoy, $usuario_id]);
    $caja = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($caja) {
        echo "id: {$caja['id']}\n";
        echo "estado: '{$caja['estado']}'\n";
        echo "longitud estado: {$caja['len_estado']}\n";
    } else {
        echo "No hay caja para hoy y usuario.\n";
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}
?>
