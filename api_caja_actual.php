<?php
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '.clinica2demayo.com', // Compartir cookie entre www y sin www
    'secure' => true,
    'httponly' => true,
    'samesite' => 'Lax',
]);
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
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}
header('Content-Type: application/json');
require_once __DIR__ . '/config.php';

try {
    // Verificar autenticación
    if (!isset($_SESSION['usuario'])) {
        http_response_code(401);
        echo json_encode(['success' => false, 'error' => 'No autenticado']);
        exit;
    }

    // Obtener caja abierta actual
    $sql = "SELECT c.*, u.nombre as usuario_nombre 
        FROM cajas c 
        LEFT JOIN usuarios u ON c.usuario_id = u.id 
        WHERE c.estado = 'abierta' AND c.usuario_id = :usuario_id
        ORDER BY c.created_at DESC 
        LIMIT 1";
    $stmt = $pdo->prepare($sql);
    $stmt->execute(['usuario_id' => $_SESSION['usuario']['id']]);
    $caja = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($caja) {
        echo json_encode([
            'success' => true,
            'caja' => $caja
        ]);
    } else {
        echo json_encode([
            'success' => false,
            'message' => 'No hay caja abierta'
        ]);
    }

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Error de base de datos: ' . $e->getMessage()
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Error del servidor: ' . $e->getMessage()
    ]);
}
?>