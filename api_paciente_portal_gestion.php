<?php
// API del personal para el portal del paciente (módulo 'portal_pacientes'): buscar paciente, generar PIN,
// liberar o retener resultados y ajustar las opciones de la clínica.
// Requiere sesión de personal: administrador, o recepcionista con el permiso 'gestionar_portal_pacientes'.
//   GET  ?accion=buscar&q=             -> pacientes por documento, historia o nombre
//   GET  ?accion=paciente&paciente_id= -> acceso del paciente + sus documentos con estado y saldo
//   GET  ?accion=config
//   POST accion=generar_pin | desactivar_acceso | liberar | guardar_config   (cuerpo JSON)
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/auth_check.php';
require_once __DIR__ . '/modules/ModulosInstalacion.php';
require_once __DIR__ . '/modules/PortalPaciente.php';

ModulosInstalacion::exigir($mysqli ?? ($pdo ?? null), 'portal_pacientes');

$usuarioStaff = $_SESSION['usuario'] ?? null;
if (!PortalPaciente::staffPermitido(is_array($usuarioStaff) ? $usuarioStaff : null)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'No tiene permiso para gestionar el portal del paciente']);
    exit;
}

function ppa_responder(int $codigo, array $payload): void
{
    http_response_code($codigo);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function ppa_paciente(mysqli $conn, int $pacienteId): ?array
{
    $stmt = $conn->prepare('SELECT p.id, p.nombre, p.apellido, p.dni, p.historia_clinica, p.telefono,
                                   a.estado AS acceso_estado, a.pin_generado_at, a.pin_generado_por, a.ultimo_login_at
                            FROM pacientes p
                            LEFT JOIN paciente_portal_accesos a ON a.paciente_id = p.id
                            WHERE p.id = ? LIMIT 1');
    $stmt->bind_param('i', $pacienteId);
    $stmt->execute();
    $fila = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $fila ?: null;
}

function ppa_cuerpo(): array
{
    $data = json_decode((string)file_get_contents('php://input'), true);
    return is_array($data) ? $data : [];
}

$actor = mb_substr((string)($usuarioStaff['nombre'] ?? $usuarioStaff['usuario'] ?? 'personal'), 0, 80);
$esAdministrador = strtolower((string)($usuarioStaff['rol'] ?? '')) === 'administrador';
$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$cuerpo = $metodo === 'POST' ? ppa_cuerpo() : [];
$accion = trim((string)($_GET['accion'] ?? $cuerpo['accion'] ?? ''));

try {
    if ($metodo === 'GET' && $accion === 'config') {
        ppa_responder(200, ['success' => true, 'data' => PortalPaciente::config($mysqli), 'puede_editar' => $esAdministrador]);
    }

    if ($metodo === 'GET' && $accion === 'buscar') {
        $q = trim((string)($_GET['q'] ?? ''));
        if (mb_strlen($q) < 2) {
            ppa_responder(200, ['success' => true, 'data' => []]);
        }
        $like = '%' . addcslashes($q, '%_\\') . '%';
        $stmt = $mysqli->prepare("SELECT p.id, p.nombre, p.apellido, p.dni, p.historia_clinica, p.telefono,
                                         a.estado AS acceso_estado, a.ultimo_login_at
                                  FROM pacientes p
                                  LEFT JOIN paciente_portal_accesos a ON a.paciente_id = p.id
                                  WHERE p.dni LIKE ? OR p.historia_clinica LIKE ?
                                     OR CONCAT(p.nombre, ' ', p.apellido) LIKE ? OR CONCAT(p.apellido, ' ', p.nombre) LIKE ?
                                  ORDER BY p.id DESC LIMIT 15");
        $stmt->bind_param('ssss', $like, $like, $like, $like);
        $stmt->execute();
        $filas = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        ppa_responder(200, ['success' => true, 'data' => $filas]);
    }

    if ($metodo === 'GET' && $accion === 'paciente') {
        $pacienteId = (int)($_GET['paciente_id'] ?? 0);
        $paciente = $pacienteId > 0 ? ppa_paciente($mysqli, $pacienteId) : null;
        if (!$paciente) {
            ppa_responder(404, ['success' => false, 'error' => 'Paciente no encontrado']);
        }
        ppa_responder(200, [
            'success' => true,
            'paciente' => $paciente,
            'documentos' => PortalPaciente::documentos($mysqli, $pacienteId, true),
            'config' => PortalPaciente::config($mysqli),
        ]);
    }

    if ($metodo === 'POST' && $accion === 'guardar_config') {
        if (!$esAdministrador) {
            ppa_responder(403, ['success' => false, 'error' => 'Solo el administrador puede cambiar las opciones del portal']);
        }
        $d = $cuerpo;
        $modo = (string)($d['modo'] ?? '');
        if (!in_array($modo, [PortalPaciente::MODO_AUTOMATICO, PortalPaciente::MODO_MANUAL], true)) {
            ppa_responder(422, ['success' => false, 'error' => 'Modo de liberación no válido']);
        }
        PortalPaciente::guardarConfig($mysqli, $modo, !empty($d['bloquear_deuda']));
        PortalPaciente::registrarEvento($mysqli, null, 'config', null, null, $actor, $modo . ($d['bloquear_deuda'] ? ' | bloquea deuda' : ' | sin bloqueo por deuda'));
        ppa_responder(200, ['success' => true, 'data' => PortalPaciente::config($mysqli)]);
    }

    if ($metodo === 'POST' && in_array($accion, ['generar_pin', 'desactivar_acceso', 'liberar'], true)) {
        $d = $cuerpo;
        $pacienteId = (int)($d['paciente_id'] ?? 0);
        $paciente = $pacienteId > 0 ? ppa_paciente($mysqli, $pacienteId) : null;
        if (!$paciente) {
            ppa_responder(404, ['success' => false, 'error' => 'Paciente no encontrado']);
        }

        if ($accion === 'generar_pin') {
            $documento = trim((string)$paciente['dni']);
            if (PortalPaciente::normalizarDocumento($documento) !== strtoupper($documento)) {
                ppa_responder(422, ['success' => false, 'error' => 'El paciente no tiene un documento válido (5 a 15 letras o números). Corrija sus datos primero.']);
            }
            $pin = PortalPaciente::generarPin();
            $hash = password_hash($pin, PASSWORD_DEFAULT);
            $stmt = $mysqli->prepare("INSERT INTO paciente_portal_accesos (paciente_id, pin_hash, estado, pin_generado_por, pin_generado_at)
                                      VALUES (?, ?, 'activo', ?, NOW())
                                      ON DUPLICATE KEY UPDATE pin_hash = VALUES(pin_hash), estado = 'activo',
                                          pin_generado_por = VALUES(pin_generado_por), pin_generado_at = NOW()");
            $stmt->bind_param('iss', $pacienteId, $hash, $actor);
            $stmt->execute();
            $stmt->close();
            PortalPaciente::registrarEvento($mysqli, $pacienteId, 'pin_generado', null, null, $actor);
            // El PIN solo se muestra aquí, una vez: en la BD queda únicamente su hash.
            ppa_responder(200, ['success' => true, 'pin' => $pin, 'documento' => $documento]);
        }

        if ($accion === 'desactivar_acceso') {
            $stmt = $mysqli->prepare("UPDATE paciente_portal_accesos SET estado = 'inactivo' WHERE paciente_id = ?");
            $stmt->bind_param('i', $pacienteId);
            $stmt->execute();
            $stmt->close();
            PortalPaciente::registrarEvento($mysqli, $pacienteId, 'acceso_desactivado', null, null, $actor);
            ppa_responder(200, ['success' => true]);
        }

        // liberar: decisión manual sobre un documento ('liberado', 'retenido' o 'automatico' para quitarla)
        $tipo = (string)($d['tipo'] ?? '');
        $refId = (int)($d['ref_id'] ?? 0);
        $decision = (string)($d['decision'] ?? '');
        $motivo = trim((string)($d['motivo'] ?? ''));
        if (!in_array($decision, ['liberado', 'retenido', 'automatico'], true)) {
            ppa_responder(422, ['success' => false, 'error' => 'Decisión no válida']);
        }
        if (!in_array($tipo, PortalPaciente::tiposValidos(), true) || PortalPaciente::buscarDocumento($mysqli, $pacienteId, $tipo, $refId) === null) {
            ppa_responder(404, ['success' => false, 'error' => 'Documento no encontrado para este paciente']);
        }
        if ($decision === 'automatico') {
            $stmt = $mysqli->prepare('DELETE FROM paciente_portal_liberaciones WHERE tipo = ? AND ref_id = ? AND paciente_id = ?');
            $stmt->bind_param('sii', $tipo, $refId, $pacienteId);
        } else {
            $motivoDb = $motivo !== '' ? mb_substr($motivo, 0, 255) : null;
            $stmt = $mysqli->prepare('INSERT INTO paciente_portal_liberaciones (paciente_id, tipo, ref_id, estado, motivo, usuario_nombre)
                                      VALUES (?, ?, ?, ?, ?, ?)
                                      ON DUPLICATE KEY UPDATE estado = VALUES(estado), motivo = VALUES(motivo), usuario_nombre = VALUES(usuario_nombre)');
            $stmt->bind_param('isisss', $pacienteId, $tipo, $refId, $decision, $motivoDb, $actor);
        }
        $stmt->execute();
        $stmt->close();
        PortalPaciente::registrarEvento($mysqli, $pacienteId, 'liberacion', $tipo, $refId, $actor, $decision . ($motivo !== '' ? ': ' . $motivo : ''));
        ppa_responder(200, ['success' => true, 'documentos' => PortalPaciente::documentos($mysqli, $pacienteId, true)]);
    }

    ppa_responder(405, ['success' => false, 'error' => 'Acción no soportada']);
} catch (Throwable $e) {
    if (function_exists('api_log_server_error')) {
        api_log_server_error('api-paciente-portal-gestion', $e->getMessage(), $e->getFile(), (int)$e->getLine());
    } else {
        error_log('api_paciente_portal_gestion: ' . $e->getMessage());
    }
    ppa_responder(500, ['success' => false, 'error' => 'Error interno del servidor']);
}
