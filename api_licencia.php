<?php
// Estado de la suscripción del sistema para la sesión actual (banner, modal de pago y pantalla de bloqueo).
// Solo lectura. El administrador ve aviso, vencida y bloqueada con datos de pago; recepción, vencida y bloqueada;
// el resto de roles solo el mensaje de bloqueo (sin montos ni cuentas). Sin sesión: 401.
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/modules/LicenciaSistema.php';
api_liberar_sesion_lectura();

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Metodo no permitido']);
    exit;
}

$usuario = $_SESSION['usuario'] ?? null;
if (!is_array($usuario) && !isset($_SESSION['medico_id']) && !isset($_SESSION['empresa_portal'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'No autenticado']);
    exit;
}

$rol = is_array($usuario) ? strtolower(trim((string)($usuario['rol'] ?? ''))) : 'otro';
echo json_encode(LicenciaSistema::vistaPara(LicenciaSistema::leerFila($pdo ?? $mysqli ?? null), $rol), JSON_UNESCAPED_UNICODE);
