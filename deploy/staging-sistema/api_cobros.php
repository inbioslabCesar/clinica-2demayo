<?php
require_once __DIR__ . '/init_api.php';

require_once 'config.php';

require_once "auth_check.php";

require_once __DIR__ . '/modules/CobroModule.php';
require_once __DIR__ . '/modules/LaboratorioModule.php';
require_once __DIR__ . '/modules/CajaModule.php';
require_once __DIR__ . '/modules/FarmaciaModule.php';
require_once __DIR__ . '/modules/HonorarioModule.php';
require_once __DIR__ . '/modules/AtencionModule.php';

// Forzar codificación utf8mb4 en la conexión MySQLi
if (isset($conn) && method_exists($conn, 'set_charset')) {
    $conn->set_charset('utf8mb4');
}

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'POST':
        // --- INICIO BLOQUE: Validación de datos recibidos ---
        $data = json_decode(file_get_contents('php://input'), true);
        $validacion = CobroModule::validarDatos($data);
        if (!$validacion['success']) {
            echo json_encode($validacion);
            break;
        }
        // --- FIN BLOQUE VALIDACIÓN ---

        // --- INICIO BLOQUE: Proceso principal de cobro ---
        $result = CobroModule::procesarCobro($conn, $data);
        echo json_encode($result);
        // --- FIN BLOQUE PROCESO PRINCIPAL DE COBRO ---
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
                 $stmt_detalle = $conn->prepare("
                    SELECT cd.*, t.descripcion
                    FROM cobros_detalle cd
                    LEFT JOIN tarifas t ON cd.tarifa_id = t.id
                    WHERE cd.cobro_id = ?
                 ");
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
            // Obtener cobros usando CobroModule
            $params = $_GET;
            $result = CobroModule::obtenerCobros($conn, $params);
            echo json_encode($result);
            break;
        }
        // ...existing code...
        // Cierre del switch principal
}
