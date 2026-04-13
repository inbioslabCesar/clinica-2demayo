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
        $result = CobroModule::obtenerCobros($conn, $_GET);
        echo json_encode($result);
        break;
}
