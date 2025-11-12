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
    'https://clinica2demayo.com',
    'https://www.clinica2demayo.com'
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins)) {
    header('Access-Control-Allow-Origin: ' . $origin);
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Content-Type: application/json');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// ...existing code...
require_once __DIR__ . '/config.php'; 

try {
    // Obtener total de pacientes registrados
    $stmt_total_pacientes = $pdo->query("SELECT COUNT(*) as total FROM pacientes");
    $total_pacientes = $stmt_total_pacientes->fetch()['total'];

    // Obtener pacientes atendidos hoy (si existe tabla atenciones)
    $pacientes_hoy = 0;
    try {
        $stmt_pacientes_hoy = $pdo->query("SELECT COUNT(DISTINCT paciente_id) as total FROM atenciones WHERE DATE(fecha) = CURDATE()");
        $result = $stmt_pacientes_hoy->fetch();
        $pacientes_hoy = $result ? $result['total'] : 0;
    } catch (PDOException $e) {
        // Si no existe la tabla atenciones, mantener en 0
        $pacientes_hoy = 0;
    }

    // Obtener consultas médicas hoy (si existe tabla consultas)
    $consultas_hoy = 0;
    try {
        $stmt_consultas_hoy = $pdo->query("SELECT COUNT(*) as total FROM consultas WHERE DATE(fecha) = CURDATE()");
        $result = $stmt_consultas_hoy->fetch();
        $consultas_hoy = $result ? $result['total'] : 0;
    } catch (PDOException $e) {
        // Si no existe la tabla consultas, mantener en 0
        $consultas_hoy = 0;
    }

    // Si no hay datos de consultas, intentar contar desde historia_clinica de hoy
    if ($consultas_hoy == 0) {
        try {
            $stmt_hc_hoy = $pdo->query("SELECT COUNT(*) as total FROM historia_clinica WHERE DATE(fecha) = CURDATE()");
            $result = $stmt_hc_hoy->fetch();
            $consultas_hoy = $result ? $result['total'] : 0;
        } catch (PDOException $e) {
            $consultas_hoy = 0;
        }
    }

    echo json_encode([
        'success' => true,
        'estadisticas' => [
            'total_pacientes' => intval($total_pacientes),
            'pacientes_hoy' => intval($pacientes_hoy),
            'consultas_hoy' => intval($consultas_hoy)
        ]
    ]);

} catch (PDOException $e) {
    echo json_encode([
        'success' => false,
        'error' => 'Error al obtener estadísticas: ' . $e->getMessage()
    ]);
}
?>