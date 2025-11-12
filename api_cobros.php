<?php
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '.clinica2demayo.com',
    'secure' => true,
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();
// CORS para localhost y producción
$allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',
    'https://clinica2demayo.com',
    'https://www.clinica2demayo.com'
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins)) {
    header('Access-Control-Allow-Origin: ' . $origin);
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS, DELETE');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Capturar errores fatales y enviar JSON con CORS
set_exception_handler(function($e) use ($origin, $allowedOrigins) {
    http_response_code(500);
    if (in_array($origin, $allowedOrigins)) {
        header('Access-Control-Allow-Origin: ' . $origin);
    }
    header('Access-Control-Allow-Credentials: true');
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => 'Error del servidor: ' . $e->getMessage()]);
    exit();
});
header('Content-Type: application/json');

require_once 'config.php';

require_once "auth_check.php";

require_once __DIR__ . '/CobroModule.php';
require_once __DIR__ . '/LaboratorioModule.php';
require_once __DIR__ . '/CajaModule.php';
require_once __DIR__ . '/FarmaciaModule.php';
require_once __DIR__ . '/HonorarioModule.php';

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
            // 1. Registrar cobro principal y detalles
            $cobro_id = CobroModule::registrarCobro($conn, $data);
            
            // 2. Obtener caja abierta (filtrando por fecha y turno si existen)
            $fecha_cobro = $data['fecha'] ?? date('Y-m-d');
            $turno_cobro = $data['turno'] ?? null;
            $caja_abierta = CajaModule::obtenerCajaAbierta($conn, $data['usuario_id'], $fecha_cobro, $turno_cobro);
            $caja_id = $caja_abierta['id'] ?? null;
            
            // 3. Registrar movimientos de laboratorio de referencia
            foreach ($data['detalles'] as $detalle) {
                if (!empty($detalle['derivado']) && $detalle['derivado'] === true) {
                    $usuario_caja = $caja_abierta['usuario_id'] ?? $data['usuario_id'];
                    $turno_caja = $caja_abierta['turno'] ?? ($data['turno'] ?? null);
                    LaboratorioModule::registrarMovimientoReferencia($conn, $cobro_id, $detalle, $caja_id, $data['paciente_id'], $usuario_caja, $turno_caja);
                }
            }
            
            // ========================================
            // INTEGRACIÓN CON MÓDULO DE INGRESOS
            // ========================================
            
            // Verificar si hay una caja abierta del usuario actual
            $stmt_caja = $conn->prepare("SELECT id, turno FROM cajas WHERE estado = 'abierta' AND usuario_id = ? ORDER BY created_at DESC LIMIT 1");
            $usuario_id_param = $data['usuario_id'];
            $stmt_caja->bind_param("i", $usuario_id_param);
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

                // Inicializar variables requeridas para el registro de ingreso
                $total_param = $data['total'] ?? 0;
                $referencia_tabla_param = 'cobros';
                $paciente_id_param = $data['paciente_id'] ?? null;
                $nombre_paciente = $data['paciente_nombre'] ?? '';
                $usuario_id_param = $data['usuario_id'];
                $turno_param = $caja_abierta['turno'] ?? ($data['turno'] ?? null);

                // --- Registro de ingreso en caja ---
                $params = [
                    'caja_id' => $caja_id,
                    'tipo_ingreso' => $tipo_ingreso,
                    'area_servicio' => $area_servicio,
                    'descripcion_ingreso' => $descripcion_ingreso,
                    'total_param' => $total_param,
                    'metodo_pago' => $metodo_pago,
                    'cobro_id' => $cobro_id,
                    'referencia_tabla_param' => $referencia_tabla_param,
                    'paciente_id_param' => $paciente_id_param,
                    'nombre_paciente' => $nombre_paciente,
                    'usuario_id_param' => $usuario_id_param,
                    'turno_param' => $turno_param
                ];
                CajaModule::registrarIngreso($conn, $params);
            }
            
            // ========================================
            // CONTINÚA CON LÓGICA ORIGINAL
            // ========================================
            
            // 3. Si es venta de farmacia, actualizar stock y registrar movimientos
            $servicio_key = $data['servicio_info']['key'] ?? 'consulta';
            // Inicializar variables de paciente para farmacia
            $dni_paciente = $data['paciente_dni'] ?? '';
            $hc_paciente = $data['paciente_hc'] ?? '';
            if ($servicio_key === 'farmacia') {
                foreach ($data['detalles'] as $detalle) {
                    FarmaciaModule::procesarVenta(
                        $conn,
                        $detalle,
                        $cobro_id,
                        $nombre_paciente,
                        $dni_paciente,
                        $hc_paciente,
                        $data['usuario_id']
                    );
                }
            }
            
            // 4. Registrar atención si el paciente está registrado
            // 5. Registrar movimiento de honorarios médicos si es consulta
            // Registrar movimiento de honorarios médicos si es consulta o ecografia
            if (in_array($servicio_key, ['consulta', 'ecografia', 'operacion']) && isset($data['detalles'][0])) {
                $detalleServicio = $data['detalles'][0];
                // Buscar tarifa asociada por ID si existe
                $tarifa = null;
                if (isset($detalleServicio['servicio_id']) && $detalleServicio['servicio_id']) {
                    $stmt_tarifa = $conn->prepare("SELECT * FROM tarifas WHERE id = ? LIMIT 1");
                    $stmt_tarifa->bind_param("i", $detalleServicio['servicio_id']);
                    $stmt_tarifa->execute();
                    $tarifa = $stmt_tarifa->get_result()->fetch_assoc();
                } else {
                    $stmt_tarifa = $conn->prepare("SELECT * FROM tarifas WHERE descripcion = ? AND servicio_tipo = ? LIMIT 1");
                    $stmt_tarifa->bind_param("ss", $detalleServicio['descripcion'], $servicio_key);
                    $stmt_tarifa->execute();
                    $tarifa = $stmt_tarifa->get_result()->fetch_assoc();
                }
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
                    $consulta_id = isset($detalleServicio['consulta_id']) ? $detalleServicio['consulta_id'] : null;
                    $paciente_id = isset($detalleServicio['paciente_id']) ? $detalleServicio['paciente_id'] : null;
                    $medico_id = isset($detalleServicio['medico_id']) ? $detalleServicio['medico_id'] : ($tarifa['medico_id'] ?? null);
                    $especialidad = isset($detalleServicio['especialidad']) ? $detalleServicio['especialidad'] : ($tarifa['especialidad'] ?? null);

                    // Insertar movimiento de honorario
                    $stmt_honorario = $conn->prepare("INSERT INTO honorarios_medicos_movimientos (
                        consulta_id, medico_id, paciente_id, tarifa_id, tipo_precio, fecha, hora, tipo_servicio, especialidad, tarifa_total,
                        monto_clinica, monto_medico, porcentaje_aplicado_clinica, porcentaje_aplicado_medico, estado_pago_medico, metodo_pago_medico, created_at, cobro_id
                    ) VALUES (?, ?, ?, ?, ?, CURDATE(), CURTIME(), ?, ?, ?, ?, ?, ?, ?, 'pendiente', ?, NOW(), ?)");
                    $stmt_honorario->bind_param(
                        "iiiisssdddddsi",
                        $consulta_id,         // i
                        $medico_id,           // i
                        $paciente_id,         // i
                        $tarifa['id'],        // i
                        $tipo_precio,         // s
                        $servicio_key,        // s
                        $especialidad,        // s
                        $tarifa_total,        // d
                        $monto_clinica,       // d
                        $monto_medico,        // d
                        $porcentaje_aplicado_clinica, // d
                        $porcentaje_aplicado_medico,  // d
                        $metodo_pago,         // s
                        $cobro_id             // i
                    );
                    $stmt_honorario->execute();
                    // Obtener el id del movimiento de honorario recién creado
                    $honorario_id = $conn->insert_id;
                    // Actualizar ingresos_diarios con el honorario_movimiento_id usando el cobro_id
                    $stmt_update_ingreso = $conn->prepare("UPDATE ingresos_diarios SET honorario_movimiento_id = ? WHERE referencia_id = ? AND referencia_tabla = 'cobros'");
                    $stmt_update_ingreso->bind_param("ii", $honorario_id, $cobro_id);
                    $stmt_update_ingreso->execute();
                }
            }
            if ($data['paciente_id'] && $data['paciente_id'] !== 'null') {
                $servicios_validos = [
                    'consulta', 'laboratorio', 'farmacia', 'rayosx', 'ecografia', 'procedimiento',
                    'operacion', 'hospitalizacion', 'ocupacional', 'procedimientos',
                    'cirugias', 'tratamientos', 'emergencias'
                ];
                if (in_array($servicio_key, $servicios_validos)) {
                    $stmt_atencion = $conn->prepare("INSERT INTO atenciones (paciente_id, usuario_id, servicio, estado) VALUES (?, ?, ?, 'pendiente')");
                    $stmt_atencion->bind_param("iis", 
                        $data['paciente_id'], 
                        $data['usuario_id'], 
                        $servicio_key
                    );
                    $stmt_atencion->execute();
                } else {
                    echo json_encode(['success' => false, 'error' => "Servicio '$servicio_key' no permitido en atenciones. Actualiza el ENUM o revisa el frontend."]);
                    $conn->rollback();
                    exit();
                }
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
            
            // Contar total with the same filters
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
