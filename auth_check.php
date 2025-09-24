<?php
// Solo verificación de sesión, sin CORS ni session_start
if (!isset($_SESSION['usuario']) && !isset($_SESSION['medico_id'])) {
    http_response_code(401);
    echo json_encode(['error' => 'No autenticado']);
    exit;
}
// Si quieres restringir por rol, puedes hacer algo como:
// if (isset($_SESSION['usuario']) && $_SESSION['usuario']['rol'] !== 'laboratorista') { ... }