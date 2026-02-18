<?php
require_once __DIR__ . '/init_api.php';
require_once "config.php";
require_once "auth_check.php";

$method = $_SERVER['REQUEST_METHOD'];

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
            $stmt = $conn->prepare("SELECT * FROM cotizaciones_farmacia WHERE id = ?");
            $stmt->bind_param("i", $_GET['cotizacion_id']);
            $stmt->execute();
            $cotizacion = $stmt->get_result()->fetch_assoc();
            if ($cotizacion) {
                $stmt_detalle = $conn->prepare("SELECT * FROM cotizaciones_farmacia_detalle WHERE cotizacion_id = ?");
                $stmt_detalle->bind_param("i", $cotizacion['id']);
                $stmt_detalle->execute();
                $detalles = $stmt_detalle->get_result()->fetch_all(MYSQLI_ASSOC);
                $cotizacion['detalles'] = $detalles;
                echo json_encode(['success' => true, 'cotizacion' => $cotizacion]);
            } else {
                echo json_encode(['success' => false, 'error' => 'Cotización no encontrada']);
            }
        } elseif (isset($_GET['movimientos'])) {
            // Panel del químico: listar movimientos
            $stmt = $conn->prepare("SELECT m.*, me.nombre as medicamento, u.nombre as usuario FROM movimientos_medicamento m JOIN medicamentos me ON m.medicamento_id = me.id JOIN usuarios u ON m.usuario_id = u.id ORDER BY m.fecha_hora DESC");
            $stmt->execute();
            $movimientos = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
            echo json_encode(['success' => true, 'movimientos' => $movimientos]);
        } else {
            // Todas las cotizaciones (paginación)
            $page = $_GET['page'] ?? 1;
            $limit = $_GET['limit'] ?? 10;
            $offset = ($page - 1) * $limit;
            $fecha_inicio = $_GET['fecha_inicio'] ?? null;
            $fecha_fin = $_GET['fecha_fin'] ?? null;
            $where = '';
            $params = [];
            $types = '';
            if ($fecha_inicio && $fecha_fin) {
                $where = 'WHERE DATE(c.fecha) BETWEEN ? AND ?';
                $params = [$fecha_inicio, $fecha_fin, $limit, $offset];
                $types = 'ssii';
            } else {
                $params = [$limit, $offset];
                $types = 'ii';
            }
            $sql = "SELECT c.*, 
                COALESCE(p.nombre, c.paciente_nombre) as paciente_nombre, 
                COALESCE(p.dni, c.paciente_dni) as paciente_dni, 
                u.nombre as usuario_nombre 
                FROM cotizaciones_farmacia c 
                LEFT JOIN pacientes p ON c.paciente_id = p.id 
                JOIN usuarios u ON c.usuario_id = u.id 
                $where 
                ORDER BY c.fecha DESC LIMIT ? OFFSET ?";
            error_log("[VENTAS] SQL: $sql");
            error_log("[VENTAS] Params: " . json_encode($params));
            error_log("[VENTAS] Types: $types");
            $stmt = $conn->prepare($sql);
            if (!$stmt) {
                error_log("[VENTAS] Prepare failed: " . $conn->error);
                echo json_encode(['success' => false, 'error' => 'Error en SQL: ' . $conn->error]);
                exit;
            }
            if (!$stmt->bind_param($types, ...$params)) {
                error_log("[VENTAS] Bind failed: " . $stmt->error);
                echo json_encode(['success' => false, 'error' => 'Error en bind_param: ' . $stmt->error]);
                exit;
            }
            if (!$stmt->execute()) {
                error_log("[VENTAS] Execute failed: " . $stmt->error);
                echo json_encode(['success' => false, 'error' => 'Error en execute: ' . $stmt->error]);
                exit;
            }
            $cotizaciones = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
            $where_count = '';
            if ($fecha_inicio && $fecha_fin) {
                $where_count = 'WHERE DATE(fecha) BETWEEN ? AND ?';
            }
            $stmt_count = $conn->prepare("SELECT COUNT(*) as total FROM cotizaciones_farmacia" . ($where_count ? " $where_count" : ""));
            if ($where_count) {
                $stmt_count->bind_param('ss', $fecha_inicio, $fecha_fin);
            }
            $stmt_count->execute();
            $total = $stmt_count->get_result()->fetch_assoc()['total'];
            echo json_encode([
                'success' => true,
                'cotizaciones' => $cotizaciones,
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
