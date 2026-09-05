
<?php
require_once __DIR__ . '/init_api.php';

require_once __DIR__ . '/config.php';

function fecha_hoy_lima_egreso()
{
    return date('Y-m-d');
}

function hora_actual_lima_egreso()
{
    return date('H:i:s');
}

function fecha_valida_egreso($fecha)
{
    if (!is_string($fecha)) {
        return null;
    }
    $valor = trim($fecha);
    if ($valor === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $valor)) {
        return null;
    }
    $dt = DateTime::createFromFormat('Y-m-d', $valor, new DateTimeZone('America/Lima'));
    if (!$dt || $dt->format('Y-m-d') !== $valor) {
        return null;
    }
    return $valor;
}

function hora_valida_egreso($hora)
{
    if (!is_string($hora)) {
        return null;
    }
    $valor = trim($hora);
    if ($valor === '') {
        return null;
    }
    if (preg_match('/^\d{2}:\d{2}$/', $valor)) {
        $valor .= ':00';
    }
    if (!preg_match('/^\d{2}:\d{2}:\d{2}$/', $valor)) {
        return null;
    }
    $dt = DateTime::createFromFormat('H:i:s', $valor, new DateTimeZone('America/Lima'));
    if (!$dt || $dt->format('H:i:s') !== $valor) {
        return null;
    }
    return $valor;
}

function normalizar_turno_egreso($turno)
{
    $t = strtolower(trim((string)$turno));
    if ($t === 'manana' || $t === 'mañana' || $t === 'maÃ±ana') {
        return 'mañana';
    }
    if ($t === 'tarde' || $t === 'noche') {
        return $t;
    }
    return 'mañana';
}

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
    $turno = normalizar_turno_egreso($input['turno'] ?? ($_SESSION['usuario']['turno'] ?? 'mañana'));
    $estado = $input['estado'] ?? 'pagado';
    $fecha = fecha_valida_egreso($input['fecha'] ?? null) ?? fecha_hoy_lima_egreso();
    $hora = hora_valida_egreso($input['hora'] ?? null) ?? hora_actual_lima_egreso();

    // Si no se envía caja_id, buscar la caja abierta del usuario en el día y asignar siempre para egreso operativo
    $usuario_id_actual = $_SESSION['usuario']['id'] ?? null;
    if (empty($input['caja_id']) || $tipo_egreso === 'operativo') {
        $stmtCaja = $pdo->prepare('SELECT id FROM cajas WHERE usuario_id = ? AND estado = "abierta" ORDER BY created_at DESC LIMIT 1');
        $stmtCaja->execute([$usuario_id_actual]);
        $cajaRow = $stmtCaja->fetch(PDO::FETCH_ASSOC);
        if (!$cajaRow) {
            $stmtCaja = $pdo->prepare('SELECT id FROM cajas WHERE DATE(fecha) = ? AND usuario_id = ? AND estado = "abierta" ORDER BY hora_apertura ASC LIMIT 1');
            $stmtCaja->execute([$fecha, $usuario_id_actual]);
            $cajaRow = $stmtCaja->fetch(PDO::FETCH_ASSOC);
        }
        $caja_id = $cajaRow ? $cajaRow['id'] : null;
    } else {
        $caja_id = $input['caja_id'];
    }
    $observaciones = $input['observaciones'] ?? '';

    $tipo = $input['tipo'] ?? 'operativo';
    $concepto = $input['concepto'] ?? $descripcion;
    $responsable = isset($_SESSION['usuario']['nombre']) ? $_SESSION['usuario']['nombre'] : '';
    $stmt = $pdo->prepare("INSERT INTO egresos (fecha, tipo, tipo_egreso, categoria, descripcion, concepto, monto, metodo_pago, usuario_id, turno, estado, caja_id, observaciones, hora, responsable) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    $ok = $stmt->execute([$fecha, $tipo, $tipo_egreso, $categoria, $descripcion, $concepto, $monto, $metodo_pago, $usuario_id, $turno, $estado, $caja_id, $observaciones, $hora, $responsable]);
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
    $fecha = fecha_valida_egreso($input['fecha'] ?? null) ?? fecha_hoy_lima_egreso();
    $hora = hora_valida_egreso($input['hora'] ?? null) ?? hora_actual_lima_egreso();
    $stmt = $pdo->prepare("UPDATE egresos SET fecha=?, tipo_egreso=?, categoria=?, descripcion=?, monto=?, metodo_pago=?, turno=?, estado=?, caja_id=?, observaciones=?, hora=? WHERE id=?");
    $ok = $stmt->execute([
        $fecha,
        $input['tipo_egreso'] ?? '',
        $input['categoria'] ?? '',
        $input['descripcion'] ?? '',
        $input['monto'] ?? 0,
        $input['metodo_pago'] ?? 'efectivo',
        normalizar_turno_egreso($input['turno'] ?? ($_SESSION['usuario']['turno'] ?? 'mañana')),
        $input['estado'] ?? 'pagado',
        empty($input['caja_id']) ? null : $input['caja_id'],
        $input['observaciones'] ?? '',
        $hora,
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
    $fecha = fecha_valida_egreso($_GET['fecha'] ?? null) ?? fecha_hoy_lima_egreso();
    $stmt = $pdo->prepare("SELECT e.*, u.nombre as usuario_nombre FROM egresos e LEFT JOIN usuarios u ON e.usuario_id = u.id WHERE DATE(COALESCE(NULLIF(e.fecha, ''), DATE(e.created_at))) = ? ORDER BY COALESCE(NULLIF(e.fecha, ''), DATE(e.created_at)) DESC, COALESCE(NULLIF(e.hora, ''), TIME(e.created_at)) DESC, e.created_at DESC");
    $stmt->execute([$fecha]);
    $egresos = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode(["success" => true, "egresos" => $egresos]);
    exit;
}

http_response_code(405);
echo json_encode(["success" => false, "error" => "Método no permitido"]);
