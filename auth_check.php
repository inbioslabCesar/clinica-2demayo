<?php
// Log temporal para depuración de sesión
file_put_contents(__DIR__ . '/debug_session.txt', date('Y-m-d H:i:s') . "\n" . print_r($_SESSION, true) . "\n", FILE_APPEND);

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') {
    // Permitir acceso público a operaciones GET (lectura)
    return;
}

if (isset($_SESSION['usuario'])) {
    // Solo permitir acceso a roles permitidos de usuario
    $isExamenesLab = strpos($_SERVER['SCRIPT_NAME'], 'api_examenes_laboratorio.php') !== false;
    $isMedicamentos = strpos($_SERVER['SCRIPT_NAME'], 'api_medicamentos.php') !== false;
    $isHistorialMedico = strpos($_SERVER['SCRIPT_NAME'], 'api_historial_consultas_medico.php') !== false;
    $rolesPermitidos = ['administrador', 'quimico', 'laboratorio', 'laboratorista'];
    if ($isExamenesLab || $isMedicamentos || $isHistorialMedico) {
        $rolesPermitidos[] = 'medico';
    }
    // Permitir acceso a médicos solo para api_historia_clinica.php
    $isHistoriaClinica = strpos($_SERVER['SCRIPT_NAME'], 'api_historia_clinica.php') !== false;
    if ($isHistoriaClinica) {
        $rolesPermitidos[] = 'medico';
    }
    if (!in_array($_SESSION['usuario']['rol'], $rolesPermitidos)) {
        http_response_code(403);
        echo json_encode(['error' => 'No autorizado']);
        exit;
    }
} elseif (isset($_SESSION['medico_id'])) {
    // Médico logueado: acceso permitido
    // Puedes agregar validaciones adicionales aquí si lo necesitas
} else {
    http_response_code(401);
    echo json_encode(['error' => 'No autenticado']);
    exit;
}