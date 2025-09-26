<?php
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '',
    'secure' => false, // Cambiado a false para desarrollo local (HTTP)
    'httponly' => true,
    'samesite' => 'Lax', // Cambiado de None a Lax para mejor compatibilidad
]);
session_start();
// CORS para localhost y producción
$allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'https://darkcyan-gnu-615778.hostingersite.com'
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins)) {
    header('Access-Control-Allow-Origin: ' . $origin);
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}
// API para gestionar cobros
header('Content-Type: application/json');
require_once "config.php";
require_once "auth_check.php";

$method = $_SERVER['REQUEST_METHOD'];

switch($method) {
    case 'POST':
        // Procesar cobro
        $data = json_decode(file_get_contents('php://input'), true);
        
        // Validar datos requeridos
        if (!isset($data['paciente_id']) || !isset($data['usuario_id']) || 
            !isset($data['total']) || !isset($data['tipo_pago']) || 
            !isset($data['detalles']) || empty($data['detalles'])) {
            echo json_encode(['success' => false, 'error' => 'Datos incompletos']);
            break;
        }
        
        // Iniciar transacción
        $conn->begin_transaction();
        
        try {
            // 1. Crear cobro principal
            $observaciones = $data['observaciones'] ?? '';
            $stmt = $conn->prepare("INSERT INTO cobros (paciente_id, usuario_id, total, tipo_pago, estado, observaciones) VALUES (?, ?, ?, ?, 'pagado', ?)");
            $stmt->bind_param("iidss", 
                $data['paciente_id'], 
                $data['usuario_id'], 
                $data['total'], 
                $data['tipo_pago'],
                $observaciones
            );
            $stmt->execute();
            
            $cobro_id = $conn->insert_id;
            
            // 2. Insertar detalles del cobro
            $stmt_detalle = $conn->prepare("INSERT INTO cobros_detalle (cobro_id, servicio_tipo, servicio_id, descripcion, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?)");
            
            foreach ($data['detalles'] as $detalle) {
                $servicio_id = $detalle['servicio_id'] ?? null;
                $stmt_detalle->bind_param("ississd", 
                    $cobro_id, 
                    $detalle['servicio_tipo'], 
                    $servicio_id,
                    $detalle['descripcion'], 
                    $detalle['cantidad'], 
                    $detalle['precio_unitario'], 
                    $detalle['subtotal']
                );
                $stmt_detalle->execute();
            }
            
            // 3. Registrar atención si no existe
            $servicio_key = $data['servicio_info']['key'] ?? 'consulta';
            $stmt_atencion = $conn->prepare("INSERT INTO atenciones (paciente_id, usuario_id, servicio, estado) VALUES (?, ?, ?, 'pendiente')");
            $stmt_atencion->bind_param("iis", 
                $data['paciente_id'], 
                $data['usuario_id'], 
                $servicio_key
            );
            $stmt_atencion->execute();
            
            $conn->commit();
            
            // 4. Generar número de comprobante
            $numero_comprobante = sprintf("C%06d", $cobro_id);
            
            echo json_encode([
                'success' => true, 
                'cobro_id' => $cobro_id,
                'numero_comprobante' => $numero_comprobante,
                'message' => 'Cobro procesado exitosamente'
            ]);
            
        } catch (Exception $e) {
            $conn->rollback();
            error_log("Error en cobro: " . $e->getMessage());
            echo json_encode(['success' => false, 'error' => 'Error al procesar el cobro: ' . $e->getMessage()]);
        }
        break;
        
    case 'GET':
        // Listar cobros
        if (isset($_GET['paciente_id'])) {
            // Cobros de un paciente específico
            $stmt = $conn->prepare("
                SELECT c.*, p.nombre, p.apellido, u.nombre as usuario_nombre
                FROM cobros c 
                JOIN pacientes p ON c.paciente_id = p.id 
                JOIN usuarios u ON c.usuario_id = u.id
                WHERE c.paciente_id = ? 
                ORDER BY c.fecha_cobro DESC
            ");
            $stmt->bind_param("i", $_GET['paciente_id']);
            $stmt->execute();
            $result = $stmt->get_result();
            $cobros = $result->fetch_all(MYSQLI_ASSOC);
            
            // Obtener detalles de cada cobro
            foreach ($cobros as &$cobro) {
                $stmt_detalle = $conn->prepare("SELECT * FROM cobros_detalle WHERE cobro_id = ?");
                $stmt_detalle->bind_param("i", $cobro['id']);
                $stmt_detalle->execute();
                $detalles = $stmt_detalle->get_result()->fetch_all(MYSQLI_ASSOC);
                $cobro['detalles'] = $detalles;
            }
            
            echo json_encode(['success' => true, 'cobros' => $cobros]);
            
        } elseif (isset($_GET['cobro_id'])) {
            // Obtener un cobro específico con sus detalles
            $stmt = $conn->prepare("
                SELECT c.*, p.nombre, p.apellido, p.dni, p.historia_clinica, u.nombre as usuario_nombre
                FROM cobros c 
                JOIN pacientes p ON c.paciente_id = p.id 
                JOIN usuarios u ON c.usuario_id = u.id
                WHERE c.id = ?
            ");
            $stmt->bind_param("i", $_GET['cobro_id']);
            $stmt->execute();
            $result = $stmt->get_result();
            $cobro = $result->fetch_assoc();
            
            if ($cobro) {
                // Obtener detalles
                $stmt_detalle = $conn->prepare("SELECT * FROM cobros_detalle WHERE cobro_id = ?");
                $stmt_detalle->bind_param("i", $cobro['id']);
                $stmt_detalle->execute();
                $detalles = $stmt_detalle->get_result()->fetch_all(MYSQLI_ASSOC);
                $cobro['detalles'] = $detalles;
                
                echo json_encode(['success' => true, 'cobro' => $cobro]);
            } else {
                echo json_encode(['success' => false, 'error' => 'Cobro no encontrado']);
            }
            
        } else {
            // Todos los cobros (con paginación)
            $page = $_GET['page'] ?? 1;
            $limit = $_GET['limit'] ?? 20;
            $offset = ($page - 1) * $limit;
            
            $stmt = $conn->prepare("
                SELECT c.*, p.nombre, p.apellido, u.nombre as usuario_nombre
                FROM cobros c 
                JOIN pacientes p ON c.paciente_id = p.id 
                JOIN usuarios u ON c.usuario_id = u.id
                ORDER BY c.fecha_cobro DESC 
                LIMIT ? OFFSET ?
            ");
            $stmt->bind_param("ii", $limit, $offset);
            $stmt->execute();
            $result = $stmt->get_result();
            $cobros = $result->fetch_all(MYSQLI_ASSOC);
            
            // Contar total
            $stmt_count = $conn->prepare("SELECT COUNT(*) as total FROM cobros");
            $stmt_count->execute();
            $total = $stmt_count->get_result()->fetch_assoc()['total'];
            
            echo json_encode([
                'success' => true, 
                'cobros' => $cobros, 
                'total' => $total,
                'page' => $page,
                'limit' => $limit
            ]);
        }
        break;
        
    case 'PUT':
        // Actualizar estado del cobro (anular, etc.)
        $data = json_decode(file_get_contents('php://input'), true);
        
        if (!isset($data['id']) || !isset($data['estado'])) {
            echo json_encode(['success' => false, 'error' => 'Datos incompletos']);
            break;
        }
        
        $estados_validos = ['pagado', 'anulado', 'devolucion', 'pendiente'];
        if (!in_array($data['estado'], $estados_validos)) {
            echo json_encode(['success' => false, 'error' => 'Estado no válido']);
            break;
        }
        
        $observaciones_update = $data['observaciones'] ?? '';
        $stmt = $conn->prepare("UPDATE cobros SET estado = ?, observaciones = ? WHERE id = ?");
        $stmt->bind_param("ssi", $data['estado'], $observaciones_update, $data['id']);
        
        if ($stmt->execute()) {
            echo json_encode(['success' => true, 'message' => 'Estado actualizado']);
        } else {
            echo json_encode(['success' => false, 'error' => 'Error al actualizar']);
        }
        break;
        
    default:
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
        break;
}
?>