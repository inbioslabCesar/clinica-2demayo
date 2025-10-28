<?php
// Script para mostrar el usuario_id de la sesión y el usuario_id de la última caja creada
header('Content-Type: text/plain');
require_once 'config.php';
session_start();

try {
    $usuario_id = isset($_SESSION['usuario']['id']) ? $_SESSION['usuario']['id'] : 'NO_SESSION';
    echo "usuario_id en sesión: $usuario_id\n";
    
    $stmt = $pdo->query("SELECT id, usuario_id, estado, fecha FROM cajas ORDER BY id DESC LIMIT 1");
    $caja = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($caja) {
        echo "usuario_id en caja: {$caja['usuario_id']}\n";
        echo "estado: {$caja['estado']}\n";
        echo "fecha: {$caja['fecha']}\n";
    } else {
        echo "No hay cajas en la base de datos.\n";
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}
?>
