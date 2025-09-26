<?php
// Script de debug para verificar sesión de químico
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '',
    'secure' => false,
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

header('Content-Type: application/json');

$debug_info = [
    'session_id' => session_id(),
    'session_status' => session_status(),
    'session_data' => $_SESSION,
    'usuario_isset' => isset($_SESSION['usuario']),
    'medico_id_isset' => isset($_SESSION['medico_id']),
    'cookie_params' => session_get_cookie_params(),
    'server_time' => date('Y-m-d H:i:s'),
];

echo json_encode($debug_info, JSON_PRETTY_PRINT);
?>