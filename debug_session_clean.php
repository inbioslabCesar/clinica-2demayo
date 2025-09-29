<?php
session_start();
header('Content-Type: application/json');

echo json_encode([
    'session_data' => $_SESSION,
    'session_id' => session_id(),
    'session_status' => session_status(),
    'usuario_exists' => isset($_SESSION['usuario']),
    'usuario_data' => $_SESSION['usuario'] ?? 'No existe',
    'usuario_rol' => $_SESSION['usuario']['rol'] ?? 'No existe rol',
    'medico_exists' => isset($_SESSION['medico_id']),
    'medico_data' => [
        'medico_id' => $_SESSION['medico_id'] ?? 'No existe',
        'medico_email' => $_SESSION['medico_email'] ?? 'No existe'
    ]
], JSON_PRETTY_PRINT);
?>