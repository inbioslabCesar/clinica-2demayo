
<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

// Parámetros de filtro y paginación
$fecha = isset($_GET['fecha']) ? $_GET['fecha'] : null;
$limit = isset($_GET['limit']) ? intval($_GET['limit']) : 30;
$offset = isset($_GET['offset']) ? intval($_GET['offset']) : 0;

try {
    $where = [];
    $params = [];
    if ($fecha) {
        $where[] = "fecha = ?";
        $params[] = $fecha;
    }
    $where_sql = count($where) ? ('WHERE ' . implode(' AND ', $where)) : '';

    // Consulta principal
    $sql = "SELECT * FROM descuentos_aplicados $where_sql ORDER BY created_at DESC LIMIT ? OFFSET ?";
    $params[] = $limit;
    $params[] = $offset;
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $descuentos = $stmt->fetchAll();

    // Total para paginación
    $count_sql = "SELECT COUNT(*) as total FROM descuentos_aplicados $where_sql";
    $count_stmt = $pdo->prepare($count_sql);
    $count_stmt->execute($fecha ? [$fecha] : []);
    $total = $count_stmt->fetchColumn();

    echo json_encode([
        'success' => true,
        'descuentos' => $descuentos,
        'total' => intval($total)
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Error al consultar descuentos: ' . $e->getMessage()
    ]);
    exit;
}
