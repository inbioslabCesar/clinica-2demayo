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
    $isCobros = strpos($_SERVER['SCRIPT_NAME'], 'api_cobros.php') !== false;
    $isIngresos = strpos($_SERVER['SCRIPT_NAME'], 'api_registrar_ingreso.php') !== false ||
                  strpos($_SERVER['SCRIPT_NAME'], 'api_ingresos_detalle.php') !== false ||
                  strpos($_SERVER['SCRIPT_NAME'], 'api_detalle_ingresos_hoy.php') !== false;
    $isCajaBasica = strpos($_SERVER['SCRIPT_NAME'], 'api_caja_abrir.php') !== false ||
                    strpos($_SERVER['SCRIPT_NAME'], 'api_caja_cerrar.php') !== false ||
                    strpos($_SERVER['SCRIPT_NAME'], 'api_caja_estado.php') !== false ||
                    strpos($_SERVER['SCRIPT_NAME'], 'api_caja_actual.php') !== false;
    $isReabrirCaja = strpos($_SERVER['SCRIPT_NAME'], 'api_reabrir_caja.php') !== false ||
                     strpos($_SERVER['SCRIPT_NAME'], 'api_cajas_cerradas.php') !== false;
    $isHonorariosMedicos = strpos($_SERVER['SCRIPT_NAME'], 'api_honorarios_medicos') !== false ||
                          strpos($_SERVER['SCRIPT_NAME'], 'api_movimientos_honorarios.php') !== false;
    
    $rolesPermitidos = ['administrador', 'quimico', 'laboratorio', 'laboratorista', 'recepcionista'];
    
    // Permitir a recepcionistas hacer cobros/ventas, gestionar ingresos, operaciones básicas de caja y honorarios médicos
    if ($isCobros || $isIngresos || $isCajaBasica || $isHonorariosMedicos) {
        $rolesPermitidos[] = 'recepcionista';
    }
    
    // Solo administradores pueden reabrir cajas
    if ($isReabrirCaja && $_SESSION['usuario']['rol'] !== 'administrador') {
        http_response_code(403);
        echo json_encode(['error' => 'Solo administradores pueden reabrir cajas']);
        exit;
    }
    
    // Para honorarios médicos: definir permisos específicos por rol
    if ($isHonorariosMedicos) {
        $usuarioRol = $_SESSION['usuario']['rol'];
        $isConfiguracionHonorarios = strpos($_SERVER['SCRIPT_NAME'], 'api_honorarios_medicos') !== false;
        $isMovimientosHonorarios = strpos($_SERVER['SCRIPT_NAME'], 'api_movimientos_honorarios.php') !== false;
        
        // ADMINISTRADOR: Acceso completo a configuración Y gestión de pagos
        if ($usuarioRol === 'administrador') {
            // Acceso total permitido - no hay restricciones
        }
        // RECEPCIONISTA: Solo gestión de pagos, NO configuración
        elseif ($usuarioRol === 'recepcionista') {
            // Recepcionistas NO pueden modificar configuraciones de honorarios (solo administradores)
            if ($isConfiguracionHonorarios && $method !== 'GET') {
                http_response_code(403);
                echo json_encode(['error' => 'Solo administradores pueden configurar honorarios médicos']);
                exit;
            }
            // Recepcionistas SÍ pueden gestionar movimientos de honorarios (consultar, marcar como pagado)
        }
    }
    
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