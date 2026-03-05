
<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';



$orden_id = isset($_GET['orden_id']) ? intval($_GET['orden_id']) : null;
if (!$orden_id) {
    echo json_encode(['success' => false, 'error' => 'Falta orden_id']);
    exit;
}
// Buscar la orden por su ID real
$stmt_orden = $conn->prepare('SELECT id, consulta_id FROM ordenes_laboratorio WHERE id = ? LIMIT 1');
$stmt_orden->bind_param('i', $orden_id);
$stmt_orden->execute();
$orden = $stmt_orden->get_result()->fetch_assoc();
$stmt_orden->close();

// Compatibilidad hacia atrás: algunas llamadas antiguas enviaban consulta_id
if (!$orden) {
    $stmt_orden = $conn->prepare('SELECT id, consulta_id FROM ordenes_laboratorio WHERE consulta_id = ? ORDER BY id DESC LIMIT 1');
    $stmt_orden->bind_param('i', $orden_id);
    $stmt_orden->execute();
    $orden = $stmt_orden->get_result()->fetch_assoc();
    $stmt_orden->close();
}
if (!$orden) {
    echo json_encode(['success' => false, 'error' => 'Orden de laboratorio no encontrada']);
    exit;
}
// Buscar primero por orden_id (fuente de verdad), luego fallback por consulta_id en datos antiguos
$stmt = $conn->prepare('SELECT * FROM resultados_laboratorio WHERE orden_id = ? ORDER BY id DESC LIMIT 1');
$stmt->bind_param('i', $orden['id']);
$stmt->execute();
$res = $stmt->get_result();
$row = $res->fetch_assoc();
$stmt->close();
if ($row) {
    $row['resultados'] = json_decode($row['resultados'], true);
    echo json_encode(['success' => true, 'resultado' => $row]);
} else {
    echo json_encode(['success' => false, 'resultado' => null]);
}
