<?php
// API del portal del paciente (módulo opcional 'portal_pacientes'): login con DNI + PIN, lista y descarga de resultados.
// Su sesión ($_SESSION['paciente_portal']) es independiente de la del personal y no da acceso a ninguna otra API.
//   GET  ?accion=sesion     -> ¿hay sesión? (200 aunque no la haya)
//   POST ?accion=login      -> { documento, pin }
//   POST ?accion=logout
//   GET  ?accion=listar     -> documentos del paciente con su estado de entrega
//   GET  ?accion=descargar&tipo=laboratorio|imagenologia&id=N
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/modules/ModulosInstalacion.php';
require_once __DIR__ . '/modules/LimiteIntentos.php';
require_once __DIR__ . '/modules/PortalPaciente.php';

ModulosInstalacion::exigir($mysqli ?? ($pdo ?? null), 'portal_pacientes');

// Hash de relleno: el login tarda lo mismo exista o no el documento (no revela qué DNI tienen acceso).
const PP_HASH_RELLENO = '$2y$10$SC99RdNqs/aOmaH54WoByO3aVidW70gK.b2NJZwur0an1p4Zw.AQK';

const PP_MENSAJES_ESTADO = [
    'pendiente_pago' => 'Este resultado tiene un saldo pendiente. Regularice su pago en caja para descargarlo.',
    'en_revision' => 'Este resultado aún está en revisión. La clínica lo habilitará en breve.',
];

function pp_responder(int $codigo, array $payload): void
{
    while (ob_get_level() > 0) {
        ob_end_clean();
    }
    http_response_code($codigo);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** @return array<string,mixed>|null sesión vigente del paciente, o null (y la limpia si expiró o el acceso se desactivó) */
function pp_sesion(mysqli $conn): ?array
{
    $s = $_SESSION['paciente_portal'] ?? null;
    if (!is_array($s) || (int)($s['paciente_id'] ?? 0) <= 0) {
        return null;
    }
    if (time() - (int)($s['ultimo_acceso'] ?? 0) > PortalPaciente::INACTIVIDAD_SEG) {
        unset($_SESSION['paciente_portal']);
        return null;
    }
    $stmt = $conn->prepare("SELECT 1 FROM paciente_portal_accesos WHERE paciente_id = ? AND estado = 'activo' LIMIT 1");
    $pid = (int)$s['paciente_id'];
    $stmt->bind_param('i', $pid);
    $stmt->execute();
    $activo = (bool)$stmt->get_result()->fetch_row();
    $stmt->close();
    if (!$activo) {
        unset($_SESSION['paciente_portal']);
        return null;
    }
    $_SESSION['paciente_portal']['ultimo_acceso'] = time();
    return $_SESSION['paciente_portal'];
}

function pp_sesion_requerida(mysqli $conn): array
{
    $s = pp_sesion($conn);
    if ($s === null) {
        pp_responder(401, ['success' => false, 'error' => 'Sesión no iniciada o expirada']);
    }
    return $s;
}

function pp_login(mysqli $conn): void
{
    $data = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($data)) {
        $data = $_POST;
    }
    $documento = PortalPaciente::normalizarDocumento((string)($data['documento'] ?? ''));
    $pin = trim((string)($data['pin'] ?? ''));
    if ($documento === '' || !PortalPaciente::pinValido($pin)) {
        pp_responder(422, ['success' => false, 'error' => 'Ingrese su documento y el PIN de 6 dígitos']);
    }

    $ip = (string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
    $claves = ['ip:' . $ip, 'doc:' . $documento];
    if (LimiteIntentos::bloqueado('portal_paciente', ['doc:' . $documento], PortalPaciente::MAX_FALLOS_DOCUMENTO)
        || LimiteIntentos::bloqueado('portal_paciente', ['ip:' . $ip], PortalPaciente::MAX_FALLOS_IP)) {
        pp_responder(429, ['success' => false, 'error' => 'Demasiados intentos. Espere unos minutos.']);
    }

    $stmt = $conn->prepare("SELECT a.id, a.paciente_id, a.pin_hash, a.estado, p.nombre, p.apellido
                            FROM paciente_portal_accesos a
                            INNER JOIN pacientes p ON p.id = a.paciente_id
                            WHERE UPPER(TRIM(p.dni)) = ?");
    $stmt->bind_param('s', $documento);
    $stmt->execute();
    $candidatos = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();

    $acceso = null;
    foreach ($candidatos as $c) {
        if ($c['estado'] === 'activo' && password_verify($pin, (string)$c['pin_hash'])) {
            $acceso = $c;
            break;
        }
    }
    if ($acceso === null) {
        if (!$candidatos) {
            password_verify($pin, PP_HASH_RELLENO);
        }
        LimiteIntentos::registrarFallo('portal_paciente', $claves);
        PortalPaciente::registrarEvento($conn, null, 'login_fallido', null, null, null, 'doc:' . $documento);
        pp_responder(401, ['success' => false, 'error' => 'Documento o PIN incorrecto']);
    }

    LimiteIntentos::limpiar('portal_paciente', 'doc:' . $documento);
    session_regenerate_id(true);
    $pacienteId = (int)$acceso['paciente_id'];
    $nombre = trim($acceso['nombre'] . ' ' . $acceso['apellido']);
    $_SESSION['paciente_portal'] = ['paciente_id' => $pacienteId, 'nombre' => $nombre, 'ultimo_acceso' => time()];

    $upd = $conn->prepare('UPDATE paciente_portal_accesos SET ultimo_login_at = NOW() WHERE id = ?');
    $accesoId = (int)$acceso['id'];
    $upd->bind_param('i', $accesoId);
    $upd->execute();
    $upd->close();
    PortalPaciente::registrarEvento($conn, $pacienteId, 'login');

    pp_responder(200, ['success' => true, 'paciente' => ['nombre' => $nombre]]);
}

/**
 * Atiende la acción. Devuelve el id del resultado de laboratorio a generar cuando hay que entregar ese PDF
 * (el generador es un script global que necesita $conn); en cualquier otro caso responde y termina.
 */
function pp_despachar(mysqli $conn): int
{
    $metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $accion = trim((string)($_GET['accion'] ?? ''));

    if ($accion === 'login' && $metodo === 'POST') {
        pp_login($conn);
    }
    if ($accion === 'logout' && $metodo === 'POST') {
        unset($_SESSION['paciente_portal']);
        pp_responder(200, ['success' => true]);
    }
    if ($accion === 'sesion' && $metodo === 'GET') {
        $s = pp_sesion($conn);
        pp_responder(200, [
            'success' => true,
            'autenticado' => $s !== null,
            'paciente' => $s !== null ? ['nombre' => (string)$s['nombre']] : null,
        ]);
    }
    if ($accion === 'listar' && $metodo === 'GET') {
        $s = pp_sesion_requerida($conn);
        pp_responder(200, ['success' => true, 'data' => PortalPaciente::documentos($conn, (int)$s['paciente_id'])]);
    }
    if ($accion === 'descargar' && $metodo === 'GET') {
        $s = pp_sesion_requerida($conn);
        $pacienteId = (int)$s['paciente_id'];
        $tipo = trim((string)($_GET['tipo'] ?? ''));
        $refId = (int)($_GET['id'] ?? 0);
        if (!in_array($tipo, PortalPaciente::tiposValidos(), true) || $refId <= 0) {
            pp_responder(422, ['success' => false, 'error' => 'Documento no válido']);
        }

        // Se busca entre los documentos del propio paciente: un id ajeno simplemente no aparece.
        $doc = PortalPaciente::buscarDocumento($conn, $pacienteId, $tipo, $refId);
        if ($doc === null) {
            pp_responder(404, ['success' => false, 'error' => 'Documento no encontrado']);
        }
        if ($doc['estado'] !== 'disponible') {
            PortalPaciente::registrarEvento($conn, $pacienteId, 'descarga_bloqueada', $tipo, $refId, null, (string)$doc['estado']);
            pp_responder(403, [
                'success' => false,
                'estado' => $doc['estado'],
                'error' => PP_MENSAJES_ESTADO[$doc['estado']] ?? 'Documento no disponible',
            ]);
        }

        if ($tipo === 'laboratorio') {
            PortalPaciente::registrarEvento($conn, $pacienteId, 'descarga', $tipo, $refId);
            return $refId;
        }

        $ruta = PortalPaciente::rutaPdfInforme($conn, $refId);
        if ($ruta === null) {
            pp_responder(404, ['success' => false, 'error' => 'El archivo del informe no está disponible']);
        }
        PortalPaciente::registrarEvento($conn, $pacienteId, 'descarga', $tipo, $refId);
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        header('Content-Type: application/pdf');
        header('Content-Disposition: attachment; filename="informe_imagenologia_' . $refId . '.pdf"');
        header('Content-Length: ' . filesize($ruta));
        header('Cache-Control: private, no-store, no-cache, must-revalidate');
        header('Pragma: no-cache');
        readfile($ruta);
        exit;
    }

    pp_responder(405, ['success' => false, 'error' => 'Acción no soportada']);
}

try {
    $resultadoLabParaGenerar = pp_despachar($mysqli);
} catch (Throwable $e) {
    if (function_exists('api_log_server_error')) {
        api_log_server_error('api-paciente-portal', $e->getMessage(), $e->getFile(), (int)$e->getLine());
    } else {
        error_log('api_paciente_portal: ' . $e->getMessage());
    }
    pp_responder(500, ['success' => false, 'error' => 'Error interno del servidor']);
}

// Laboratorio: el PDF lo genera el script existente; el id ya fue validado como del paciente en sesión.
$_GET = ['id' => $resultadoLabParaGenerar];
require __DIR__ . '/descargar_resultados_laboratorio.php';
exit;
