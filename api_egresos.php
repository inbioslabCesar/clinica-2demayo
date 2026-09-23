
<?php
require_once __DIR__ . '/init_api.php';

require_once __DIR__ . '/config.php';

function egresos_columna_existe(PDO $pdo, string $columna): bool
{
    static $cache = [];
    if (array_key_exists($columna, $cache)) {
        return $cache[$columna];
    }
    try {
        $stmt = $pdo->prepare("SHOW COLUMNS FROM egresos LIKE ?");
        $stmt->execute([$columna]);
        $cache[$columna] = (bool)$stmt->fetch(PDO::FETCH_ASSOC);
        return $cache[$columna];
    } catch (Throwable $e) {
        $cache[$columna] = false;
        return false;
    }
}

function egresos_construir_insert(PDO $pdo, array $valores): array
{
    $columnas = [];
    $placeholders = [];
    $params = [];
    foreach ($valores as $col => $valor) {
        if (egresos_columna_existe($pdo, $col)) {
            $columnas[] = $col;
            $placeholders[] = '?';
            $params[] = $valor;
        }
    }
    if (empty($columnas)) {
        throw new RuntimeException('La tabla egresos no tiene columnas compatibles para registrar.');
    }
    $sql = "INSERT INTO egresos (" . implode(', ', $columnas) . ") VALUES (" . implode(', ', $placeholders) . ")";
    return [$sql, $params];
}

function egresos_construir_update(PDO $pdo, array $valores, int $id): array
{
    $sets = [];
    $params = [];
    foreach ($valores as $col => $valor) {
        if (egresos_columna_existe($pdo, $col)) {
            $sets[] = $col . ' = ?';
            $params[] = $valor;
        }
    }
    if (empty($sets)) {
        throw new RuntimeException('La tabla egresos no tiene columnas compatibles para actualizar.');
    }
    $params[] = $id;
    $sql = "UPDATE egresos SET " . implode(', ', $sets) . " WHERE id = ?";
    return [$sql, $params];
}

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
    $map = [
        'maÃ±ana' => 'mañana',
        'maã±ana' => 'mañana',
    ];
    $normalizado = strtr((string)$turno, $map);
    $t = strtolower(trim($normalizado));
    if ($t === 'manana' || $t === 'mañana') {
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

    try {
        [$sql, $params] = egresos_construir_insert($pdo, [
            'fecha' => $fecha,
            'tipo' => $tipo,
            'tipo_egreso' => $tipo_egreso,
            'categoria' => $categoria,
            'descripcion' => $descripcion,
            'concepto' => $concepto,
            'monto' => $monto,
            'metodo_pago' => $metodo_pago,
            'usuario_id' => $usuario_id,
            'turno' => $turno,
            'estado' => $estado,
            'caja_id' => $caja_id,
            'observaciones' => $observaciones,
            'hora' => $hora,
            'responsable' => $responsable,
        ]);
        $stmt = $pdo->prepare($sql);
        $ok = $stmt->execute($params);
        if ($ok) {
            echo json_encode(["success" => true, "id" => $pdo->lastInsertId()]);
        } else {
            echo json_encode(["success" => false, "error" => "No se pudo registrar el egreso."]);
        }
    } catch (Throwable $e) {
        error_log('api_egresos POST error: ' . $e->getMessage());
        echo json_encode(["success" => false, "error" => "No se pudo registrar el egreso: " . $e->getMessage()]);
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
    try {
        [$sql, $params] = egresos_construir_update($pdo, [
            'fecha' => $fecha,
            'tipo_egreso' => $input['tipo_egreso'] ?? '',
            'categoria' => $input['categoria'] ?? '',
            'descripcion' => $input['descripcion'] ?? '',
            'monto' => $input['monto'] ?? 0,
            'metodo_pago' => $input['metodo_pago'] ?? 'efectivo',
            'turno' => normalizar_turno_egreso($input['turno'] ?? ($_SESSION['usuario']['turno'] ?? 'mañana')),
            'estado' => $input['estado'] ?? 'pagado',
            'caja_id' => empty($input['caja_id']) ? null : $input['caja_id'],
            'observaciones' => $input['observaciones'] ?? '',
            'hora' => $hora,
        ], (int)$id);
        $stmt = $pdo->prepare($sql);
        $ok = $stmt->execute($params);
        if ($ok) {
            echo json_encode(["success" => true]);
        } else {
            echo json_encode(["success" => false, "error" => "No se pudo actualizar el egreso."]);
        }
    } catch (Throwable $e) {
        error_log('api_egresos PUT error: ' . $e->getMessage());
        echo json_encode(["success" => false, "error" => "No se pudo actualizar el egreso: " . $e->getMessage()]);
    }
    exit;
}

if ($method === 'GET') {
    // Listar egresos compatible con esquemas antiguos (sin created_at/hora).
    try {
        $fechaSolicitada = fecha_valida_egreso($_GET['fecha'] ?? null);
        $hasFecha = egresos_columna_existe($pdo, 'fecha');
        $hasHora = egresos_columna_existe($pdo, 'hora');
        $hasCreatedAt = egresos_columna_existe($pdo, 'created_at');

        if ($hasFecha) {
            $dateExpr = "DATE(e.fecha)";
        } elseif ($hasCreatedAt) {
            $dateExpr = "DATE(e.created_at)";
        } else {
            $dateExpr = "CURDATE()";
        }

        if ($hasHora) {
            $timeExpr = "TIME(e.hora)";
        } elseif ($hasCreatedAt) {
            $timeExpr = "TIME(e.created_at)";
        } else {
            $timeExpr = "'00:00:00'";
        }

        $sql = "SELECT e.*, u.nombre as usuario_nombre FROM egresos e LEFT JOIN usuarios u ON e.usuario_id = u.id";
        $params = [];

        if ($fechaSolicitada) {
            $sql .= " WHERE {$dateExpr} = ?";
            $params[] = $fechaSolicitada;
        }

        $sql .= " ORDER BY {$dateExpr} DESC, {$timeExpr} DESC, e.id DESC";

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        $egresos = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode(["success" => true, "egresos" => $egresos]);
    } catch (Throwable $e) {
        error_log('api_egresos GET error: ' . $e->getMessage());
        echo json_encode(["success" => false, "error" => "No se pudo listar egresos: " . $e->getMessage(), "egresos" => []]);
    }
    exit;
}

http_response_code(405);
echo json_encode(["success" => false, "error" => "Método no permitido"]);
