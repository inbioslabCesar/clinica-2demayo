<?php
require_once __DIR__ . '/init_api.php';
require_once __DIR__ . '/config.php';

if (!isset($_SESSION['usuario'])) {
    echo json_encode(['success' => false, 'error' => 'No autenticado']);
    exit;
}

$usuario = $_SESSION['usuario'];
if (!in_array($usuario['rol'] ?? '', ['administrador','recepcionista'])) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Acceso denegado']);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Método no permitido']);
    exit;
}

try {
    // Se asume que la tabla log_eliminaciones ya existe en la base de datos.

    // Paginación: solo 3,5,10 permitidos; por defecto 3
    $allowedLimits = [3,5,10];
    $limit = intval($_GET['limit'] ?? 3);
    if (!in_array($limit, $allowedLimits, true)) { $limit = 3; }
    $page = max(1, intval($_GET['page'] ?? 1));
    $offset = ($page - 1) * $limit;

    $params = [];
    $wheres = [];

    if (!empty($_GET['desde'])) {
        $wheres[] = 'le.fecha_hora >= ?';
        $params[] = $_GET['desde'] . ' 00:00:00';
    }
    if (!empty($_GET['hasta'])) {
        $wheres[] = 'le.fecha_hora <= ?';
        $params[] = $_GET['hasta'] . ' 23:59:59';
    }
    if (!empty($_GET['usuario_id'])) {
        $wheres[] = 'le.usuario_id = ?';
        $params[] = intval($_GET['usuario_id']);
    }
    if (!empty($_GET['servicio_tipo'])) {
        $wheres[] = 'le.servicio_tipo = ?';
        $params[] = $_GET['servicio_tipo'];
    }
    if (!empty($_GET['cobro_id'])) {
        $wheres[] = 'le.cobro_id = ?';
        $params[] = intval($_GET['cobro_id']);
    }
    if (!empty($_GET['paciente'])) {
        $wheres[] = '(p.dni LIKE ? OR CONCAT(p.nombre, " ", p.apellido) LIKE ?)';
        $buscar = '%' . $_GET['paciente'] . '%';
        $params[] = $buscar;
        $params[] = $buscar;
    }
    if (isset($_GET['monto_min']) && $_GET['monto_min'] !== '') {
        $wheres[] = 'le.monto >= ?';
        $params[] = floatval($_GET['monto_min']);
    }
    if (isset($_GET['monto_max']) && $_GET['monto_max'] !== '') {
        $wheres[] = 'le.monto <= ?';
        $params[] = floatval($_GET['monto_max']);
    }

    // Consulta de conteo total para las condiciones aplicadas (para paginación)
    $sqlCount = 'SELECT COUNT(*) AS total FROM log_eliminaciones le LEFT JOIN pacientes p ON p.id = le.paciente_id';
    if (count($wheres) > 0) {
        $sqlCount .= ' WHERE ' . implode(' AND ', $wheres);
    }

    $stmtCount = $pdo->prepare($sqlCount);
    $stmtCount->execute($params);
    $total = (int)($stmtCount->fetchColumn() ?: 0);

    $sql = 'SELECT le.id, le.cobro_id, le.cobros_detalle_id, le.servicio_tipo, le.item_json, le.monto, le.usuario_id, le.paciente_id, le.caja_id, le.motivo, le.fecha_hora, p.nombre AS pac_nombre, p.apellido AS pac_apellido, p.dni AS pac_dni, u.nombre AS usuario_nombre, u.usuario AS usuario_usuario FROM log_eliminaciones le LEFT JOIN pacientes p ON p.id = le.paciente_id LEFT JOIN usuarios u ON u.id = le.usuario_id';
    if (count($wheres) > 0) {
        $sql .= ' WHERE ' . implode(' AND ', $wheres);
    }
    $sql .= ' ORDER BY le.fecha_hora DESC, le.id DESC LIMIT ' . $limit . ' OFFSET ' . $offset;

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Parse item_json como objeto para el frontend
    foreach ($rows as &$r) {
        $r['item'] = json_decode($r['item_json'], true);
        unset($r['item_json']);
        $r['paciente_nombre'] = trim(($r['pac_nombre'] ?? '') . ' ' . ($r['pac_apellido'] ?? ''));
        $r['paciente_dni'] = $r['pac_dni'] ?? null;
        $r['usuario_nombre'] = $r['usuario_nombre'] ?? null;
        $r['usuario_usuario'] = $r['usuario_usuario'] ?? null;
        unset($r['pac_nombre'], $r['pac_apellido'], $r['pac_dni']);
    }

    echo json_encode(['success' => true, 'logs' => $rows, 'total' => $total, 'page' => $page, 'limit' => $limit]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Error obteniendo auditoría']);
}
