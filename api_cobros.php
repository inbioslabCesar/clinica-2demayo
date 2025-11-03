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
    'https://clinica2demayo.com'
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins)) {
    header('Access-Control-Allow-Origin: ' . $origin);
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}
// API para gestionar cobros
header('Content-Type: application/json');
require_once "config.php";
require_once "auth_check.php";
// Forzar codificación utf8mb4 en la conexión MySQLi
if (isset($conn) && method_exists($conn, 'set_charset')) {
    $conn->set_charset('utf8mb4');
}

$method = $_SERVER['REQUEST_METHOD'];

switch($method) {
    case 'POST':
    // Procesar cobro
    $data = json_decode(file_get_contents('php://input'), true);
        
        // Validar datos requeridos (paciente_id puede ser null para pacientes no registrados)
        if (!isset($data['usuario_id']) || 
            !isset($data['total']) || !isset($data['tipo_pago']) || 
            !isset($data['detalles']) || empty($data['detalles'])) {
            echo json_encode(['success' => false, 'error' => 'Datos incompletos']);
            break;
        }
        
        // Para pacientes no registrados, verificar que tengan al menos nombre y DNI
        if ((!$data['paciente_id'] || $data['paciente_id'] === 'null') && 
            (empty($data['paciente_nombre']) || empty($data['paciente_dni']))) {
            echo json_encode(['success' => false, 'error' => 'Para pacientes no registrados se requiere nombre y DNI']);
            break;
        }
        
        // Iniciar transacción
        $conn->begin_transaction();
        
        try {
            // 1. Obtener información del paciente para los movimientos
            if ($data['paciente_id'] && $data['paciente_id'] !== 'null') {
                // Paciente registrado en la BD
                $stmt_paciente = $conn->prepare("SELECT nombre, apellido, dni, historia_clinica FROM pacientes WHERE id = ?");
                $stmt_paciente->bind_param("i", $data['paciente_id']);
                $stmt_paciente->execute();
                $paciente_info = $stmt_paciente->get_result()->fetch_assoc();
                $nombre_paciente = ($paciente_info['nombre'] ?? '') . ' ' . ($paciente_info['apellido'] ?? '');
                $dni_paciente = $paciente_info['dni'] ?? '';
                $hc_paciente = $paciente_info['historia_clinica'] ?? '';
            } else {
                // Paciente no registrado - usar datos del request
                $nombre_paciente = $data['paciente_nombre'] ?? 'Cliente no registrado';
                $dni_paciente = $data['paciente_dni'] ?? '';
                $hc_paciente = $data['paciente_historia_clinica'] ?? '';
            }
            
            // 2. Crear cobro principal
            $observaciones = $data['observaciones'] ?? '';
            // Para pacientes no registrados, almacenar información en observaciones
            if (!$data['paciente_id'] || $data['paciente_id'] === 'null') {
                $observaciones = "Cliente no registrado: $nombre_paciente (DNI: $dni_paciente). " . $observaciones;
            }
            
            $stmt = $conn->prepare("INSERT INTO cobros (paciente_id, usuario_id, total, tipo_pago, estado, observaciones) VALUES (?, ?, ?, ?, 'pagado', ?)");
            $paciente_id_param = ($data['paciente_id'] && $data['paciente_id'] !== 'null') ? $data['paciente_id'] : null;
            $usuario_id_param = $data['usuario_id'];
            $total_param = $data['total'];
            $tipo_pago_param = $data['tipo_pago'];
            
            $stmt->bind_param("iidss", 
                $paciente_id_param, 
                $usuario_id_param, 
                $total_param, 
                $tipo_pago_param,
                $observaciones
            );
            $stmt->execute();
            
            $cobro_id = $conn->insert_id;
            
            // 2. Insertar detalles del cobro
            // Guardar todos los detalles como un array JSON en una sola fila
            $servicio_tipo = $data['detalles'][0]['servicio_tipo'];
            $servicio_id = $data['detalles'][0]['servicio_id'];
            $descripcion_json = json_encode($data['detalles']);
            $cantidad = count($data['detalles']);
            $precio_unitario = array_sum(array_map(function($d){return $d['precio_unitario'];}, $data['detalles'])) / max(1, $cantidad);
            $subtotal = array_sum(array_map(function($d){return $d['subtotal'];}, $data['detalles']));
            $stmt_detalle = $conn->prepare("INSERT INTO cobros_detalle (cobro_id, servicio_tipo, servicio_id, descripcion, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?, ?, ?)");
            $stmt_detalle->bind_param("isisssd", 
                $cobro_id, 
                $servicio_tipo, 
                $servicio_id,
                $descripcion_json, 
                $cantidad, 
                $precio_unitario, 
                $subtotal
            );
            $stmt_detalle->execute();
            
            // ========================================
            // INTEGRACIÓN CON MÓDULO DE INGRESOS
            // ========================================
            
            // Verificar si hay una caja abierta
            $stmt_caja = $conn->prepare("SELECT id FROM cajas WHERE estado = 'abierta' ORDER BY created_at DESC LIMIT 1");
            $stmt_caja->execute();
            $caja_result = $stmt_caja->get_result();
            
            if ($caja_result->num_rows > 0) {
                $caja_abierta = $caja_result->fetch_assoc();
                $caja_id = $caja_abierta['id'];
                
                // Determinar el tipo de ingreso y área según el servicio
                $servicio_key = $data['servicio_info']['key'] ?? 'otros';
                $area_servicio = $data['servicio_info']['nombre'] ?? 'Otros servicios';
                
                // Mapear el tipo de servicio al tipo de ingreso del módulo de caja
                $tipo_ingreso_map = [
                    'farmacia' => 'farmacia',
                    'laboratorio' => 'laboratorio',
                    'consulta' => 'consulta',
                    'ecografia' => 'ecografia',
                    'rayosx' => 'rayosx',
                    'procedimiento' => 'procedimiento'
                ];
                
                $tipo_ingreso = $tipo_ingreso_map[$servicio_key] ?? 'otros';
                
                // Mapear el tipo de pago al método de pago del módulo de caja
                $metodo_pago_map = [
                    'efectivo' => 'efectivo',
                    'tarjeta' => 'tarjeta',
                    'transferencia' => 'transferencia',
                    'yape' => 'yape',
                    'plin' => 'plin',
                    'seguro' => 'otros'
                ];
                
                $metodo_pago = $metodo_pago_map[$data['tipo_pago']] ?? 'otros';
                
                // Crear descripción del ingreso
                $descripcion_ingreso = "Cobro automático - ";
                if (count($data['detalles']) == 1) {
                    $descripcion_ingreso .= $data['detalles'][0]['descripcion'];
                } else {
                    $descripcion_ingreso .= count($data['detalles']) . " servicios/productos";
                }
                
                // Registrar el ingreso en el módulo de caja
                $stmt_ingreso = $conn->prepare("INSERT INTO ingresos_diarios (
                    caja_id, 
                    tipo_ingreso, 
                    area, 
                    descripcion, 
                    monto, 
                    metodo_pago, 
                    referencia_id, 
                    referencia_tabla, 
                    paciente_id,
                    paciente_nombre, 
                    usuario_id,
                    turno
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                
                // Preparar todas las variables para bind_param (evitar problemas con NULL)
                $paciente_id_param = $data['paciente_id'];
                $usuario_id_param = $data['usuario_id'];
                $total_param = $data['total'];
                $referencia_tabla_param = 'cobros';
                $turno_param = $caja_abierta['turno'] ?? 'manana';
                $stmt_ingreso->bind_param("isssdsisisis", 
                    $caja_id,
                    $tipo_ingreso,
                    $area_servicio,
                    $descripcion_ingreso,
                    $total_param,
                    $metodo_pago,
                    $cobro_id,
                    $referencia_tabla_param,
                    $paciente_id_param,
                    $nombre_paciente,
                    $usuario_id_param,
                    $turno_param
                );
                
                if ($stmt_ingreso->execute()) {
                    // Actualizar timestamp de la caja
                    $stmt_update_caja = $conn->prepare("UPDATE cajas SET updated_at = CURRENT_TIMESTAMP WHERE id = ?");
                    $stmt_update_caja->bind_param("i", $caja_id);
                    $stmt_update_caja->execute();
                }
            }
            
            // ========================================
            // CONTINÚA CON LÓGICA ORIGINAL
            // ========================================
            
            // 3. Si es venta de farmacia, actualizar stock y registrar movimientos
            $servicio_key = $data['servicio_info']['key'] ?? 'consulta';
            if ($servicio_key === 'farmacia') {
                foreach ($data['detalles'] as $detalle) {
                    $medicamento_id = $detalle['servicio_id'];
                    $cantidad_vendida = $detalle['cantidad'];
                    
                    // Obtener información del medicamento para el stock y unidades por caja
                    $stmt_med = $conn->prepare("SELECT stock, unidades_por_caja, nombre FROM medicamentos WHERE id = ?");
                    $stmt_med->bind_param("i", $medicamento_id);
                    $stmt_med->execute();
                    $med_result = $stmt_med->get_result()->fetch_assoc();
                    
                    if (!$med_result) {
                        throw new Exception("Medicamento no encontrado ID: $medicamento_id");
                    }
                    
                    $stock_actual = intval($med_result['stock']);
                    $unidades_por_caja = intval($med_result['unidades_por_caja']) ?: 1;
                    $nombre_medicamento = $med_result['nombre'];
                    
                    // Determinar si es venta por unidad o caja
                    $es_caja = strpos($detalle['descripcion'], '(Caja)') !== false;
                    
                    if ($es_caja) {
                        $cantidad_total_unidades = $cantidad_vendida * $unidades_por_caja;
                        $tipo_movimiento = 'venta_caja';
                    } else {
                        $cantidad_total_unidades = $cantidad_vendida;
                        $tipo_movimiento = 'venta_unidad';
                    }
                    
                    // Verificar stock suficiente
                    if ($stock_actual < $cantidad_total_unidades) {
                        throw new Exception("Stock insuficiente para $nombre_medicamento. Disponible: $stock_actual, solicitado: $cantidad_total_unidades");
                    }
                    
                    $nuevo_stock = $stock_actual - $cantidad_total_unidades;
                    
                    // Actualizar stock del medicamento
                    $stmt_stock = $conn->prepare("UPDATE medicamentos SET stock = ? WHERE id = ?");
                    $stmt_stock->bind_param("ii", $nuevo_stock, $medicamento_id);
                    $stmt_stock->execute();
                    
                    // Registrar movimiento de salida con información del paciente
                    $observaciones = "Venta - Cobro #$cobro_id - Paciente: $nombre_paciente (DNI: $dni_paciente, HC: $hc_paciente) - " . ($es_caja ? "$cantidad_vendida caja(s)" : "$cantidad_vendida unidad(es)");
                    $stmt_mov = $conn->prepare("INSERT INTO movimientos_medicamento (medicamento_id, tipo_movimiento, cantidad, observaciones, usuario_id, fecha_hora) VALUES (?, ?, ?, ?, ?, NOW())");
                    $stmt_mov->bind_param("isisi", $medicamento_id, $tipo_movimiento, $cantidad_total_unidades, $observaciones, $data['usuario_id']);
                    $stmt_mov->execute();
                }
            }
            
            // 4. Registrar atención si el paciente está registrado
            // 5. Registrar movimiento de honorarios médicos si es consulta
            if ($servicio_key === 'consulta' && isset($data['detalles'][0])) {
                // Buscar tarifa asociada
                $detalleConsulta = $data['detalles'][0];
                $stmt_tarifa = $conn->prepare("SELECT * FROM tarifas WHERE descripcion = ? AND servicio_tipo = 'consulta' LIMIT 1");
                $stmt_tarifa->bind_param("s", $detalleConsulta['descripcion']);
                $stmt_tarifa->execute();
                $tarifa = $stmt_tarifa->get_result()->fetch_assoc();
                // Definir $metodo_pago si no existe en este scope
                if (!isset($metodo_pago)) {
                    $metodo_pago_map = [
                        'efectivo' => 'efectivo',
                        'tarjeta' => 'tarjeta',
                        'transferencia' => 'transferencia',
                        'yape' => 'yape',
                        'plin' => 'plin',
                        'seguro' => 'otros'
                    ];
                    $metodo_pago = $metodo_pago_map[$data['tipo_pago']] ?? 'otros';
                }
                if ($tarifa) {
                    // Determinar tipo de precio
                    $tipo_precio = 'particular';
                    if ($metodo_pago === 'seguro') {
                        $tipo_precio = 'seguro';
                    } elseif ($metodo_pago === 'convenio') {
                        $tipo_precio = 'convenio';
                    }
                    $tarifa_total = floatval($tarifa['precio_' . $tipo_precio]);

                    // Calcular honorarios
                    $monto_medico = null;
                    $monto_clinica = null;
                    $porcentaje_aplicado_medico = null;
                    $porcentaje_aplicado_clinica = null;
                    if (!empty($tarifa['monto_medico'])) {
                        $monto_medico = floatval($tarifa['monto_medico']);
                        $porcentaje_aplicado_medico = 0;
                    } elseif (!empty($tarifa['porcentaje_medico'])) {
                        $monto_medico = round($tarifa_total * floatval($tarifa['porcentaje_medico']) / 100, 2);
                        $porcentaje_aplicado_medico = floatval($tarifa['porcentaje_medico']);
                    } else {
                        $porcentaje_aplicado_medico = 0;
                    }
                    if (!empty($tarifa['monto_clinica'])) {
                        $monto_clinica = floatval($tarifa['monto_clinica']);
                        $porcentaje_aplicado_clinica = 0;
                    } elseif (!empty($tarifa['porcentaje_clinica'])) {
                        $monto_clinica = round($tarifa_total * floatval($tarifa['porcentaje_clinica']) / 100, 2);
                        $porcentaje_aplicado_clinica = floatval($tarifa['porcentaje_clinica']);
                    } else {
                        $porcentaje_aplicado_clinica = 0;
                    }

                    // Usar consulta_id y paciente_id si están presentes en el detalle
                    $consulta_id = isset($detalleConsulta['consulta_id']) ? $detalleConsulta['consulta_id'] : null;
                    $paciente_id = isset($detalleConsulta['paciente_id']) ? $detalleConsulta['paciente_id'] : null;
                    $medico_id = isset($detalleConsulta['medico_id']) ? $detalleConsulta['medico_id'] : ($tarifa['medico_id'] ?? null);

                    // Insertar movimiento de honorario
                    $stmt_honorario = $conn->prepare("INSERT INTO honorarios_medicos_movimientos (
                        consulta_id, medico_id, paciente_id, tarifa_id, tipo_precio, fecha, hora, tipo_servicio, especialidad, tarifa_total,
                        monto_clinica, monto_medico, porcentaje_aplicado_clinica, porcentaje_aplicado_medico, estado_pago_medico, metodo_pago_medico, created_at
                    ) VALUES (?, ?, ?, ?, ?, CURDATE(), CURTIME(), ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?, NOW())");
                    $stmt_honorario->bind_param(
                        "iiiisssddddds",
                        $consulta_id,
                        $medico_id,
                        $paciente_id,
                        $tarifa['id'],
                        $tipo_precio,
                        $servicio_key,
                        $tarifa['descripcion'],
                        $tarifa_total,
                        $monto_clinica,
                        $monto_medico,
                        $porcentaje_aplicado_clinica,
                        $porcentaje_aplicado_medico,
                        $metodo_pago
                    );
                    $stmt_honorario->execute();
                }
            }
            if ($data['paciente_id'] && $data['paciente_id'] !== 'null') {
                $stmt_atencion = $conn->prepare("INSERT INTO atenciones (paciente_id, usuario_id, servicio, estado) VALUES (?, ?, ?, 'pendiente')");
                $stmt_atencion->bind_param("iis", 
                    $data['paciente_id'], 
                    $data['usuario_id'], 
                    $servicio_key
                );
                $stmt_atencion->execute();
            }
            
            $conn->commit();
            
            // 5. Generar número de comprobante
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
            // Todos los cobros (con paginación y filtros)
            $page = $_GET['page'] ?? 1;
            $limit = $_GET['limit'] ?? 3;
            $offset = ($page - 1) * $limit;
            $servicio = $_GET['servicio'] ?? null;
            $fecha_inicio = $_GET['fecha_inicio'] ?? null;
            $fecha_fin = $_GET['fecha_fin'] ?? null;
            
            // Construir WHERE clause dinámicamente
            $where_conditions = [];
            $params = [];
            $types = "";
            
            // Filtro por servicio (farmacia)
            if ($servicio === 'farmacia') {
                $where_conditions[] = "EXISTS (SELECT 1 FROM cobros_detalle cd WHERE cd.cobro_id = c.id AND cd.servicio_tipo = 'farmacia')";
            }
            
            // Filtro por fechas
            if ($fecha_inicio && $fecha_fin) {
                $where_conditions[] = "DATE(c.fecha_cobro) BETWEEN ? AND ?";
                $params[] = $fecha_inicio;
                $params[] = $fecha_fin;
                $types .= "ss";
            }
            
            $where_clause = "";
            if (!empty($where_conditions)) {
                $where_clause = "WHERE " . implode(" AND ", $where_conditions);
            }
            
            // Query principal con LEFT JOIN para manejar pacientes no registrados
            $sql = "
                SELECT c.*, 
                       COALESCE(p.nombre, SUBSTRING_INDEX(SUBSTRING_INDEX(c.observaciones, 'Cliente no registrado: ', -1), ' (DNI:', 1)) as nombre,
                       COALESCE(p.apellido, '') as apellido,
                       COALESCE(p.dni, SUBSTRING_INDEX(SUBSTRING_INDEX(c.observaciones, '(DNI: ', -1), ')', 1)) as dni,
                       u.nombre as usuario_nombre
                FROM cobros c 
                LEFT JOIN pacientes p ON c.paciente_id = p.id 
                JOIN usuarios u ON c.usuario_id = u.id
                $where_clause
                ORDER BY c.fecha_cobro DESC 
                LIMIT ? OFFSET ?
            ";
            
            $params[] = $limit;
            $params[] = $offset;
            $types .= "ii";
            
            $stmt = $conn->prepare($sql);
            if (!empty($params)) {
                $stmt->bind_param($types, ...$params);
            }
            $stmt->execute();
            $result = $stmt->get_result();
            $cobros = $result->fetch_all(MYSQLI_ASSOC);
            
            // Obtener detalles para cada cobro
            foreach ($cobros as &$cobro) {
                $stmt_detalle = $conn->prepare("SELECT * FROM cobros_detalle WHERE cobro_id = ?");
                $stmt_detalle->bind_param("i", $cobro['id']);
                $stmt_detalle->execute();
                $detalles = $stmt_detalle->get_result()->fetch_all(MYSQLI_ASSOC);
                $cobro['detalles'] = $detalles;
            }
            
            // Contar total con los mismos filtros
            $count_sql = "
                SELECT COUNT(*) as total 
                FROM cobros c 
                LEFT JOIN pacientes p ON c.paciente_id = p.id 
                JOIN usuarios u ON c.usuario_id = u.id
                $where_clause
            ";
            
            $stmt_count = $conn->prepare($count_sql);
            if (!empty($where_conditions)) {
                // Usar solo los parámetros de filtro, no limit/offset
                $count_params = array_slice($params, 0, -2);
                $count_types = substr($types, 0, -2);
                if (!empty($count_params)) {
                    $stmt_count->bind_param($count_types, ...$count_params);
                }
            }
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
        
        $conn->begin_transaction();
        
        try {
            // Obtener estado actual del cobro y información del paciente
            $stmt_current = $conn->prepare("SELECT c.estado, c.paciente_id, p.nombre, p.apellido, p.dni, p.historia_clinica FROM cobros c JOIN pacientes p ON c.paciente_id = p.id WHERE c.id = ?");
            $stmt_current->bind_param("i", $data['id']);
            $stmt_current->execute();
            $current_result = $stmt_current->get_result()->fetch_assoc();
            $estado_actual = $current_result['estado'];
            $nombre_paciente = ($current_result['nombre'] ?? '') . ' ' . ($current_result['apellido'] ?? '');
            $dni_paciente = $current_result['dni'] ?? '';
            $hc_paciente = $current_result['historia_clinica'] ?? '';
            
            // Si se está anulando un cobro de farmacia que estaba pagado, revertir stock
            if ($data['estado'] === 'anulado' && $estado_actual === 'pagado') {
                // Obtener detalles del cobro para verificar si es de farmacia
                $stmt_detalles = $conn->prepare("SELECT servicio_tipo, servicio_id, descripcion FROM cobros_detalle WHERE cobro_id = ?");
                $stmt_detalles->bind_param("i", $data['id']);
                $stmt_detalles->execute();
                $detalles_result = $stmt_detalles->get_result();
                
                while ($detalle = $detalles_result->fetch_assoc()) {
                    if ($detalle['servicio_tipo'] === 'farmacia') {
                        // Decodificar detalles JSON
                        $detalles_json = json_decode($detalle['descripcion'], true);
                        
                        foreach ($detalles_json as $item) {
                            $medicamento_id = $item['servicio_id'];
                            $cantidad_vendida = $item['cantidad'];
                            
                            // Obtener información del medicamento
                            $stmt_med = $conn->prepare("SELECT stock, unidades_por_caja, nombre FROM medicamentos WHERE id = ?");
                            $stmt_med->bind_param("i", $medicamento_id);
                            $stmt_med->execute();
                            $med_result = $stmt_med->get_result()->fetch_assoc();
                            
                            if ($med_result) {
                                $stock_actual = intval($med_result['stock']);
                                $unidades_por_caja = intval($med_result['unidades_por_caja']) ?: 1;
                                $nombre_medicamento = $med_result['nombre'];
                                
                                // Determinar si era venta por unidad o caja
                                $es_caja = strpos($item['descripcion'], '(Caja)') !== false;
                                
                                if ($es_caja) {
                                    $cantidad_total_unidades = $cantidad_vendida * $unidades_por_caja;
                                    $tipo_movimiento = 'devolucion_caja';
                                } else {
                                    $cantidad_total_unidades = $cantidad_vendida;
                                    $tipo_movimiento = 'devolucion_unidad';
                                }
                                
                                $nuevo_stock = $stock_actual + $cantidad_total_unidades;
                                
                                // Devolver stock al medicamento
                                $stmt_stock_return = $conn->prepare("UPDATE medicamentos SET stock = ? WHERE id = ?");
                                $stmt_stock_return->bind_param("ii", $nuevo_stock, $medicamento_id);
                                $stmt_stock_return->execute();
                                
                                // Registrar movimiento de entrada (devolución) con información del paciente
                                $observaciones = "Devolución - Anulación Cobro #{$data['id']} - Paciente: $nombre_paciente (DNI: $dni_paciente, HC: $hc_paciente) - " . ($es_caja ? "$cantidad_vendida caja(s)" : "$cantidad_vendida unidad(es)");
                                $usuario_actual = $_SESSION['usuario_id'] ?? 1;
                                $stmt_mov_return = $conn->prepare("INSERT INTO movimientos_medicamento (medicamento_id, tipo_movimiento, cantidad, observaciones, usuario_id, fecha_hora) VALUES (?, ?, ?, ?, ?, NOW())");
                                $stmt_mov_return->bind_param("isisi", $medicamento_id, $tipo_movimiento, $cantidad_total_unidades, $observaciones, $usuario_actual);
                                $stmt_mov_return->execute();
                            }
                        }
                    }
                }
            }
            
            // Actualizar estado del cobro
            $observaciones_update = $data['observaciones'] ?? '';
            $stmt = $conn->prepare("UPDATE cobros SET estado = ?, observaciones = ? WHERE id = ?");
            $stmt->bind_param("ssi", $data['estado'], $observaciones_update, $data['id']);
            $stmt->execute();
            
            $conn->commit();
            echo json_encode(['success' => true, 'message' => 'Estado actualizado']);
            
        } catch (Exception $e) {
            $conn->rollback();
            error_log("Error al actualizar cobro: " . $e->getMessage());
            echo json_encode(['success' => false, 'error' => 'Error al actualizar: ' . $e->getMessage()]);
        }
        break;
        
    default:
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
        break;
}
?>
