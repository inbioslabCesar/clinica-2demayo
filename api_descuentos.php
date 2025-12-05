<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';
require_once "db.php";

// Parámetros de filtro y paginación
$fecha = isset($_GET['fecha']) ? $_GET['fecha'] : null;
$limit = isset($_GET['limit']) ? intval($_GET['limit']) : 30;
$offset = isset($_GET['offset']) ? intval($_GET['offset']) : 0;

$where = [];
$params = [];
$types = '';

if ($fecha) {
    $where[] = "fecha = ?";
    $params[] = $fecha;
    $types .= 's';
}

$where_sql = count($where) ? ('WHERE ' . implode(' AND ', $where)) : '';

$sql = "SELECT * FROM descuentos_aplicados $where_sql ORDER BY created_at DESC LIMIT ? OFFSET ?";
$params[] = $limit;
$params[] = $offset;
$types .= 'ii';

$stmt = $conn->prepare($sql);
if ($types) {
    $stmt->bind_param($types, ...$params);
}
$stmt->execute();
$result = $stmt->get_result();
$descuentos = [];
while ($row = $result->fetch_assoc()) {
    $descuentos[] = $row;
}

// Total para paginación
$count_sql = "SELECT COUNT(*) as total FROM descuentos_aplicados $where_sql";
$count_stmt = $conn->prepare($count_sql);
if ($fecha) {
    $count_stmt->bind_param('s', $fecha);
}
$count_stmt->execute();
$count_result = $count_stmt->get_result();
$total = $count_result->fetch_assoc()['total'];

echo json_encode([
    'success' => true,
    'descuentos' => $descuentos,
    'total' => $total
]);
