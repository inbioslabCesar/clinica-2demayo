<?php
// Seguimiento clínico (módulo opcional 'seguimiento_clinico'), base del backend.
// Fase 1: solo estado/guardia. Las acciones de búsqueda, historial y generación de consultas se agregan en fases siguientes
// y deben seguir pasando por estas mismas comprobaciones (módulo habilitado + médico o administrador).
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/modules/ModulosInstalacion.php';

header('Content-Type: application/json; charset=utf-8');

function sc_responder(int $codigo, array $payload): void {
    http_response_code($codigo);
    echo json_encode($payload);
    exit;
}

/** Rol que opera: 'medico' (login de médico o usuario con rol médico), 'administrador' o null si no está autorizado. */
function sc_rol_actor(): ?string {
    if (!empty($_SESSION['medico_id'])) {
        return 'medico';
    }
    $rol = strtolower(trim((string)($_SESSION['usuario']['rol'] ?? '')));
    return in_array($rol, ['medico', 'administrador'], true) ? $rol : null;
}

if (!isset($_SESSION['usuario']) && !isset($_SESSION['medico_id'])) {
    sc_responder(401, ['success' => false, 'error' => 'No autenticado']);
}

$rolActor = sc_rol_actor();
if ($rolActor === null) {
    sc_responder(403, ['success' => false, 'error' => 'No autorizado']);
}

// Guardia real del módulo: sin licencia activa responde 403 aunque se llame al endpoint directamente.
ModulosInstalacion::exigir($mysqli ?? ($pdo ?? null), 'seguimiento_clinico');

$accion = (string)($_GET['accion'] ?? 'estado');
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET' && $accion === 'estado') {
    sc_responder(200, ['success' => true, 'modulo' => 'seguimiento_clinico', 'activo' => true, 'rol' => $rolActor]);
}

sc_responder(404, ['success' => false, 'error' => 'Accion no soportada']);
