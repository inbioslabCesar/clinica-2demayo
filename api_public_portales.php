<?php
// Endpoint público (sin sesión): informa qué accesos externos tiene activos esta clínica, para que el sitio web
// muestre solo las opciones del menú "Iniciar sesión como". No expone nada más.
//   pacientes -> módulo 'portal_pacientes'
//   empresas  -> módulos 'ocupacional' y 'portal_empresas' (el portal de empresas exige ambos)
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/modules/ModulosInstalacion.php';
require_once __DIR__ . '/modules/PortalPaciente.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Método no permitido']);
    exit;
}

$conn = $mysqli ?? ($pdo ?? null);
// Paciente: módulo activo y al menos una categoría (laboratorio / imagenología) encendida por el Engineer.
$pacientes = ModulosInstalacion::habilitado($conn, 'portal_pacientes');
if ($pacientes && $conn instanceof mysqli) {
    try {
        $cfgPortal = PortalPaciente::config($conn);
        $pacientes = $cfgPortal['publicar_laboratorio'] || $cfgPortal['publicar_imagenologia'];
    } catch (Throwable $e) {
        $pacientes = false;
    }
}
header('Cache-Control: no-store');
echo json_encode([
    'success' => true,
    'pacientes' => $pacientes,
    'empresas' => ModulosInstalacion::habilitado($conn, 'ocupacional') && ModulosInstalacion::habilitado($conn, 'portal_empresas'),
]);
