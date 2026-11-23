<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db_ocupacional.php';
require_once __DIR__ . '/modules/OcupacionalSecretos.php';
require_once __DIR__ . '/modules/LimiteIntentos.php';
// El portal exige además su propio módulo (db_ocupacional.php ya exigió 'ocupacional').
ModulosInstalacion::exigir($mysqli ?? ($pdo ?? null), 'portal_empresas');

const EMPRESA_LOGIN_MAX_FALLOS = 8;

const EMPRESA_LOGIN_DOMAIN = 'clinica2demayo.com';
const EMPRESA_LOGIN_ALLOWED_DOMAINS = [
    'clinica2demayo.com',
    'clinica2demayo.co',
    'clinica2demayo',
    'clinicadosdemayo.com',
    'clinicadosdemayo.co',
    'clinicadosdemayo',
];

function out_empresa_login($code, $payload)
{
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function normalize_slug_empresa_login($value)
{
    $text = trim((string)$value);
    if ($text === '') {
        return '';
    }
    $converted = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $text);
    if ($converted !== false && $converted !== '') {
        $text = $converted;
    }
    $text = strtolower($text);
    $text = preg_replace('/[^a-z0-9]+/', '_', $text);
    $text = preg_replace('/_+/', '_', (string)$text);
    return trim((string)$text, '_');
}

function extract_local_part_empresa_login($value)
{
    $text = strtolower(trim((string)$value));
    if ($text === '') {
        return '';
    }
    $atPos = strpos($text, '@');
    if ($atPos === false) {
        return $text;
    }
    return trim(substr($text, 0, $atPos));
}

function parse_empresa_login_email($email)
{
    $email = strtolower(trim((string)$email));
    if ($email === '' || strpos($email, '@') === false) {
        return null;
    }
    $parts = explode('@', $email);
    if (count($parts) !== 2) {
        return null;
    }
    $localPart = trim((string)$parts[0]);
    $domain = trim((string)$parts[1]);
    if ($localPart === '' || !in_array($domain, EMPRESA_LOGIN_ALLOWED_DOMAINS, true)) {
        return null;
    }
    $canonicalEmail = $localPart . '@' . EMPRESA_LOGIN_DOMAIN;
    return [
        'email' => $canonicalEmail,
        'email_original' => $email,
        'local' => $localPart,
    ];
}

// Las tablas ocupacionales se crean con la herramienta de esquema (db/esquema_referencia/esquema_referencia_ocupacional.json),
// nunca durante una petición.

/** Registra el fallo (por IP y por cuenta) y responde con el mismo mensaje genérico. */
function login_empresa_fallido()
{
    global $loginClavesLimite;
    LimiteIntentos::registrarFallo('portal_empresa', $loginClavesLimite ?? []);
    out_empresa_login(401, ['success' => false, 'error' => 'Credenciales incorrectas']);
}

/** @return string|null 'rrhh' o 'doctor' según qué contraseña de la empresa coincidió */
function empresa_password_coincidente($empresa, $password)
{
    if (OcupacionalSecretos::verificar($password, (string)($empresa['rrhh_password'] ?? ''))) {
        return 'rrhh';
    }
    if (OcupacionalSecretos::verificar($password, (string)($empresa['doctor_password'] ?? ''))) {
        return 'doctor';
    }
    return null;
}

/** Si la contraseña de la empresa aún estaba en texto plano, la reescribe como hash (primer uso). */
function empresa_asegurar_hash($mysqliOcup, $empresa, $columna, $password)
{
    if (!in_array($columna, ['rrhh', 'doctor'], true)) {
        return;
    }
    $campo = $columna . '_password';
    if (!OcupacionalSecretos::requiereActualizar((string)($empresa[$campo] ?? ''))) {
        return;
    }
    $hash = OcupacionalSecretos::hashear($password);
    $empresaId = (int)($empresa['id'] ?? 0);
    $stmt = $mysqliOcup->prepare('UPDATE empresas_ocupacionales SET ' . $campo . ' = ? WHERE id = ? LIMIT 1');
    if ($stmt) {
        $stmt->bind_param('si', $hash, $empresaId);
        $stmt->execute();
        $stmt->close();
    }
}

function set_empresa_session($account, $empresa)
{
    LimiteIntentos::limpiar('portal_empresa', 'cuenta:' . strtolower((string)($account['email_login'] ?? '')));
    session_regenerate_id(true);
    $_SESSION['empresa_portal'] = [
        'usuario_portal_id' => (int)($account['id'] ?? 0),
        'empresa_id' => (int)($empresa['id'] ?? 0),
        'email_login' => (string)($account['email_login'] ?? ''),
        'nombre_empresa' => (string)($empresa['razon_social'] ?? ''),
        'ruc' => (string)($empresa['ruc'] ?? ''),
    ];

    unset($_SESSION['usuario']);
    unset($_SESSION['medico']);
    unset($_SESSION['medico_id']);

    return [
        'id' => (int)($account['id'] ?? 0),
        'usuario' => (string)($account['email_login'] ?? ''),
        'nombre' => (string)($empresa['razon_social'] ?? ''),
        'rol' => 'empresa',
        'empresa_id' => (int)($empresa['id'] ?? 0),
        'ruc' => (string)($empresa['ruc'] ?? ''),
        'permisos' => ['empresa_portal_read'],
    ];
}

function find_empresa_legacy_match($mysqliOcup, $localPart)
{
    $stmt = $mysqliOcup->prepare('SELECT id, ruc, razon_social, nombre_comercial, rrhh_usuario, rrhh_password, doctor_usuario, doctor_password, estado FROM empresas_ocupacionales WHERE estado = "activo"');
    if (!$stmt) {
        out_empresa_login(500, ['success' => false, 'error' => 'No se pudo validar empresa para login']);
    }
    $stmt->execute();
    $res = $stmt->get_result();

    $localPartRaw = strtolower(trim((string)$localPart));
    $localNorm = normalize_slug_empresa_login($localPartRaw);
    $found = null;
    while ($row = $res->fetch_assoc()) {
        $rrhhUsuarioRaw = strtolower(trim((string)($row['rrhh_usuario'] ?? '')));
        $doctorUsuarioRaw = strtolower(trim((string)($row['doctor_usuario'] ?? '')));
        $rrhhUsuarioLocal = extract_local_part_empresa_login($rrhhUsuarioRaw);
        $doctorUsuarioLocal = extract_local_part_empresa_login($doctorUsuarioRaw);

        // Match directo por usuario legacy (correo completo o solo parte local).
        if (($rrhhUsuarioRaw !== '' && $rrhhUsuarioRaw === $localPartRaw)
            || ($doctorUsuarioRaw !== '' && $doctorUsuarioRaw === $localPartRaw)
            || ($rrhhUsuarioLocal !== '' && $rrhhUsuarioLocal === $localPartRaw)
            || ($doctorUsuarioLocal !== '' && $doctorUsuarioLocal === $localPartRaw)) {
            $found = $row;
            break;
        }

        $candidates = [
            normalize_slug_empresa_login($rrhhUsuarioRaw),
            normalize_slug_empresa_login($doctorUsuarioRaw),
            normalize_slug_empresa_login($rrhhUsuarioLocal),
            normalize_slug_empresa_login($doctorUsuarioLocal),
            normalize_slug_empresa_login($row['nombre_comercial'] ?? ''),
            normalize_slug_empresa_login($row['razon_social'] ?? ''),
            normalize_slug_empresa_login((string)($row['id'] ?? '')),
            normalize_slug_empresa_login((string)($row['ruc'] ?? '')),
        ];
        foreach ($candidates as $candidate) {
            if ($candidate !== '' && $candidate === $localNorm) {
                $found = $row;
                break 2;
            }
        }
    }
    $stmt->close();
    return $found;
}

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if (!is_array($data)) {
    $data = $_POST;
}

$usuario = (string)($data['usuario'] ?? $data['email'] ?? '');
$password = (string)($data['password'] ?? '');
if (trim($usuario) === '' || trim($password) === '') {
    out_empresa_login(400, ['success' => false, 'error' => 'Usuario y contraseña requeridos']);
}

$parsedEmail = parse_empresa_login_email($usuario);
if (!$parsedEmail) {
    out_empresa_login(422, ['success' => false, 'error' => 'Use un login empresarial valido (nombre_empresa@clinica2demayo.com)']);
}

$loginIp = (string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
$loginClavesLimite = ['ip:' . $loginIp, 'cuenta:' . (string)$parsedEmail['email']];
if (LimiteIntentos::bloqueado('portal_empresa', $loginClavesLimite, EMPRESA_LOGIN_MAX_FALLOS)) {
    out_empresa_login(429, ['success' => false, 'error' => 'Demasiados intentos. Espere unos minutos.']);
}

$stmtAcc = $mysqliOcup->prepare('SELECT pu.id, pu.empresa_id, pu.email_login, pu.password_hash, pu.estado, e.ruc, e.razon_social, e.estado AS empresa_estado
                                 FROM ocupacional_empresas_portal_usuarios pu
                                 INNER JOIN empresas_ocupacionales e ON e.id = pu.empresa_id
                                 WHERE LOWER(pu.email_login) = LOWER(?) OR LOWER(pu.email_login) = LOWER(?)
                                 LIMIT 1');
if (!$stmtAcc) {
    out_empresa_login(500, ['success' => false, 'error' => 'No se pudo autenticar empresa']);
}
$emailCanonical = (string)$parsedEmail['email'];
$emailOriginal = (string)($parsedEmail['email_original'] ?? $emailCanonical);
$stmtAcc->bind_param('ss', $emailCanonical, $emailOriginal);
$stmtAcc->execute();
$account = $stmtAcc->get_result()->fetch_assoc();
$stmtAcc->close();

if ($account) {
    if (($account['estado'] ?? '') !== 'activo' || ($account['empresa_estado'] ?? '') !== 'activo') {
        out_empresa_login(403, ['success' => false, 'error' => 'Cuenta empresarial inactiva']);
    }

    if (!password_verify($password, (string)($account['password_hash'] ?? ''))) {
        // Respaldo heredado: si el hash del portal quedó desactualizado, se valida contra las contraseñas de la empresa
        // (hash o texto plano antiguo) y se renueva el hash del portal.
        $empresaLegacyFallback = find_empresa_legacy_match($mysqliOcup, (string)$parsedEmail['local']);
        $columnaCoincide = $empresaLegacyFallback ? empresa_password_coincidente($empresaLegacyFallback, $password) : null;

        if ($columnaCoincide === null) {
            login_empresa_fallido();
        }
        empresa_asegurar_hash($mysqliOcup, $empresaLegacyFallback, $columnaCoincide, $password);
        $hashFallback = password_hash($password, PASSWORD_DEFAULT);
        $stmtFix = $mysqliOcup->prepare('UPDATE ocupacional_empresas_portal_usuarios
                                         SET empresa_id = ?, password_hash = ?, estado = "activo", ultimo_login_at = NOW()
                                         WHERE id = ? LIMIT 1');
        if ($stmtFix) {
            $empresaFallbackId = (int)($empresaLegacyFallback['id'] ?? $account['empresa_id'] ?? 0);
            $accFallbackId = (int)($account['id'] ?? 0);
            $stmtFix->bind_param('isi', $empresaFallbackId, $hashFallback, $accFallbackId);
            $stmtFix->execute();
            $stmtFix->close();
        }

        $stmtReloadAcc = $mysqliOcup->prepare('SELECT pu.id, pu.empresa_id, pu.email_login, pu.password_hash, pu.estado, e.ruc, e.razon_social, e.estado AS empresa_estado
                                               FROM ocupacional_empresas_portal_usuarios pu
                                               INNER JOIN empresas_ocupacionales e ON e.id = pu.empresa_id
                                               WHERE pu.id = ?
                                               LIMIT 1');
        if ($stmtReloadAcc) {
            $accFallbackId = (int)($account['id'] ?? 0);
            $stmtReloadAcc->bind_param('i', $accFallbackId);
            $stmtReloadAcc->execute();
            $reloaded = $stmtReloadAcc->get_result()->fetch_assoc();
            $stmtReloadAcc->close();
            if ($reloaded) {
                $account = $reloaded;
            }
        }
    }

    $stmtTouch = $mysqliOcup->prepare('UPDATE ocupacional_empresas_portal_usuarios SET ultimo_login_at = NOW() WHERE id = ? LIMIT 1');
    if ($stmtTouch) {
        $accId = (int)$account['id'];
        $stmtTouch->bind_param('i', $accId);
        $stmtTouch->execute();
        $stmtTouch->close();
    }

    $usuarioPortal = set_empresa_session($account, [
        'id' => (int)$account['empresa_id'],
        'ruc' => (string)($account['ruc'] ?? ''),
        'razon_social' => (string)($account['razon_social'] ?? ''),
    ]);
    out_empresa_login(200, ['success' => true, 'usuario' => $usuarioPortal]);
}

$empresaLegacy = find_empresa_legacy_match($mysqliOcup, (string)$parsedEmail['local']);
if (!$empresaLegacy) {
    login_empresa_fallido();
}

$columnaLegacy = empresa_password_coincidente($empresaLegacy, $password);
if ($columnaLegacy === null) {
    login_empresa_fallido();
}
empresa_asegurar_hash($mysqliOcup, $empresaLegacy, $columnaLegacy, $password);
$hash = password_hash($password, PASSWORD_DEFAULT);
$stmtUpsert = $mysqliOcup->prepare('INSERT INTO ocupacional_empresas_portal_usuarios (empresa_id, email_login, password_hash, estado, ultimo_login_at)
                                    VALUES (?, ?, ?, "activo", NOW())
                                    ON DUPLICATE KEY UPDATE
                                        empresa_id = VALUES(empresa_id),
                                        password_hash = VALUES(password_hash),
                                        estado = "activo",
                                        ultimo_login_at = NOW()');
if (!$stmtUpsert) {
    out_empresa_login(500, ['success' => false, 'error' => 'No se pudo crear credencial de portal empresa']);
}
$empresaIdLegacy = (int)$empresaLegacy['id'];
$emailLogin = (string)$parsedEmail['email'];
$stmtUpsert->bind_param('iss', $empresaIdLegacy, $emailLogin, $hash);
$stmtUpsert->execute();
$stmtUpsert->close();

$stmtReload = $mysqliOcup->prepare('SELECT id, empresa_id, email_login FROM ocupacional_empresas_portal_usuarios WHERE LOWER(email_login) = LOWER(?) LIMIT 1');
if (!$stmtReload) {
    out_empresa_login(500, ['success' => false, 'error' => 'No se pudo finalizar login empresa']);
}
$stmtReload->bind_param('s', $emailLogin);
$stmtReload->execute();
$accountReload = $stmtReload->get_result()->fetch_assoc();
$stmtReload->close();

if (!$accountReload) {
    out_empresa_login(500, ['success' => false, 'error' => 'No se pudo finalizar login empresa']);
}

$usuarioPortal = set_empresa_session($accountReload, [
    'id' => (int)$empresaLegacy['id'],
    'ruc' => (string)($empresaLegacy['ruc'] ?? ''),
    'razon_social' => (string)($empresaLegacy['razon_social'] ?? ''),
]);

out_empresa_login(200, [
    'success' => true,
    'usuario' => $usuarioPortal,
    'migrated_from_legacy' => true,
]);
