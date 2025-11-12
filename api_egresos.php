
<?php
require_once __DIR__ . '/init_api.php';

require_once __DIR__ . '/config.php';

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST') {
    // Registrar nuevo egreso con todos los campos relevantes
    $input = json_decode(file_get_contents('php://input'), true);
    $tipo_egreso = $input['tipo_egreso'] ?? 'operativo';
    $categoria = $input['categoria'] ?? '';
    $descripcion = $input['descripcion'] ?? '';
    $monto = $input['monto'] ?? 0;
    $metodo_pago = $input['metodo_pago'] ?? 'efectivo';
    $usuario_id = $_SESSION['usuario']['id'] ?? null;
    $turno = $input['turno'] ?? ($_SESSION['usuario']['turno'] ?? 'mañana');
    $estado = $input['estado'] ?? 'pagado';
    // Si no se envía caja_id, buscar la caja abierta del usuario en el día y asignar siempre para egreso operativo
    $fecha_actual = $input['fecha'] ?? date('Y-m-d');
    $usuario_id_actual = $_SESSION['usuario']['id'] ?? null;
    if (empty($input['caja_id']) || $tipo_egreso === 'operativo') {
        $stmtCaja = $pdo->prepare('SELECT id FROM cajas WHERE DATE(fecha) = ? AND usuario_id = ? AND estado = "abierta" ORDER BY hora_apertura ASC LIMIT 1');
        $stmtCaja->execute([$fecha_actual, $usuario_id_actual]);
        $cajaRow = $stmtCaja->fetch(PDO::FETCH_ASSOC);
        $caja_id = $cajaRow ? $cajaRow['id'] : null;
    } else {
        $caja_id = $input['caja_id'];
    }
    $observaciones = $input['observaciones'] ?? '';
    $fecha = $input['fecha'] ?? date('Y-m-d');
    date_default_timezone_set('America/Lima');
    $hora = $input['hora'] ?? date('H:i:s');

    $stmt = $pdo->prepare("INSERT INTO egresos (fecha, tipo_egreso, categoria, descripcion, monto, metodo_pago, usuario_id, turno, estado, caja_id, observaciones, hora) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    $ok = $stmt->execute([$fecha, $tipo_egreso, $categoria, $descripcion, $monto, $metodo_pago, $usuario_id, $turno, $estado, $caja_id, $observaciones, $hora]);
    if ($ok) {
        echo json_encode(["success" => true, "id" => $pdo->lastInsertId()]);
    } else {
        echo json_encode(["success" => false, "error" => "No se pudo registrar el egreso."]);
    }
    exit;
}

if ($method === 'DELETE') {
    parse_str($_SERVER['QUERY_STRING'], $params);
    $id = $params['id'] ?? null;
    if (!$id) {
        echo json_encode(["success" => false, "error" => "ID de egreso requerido"]);
        exit;
    }
    $stmt = $pdo->prepare("DELETE FROM egresos WHERE id = ?");
    $ok = $stmt->execute([$id]);
    if ($ok) {
        echo json_encode(["success" => true]);
    } else {
        echo json_encode(["success" => false, "error" => "No se pudo eliminar el egreso."]);
    }
    exit;
    exit;
}

if ($method === 'PUT') {
    // Actualizar egreso existente
    parse_str($_SERVER['QUERY_STRING'], $params);
    $id = $params['id'] ?? null;
    if (!$id) {
        echo json_encode(["success" => false, "error" => "ID de egreso requerido"]);
        exit;
    }
    $input = json_decode(file_get_contents('php://input'), true);
    $stmt = $pdo->prepare("UPDATE egresos SET fecha=?, tipo_egreso=?, categoria=?, descripcion=?, monto=?, metodo_pago=?, turno=?, estado=?, caja_id=?, observaciones=?, hora=? WHERE id=?");
    $ok = $stmt->execute([
        $input['fecha'] ?? date('Y-m-d'),
        $input['tipo_egreso'] ?? '',
        $input['categoria'] ?? '',
        $input['descripcion'] ?? '',
        $input['monto'] ?? 0,
        $input['metodo_pago'] ?? 'efectivo',
        $input['turno'] ?? '',
        $input['estado'] ?? 'pagado',
        empty($input['caja_id']) ? null : $input['caja_id'],
        $input['observaciones'] ?? '',
        $input['hora'] ?? date('H:i:s'),
        $id
    ]);
    if ($ok) {
        echo json_encode(["success" => true]);
    } else {
        echo json_encode(["success" => false, "error" => "No se pudo actualizar el egreso."]);
    }
    exit;
}

if ($method === 'GET') {
    // Listar egresos por fecha (por defecto, día actual) y mostrar nombre del usuario
    $fecha = isset($_GET['fecha']) ? $_GET['fecha'] : date('Y-m-d');
    $stmt = $pdo->prepare("SELECT e.*, u.nombre as usuario_nombre FROM egresos e LEFT JOIN usuarios u ON e.usuario_id = u.id WHERE DATE(e.created_at) = ? ORDER BY e.created_at DESC");
    $stmt->execute([$fecha]);
    $egresos = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode(["success" => true, "egresos" => $egresos]);
    exit;
}

http_response_code(405);
echo json_encode(["success" => false, "error" => "Método no permitido"]);
