<?php
require_once __DIR__ . '/init_api.php';
require_once "config.php";
require_once "auth_check.php";

$method = $_SERVER['REQUEST_METHOD'];

function respond($payload, $code = 200) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

function extraer_paciente_temporal_desde_observaciones($observaciones) {
    $texto = trim((string)$observaciones);
    if ($texto === '') {
        return ['nombre' => '', 'dni' => ''];
    }

    $nombre = '';
    $dni = '';

    // Formato de cotizaciones: [PARTICULAR] Nombre=...; DNI=...;
    if (stripos($texto, '[PARTICULAR]') !== false) {
        if (preg_match('/Nombre=([^;]+)/i', $texto, $m)) {
            $nombre = trim((string)($m[1] ?? ''));
        }
        if (preg_match('/DNI=([^;]+)/i', $texto, $m)) {
            $dni = trim((string)($m[1] ?? ''));
        }
    }

    // Formato alterno de cobros: Cliente no registrado: NOMBRE (DNI: XXXXX).
    if ($nombre === '' && stripos($texto, 'Cliente no registrado:') !== false) {
        if (preg_match('/Cliente\s+no\s+registrado:\s*([^\(\n\.]+?)(?:\s*\(DNI:\s*([^\)]+)\))?(?:\.|$)/i', $texto, $m)) {
            $nombre = trim((string)($m[1] ?? ''));
            $dni = $dni !== '' ? $dni : trim((string)($m[2] ?? ''));
        }
    }

    return ['nombre' => $nombre, 'dni' => $dni];
}

function table_exists_local($conn, $tableName) {
    static $cache = [];
    $tableName = trim((string)$tableName);
    if ($tableName === '') {
        return false;
    }
    if (array_key_exists($tableName, $cache)) {
        return $cache[$tableName];
    }

    $stmt = $conn->prepare("SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1");
    if (!$stmt) {
        $cache[$tableName] = false;
        return false;
    }
    $stmt->bind_param('s', $tableName);
    $stmt->execute();
    $res = $stmt->get_result();
    $exists = $res && $res->num_rows > 0;
    $cache[$tableName] = $exists;
    return $exists;
}

function resolver_paciente_desde_cotizacion_por_cobro($conn, $cobroId) {
    static $cache = [];
    $cobroId = (int)$cobroId;
    if ($cobroId <= 0) {
        return ['nombre' => '', 'dni' => ''];
    }
    if (isset($cache[$cobroId])) {
        return $cache[$cobroId];
    }
    if (!table_exists_local($conn, 'cotizacion_movimientos') || !table_exists_local($conn, 'cotizaciones')) {
        $cache[$cobroId] = ['nombre' => '', 'dni' => ''];
        return $cache[$cobroId];
    }

    $sql = "SELECT ct.observaciones, p.nombre, p.apellido, p.dni
            FROM cotizacion_movimientos cm
            INNER JOIN cotizaciones ct ON ct.id = cm.cotizacion_id
            LEFT JOIN pacientes p ON p.id = ct.paciente_id
            WHERE cm.cobro_id = ?
            ORDER BY cm.id DESC
            LIMIT 1";
    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        $cache[$cobroId] = ['nombre' => '', 'dni' => ''];
        return $cache[$cobroId];
    }
    $stmt->bind_param('i', $cobroId);
    if (!$stmt->execute()) {
        $cache[$cobroId] = ['nombre' => '', 'dni' => ''];
        return $cache[$cobroId];
    }

    $row = $stmt->get_result()->fetch_assoc();
    if (!$row) {
        $cache[$cobroId] = ['nombre' => '', 'dni' => ''];
        return $cache[$cobroId];
    }

    $nombre = formatear_paciente($row['nombre'] ?? '', $row['apellido'] ?? '');
    $dni = trim((string)($row['dni'] ?? ''));
    if ($nombre === 'Particular' && $dni === '') {
        $tmp = extraer_paciente_temporal_desde_observaciones($row['observaciones'] ?? '');
        if (trim((string)($tmp['nombre'] ?? '')) !== '') {
            $nombre = trim((string)$tmp['nombre']);
        }
        $dni = trim((string)($tmp['dni'] ?? ''));
    }

    $cache[$cobroId] = [
        'nombre' => $nombre !== 'Particular' ? $nombre : '',
        'dni' => $dni,
    ];
    return $cache[$cobroId];
}

function formatear_paciente($nombre, $apellido = '') {
    $nombre = trim((string)$nombre);
    $apellido = trim((string)$apellido);
    $texto = trim($nombre . ' ' . $apellido);
    return $texto !== '' ? $texto : 'Particular';
}

function normalizar_venta_legacy($row) {
    return [
        'id' => (int)$row['id'],
        'source' => 'legacy',
        'origen' => 'farmacia',
        'referencia' => sprintf('F%06d', (int)$row['id']),
        'fecha' => $row['fecha'],
        'paciente_id' => isset($row['paciente_id']) ? (int)$row['paciente_id'] : null,
        'paciente_nombre' => trim((string)($row['paciente_nombre'] ?? '')) !== '' ? $row['paciente_nombre'] : 'Particular',
        'paciente_dni' => $row['paciente_dni'] ?? '',
        'usuario_id' => isset($row['usuario_id']) ? (int)$row['usuario_id'] : null,
        'usuario_nombre' => $row['usuario_nombre'] ?? '',
        'total' => isset($row['total']) ? (float)$row['total'] : 0,
        'estado' => $row['estado'] ?? 'pagado'
    ];
}

function extraer_detalles_farmacia_desde_json($descripcionJson, $fallbackRow = null) {
    $detalles = [];
    $payload = json_decode((string)$descripcionJson, true);

    if (is_array($payload)) {
        foreach ($payload as $idx => $item) {
            if (!is_array($item)) {
                continue;
            }
            $tipo = strtolower(trim((string)($item['servicio_tipo'] ?? '')));
            if ($tipo !== 'farmacia') {
                continue;
            }
            $detalles[] = [
                'id' => (int)$idx + 1,
                'medicamento_id' => isset($item['servicio_id']) ? (int)$item['servicio_id'] : null,
                'descripcion' => trim((string)($item['descripcion'] ?? 'Medicamento')),
                'cantidad' => isset($item['cantidad']) ? (float)$item['cantidad'] : 1,
                'precio_unitario' => isset($item['precio_unitario']) ? (float)$item['precio_unitario'] : 0,
                'subtotal' => isset($item['subtotal']) ? (float)$item['subtotal'] : 0,
            ];
        }
    }

    if (!empty($detalles)) {
        return $detalles;
    }

    if (is_array($fallbackRow) && strtolower(trim((string)($fallbackRow['servicio_tipo'] ?? ''))) === 'farmacia') {
        $detalles[] = [
            'id' => isset($fallbackRow['id']) ? (int)$fallbackRow['id'] : 1,
            'medicamento_id' => isset($fallbackRow['servicio_id']) ? (int)$fallbackRow['servicio_id'] : null,
            'descripcion' => trim((string)($fallbackRow['descripcion'] ?? 'Medicamento')),
            'cantidad' => isset($fallbackRow['cantidad']) ? (float)$fallbackRow['cantidad'] : 1,
            'precio_unitario' => isset($fallbackRow['precio_unitario']) ? (float)$fallbackRow['precio_unitario'] : 0,
            'subtotal' => isset($fallbackRow['subtotal']) ? (float)$fallbackRow['subtotal'] : 0,
        ];
    }

    return $detalles;
}

function obtener_ventas_generales_farmacia($conn, $fecha_inicio = null, $fecha_fin = null) {
    $where = [
        "c.estado <> 'anulado'",
        "EXISTS (
            SELECT 1
            FROM cobros_detalle cd
            WHERE cd.cobro_id = c.id
              AND (
                cd.servicio_tipo = 'farmacia'
                OR cd.descripcion LIKE '%\\\"servicio_tipo\\\":\\\"farmacia\\\"%'
              )
        )"
    ];
    $params = [];
    $types = '';

    if ($fecha_inicio && $fecha_fin) {
        $where[] = 'DATE(c.fecha_cobro) BETWEEN ? AND ?';
        $params[] = $fecha_inicio;
        $params[] = $fecha_fin;
        $types .= 'ss';
    }

    $sql = "SELECT
                c.id,
                c.paciente_id,
                c.usuario_id,
                c.fecha_cobro,
                c.total,
                c.estado,
                c.observaciones,
                p.nombre,
                p.apellido,
                p.dni,
                u.nombre AS usuario_nombre
            FROM cobros c
            LEFT JOIN pacientes p ON c.paciente_id = p.id
            LEFT JOIN usuarios u ON c.usuario_id = u.id
            WHERE " . implode(' AND ', $where) . "
            ORDER BY c.fecha_cobro DESC";

    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        respond(['success' => false, 'error' => 'Error en SQL: ' . $conn->error], 500);
    }
    if ($types !== '') {
        $stmt->bind_param($types, ...$params);
    }
    if (!$stmt->execute()) {
        respond(['success' => false, 'error' => 'Error al consultar ventas: ' . $stmt->error], 500);
    }

    $ventas = [];
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmtDetalle = $conn->prepare("SELECT id, servicio_tipo, servicio_id, descripcion, cantidad, precio_unitario, subtotal FROM cobros_detalle WHERE cobro_id = ?");
    if (!$stmtDetalle) {
        respond(['success' => false, 'error' => 'Error al preparar detalle de cobros: ' . $conn->error], 500);
    }

    foreach ($rows as $row) {
        $cobroId = (int)$row['id'];
        $stmtDetalle->bind_param('i', $cobroId);
        if (!$stmtDetalle->execute()) {
            respond(['success' => false, 'error' => 'Error al consultar detalle de cobro: ' . $stmtDetalle->error], 500);
        }
        $detalleRows = $stmtDetalle->get_result()->fetch_all(MYSQLI_ASSOC);
        $detallesFarmacia = [];
        foreach ($detalleRows as $detalleRow) {
            $detallesFarmacia = array_merge(
                $detallesFarmacia,
                extraer_detalles_farmacia_desde_json($detalleRow['descripcion'] ?? '', $detalleRow)
            );
        }

        if (empty($detallesFarmacia)) {
            continue;
        }

        $pacienteNombre = formatear_paciente($row['nombre'] ?? '', $row['apellido'] ?? '');
        $pacienteDni = trim((string)($row['dni'] ?? ''));
        if ($pacienteNombre === 'Particular' && $pacienteDni === '') {
            $temp = extraer_paciente_temporal_desde_observaciones($row['observaciones'] ?? '');
            if (trim((string)($temp['nombre'] ?? '')) !== '') {
                $pacienteNombre = $temp['nombre'];
            }
            $pacienteDni = trim((string)($temp['dni'] ?? ''));

            if (($pacienteNombre === 'Particular' || $pacienteNombre === '') && $pacienteDni === '') {
                $pacienteCot = resolver_paciente_desde_cotizacion_por_cobro($conn, $cobroId);
                if (trim((string)($pacienteCot['nombre'] ?? '')) !== '') {
                    $pacienteNombre = trim((string)$pacienteCot['nombre']);
                }
                if (trim((string)($pacienteCot['dni'] ?? '')) !== '') {
                    $pacienteDni = trim((string)$pacienteCot['dni']);
                }
            }
        }

        $totalFarmacia = 0;
        foreach ($detallesFarmacia as $detalle) {
            $totalFarmacia += (float)($detalle['subtotal'] ?? 0);
        }

        $ventas[] = [
            'id' => $cobroId,
            'source' => 'general',
            'origen' => 'cobro',
            'referencia' => sprintf('C%06d', $cobroId),
            'fecha' => $row['fecha_cobro'],
            'paciente_id' => isset($row['paciente_id']) ? (int)$row['paciente_id'] : null,
            'paciente_nombre' => $pacienteNombre,
            'paciente_dni' => $pacienteDni,
            'usuario_id' => isset($row['usuario_id']) ? (int)$row['usuario_id'] : null,
            'usuario_nombre' => $row['usuario_nombre'] ?? '',
            'total' => round($totalFarmacia, 2),
            'estado' => $row['estado'] ?? 'pagado'
        ];
    }

    return $ventas;
}

function obtener_detalle_venta_general($conn, $cobroId) {
    $stmt = $conn->prepare("SELECT
            c.id,
            c.paciente_id,
            c.usuario_id,
            c.fecha_cobro,
            c.total,
            c.estado,
            c.observaciones,
            p.nombre,
            p.apellido,
            p.dni,
            u.nombre AS usuario_nombre
        FROM cobros c
        LEFT JOIN pacientes p ON c.paciente_id = p.id
        LEFT JOIN usuarios u ON c.usuario_id = u.id
        WHERE c.id = ?");
    if (!$stmt) {
        respond(['success' => false, 'error' => 'Error al preparar consulta de detalle: ' . $conn->error], 500);
    }
    $stmt->bind_param('i', $cobroId);
    if (!$stmt->execute()) {
        respond(['success' => false, 'error' => 'Error al consultar venta: ' . $stmt->error], 500);
    }
    $venta = $stmt->get_result()->fetch_assoc();
    if (!$venta) {
        respond(['success' => false, 'error' => 'Venta no encontrada'], 404);
    }

    $stmtDetalle = $conn->prepare("SELECT id, servicio_tipo, servicio_id, descripcion, cantidad, precio_unitario, subtotal FROM cobros_detalle WHERE cobro_id = ?");
    if (!$stmtDetalle) {
        respond(['success' => false, 'error' => 'Error al preparar detalle de venta: ' . $conn->error], 500);
    }
    $stmtDetalle->bind_param('i', $cobroId);
    if (!$stmtDetalle->execute()) {
        respond(['success' => false, 'error' => 'Error al consultar detalle de venta: ' . $stmtDetalle->error], 500);
    }
    $detalleRows = $stmtDetalle->get_result()->fetch_all(MYSQLI_ASSOC);
    $detalles = [];
    foreach ($detalleRows as $detalleRow) {
        $detalles = array_merge(
            $detalles,
            extraer_detalles_farmacia_desde_json($detalleRow['descripcion'] ?? '', $detalleRow)
        );
    }
    if (empty($detalles)) {
        respond(['success' => false, 'error' => 'La venta no tiene ítems de farmacia'], 404);
    }

    $pacienteNombre = formatear_paciente($venta['nombre'] ?? '', $venta['apellido'] ?? '');
    $pacienteDni = trim((string)($venta['dni'] ?? ''));
    if ($pacienteNombre === 'Particular' && $pacienteDni === '') {
        $temp = extraer_paciente_temporal_desde_observaciones($venta['observaciones'] ?? '');
        if (trim((string)($temp['nombre'] ?? '')) !== '') {
            $pacienteNombre = $temp['nombre'];
        }
        $pacienteDni = trim((string)($temp['dni'] ?? ''));

        if (($pacienteNombre === 'Particular' || $pacienteNombre === '') && $pacienteDni === '') {
            $pacienteCot = resolver_paciente_desde_cotizacion_por_cobro($conn, $cobroId);
            if (trim((string)($pacienteCot['nombre'] ?? '')) !== '') {
                $pacienteNombre = trim((string)$pacienteCot['nombre']);
            }
            if (trim((string)($pacienteCot['dni'] ?? '')) !== '') {
                $pacienteDni = trim((string)$pacienteCot['dni']);
            }
        }
    }

    $totalFarmacia = 0;
    foreach ($detalles as $detalle) {
        $totalFarmacia += (float)($detalle['subtotal'] ?? 0);
    }

    return [
        'id' => $cobroId,
        'source' => 'general',
        'origen' => 'cobro',
        'referencia' => sprintf('C%06d', $cobroId),
        'fecha' => $venta['fecha_cobro'],
        'paciente_id' => isset($venta['paciente_id']) ? (int)$venta['paciente_id'] : null,
        'paciente_nombre' => $pacienteNombre,
        'paciente_dni' => $pacienteDni,
        'usuario_id' => isset($venta['usuario_id']) ? (int)$venta['usuario_id'] : null,
        'usuario_nombre' => $venta['usuario_nombre'] ?? '',
        'total' => round($totalFarmacia, 2),
        'estado' => $venta['estado'] ?? 'pagado',
        'detalles' => $detalles,
    ];
}

switch($method) {
    case 'POST':
        // Registrar cotización y salida de medicamentos
        $data = json_decode(file_get_contents('php://input'), true);
        $pacienteValido = isset($data['paciente_id']) || (isset($data['paciente_dni']) && isset($data['paciente_nombre']) && $data['paciente_dni'] && $data['paciente_nombre']);
        if (!$pacienteValido || !isset($data['usuario_id']) || !isset($data['total']) || !isset($data['detalles']) || empty($data['detalles'])) {
            echo json_encode(['success' => false, 'error' => 'Datos incompletos']);
            break;
        }
        $conn->begin_transaction();
        try {
            $observaciones = $data['observaciones'] ?? '';
            // Si paciente_id existe, usarlo. Si no, guardar paciente_dni y paciente_nombre en campos extra
            if (isset($data['paciente_id'])) {
                $stmt = $conn->prepare("INSERT INTO cotizaciones_farmacia (paciente_id, usuario_id, total, estado, observaciones) VALUES (?, ?, ?, 'pagado', ?)");
                $stmt->bind_param("iids", $data['paciente_id'], $data['usuario_id'], $data['total'], $observaciones);
            } else {
                $stmt = $conn->prepare("INSERT INTO cotizaciones_farmacia (usuario_id, total, estado, observaciones, paciente_dni, paciente_nombre) VALUES (?, ?, 'pagado', ?, ?, ?)");
                $stmt->bind_param("idsss", $data['usuario_id'], $data['total'], $observaciones, $data['paciente_dni'], $data['paciente_nombre']);
            }
            $stmt->execute();
            $cotizacion_id = $conn->insert_id;
            $stmt_detalle = $conn->prepare("INSERT INTO cotizaciones_farmacia_detalle (cotizacion_id, medicamento_id, descripcion, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?, ?)");
            foreach ($data['detalles'] as $detalle) {
                $stmt_detalle->bind_param("iisiid", $cotizacion_id, $detalle['medicamento_id'], $detalle['descripcion'], $detalle['cantidad'], $detalle['precio_unitario'], $detalle['subtotal']);
                $stmt_detalle->execute();
                // Descontar stock
                $stmt_stock = $conn->prepare("UPDATE medicamentos SET stock = stock - ? WHERE id = ? AND stock >= ?");
                $stmt_stock->bind_param("iii", $detalle['cantidad'], $detalle['medicamento_id'], $detalle['cantidad']);
                $stmt_stock->execute();
                // Registrar movimiento
                $stmt_mov = $conn->prepare("INSERT INTO movimientos_medicamento (medicamento_id, usuario_id, cantidad, tipo_movimiento, observaciones) VALUES (?, ?, ?, 'salida', ?)");
                $stmt_mov->bind_param("iiis", $detalle['medicamento_id'], $data['usuario_id'], $detalle['cantidad'], $observaciones);
                $stmt_mov->execute();
            }
            $conn->commit();
            $numero_comprobante = sprintf("F%06d", $cotizacion_id);
            echo json_encode([
                'success' => true,
                'cotizacion_id' => $cotizacion_id,
                'numero_comprobante' => $numero_comprobante,
                'message' => 'Venta registrada exitosamente'
            ]);
        } catch (Exception $e) {
            $conn->rollback();
            error_log("Error en venta farmacia: " . $e->getMessage());
            if (isset($stmt) && $stmt->error) {
                error_log("MySQL error: " . $stmt->error);
            }
            echo json_encode(['success' => false, 'error' => 'Error al registrar la venta: ' . $e->getMessage() . ($stmt->error ? ' | MySQL: ' . $stmt->error : '')]);
        }
        break;
    case 'GET':
        // Listar cotizaciones o movimientos
        if (isset($_GET['cotizacion_id'])) {
            $ventaId = (int)$_GET['cotizacion_id'];
            $source = trim((string)($_GET['source'] ?? 'legacy'));

            if ($source === 'general') {
                $venta = obtener_detalle_venta_general($conn, $ventaId);
                respond(['success' => true, 'cotizacion' => $venta]);
            }

            $stmt = $conn->prepare("SELECT c.*, COALESCE(p.nombre, c.paciente_nombre) as paciente_nombre, COALESCE(p.dni, c.paciente_dni) as paciente_dni, u.nombre as usuario_nombre FROM cotizaciones_farmacia c LEFT JOIN pacientes p ON c.paciente_id = p.id LEFT JOIN usuarios u ON c.usuario_id = u.id WHERE c.id = ?");
            $stmt->bind_param("i", $ventaId);
            $stmt->execute();
            $cotizacion = $stmt->get_result()->fetch_assoc();
            if (!$cotizacion) {
                respond(['success' => false, 'error' => 'Cotización no encontrada'], 404);
            }

            $stmt_detalle = $conn->prepare("SELECT * FROM cotizaciones_farmacia_detalle WHERE cotizacion_id = ?");
            $stmt_detalle->bind_param("i", $cotizacion['id']);
            $stmt_detalle->execute();
            $detalles = $stmt_detalle->get_result()->fetch_all(MYSQLI_ASSOC);

            $venta = normalizar_venta_legacy($cotizacion);
            $venta['detalles'] = $detalles;
            respond(['success' => true, 'cotizacion' => $venta]);
        } elseif (isset($_GET['movimientos'])) {
            // Panel del químico: listar movimientos
            $stmt = $conn->prepare("SELECT m.*, me.nombre as medicamento, u.nombre as usuario FROM movimientos_medicamento m JOIN medicamentos me ON m.medicamento_id = me.id JOIN usuarios u ON m.usuario_id = u.id ORDER BY m.fecha_hora DESC");
            $stmt->execute();
            $movimientos = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
            respond(['success' => true, 'movimientos' => $movimientos]);
        } else {
            // Todas las ventas de farmacia (legacy + cobros generales con ítems farmacia)
            $page = max(1, (int)($_GET['page'] ?? 1));
            $limit = max(1, (int)($_GET['limit'] ?? 10));
            $offset = ($page - 1) * $limit;
            $fecha_inicio = $_GET['fecha_inicio'] ?? null;
            $fecha_fin = $_GET['fecha_fin'] ?? null;

            $where = '';
            $params = [];
            $types = '';
            if ($fecha_inicio && $fecha_fin) {
                $where = 'WHERE DATE(c.fecha) BETWEEN ? AND ?';
                $params = [$fecha_inicio, $fecha_fin];
                $types = 'ss';
            }
            $sql = "SELECT c.*, 
                COALESCE(p.nombre, c.paciente_nombre) as paciente_nombre, 
                COALESCE(p.dni, c.paciente_dni) as paciente_dni, 
                u.nombre as usuario_nombre 
                FROM cotizaciones_farmacia c 
                LEFT JOIN pacientes p ON c.paciente_id = p.id 
                JOIN usuarios u ON c.usuario_id = u.id 
                $where 
                ORDER BY c.fecha DESC";
            $stmt = $conn->prepare($sql);
            if (!$stmt) {
                respond(['success' => false, 'error' => 'Error en SQL: ' . $conn->error], 500);
            }
            if ($types !== '' && !$stmt->bind_param($types, ...$params)) {
                respond(['success' => false, 'error' => 'Error en bind_param: ' . $stmt->error], 500);
            }
            if (!$stmt->execute()) {
                respond(['success' => false, 'error' => 'Error en execute: ' . $stmt->error], 500);
            }

            $ventasLegacy = array_map('normalizar_venta_legacy', $stmt->get_result()->fetch_all(MYSQLI_ASSOC));
            $ventasGenerales = obtener_ventas_generales_farmacia($conn, $fecha_inicio, $fecha_fin);
            $ventas = array_merge($ventasLegacy, $ventasGenerales);

            usort($ventas, function ($a, $b) {
                return strcmp((string)($b['fecha'] ?? ''), (string)($a['fecha'] ?? ''));
            });

            $total = count($ventas);
            if ($offset > 0) {
                $ventas = array_slice($ventas, $offset, $limit);
            } else {
                $ventas = array_slice($ventas, 0, $limit);
            }

            respond([
                'success' => true,
                'cotizaciones' => $ventas,
                'total' => $total,
                'page' => $page,
                'limit' => $limit
            ]);
        }
        break;
    default:
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
        break;
}
?>
