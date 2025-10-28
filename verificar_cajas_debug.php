<?php
// Script para mostrar todos los registros de la tabla cajas con sus valores clave
header('Content-Type: text/plain');
require_once 'config.php';
session_start();

try {
    $usuario_id = isset($_SESSION['usuario']['id']) ? intval($_SESSION['usuario']['id']) : 'NO_SESSION';
    echo "usuario_id en sesión: $usuario_id\n";
    $stmt = $pdo->query("SELECT id, fecha, usuario_id, estado, created_at FROM cajas ORDER BY id DESC LIMIT 10");
    $cajas = $stmt->fetchAll(PDO::FETCH_ASSOC);
    if (count($cajas) === 0) {
        echo "No hay cajas en la base de datos.\n";
    } else {
        echo "Registros recientes en la tabla cajas:\n";
        foreach ($cajas as $caja) {
            echo "ID: {$caja['id']}, fecha: {$caja['fecha']}, usuario_id: {$caja['usuario_id']}, estado: '{$caja['estado']}', created_at: {$caja['created_at']}\n";
        }
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage();
}
?>
