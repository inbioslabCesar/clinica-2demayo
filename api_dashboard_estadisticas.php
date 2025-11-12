
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
    'https://clinica2demayo.com',
    'https://www.clinica2demayo.com'
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
    FROM cajas WHERE estado = 'cerrada';";
    $res = $pdo->query($sqlResumen)->fetch(PDO::FETCH_ASSOC);

    // Calcular crecimiento mensual (%) comparando con el mes anterior usando ganancia_dia
    $sqlPrevMonth = "SELECT SUM(ganancia_dia) AS gananciaMesPrev
        FROM cajas
        WHERE estado = 'cerrada' AND MONTH(fecha) = MONTH(CURDATE() - INTERVAL 1 MONTH) AND YEAR(fecha) = YEAR(CURDATE() - INTERVAL 1 MONTH)";
    $resPrev = $pdo->query($sqlPrevMonth)->fetch(PDO::FETCH_ASSOC);
    $gananciaMes = floatval($res['gananciaMes'] ?? 0);
    $gananciaPrev = floatval($resPrev['gananciaMesPrev'] ?? 0);
    if ($gananciaPrev > 0) {
        $crecimiento = (($gananciaMes - $gananciaPrev) / $gananciaPrev) * 100;
    } else {
        $crecimiento = null;
    }

    // Pacientes atendidos en el mes actual
    $pacientesMes = 0;
    try {
        // Preferentemente usar la tabla atenciones si existe
        $stmtPacientesMes = $pdo->query("SELECT COUNT(DISTINCT paciente_id) as total FROM atenciones WHERE MONTH(fecha) = MONTH(CURDATE()) AND YEAR(fecha) = YEAR(CURDATE())");
        $rowPacientesMes = $stmtPacientesMes->fetch();
        $pacientesMes = $rowPacientesMes ? intval($rowPacientesMes['total']) : 0;
    } catch (PDOException $e) {
        // Si no existe la tabla atenciones, intentar con consultas
        try {
            $stmtPacientesMes = $pdo->query("SELECT COUNT(DISTINCT paciente_id) as total FROM consultas WHERE MONTH(fecha) = MONTH(CURDATE()) AND YEAR(fecha) = YEAR(CURDATE())");
            $rowPacientesMes = $stmtPacientesMes->fetch();
            $pacientesMes = $rowPacientesMes ? intval($rowPacientesMes['total']) : 0;
        } catch (PDOException $e2) {
            $pacientesMes = 0;
        }
    }

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

    // Ranking de usuarios (admin y recepcionistas) usando ganancia_dia
    $sqlRanking = "SELECT u.nombre, u.rol, SUM(c.ganancia_dia) AS ingresos
        FROM cajas c
        LEFT JOIN usuarios u ON c.usuario_id = u.id
        WHERE c.estado = 'cerrada' AND u.rol IN ('administrador','recepcionista')
          AND MONTH(c.fecha) = MONTH(CURDATE()) AND YEAR(c.fecha) = YEAR(CURDATE())
        GROUP BY c.usuario_id, u.nombre, u.rol
        ORDER BY ingresos DESC";
    $ranking = $pdo->query($sqlRanking)->fetchAll(PDO::FETCH_ASSOC);

    // Servicios más vendidos usando el campo descripcion (JSON) de cobros_detalle
    $sqlServicios = "SELECT 
        cd.servicio_tipo, 
        cd.servicio_id, 
        cd.descripcion,
        cd.cantidad, 
        cd.subtotal
    FROM cobros_detalle cd
    INNER JOIN cobros c ON cd.cobro_id = c.id
    WHERE MONTH(c.fecha_cobro) = MONTH(CURDATE()) AND YEAR(c.fecha_cobro) = YEAR(CURDATE()) AND c.estado = 'pagado'";
    $serviciosRaw = $pdo->query($sqlServicios)->fetchAll(PDO::FETCH_ASSOC);

    // Agrupar por nombre y tipo, sumando cantidad y monto
    $serviciosAgrupados = [];
    foreach ($serviciosRaw as $s) {
        $desc = json_decode($s['descripcion'], true);
        if (is_array($desc) && isset($desc[0]['descripcion'])) {
            $nombre_servicio = $desc[0]['descripcion'];
        } else if (is_array($desc) && isset($desc['descripcion'])) {
            $nombre_servicio = $desc['descripcion'];
        } else {
            $nombre_servicio = null;
        }
        $key = $s['servicio_tipo'] . '|' . $nombre_servicio;
        if (!isset($serviciosAgrupados[$key])) {
            $serviciosAgrupados[$key] = [
                'tipo_servicio' => $s['servicio_tipo'],
                'servicio_id' => $s['servicio_id'],
                'nombre_servicio' => $nombre_servicio,
                'cantidad_total' => 0,
                'monto_total' => 0
            ];
        }
        $serviciosAgrupados[$key]['cantidad_total'] += floatval($s['cantidad']);
        $serviciosAgrupados[$key]['monto_total'] += floatval($s['subtotal']);
    }
    // Convertir a array y ordenar por monto_total DESC, cantidad_total DESC
    $servicios = array_values($serviciosAgrupados);
    usort($servicios, function($a, $b) {
        if ($a['monto_total'] == $b['monto_total']) {
            return $b['cantidad_total'] <=> $a['cantidad_total'];
        }
        return $b['monto_total'] <=> $a['monto_total'];
    });

    // Tendencias de ingresos (por día del mes) usando ganancia_dia (ganancia neta)
    $sqlTendencias = "SELECT DATE(fecha) as fecha, SUM(ganancia_dia) as total
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
            'pacientes' => $pacientesMes,
            'gananciaUsuarios' => $gananciaUsuarios,
            'crecimiento' => is_null($crecimiento) ? null : round($crecimiento, 2)
        ],
        'ranking' => $ranking,
        'servicios' => $servicios,
        'tendencias' => $tendencias
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
