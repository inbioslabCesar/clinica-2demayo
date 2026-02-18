<?php
require_once __DIR__ . '/init_api.php';
require_once "config.php";
require_once "auth_check.php";

$method = $_SERVER['REQUEST_METHOD'];

switch($method) {
    case 'POST':
        // Registrar cotización
        $data = json_decode(file_get_contents('php://input'), true);
        if (!isset($data['paciente_id']) || !isset($data['usuario_id']) || 
            !isset($data['total']) || !isset($data['detalles']) || empty($data['detalles'])) {
            echo json_encode(['success' => false, 'error' => 'Datos incompletos']);
            break;
        }
        $conn->begin_transaction();
        try {
            $observaciones = $data['observaciones'] ?? '';
            $stmt = $conn->prepare("INSERT INTO cotizaciones (paciente_id, usuario_id, total, estado, observaciones) VALUES (?, ?, ?, 'pendiente', ?)");
            $stmt->bind_param("iids", 
                $data['paciente_id'], 
                $data['usuario_id'], 
                $data['total'], 
                $observaciones
            );
            $stmt->execute();
            $cotizacion_id = $conn->insert_id;
            $stmt_detalle = $conn->prepare("INSERT INTO cotizaciones_detalle (cotizacion_id, servicio_tipo, servicio_id, descripcion, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?)");
            foreach ($data['detalles'] as $detalle) {
                $servicio_id = $detalle['servicio_id'] ?? null;
                $stmt_detalle->bind_param("ississd", 
                    $cotizacion_id, 
                    $detalle['servicio_tipo'], 
                    $servicio_id,
                    $detalle['descripcion'], 
                    $detalle['cantidad'], 
                    $detalle['precio_unitario'], 
                    $detalle['subtotal']
                );
                $stmt_detalle->execute();
            }
            $conn->commit();
            $numero_comprobante = sprintf("Q%06d", $cotizacion_id);
            echo json_encode([
                'success' => true, 
                'cotizacion_id' => $cotizacion_id,
                'numero_comprobante' => $numero_comprobante,
                'message' => 'Cotización registrada exitosamente'
            ]);
        } catch (Exception $e) {
            $conn->rollback();
            error_log("Error en cotización: " . $e->getMessage());
            echo json_encode(['success' => false, 'error' => 'Error al registrar la cotización: ' . $e->getMessage()]);
        }
        break;
    case 'GET':
        // Listar cotizaciones
        if (isset($_GET['paciente_id'])) {
            $stmt = $conn->prepare("
                SELECT c.*, p.nombre, p.apellido, u.nombre as usuario_nombre
                FROM cotizaciones c 
                JOIN pacientes p ON c.paciente_id = p.id 
                JOIN usuarios u ON c.usuario_id = u.id
                WHERE c.paciente_id = ? 
                ORDER BY c.fecha DESC
            ");
            $stmt->bind_param("i", $_GET['paciente_id']);
            $stmt->execute();
            $result = $stmt->get_result();
            $cotizaciones = $result->fetch_all(MYSQLI_ASSOC);
            foreach ($cotizaciones as &$cotizacion) {
                $stmt_detalle = $conn->prepare("SELECT * FROM cotizaciones_detalle WHERE cotizacion_id = ?");
                $stmt_detalle->bind_param("i", $cotizacion['id']);
                $stmt_detalle->execute();
                $detalles = $stmt_detalle->get_result()->fetch_all(MYSQLI_ASSOC);
                $cotizacion['detalles'] = $detalles;
            }
            echo json_encode(['success' => true, 'cotizaciones' => $cotizaciones]);
        } elseif (isset($_GET['cotizacion_id'])) {
            $stmt = $conn->prepare("
                SELECT c.*, p.nombre, p.apellido, p.dni, p.historia_clinica, u.nombre as usuario_nombre
                FROM cotizaciones c 
                JOIN pacientes p ON c.paciente_id = p.id 
                JOIN usuarios u ON c.usuario_id = u.id
                WHERE c.id = ?
            ");
            $stmt->bind_param("i", $_GET['cotizacion_id']);
            $stmt->execute();
            $result = $stmt->get_result();
            $cotizacion = $result->fetch_assoc();
            if ($cotizacion) {
                $stmt_detalle = $conn->prepare("SELECT * FROM cotizaciones_detalle WHERE cotizacion_id = ?");
                $stmt_detalle->bind_param("i", $cotizacion['id']);
                $stmt_detalle->execute();
                $detalles = $stmt_detalle->get_result()->fetch_all(MYSQLI_ASSOC);
                $cotizacion['detalles'] = $detalles;
                echo json_encode(['success' => true, 'cotizacion' => $cotizacion]);
            } else {
                echo json_encode(['success' => false, 'error' => 'Cotización no encontrada']);
            }
        } else {
            // Todas las cotizaciones (paginación)
            $page = $_GET['page'] ?? 1;
            $limit = $_GET['limit'] ?? 3;
            $offset = ($page - 1) * $limit;
            $stmt = $conn->prepare("
                SELECT c.*, p.nombre, p.apellido, u.nombre as usuario_nombre
                FROM cotizaciones c 
                JOIN pacientes p ON c.paciente_id = p.id 
                JOIN usuarios u ON c.usuario_id = u.id
                ORDER BY c.fecha DESC 
                LIMIT ? OFFSET ?
            ");
            $stmt->bind_param("ii", $limit, $offset);
            $stmt->execute();
            $result = $stmt->get_result();
            $cotizaciones = $result->fetch_all(MYSQLI_ASSOC);
            $stmt_count = $conn->prepare("SELECT COUNT(*) as total FROM cotizaciones");
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
