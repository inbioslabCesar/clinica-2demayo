<?php
require_once __DIR__ . '/init_api.php';

try {
    // Verificar si hay usuario autenticado
    if (isset($_SESSION['usuario']) && is_array($_SESSION['usuario'])) {
        // Usuario normal autenticado (estructura existente)
        echo json_encode([
            'success' => true,
            'authenticated' => true,
            'usuario_id' => $_SESSION['usuario']['id'] ?? null,
            'nombre' => $_SESSION['usuario']['nombre'] ?? '',
            'rol' => $_SESSION['usuario']['rol'] ?? '',
            'usuario' => $_SESSION['usuario']['usuario'] ?? '',
            'tipo' => 'usuario'
        ]);
    } elseif (isset($_SESSION['medico_id']) && isset($_SESSION['medico'])) {
        // Médico autenticado
        echo json_encode([
            'success' => true,
            'authenticated' => true,
            'usuario_id' => $_SESSION['medico_id'],
            'nombre' => $_SESSION['medico']['nombre'] ?? '',
            'rol' => 'medico',
            'tipo' => 'medico'
        ]);
    } else {
        // No autenticado
        echo json_encode([
            'success' => false,
            'authenticated' => false,
            'error' => 'Usuario no autenticado'
        ]);
    }
} catch (Exception $e) {
    error_log("Error en api_auth_status.php: " . $e->getMessage());
    echo json_encode([
        'success' => false,
        'authenticated' => false,
        'error' => 'Error interno del servidor'
    ]);
}
?>