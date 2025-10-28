<?php
// limpiar_cajas_debug.php
// Script seguro para limpiar todas las cajas y sus relaciones en modo desarrollo
// ¡ATENCIÓN! Solo usar en entorno de desarrollo. No ejecutar en producción.

require_once 'db.php'; // Ajusta si tu conexión está en otro archivo

// Desactivar comprobación de claves foráneas temporalmente
mysqli_query($conn, 'SET FOREIGN_KEY_CHECKS=0');

// Eliminar registros relacionados (ajusta nombres de tablas si es necesario)
$tablas = [
    'log_reaperturas', // tabla de logs de reapertura de caja
    'cajas'            // tabla principal de cajas
    // Agrega aquí otras tablas relacionadas si existen
];

foreach ($tablas as $tabla) {
    $sql = "DELETE FROM $tabla";
    if (mysqli_query($conn, $sql)) {
        echo "Registros eliminados de $tabla.<br>";
    } else {
        echo "Error al eliminar de $tabla: " . mysqli_error($conn) . "<br>";
    }
}

// Reactivar comprobación de claves foráneas
mysqli_query($conn, 'SET FOREIGN_KEY_CHECKS=1');

echo "Limpieza completada. Puedes volver a abrir cajas para pruebas.";

?>