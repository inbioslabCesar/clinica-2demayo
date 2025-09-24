<?php
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
    'https://darkcyan-gnu-615778.hostingersite.com'
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins)) {
    header('Access-Control-Allow-Origin: ' . $origin);
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

// Manejar preflight (OPTIONS)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}
// DEBUG: Registrar el contenido de la sesión y el rol detectado
file_put_contents(__DIR__.'/debug_session.txt', print_r([
    'session' => $_SESSION,
    'rol' => $_SESSION['usuario']['rol'] ?? null
], true));

// Solo admin/administrador y recepcionista pueden acceder
// Solo administrador y recepcionista pueden acceder
$rol = $_SESSION['usuario']['rol'] ?? '';
if (!in_array($rol, ['administrador', 'recepcionista'])) {
    http_response_code(403);
    echo json_encode(['error' => 'Acceso denegado']);
    exit;
}

// Conexión a la base de datos centralizada
require_once __DIR__ . '/config.php';

// Obtener parámetros GET
$paciente_id = $_GET['id'] ?? null;
$fecha_inicio = $_GET['fecha_inicio'] ?? null;
$fecha_fin = $_GET['fecha_fin'] ?? null;
$area = $_GET['area'] ?? null;

if (!$paciente_id) {
    http_response_code(400);
    echo json_encode(['error' => 'Falta el parámetro id de paciente']);
    exit;
}

$filtros = [];
$params = [];
$tipos = '';

// Filtros de fecha
if ($fecha_inicio) {
    $filtros[] = 'fecha >= ?';
    $params[] = $fecha_inicio;
    $tipos .= 's';
}
if ($fecha_fin) {
    $filtros[] = 'fecha <= ?';
    $params[] = $fecha_fin;
    $tipos .= 's';
}

$resultados = [];

// 1. Consultas
if (!$area || $area === 'Consulta') {
    $sql = "SELECT fecha, 'Consulta' AS area, 'Consulta médica' AS detalle, 30 AS monto FROM consultas WHERE paciente_id = ?";
    $tipos_consulta = 'i' . $tipos;
    $params_consulta = array_merge([$paciente_id], $params);
    if ($filtros) {
        $sql .= ' AND ' . implode(' AND ', $filtros);
    }
    $stmt = $mysqli->prepare($sql);
    $stmt->bind_param($tipos_consulta, ...$params_consulta);
    $stmt->execute();
    $res = $stmt->get_result();
    while ($row = $res->fetch_assoc()) {
        $resultados[] = $row;
    }
    $stmt->close();
}

// 2. Laboratorio
if (!$area || $area === 'Laboratorio') {
    $sql = "SELECT o.fecha, 'Laboratorio' AS area, GROUP_CONCAT(JSON_UNQUOTE(JSON_EXTRACT(o.examenes, '$[*].nombre')) SEPARATOR ', ') AS detalle, 20 AS monto FROM ordenes_laboratorio o INNER JOIN consultas c ON o.consulta_id = c.id WHERE c.paciente_id = ?";
    $tipos_lab = 'i' . $tipos;
    $params_lab = array_merge([$paciente_id], $params);
    if ($filtros) {
        $sql .= ' AND ' . implode(' AND ', $filtros);
    }
    $sql .= ' GROUP BY o.id';
    $stmt = $mysqli->prepare($sql);
    $stmt->bind_param($tipos_lab, ...$params_lab);
    $stmt->execute();
    $res = $stmt->get_result();
    while ($row = $res->fetch_assoc()) {
        $resultados[] = $row;
    }
    $stmt->close();
}

// 3. Farmacia
if (!$area || $area === 'Farmacia') {
    $sql = "SELECT fecha, 'Farmacia' AS area, GROUP_CONCAT(JSON_UNQUOTE(JSON_EXTRACT(productos, '$[*].nombre')) SEPARATOR ', ') AS detalle, monto FROM farmacia_ventas WHERE paciente_id = ?";
    $tipos_farm = 'i' . $tipos;
    $params_farm = array_merge([$paciente_id], $params);
    if ($filtros) {
        $sql .= ' AND ' . implode(' AND ', $filtros);
    }
    $sql .= ' GROUP BY id';
    $stmt = $mysqli->prepare($sql);
    $stmt->bind_param($tipos_farm, ...$params_farm);
    $stmt->execute();
    $res = $stmt->get_result();
    while ($row = $res->fetch_assoc()) {
        $resultados[] = $row;
    }
    $stmt->close();
}

// Ordenar por fecha descendente
usort($resultados, function($a, $b) {
    return strtotime($b['fecha']) - strtotime($a['fecha']);
});

echo json_encode($resultados);
$mysqli->close();
