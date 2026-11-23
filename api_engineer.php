<?php
// API del panel Engineer (licencias y módulos de ESTA instalación).
// - Si no existe el archivo de credenciales (ver modules/EngineerAuth.php) el panel está desactivado: 404.
// - Login = contraseña + código TOTP. Sesión propia ($_SESSION['engineer']), independiente de `usuarios`.
// - Las acciones que cambian datos exigen sesión vigente y cabecera X-Engineer-Csrf.
require_once __DIR__ . '/modules/EngineerAuth.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');

function engineer_out(int $codigo, array $payload): void {
    http_response_code($codigo);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

if (EngineerAuth::cargarConfig() === null) {
    engineer_out(404, ['success' => false, 'error' => 'No encontrado']);
}

require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/modules/ModulosInstalacion.php';
require_once __DIR__ . '/modules/LicenciaSistema.php';

$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$ip = (string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
$entrada = [];
if ($metodo === 'POST') {
    $crudo = file_get_contents('php://input');
    $entrada = json_decode((string)$crudo, true);
    if (!is_array($entrada)) {
        engineer_out(400, ['success' => false, 'error' => 'Cuerpo invalido']);
    }
}
$accion = $metodo === 'POST' ? (string)($entrada['accion'] ?? '') : (string)($_GET['accion'] ?? 'estado');

if ($accion === 'estado' && $metodo === 'GET') {
    $activa = EngineerAuth::sesionActiva();
    engineer_out(200, ['success' => true, 'autenticado' => $activa, 'csrf' => $activa ? (string)$_SESSION['engineer']['csrf'] : null]);
}

if ($accion === 'login' && $metodo === 'POST') {
    $r = EngineerAuth::intentarLogin((string)($entrada['password'] ?? ''), (string)($entrada['codigo'] ?? ''), $ip);
    if (!$r['ok']) {
        usleep(600000);
        if ($r['codigo'] === 'bloqueado') {
            engineer_out(429, ['success' => false, 'error' => 'Demasiados intentos. Espere unos minutos.']);
        }
        engineer_out(401, ['success' => false, 'error' => 'Credenciales invalidas']);
    }
    $csrf = EngineerAuth::iniciarSesion();
    engineer_out(200, ['success' => true, 'csrf' => $csrf]);
}

if (!EngineerAuth::sesionActiva()) {
    engineer_out(401, ['success' => false, 'error' => 'Sesion no valida']);
}

if ($accion === 'logout' && $metodo === 'POST') {
    EngineerAuth::cerrarSesion();
    engineer_out(200, ['success' => true]);
}

if ($accion === 'listar' && $metodo === 'GET') {
    try {
        engineer_out(200, [
            'success' => true,
            'modulos' => ModulosInstalacion::listarCompleto($pdo),
            'historial' => ModulosInstalacion::historial($pdo, 30),
            'gracia_dias' => ModulosInstalacion::GRACIA_DIAS,
        ]);
    } catch (PDOException $e) {
        engineer_out(500, ['success' => false, 'error' => 'Faltan las tablas de modulos: aplique sql/2026-11-22/005_modulos_instalacion_schema.sql']);
    }
}

if ($accion === 'actualizar' && $metodo === 'POST') {
    if (!EngineerAuth::csrfValido((string)($_SERVER['HTTP_X_ENGINEER_CSRF'] ?? ''))) {
        engineer_out(403, ['success' => false, 'error' => 'Token invalido']);
    }
    try {
        $cambios = ModulosInstalacion::actualizar($pdo, (string)($entrada['modulo'] ?? ''), (array)($entrada['datos'] ?? []), 'engineer', $ip);
        engineer_out(200, ['success' => true, 'cambios' => $cambios]);
    } catch (InvalidArgumentException $e) {
        engineer_out(422, ['success' => false, 'error' => $e->getMessage()]);
    } catch (Throwable $e) {
        if (function_exists('api_log_server_error')) {
            api_log_server_error('api-engineer', $e->getMessage(), $e->getFile(), (int)$e->getLine());
        }
        engineer_out(500, ['success' => false, 'error' => 'Error interno']);
    }
}

if ($accion === 'licencia' && $metodo === 'GET') {
    try {
        engineer_out(200, ['success' => true] + LicenciaSistema::obtenerAdmin($pdo));
    } catch (PDOException $e) {
        engineer_out(500, ['success' => false, 'error' => 'Faltan las tablas de suscripcion: aplique sql/2026-11-23/001_licencia_sistema_schema.sql']);
    }
}

if (in_array($accion, ['licencia_guardar', 'licencia_pago', 'licencia_prorroga'], true) && $metodo === 'POST') {
    if (!EngineerAuth::csrfValido((string)($_SERVER['HTTP_X_ENGINEER_CSRF'] ?? ''))) {
        engineer_out(403, ['success' => false, 'error' => 'Token invalido']);
    }
    try {
        if ($accion === 'licencia_guardar') {
            LicenciaSistema::guardar($pdo, (array)($entrada['datos'] ?? []), 'engineer', $ip);
        } elseif ($accion === 'licencia_pago') {
            LicenciaSistema::registrarPago($pdo, (array)($entrada['datos'] ?? []), 'engineer', $ip);
        } else {
            $hasta = isset($entrada['hasta']) && $entrada['hasta'] !== '' ? (string)$entrada['hasta'] : null;
            LicenciaSistema::prorrogar($pdo, $hasta, 'engineer', $ip);
        }
        LicenciaSistema::invalidarCache();
        engineer_out(200, ['success' => true] + LicenciaSistema::obtenerAdmin($pdo));
    } catch (InvalidArgumentException $e) {
        engineer_out(422, ['success' => false, 'error' => $e->getMessage()]);
    } catch (Throwable $e) {
        if (function_exists('api_log_server_error')) {
            api_log_server_error('api-engineer-licencia', $e->getMessage(), $e->getFile(), (int)$e->getLine());
        }
        engineer_out(500, ['success' => false, 'error' => 'Error interno']);
    }
}

engineer_out(400, ['success' => false, 'error' => 'Accion no valida']);
