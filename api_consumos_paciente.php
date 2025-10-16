<?php
// Mostrar errores en pantalla para depuración
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);
session_set_cookie_params([
    'samesite' => 'Lax',
    'secure' => false, // Permitir cookies en http para desarrollo local
    'httponly' => true,
    'path' => '/',
]);
session_start();
// Permitir origen local y producción
$allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'https://darkcyan-gnu-615778.hostingersite.com'
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins)) {
    header('Access-Control-Allow-Origin: ' . $origin);
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Content-Type: application/json');

// Manejar preflight (OPTIONS)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}
// DEBUG: Registrar el contenido de la sesión y el rol detectado
// Debug eliminado

// Solo admin/administrador y recepcionista pueden acceder
// Solo administrador y recepcionista pueden acceder
// Permitir acceso solo si el usuario está autenticado y es administrador o recepcionista
$usuario = $_SESSION['usuario'] ?? null;
$rol = $usuario['rol'] ?? '';
if (!$usuario || !in_array($rol, ['administrador', 'recepcionista'])) {
    http_response_code(403);
    echo json_encode(['error' => 'Acceso denegado']);
    exit;
}

// Conexión a la base de datos centralizada
require_once __DIR__ . '/config.php';


$paciente_id = isset($_GET['paciente_id']) ? intval($_GET['paciente_id']) : 0;
if ($paciente_id <= 0) {
    echo json_encode(['success' => false, 'error' => 'ID de paciente inválido']);
    exit;
}

try {
    // Obtener datos del paciente
    $stmt = $pdo->prepare("SELECT id, nombre, apellido, dni, historia_clinica FROM pacientes WHERE id = ? LIMIT 1");
    $stmt->execute([$paciente_id]);
    $paciente = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$paciente) {
        echo json_encode(['success' => false, 'error' => 'Paciente no encontrado']);
        exit;
    }

    // Obtener historial de cobros y servicios pagados (ahora agrupado por cobro)
    $stmt = $pdo->prepare("SELECT c.id AS cobro_id, c.fecha_cobro AS fecha, cd.servicio_tipo AS servicio, cd.descripcion, cd.subtotal AS monto FROM cobros c JOIN cobros_detalle cd ON c.id = cd.cobro_id WHERE c.paciente_id = ? AND c.estado = 'pagado' ORDER BY c.fecha_cobro DESC");
    $stmt->execute([$paciente_id]);
    $historial_raw = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $historial = [];
    foreach ($historial_raw as $row) {
        $detalles = json_decode($row['descripcion'], true);
        // Si el servicio es laboratorio, buscar la orden de laboratorio asociada al cobro
        $resultados_laboratorio_url = null;
        if ($row['servicio'] === 'laboratorio') {
            error_log("[DEBUG] Buscando orden de laboratorio para cobro_id: " . $row['cobro_id']);
            $stmtOrden = $pdo->prepare("SELECT id, consulta_id FROM ordenes_laboratorio WHERE cobro_id = ? LIMIT 1");
            $stmtOrden->execute([$row['cobro_id']]);
            $ordenLab = $stmtOrden->fetch(PDO::FETCH_ASSOC);
            error_log("[DEBUG] Resultado ordenLab: " . json_encode($ordenLab));
            if ($ordenLab) {
                $consultaId = isset($ordenLab['consulta_id']) ? $ordenLab['consulta_id'] : null;
                $ordenId = isset($ordenLab['id']) ? $ordenLab['id'] : null;
                error_log("[DEBUG] Buscando resultados_laboratorio para consulta_id: " . var_export($consultaId, true) . ", orden_id: " . var_export($ordenId, true));
                if (!empty($consultaId)) {
                    $stmtRes = $pdo->prepare("SELECT id FROM resultados_laboratorio WHERE consulta_id = ? LIMIT 1");
                    $stmtRes->execute([$consultaId]);
                } elseif (!empty($ordenId)) {
                    $stmtRes = $pdo->prepare("SELECT id FROM resultados_laboratorio WHERE orden_id = ? ORDER BY fecha DESC LIMIT 1");
                    $stmtRes->execute([$ordenId]);
                } else {
                    error_log("[ERROR] ordenLab no tiene consulta_id ni id válido");
                }
                $resLab = isset($stmtRes) ? $stmtRes->fetch(PDO::FETCH_ASSOC) : false;
                error_log("[DEBUG] Resultado resLab: " . json_encode($resLab));
                if ($resLab && isset($resLab['id'])) {
                    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
                    $baseUrl = $scheme . '://' . $_SERVER['HTTP_HOST'] . rtrim(dirname($_SERVER['SCRIPT_NAME']), '/\\') . '/';
                    $resultados_laboratorio_url = $baseUrl . "descargar_resultados_laboratorio.php?id=" . $resLab['id'];
                }
            }
        }
        $historial[] = [
            'cobro_id' => $row['cobro_id'],
            'fecha' => $row['fecha'],
            'servicio' => $row['servicio'],
            'monto' => $row['monto'],
            'detalles' => $detalles,
            'resultados_laboratorio' => $resultados_laboratorio_url
        ];
    }

    // Calcular consumo total pagado
    $stmt = $pdo->prepare("SELECT SUM(total) AS consumo_total FROM cobros WHERE paciente_id = ? AND estado = 'pagado'");
    $stmt->execute([$paciente_id]);
    $consumo_total = floatval($stmt->fetchColumn() ?: 0);

    // Calcular deuda total (pendiente)
    $stmt = $pdo->prepare("SELECT SUM(total) AS deuda_total FROM cobros WHERE paciente_id = ? AND estado = 'pendiente'");
    $stmt->execute([$paciente_id]);
    $deuda_total = floatval($stmt->fetchColumn() ?: 0);

    echo json_encode([
        'success' => true,
        'paciente_id' => $paciente['id'],
        'nombre' => $paciente['nombre'],
        'apellido' => $paciente['apellido'],
        'dni' => $paciente['dni'],
        'historia_clinica' => $paciente['historia_clinica'],
        'consumo_total' => $consumo_total,
        'deuda_total' => $deuda_total,
        'historial' => $historial
    ]);
} catch (Exception $e) {
    error_log('Error en api_consumos_paciente.php: ' . $e->getMessage());
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
