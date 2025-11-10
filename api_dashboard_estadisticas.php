
<?php
date_default_timezone_set('America/Lima');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'domain' => '',
    'secure' => false,
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();
// Mostrar errores para depuración
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);
// CORS para localhost y producción
$allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',
    'https://clinica2demayo.com'
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array($origin, $allowedOrigins)) {
    header('Access-Control-Allow-Origin: ' . $origin);
}
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Content-Type: application/json');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}
require_once __DIR__ . '/config.php';

if (!isset($_SESSION['usuario']) || !in_array($_SESSION['usuario']['rol'], ['administrador', 'recepcionista'])) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'No autorizado']);
    exit;
}

try {
    // Resumen diario, mensual, trimestral y anual usando ganancia_dia
    $sqlResumen = "SELECT 
        SUM(CASE WHEN DATE(fecha) = CURDATE() THEN ganancia_dia ELSE 0 END) AS gananciaDia,
        SUM(CASE WHEN MONTH(fecha) = MONTH(CURDATE()) AND YEAR(fecha) = YEAR(CURDATE()) THEN ganancia_dia ELSE 0 END) AS gananciaMes,
        SUM(CASE WHEN QUARTER(fecha) = QUARTER(CURDATE()) AND YEAR(fecha) = YEAR(CURDATE()) THEN ganancia_dia ELSE 0 END) AS gananciaTrimestre,
        SUM(CASE WHEN YEAR(fecha) = YEAR(CURDATE()) THEN ganancia_dia ELSE 0 END) AS gananciaAnio
    FROM cajas WHERE estado = 'cerrada'";
    $res = $pdo->query($sqlResumen)->fetch(PDO::FETCH_ASSOC);

        // Ganancia por usuario por día (solo recepcionista y administrador)
        $sqlGananciaUsuarios = "SELECT 
            DATE(fecha) as fecha,
            u.id as usuario_id,
            u.nombre as usuario_nombre,
            u.rol,
            SUM(c.ganancia_dia) as ganancia
        FROM cajas c
        LEFT JOIN usuarios u ON c.usuario_id = u.id
        WHERE c.estado = 'cerrada' AND u.rol IN ('administrador','recepcionista')
        GROUP BY DATE(fecha), u.id, u.nombre, u.rol
        ORDER BY fecha DESC, ganancia DESC";
        $gananciaUsuarios = $pdo->query($sqlGananciaUsuarios)->fetchAll(PDO::FETCH_ASSOC);

    // Ranking de usuarios (admin y recepcionistas)
    $sqlRanking = "SELECT u.nombre, SUM(c.monto_cierre) AS ingresos
        FROM cajas c
        LEFT JOIN usuarios u ON c.usuario_id = u.id
        WHERE c.estado = 'cerrada' AND MONTH(c.fecha) = MONTH(CURDATE()) AND YEAR(c.fecha) = YEAR(CURDATE())
        GROUP BY c.usuario_id
        ORDER BY ingresos DESC";
    $ranking = $pdo->query($sqlRanking)->fetchAll(PDO::FETCH_ASSOC);

    // Servicios más vendidos con nombre
    $sqlServicios = "SELECT 
        cd.servicio_tipo, 
        cd.servicio_id, 
        SUM(cd.cantidad) AS cantidad_total, 
        SUM(cd.subtotal) AS monto_total,
        CASE 
            WHEN cd.servicio_tipo = 'farmacia' THEN m.nombre
            ELSE t.descripcion
        END AS nombre_servicio
    FROM cobros_detalle cd
    INNER JOIN cobros c ON cd.cobro_id = c.id
    LEFT JOIN medicamentos m ON cd.servicio_tipo = 'farmacia' AND cd.servicio_id = m.id
    LEFT JOIN tarifas t ON cd.servicio_tipo != 'farmacia' AND cd.servicio_id = t.id
    WHERE MONTH(c.fecha_cobro) = MONTH(CURDATE()) AND YEAR(c.fecha_cobro) = YEAR(CURDATE()) AND c.estado = 'pagado'
    GROUP BY cd.servicio_tipo, cd.servicio_id, nombre_servicio
    ORDER BY monto_total DESC, cantidad_total DESC";
    $servicios = $pdo->query($sqlServicios)->fetchAll(PDO::FETCH_ASSOC);

    // Tendencias de ingresos (por día del mes)
    $sqlTendencias = "SELECT DATE(fecha) as fecha, SUM(monto_cierre) as total
        FROM cajas
        WHERE estado = 'cerrada' AND MONTH(fecha) = MONTH(CURDATE()) AND YEAR(fecha) = YEAR(CURDATE())
        GROUP BY DATE(fecha)
        ORDER BY fecha ASC";
    $tendencias = $pdo->query($sqlTendencias)->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'success' => true,
        'resumen' => [
            'gananciaDia' => floatval($res['gananciaDia'] ?? 0),
            'gananciaMes' => floatval($res['gananciaMes'] ?? 0),
            'gananciaTrimestre' => floatval($res['gananciaTrimestre'] ?? 0),
            'gananciaAnio' => floatval($res['gananciaAnio'] ?? 0),
            'pacientes' => intval($res['pacientesMes'] ?? 0),
            'gananciaUsuarios' => $gananciaUsuarios
        ],
        'ranking' => $ranking,
        'servicios' => $servicios,
        'tendencias' => $tendencias
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
