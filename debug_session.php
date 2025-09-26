<?php
session_start();
header('Content-Type: application/json');

// Verificar el estado de la sesión actual
if (isset($_SESSION['usuario_id'])) {
    echo json_encode([
        'authenticated' => true,
        'usuario_id' => $_SESSION['usuario_id'],
        'usuario_nombre' => $_SESSION['usuario_nombre'] ?? 'No definido',
        'rol' => $_SESSION['rol'] ?? 'No definido', // Cambiado de tipo_usuario a rol
        'session_data' => $_SESSION // Mostrar toda la información de sesión para debugging
    ]);
} else {
    echo json_encode([
        'authenticated' => false,
        'message' => 'No hay sesión activa',
        'session_data' => $_SESSION
    ]);
}
?>