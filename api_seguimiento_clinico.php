<?php
// Seguimiento clínico (módulo opcional 'seguimiento_clinico'): estado, búsqueda de pacientes, historial paginado, detalle de consulta
// y generación de consultas de seguimiento. Lectura salvo generar_consulta (POST). Toda acción exige módulo habilitado + médico o
// administrador (generar solo médico); abrir un historial o un detalle queda registrado
// (si no se puede registrar, no se entrega). Ver modules/SeguimientoClinico.php.
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/modules/ModulosInstalacion.php';
require_once __DIR__ . '/modules/SeguimientoClinico.php';
api_liberar_sesion_lectura();

header('Content-Type: application/json; charset=utf-8');

function sc_responder(int $codigo, array $payload): void {
    http_response_code($codigo);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

if (!isset($_SESSION['usuario']) && !isset($_SESSION['medico_id'])) {
    sc_responder(401, ['success' => false, 'error' => 'No autenticado']);
}

$actor = SeguimientoClinico::actorDesdeSesion($_SESSION);
if ($actor === null) {
    sc_responder(403, ['success' => false, 'error' => 'No autorizado']);
}

// Guardia real del módulo: sin licencia activa responde 403 aunque se llame al endpoint directamente.
ModulosInstalacion::exigir($mysqli ?? ($pdo ?? null), 'seguimiento_clinico');

$accion = (string)($_GET['accion'] ?? 'estado');
$ip = (string)($_SERVER['REMOTE_ADDR'] ?? '');
$metodo = $_SERVER['REQUEST_METHOD'] ?? 'GET';

$conn = $mysqli ?? null;
if (!$conn instanceof mysqli) {
    sc_responder(500, ['success' => false, 'error' => 'Sin conexion a la base de datos']);
}

// Única acción de escritura: genera la consulta (con o sin cobro) en una sola transacción. Ver SeguimientoClinico::generarConsulta().
if ($metodo === 'POST' && $accion === 'generar_consulta') {
    $entrada = json_decode((string)file_get_contents('php://input'), true);
    if (!is_array($entrada)) {
        sc_responder(400, ['success' => false, 'error' => 'Solicitud inválida']);
    }
    $validacion = SeguimientoClinico::validarSolicitud($entrada);
    if (!$validacion['ok']) {
        sc_responder(422, ['success' => false, 'error' => $validacion['error']]);
    }
    $resultado = SeguimientoClinico::generarConsulta($conn, $actor, $validacion['datos'], $ip);
    sc_responder($resultado['http'], $resultado['payload']);
}

if ($metodo !== 'GET') {
    sc_responder(405, ['success' => false, 'error' => 'Metodo no permitido']);
}

if ($accion === 'estado') {
    sc_responder(200, ['success' => true, 'modulo' => 'seguimiento_clinico', 'activo' => true, 'rol' => $actor['rol'], 'medico_id' => $actor['medico_id']]);
}

if ($accion === 'buscar') {
    $q = (string)($_GET['q'] ?? '');
    if (SeguimientoClinico::normalizarBusqueda($q) === null) {
        sc_responder(200, ['success' => true, 'pacientes' => [], 'mensaje' => 'Escribe al menos 4 dígitos del DNI o 3 letras del nombre']);
    }
    sc_responder(200, ['success' => true, 'pacientes' => SeguimientoClinico::buscarPacientes($conn, $q)]);
}

if ($accion === 'historial') {
    $pacienteId = (int)($_GET['paciente_id'] ?? 0);
    $paciente = $pacienteId > 0 ? SeguimientoClinico::obtenerPaciente($conn, $pacienteId) : null;
    if ($paciente === null) {
        sc_responder(404, ['success' => false, 'error' => 'Paciente no encontrado']);
    }
    // Solo la primera página cuenta como "apertura"; las siguientes del mismo historial no se vuelven a registrar.
    if ((int)($_GET['pagina'] ?? 1) <= 1 && !SeguimientoClinico::registrarAcceso($conn, $actor, $pacienteId, null, 'historial', $ip)) {
        sc_responder(500, ['success' => false, 'error' => 'No se pudo registrar el acceso; no se entrega el historial']);
    }
    $historial = SeguimientoClinico::historial($conn, $pacienteId, $_GET['pagina'] ?? 1, $_GET['por_pagina'] ?? 0, $actor['medico_id']);
    sc_responder(200, ['success' => true, 'paciente' => $paciente] + $historial);
}

if ($accion === 'detalle') {
    $consultaId = (int)($_GET['consulta_id'] ?? 0);
    $pacienteId = $consultaId > 0 ? SeguimientoClinico::pacienteDeConsulta($conn, $consultaId) : 0;
    if ($pacienteId <= 0) {
        sc_responder(404, ['success' => false, 'error' => 'Consulta no encontrada']);
    }
    if (!SeguimientoClinico::registrarAcceso($conn, $actor, $pacienteId, $consultaId, 'detalle', $ip)) {
        sc_responder(500, ['success' => false, 'error' => 'No se pudo registrar el acceso; no se entrega el detalle']);
    }
    $detalle = SeguimientoClinico::detalleConsulta($conn, $consultaId);
    if ($detalle === null) {
        sc_responder(404, ['success' => false, 'error' => 'Consulta no encontrada']);
    }
    sc_responder(200, ['success' => true] + $detalle);
}

sc_responder(404, ['success' => false, 'error' => 'Accion no soportada']);
